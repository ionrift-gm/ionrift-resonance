import { SoundProvider } from "./SoundProvider.js";
import { Logger } from "../Logger.js";

export class FoundryAudioProvider extends SoundProvider {
    /**
     * Plays a local audio file.
     * @param {string} soundId - The path to the audio file (e.g., "modules/my-module/sounds/explosion.ogg")
     * @param {number} volume - Volume (0.0 to 1.0)
     */
    async playSound(soundId, volume = 1.0) {
        if (!soundId) return;

        Logger.log(`[Local] Playing: ${soundId}`);

        try {
            AudioHelper.play({
                src: soundId,
                volume: volume,
                loop: false
            }, true);
        } catch (error) {
            Logger.error("Local Audio Error:", error);
        }
    }
}
