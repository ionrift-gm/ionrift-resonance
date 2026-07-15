export class SoundProvider {
    constructor() {
        if (new.target === SoundProvider) {
            throw new TypeError("Cannot construct SoundProvider instances directly");
        }
    }

    async playSound(soundId, volume = 1.0) {
        throw new Error("Method 'playSound()' must be implemented.");
    }

    async search(query) {
        return [];
    }

    async stopAll() {
    }
}
