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
     * Determine whether an HP change represents damage taken.
     *
     * HP direction varies by system:
     *   - DnD5e / PF2e: HP decreases on damage (standard HP-down model)
     *   - Daggerheart:  HP increases on damage (damage-UP model — HP value
     *                   represents accumulated damage, reaching max = death)
     *
     * Adapters MUST override this if their system uses a non-standard HP model.
     * Shared utilities should call this instead of comparing HP values directly.
     *
     * @param {number} oldHp - HP value before the change
     * @param {number} newHp - HP value after the change
     * @returns {boolean} true if the change represents damage
     */
    isDamage(oldHp, newHp) {
        return newHp < oldHp;
    }

    /**
     * Determine whether an HP change represents a killing blow.
     *
     * @param {number} newHp - HP value after the change
     * @param {number} maxHp - Maximum HP for the actor
     * @param {boolean} isPC - Whether the actor is a player character
     * @returns {boolean} true if the actor is dead
     */
    isDeath(newHp, maxHp, isPC) {
        if (isPC) {
            const overflow = Math.abs(Math.min(0, newHp));
            return overflow >= maxHp;
        }
        return newHp <= 0;
    }

    /**
     * System-specific sound key resolution for items/actors.
     * Called by SoundResolver.pickSound() before generic fallback matching.
     * Override in subclasses for system-specific logic (e.g. DH domain resolution).
     *
     * @param {Item|null} item - The item being used
     * @param {Actor|null} actor - The actor using the item
     * @param {SoundResolver} resolver - The resolver instance (for resolveKey calls)
     * @returns {string|null} A sound key if resolved, or null to continue the chain
     */
    resolveSystemSound(_item, _actor, _resolver) {
        return null;
    }

    /**
     * Helper to play sound via the main handler's strategy.
     * @param {string} key - Abstract Sound Key (SOUND_EVENTS)
     * @param {number} [volume]
     */
    play(key, delay = 0, volume) {
        if (this.handler) {
            this.handler.play(key, delay);
        }
    }

    get config() {
        return this.handler.config;
    }
}
