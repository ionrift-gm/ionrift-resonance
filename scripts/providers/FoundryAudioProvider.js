import { SoundProvider } from "./SoundProvider.js";
import { Logger } from "../Logger.js";

export class FoundryAudioProvider extends SoundProvider {

    constructor() {
        super();
        /** @type {Map<string, {sound: object, volume: number, fadeTimer: number|null}>} */
        this._activeLoops = new Map();
    }

    /**
     * Plays a local audio file. Supports one-shot and looping playback.
     * @param {string} soundId - Path to the audio file
     * @param {object|number} options - Volume number (legacy) or options object
     *   { volume, delay, type, loop, key, fadeInMs }
     * @returns {Promise<object|undefined>} The Sound instance if created
     */
    async playSound(soundId, options = {}) {
        if (!soundId) return;

        const volume = (typeof options === 'number') ? options : (options.volume ?? 1.0);
        const loop = options.loop ?? false;
        const fadeInMs = options.fadeInMs ?? 0;
        const key = options.key ?? null;

        // If a loop with this key is already playing, stop it first
        if (loop && key && this._activeLoops.has(key)) {
            await this.stopSound(key, 0);
        }

        const startVolume = (fadeInMs > 0) ? 0 : volume;
        Logger.log(`[Local] Playing: ${soundId} (vol: ${volume}, loop: ${loop}${key ? `, key: ${key}` : ""})`);

        try {
            const helper = foundry.audio?.AudioHelper ?? AudioHelper;
            const sound = await helper.play({
                src: soundId,
                volume: startVolume,
                loop
            }, true);

            if (loop && key && sound) {
                this._activeLoops.set(key, { sound, volume, fadeTimer: null });
            }

            if (fadeInMs > 0 && sound) {
                this._fadeVolume(sound, 0, volume, fadeInMs);
            }

            return sound;
        } catch (error) {
            Logger.error("Local Audio Error:", error);
        }
    }

    /**
     * Stop a specific looping sound by key.
     * @param {string} key - The key used when starting the loop
     * @param {number} fadeOutMs - Fade-out duration in ms (0 = immediate)
     */
    async stopSound(key, fadeOutMs = 0) {
        const entry = this._activeLoops.get(key);
        if (!entry) return;

        // Cancel any in-progress fade
        if (entry.fadeTimer) clearInterval(entry.fadeTimer);

        if (fadeOutMs > 0 && entry.sound) {
            const startVol = entry.sound.volume ?? entry.volume;
            this._fadeVolume(entry.sound, startVol, 0, fadeOutMs, () => {
                this._killSound(entry.sound);
                this._activeLoops.delete(key);
            });
        } else {
            this._killSound(entry.sound);
            this._activeLoops.delete(key);
        }

        Logger.log(`[Local] Stopped loop: ${key} (fade: ${fadeOutMs}ms)`);
    }

    /**
     * Stop all active looping sounds.
     */
    async stopAll() {
        for (const [key, entry] of this._activeLoops) {
            if (entry.fadeTimer) clearInterval(entry.fadeTimer);
            this._killSound(entry.sound);
        }
        this._activeLoops.clear();
        Logger.log("[Local] All loops stopped.");
    }

    /**
     * Gradually transition a sound's volume between two levels.
     * @param {object} sound - Foundry Sound instance
     * @param {number} from - Start volume (0-1)
     * @param {number} to - End volume (0-1)
     * @param {number} durationMs - Transition duration
     * @param {Function} [onComplete] - Callback when fade finishes
     */
    _fadeVolume(sound, from, to, durationMs, onComplete = null) {
        if (!sound) {
            onComplete?.();
            return;
        }

        const steps = Math.max(1, Math.floor(durationMs / 50));
        const stepMs = durationMs / steps;
        const delta = (to - from) / steps;
        let current = from;
        let step = 0;

        const timer = setInterval(() => {
            step++;
            current += delta;

            // Clamp to target on final step
            if (step >= steps) {
                current = to;
                clearInterval(timer);
                onComplete?.();
            }

            try {
                if (sound.volume !== undefined) sound.volume = Math.max(0, Math.min(1, current));
            } catch { /* sound may have been destroyed */ }
        }, stepMs);
    }

    /**
     * Safely stop and clean up a Sound instance.
     * @param {object} sound
     */
    _killSound(sound) {
        try {
            if (sound?.stop) sound.stop();
            else if (sound?.pause) sound.pause();
        } catch { /* already stopped */ }
    }
}
