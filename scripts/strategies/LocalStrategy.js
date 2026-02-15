import { BaseStrategy } from "./BaseStrategy.js";
import { Logger } from "../Logger.js";

/**
 * Strategy for resolving sound keys to local file paths.
 * Simply looks up the key in the merged configuration.
 */
export class LocalStrategy extends BaseStrategy {

    get isAvailable() {
        return true; // Local audio is always available
    }

    async init() {
        super.init();
        Logger.log("Local Strategy Initialized");
    }

    getBindings() {
        // Parse User Overrides
        const overridesStr = game.settings.get("ionrift-resonance", "customSoundBindings") || "{}";
        let overrides = {};
        try {
            overrides = JSON.parse(overridesStr);
        } catch (e) {
            Logger.error("Failed to parse custom bindings JSON:", e);
        }

        // For Local, we primarily rely on User Overrides since we don't have a default library of paths yet.
        // But we can fallback to Sound Config mappings managed by SoundHandler if needed.
        return overrides;
    }

    resolve(soundId) {
        if (!soundId) return null;

        const bindings = this.getBindings();
        let path = bindings[soundId];

        // Fallback: If SoundHandler config has it (mapped via Wizard)
        if (!path && game.ionrift?.handler?.config) {
            // Deep check into config? 
            // Currently SoundHandler.pickSound logic uses mappings.
            // If SystemAdapter calls play("MONSTER_WOLF_BITE"), we expect it in bindings.
        }

        if (!path) {
            // If the ID looks like a path (contains / or .), treat it as explicit
            if (soundId.includes('/') || soundId.includes('.')) {
                return soundId;
            }
        }

        return path || soundId; // Fallback to key as path if nothing else
    }

    // Play is now handled by SoundManager, so we don't need to implement it here.
    play(soundId) {
        Logger.warn("LocalStrategy.play() called but should be via SoundManager.");
    }
}
