import { SoundProvider } from "./SoundProvider.js";
import { Logger } from "../Logger.js";

export class FoundryAudioProvider extends SoundProvider {
    /**
     * Plays a local audio file.
     * @param {string} soundId - The path to the audio file (e.g., "modules/my-module/sounds/explosion.wav")
     * @param {object|number} options - Volume number (legacy) or options object { volume, delay, type }
     */
    async playSound(soundId, options = {}) {
        if (!soundId) return;

        const volume = (typeof options === 'number') ? options : (options.volume ?? 1.0);

        Logger.log(`[Local] Playing: ${soundId} (vol: ${volume})`);

        try {
            AudioHelper.play({
                src: soundId,
                volume: volume,
                loop: false
            }, true);
        } catch (error) {
            Logger.error("Local Audio Error:", error);
        }
    }
}
