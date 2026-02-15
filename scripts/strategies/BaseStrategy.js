/**
 * Abstract class for Sound Playback Strategies.
 * Implement this class to create new sound providers (e.g. Foundry Audio, External API, etc.)
 */
import { Logger } from "../Logger.js";

export class BaseStrategy {
    constructor(handler) {
        if (this.constructor === BaseStrategy) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this.handler = handler;
    }

    /**
     * Initialize the strategy (load assets, connect to APIs, etc.)
     */
    async init() {
        Logger.log("Initializing Strategy:", this.constructor.name);
    }

    /**
     * Play a sound based on a sound ID or configuration object.
     * @param {string|number|object} soundId - The identifier for the sound to play.
     * @param {number} [volume] - Volume level (0-1 or varying scales depending on implementation).
     */
    play(soundId, volume) {
        throw new Error("Method 'play()' must be implemented.");
    }

    /**
     * Preload a sound if possible.
     * @param {string|number} soundId 
     */
    preload(soundId) {
        // Optional implementation
    }
}
