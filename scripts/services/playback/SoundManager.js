import { SyrinscapeProvider } from "../../providers/concrete/SyrinscapeProvider.js";
import { FoundryAudioProvider } from "../../providers/concrete/FoundryAudioProvider.js";
import { Logger } from "../../utils/Logger.js";
import { SOUND_TYPES } from "../../data/soundTypes.js";

export class SoundManager {
    constructor() {
        if (SoundManager.instance) {
            return SoundManager.instance;
        }
        SoundManager.instance = this;

        this.syrinscapeProvider = null;
        this.localProvider = null;
        this.provider = null;
    }

    initialize() {
        this.syrinscapeProvider = new SyrinscapeProvider();
        this.localProvider = new FoundryAudioProvider();
        this.provider = this.syrinscapeProvider;

        Logger.log("SoundManager Initialized with dual-provider routing (Syrinscape + Local)");
    }

    _getProvider(soundId) {
        if (typeof soundId === "string" && (soundId.includes("/") || /\.(wav|mp3|ogg|flac|webm)$/i.test(soundId))) {
            return this.localProvider;
        }
        return this.syrinscapeProvider;
    }

    async play(soundData, options = {}) {
        if (!soundData) return;

        Logger.log("SoundManager | Play Request:", { soundData, options });

        // Resolve arrays to random selection before logging.
        let target = soundData;
        // Expand comma-separated strings into arrays (from resolveKey multi-sound)
        if (typeof target === 'string' && target.includes(',')) {
            target = target.split(',').map(s => s.trim());
        }
        if (Array.isArray(target)) {
            target = target[Math.floor(Math.random() * target.length)];
        }

        // 2. Resolve Object Structure { id, delay, volume } from data
        // If soundData is complex object { id: "...", config: { ... } }
        let finalId = target;
        let finalOptions = { ...options };

        if (typeof target === 'object' && target !== null) {
            // Unpack Ionrift "Binding" Object
            if (target.id) finalId = target.id;

            // Unpack Config (Delay/Volume)
            if (target.config) {
                // Check for ID-specific config (Multi-Sound Config Pattern)
                const specificConfig = target.config[finalId];
                if (specificConfig) {
                    if (specificConfig.delayMin || specificConfig.delayMax) {
                        const min = specificConfig.delayMin || 0;
                        const max = specificConfig.delayMax || 0;
                        // Random delay between min and max
                        finalOptions.delay = (Math.random() * (max - min) + min) * 1000; // Convert to ms
                    }
                }

                // If target.config has volume directly (Legacy/Simple)
                if (target.config.volume) finalOptions.volume = target.config.volume;
            }

            // If target.type exists, pass it
            if (target.type) finalOptions.type = target.type;
        } else {
            // It's a primitive string/ID
            finalId = target;
        }

        // 3. Apply taxonomy volume multiplier (from SoundHandler)
        if (finalOptions.volumeMultiplier !== undefined) {
            finalOptions.volume = (finalOptions.volume ?? 1.0) * finalOptions.volumeMultiplier;
            delete finalOptions.volumeMultiplier;
        }

        // 4. Route to correct provider based on ID format
        const provider = this._getProvider(finalId);

        // 5. Handle Delays (Manager handles waiting)
        const delay = finalOptions.delay || 0;
        if (delay > 0) {
            setTimeout(() => {
                provider.playSound(finalId, finalOptions);
            }, delay);
        } else {
            provider.playSound(finalId, finalOptions);
        }
    }

    // Legacy Alias
    playSound(soundKey, specificId = null, delay = 0) {
        // Map old signature to new
        const id = specificId || soundKey;
        this.play(id, { delay: delay });
    }

    // Legacy Alias
    playElement(id) {
        // Force element type if possible, or just pass through
        this.play(id, { type: SOUND_TYPES.ELEMENT });
    }

    stopAll() {
        // Stop both providers
        if (this.syrinscapeProvider && typeof this.syrinscapeProvider.stopAll === 'function') {
            this.syrinscapeProvider.stopAll();
        }
        if (this.localProvider && typeof this.localProvider.stopAll === 'function') {
            this.localProvider.stopAll();
        }
    }

    async search(query, options = {}) {
        if (!this.syrinscapeProvider) return [];
        Logger.log(`SoundManager | Searching via Syrinscape Provider`);
        return await this.syrinscapeProvider.search(query, options);
    }

    // Ambient: local provider only.
    async playAmbient(key, soundData, options = {}) {
        if (!this.localProvider) return;

        let soundId = soundData;
        if (typeof soundData === "object" && soundData !== null) {
            soundId = soundData.id ?? soundData;
        }
        if (Array.isArray(soundId)) {
            const pick = soundId[Math.floor(Math.random() * soundId.length)];
            soundId = (typeof pick === "object") ? pick.id : pick;
        }

        Logger.log(`SoundManager | playAmbient: ${key} as ${soundId}`);
        return this.localProvider.playSound(soundId, {
            ...options,
            loop: true,
            key
        });
    }
    async stopAmbient(key, fadeOutMs = 1500) {
        if (!this.localProvider) return;
        Logger.log(`SoundManager | stopAmbient: ${key} (fade: ${fadeOutMs}ms)`);
        return this.localProvider.stopSound(key, fadeOutMs);
    }
    stopAllAmbient() {
        if (!this.localProvider) return;
        Logger.log("SoundManager | stopAllAmbient");
        this.localProvider.stopAll();
    }
}

export const soundManager = new SoundManager();

