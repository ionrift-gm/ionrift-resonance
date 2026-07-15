export class SystemAdapter {
    constructor(handler) {
        this.handler = handler;
        if (this.constructor === SystemAdapter) {
            throw new Error("Abstract class SystemAdapter cannot be instantiated.");
        }
    }

    registerHooks() {
        throw new Error("Method 'registerHooks()' must be implemented.");
    }

    /** Default: HP-down means damage. Override for damage-up systems (e.g. Daggerheart). */
    isDamage(oldHp, newHp) {
        return newHp < oldHp;
    }

    isDeath(newHp, maxHp, isPC) {
        if (isPC) {
            const overflow = Math.abs(Math.min(0, newHp));
            return overflow >= maxHp;
        }
        return newHp <= 0;
    }

    resolveSystemSound(_item, _actor, _resolver) {
        return null;
    }

    play(key, delay = 0, volume) {
        if (this.handler) {
            this.handler.play(key, delay);
        }
    }

    get config() {
        return this.handler.config;
    }
}
