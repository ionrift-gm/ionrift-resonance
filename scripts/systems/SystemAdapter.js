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
    play(key, delay = 0, volume) {
        // Delegate to SoundHandler for proper resolution chain
        // Handler -> Resolver -> Manager -> Provider
        if (this.handler) {
            this.handler.play(key, delay);
        }
    }

    get config() {
        return this.handler.config;
    }
}
