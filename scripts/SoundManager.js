import { SyrinscapeProvider } from "./providers/SyrinscapeProvider.js";
import { FoundryAudioProvider } from "./providers/FoundryAudioProvider.js";
import { Logger } from "./Logger.js";

export class SoundManager {
    constructor() {
        if (SoundManager.instance) {
            return SoundManager.instance;
        }
        SoundManager.instance = this;

        this.provider = null;
    }

    initialize() {
        const providerType = game.settings.get('ionrift-resonance', 'provider') || 'syrinscape';

        if (providerType === 'foundry') {
            this.provider = new FoundryAudioProvider();
        } else {
            this.provider = new SyrinscapeProvider();
        }

        Logger.log(`SoundManager Initialized with provider: ${this.provider.constructor.name}`);
    }

    /**
     * Unified Playback Method
     * @param {string|object|string[]} soundData - The ID, Array of IDs, or Config Object
     * @param {object} options - Overrides { delay, volume, type }
     */
    async play(soundData, options = {}) {
        if (!soundData) return;

        // 1. Resolve Input (Handle Arrays -> Random Selection here, or let Provider do it?)
        // Provider has logic for it, but let's do it here to standardize behavior before logging.
        let target = soundData;
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

        // 3. Handle Delays (Manager handles waiting)
        const delay = finalOptions.delay || 0;
        if (delay > 0) {
            setTimeout(() => {
                this.provider?.playSound(finalId, finalOptions);
            }, delay);
        } else {
            this.provider?.playSound(finalId, finalOptions);
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
        this.play(id, { type: 'element' });
    }

    stopAll() {
        if (this.provider && typeof this.provider.stopAll === 'function') {
            this.provider.stopAll();
        }
    }
    async search(query, options = {}) {
        if (!this.provider) return [];
        Logger.log(`SoundManager | Searching via Provider: ${this.provider.constructor.name}`);
        return await this.provider.search(query, options);
    }
}

export const soundManager = new SoundManager();
