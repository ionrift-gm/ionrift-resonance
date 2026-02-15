/**
 * Abstract class for System Adapters.
 * Handles system-specific hooks and logic (e.g. Daggerheart Duality Dice vs DnD5e MidiQOL).
 */
export class SystemAdapter {
    /**
     * @param {SoundHandler} handler - Reference to the main SoundHandler (to access strategy & config)
     */
    constructor(handler) {
        this.handler = handler;
        if (this.constructor === SystemAdapter) {
            throw new Error("Abstract class SystemAdapter cannot be instantiated.");
        }
    }

    /**
     * Register system-specific hooks.
     */
    registerHooks() {
        throw new Error("Method 'registerHooks()' must be implemented.");
    }

    /**
     * Helper to play sound via the main handler's strategy.
     * @param {string} key - Abstract Sound Key (SOUND_EVENTS)
     * @param {number} [volume]
     */
    play(key, volume, delay = 0) {
        // Delegate directly to the active Strategy
        // This ensures consistent logic (URL parsing, token handling, etc.)
        if (this.handler.strategy) {
            if (delay > 0) {
                setTimeout(() => this.handler.strategy.play(key, volume), delay);
            } else {
                this.handler.strategy.play(key, volume);
            }
        }
    }

    get config() {
        return this.handler.config;
    }
}
