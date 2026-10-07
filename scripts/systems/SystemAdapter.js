import { originFromActor, originFromToken } from "../services/playback/SoundOrigin.js";

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

    play(key, delayOrOptions = 0, volume) {
        if (!this.handler) return;
        if (typeof delayOrOptions === "number" && volume === undefined) {
            this.handler.play(key, delayOrOptions);
            return;
        }
        let options;
        if (typeof delayOrOptions === "number") options = { delay: delayOrOptions };
        else if (delayOrOptions && typeof delayOrOptions === "object") options = { ...delayOrOptions };
        else options = {};
        if (volume !== undefined && options.volume === undefined) options.volume = volume;
        this.handler.play(key, options);
    }

    /**
     * Play at a token or actor. No subject means the sound stays global.
     * @param {string} key
     * @param {object|null} subject
     * @param {number} [delay]
     */
    playAt(key, subject, delay = 0, spatialKey = null) {
        const origin = originFromToken(subject) || originFromActor(subject);
        const ms = typeof delay === "number" ? delay : 0;
        const options = { delay: ms, origin };
        if (spatialKey) options.spatialKey = spatialKey;
        this.play(key, options);
    }

    get config() {
        return this.handler.config;
    }
}
