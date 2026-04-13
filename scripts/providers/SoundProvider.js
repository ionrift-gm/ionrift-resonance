export class SoundProvider {
    constructor() {
        if (new.target === SoundProvider) {
            throw new TypeError("Cannot construct SoundProvider instances directly");
        }
    }

    /**
     * Play a sound by ID
     * @param {string} soundId - The ID or Path of the sound
     * @param {number} [volume=1.0] - Volume modifier (0.0 to 1.0)
     */
    async playSound(soundId, volume = 1.0) {
        throw new Error("Method 'playSound()' must be implemented.");
    }

    /**
     * Search for sounds
     * @param {string} query - Search term
     * @returns {Promise<Array<{id: string, name: string, icon: string}>>}
     */
    async search(query) {
        return [];
    }

    /**
     * Stop all sounds (if supported)
     * @param {string} query - Search term
     */
    async stopAll() {
        // Optional implementation
    }
}
