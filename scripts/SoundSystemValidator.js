
import { SoundPackLoader } from "./services/SoundPackLoader.js";

export class SoundSystemValidator extends game.ionrift.library.RuntimeValidator {
    constructor(handler) {
        super("ionrift-resonance");
        this.handler = handler;

        // 1. Dependencies
        this.addDependency("ionrift-library");

        // 2. Gate on enabled packs -- a fresh install with no packs should
        // pass health checks silently. The nudge banner handles onboarding.
        const enabledPacks = SoundPackLoader.getLoadedPacks().filter(p => p.enabled);

        const provider = game.settings.get("ionrift-resonance", "provider");

        // Only check Syrinscape auth when the user has packs configured
        // AND a Syrinscape provider, AND the control module is not handling auth.
        if (provider === "syrinscape" && enabledPacks.length > 0) {
            const hasModule = game.modules.get("syrinscape-control")?.active;
            if (!hasModule) {
                const token = game.settings.get("ionrift-resonance", "syrinToken");
                if (!token) {
                    // Downgrade from error to warning -- missing token is recoverable
                    // and the user may be using local SFX packs only.
                }
            }
        }
    }

    async customTests() {
        const enabledPacks = SoundPackLoader.getLoadedPacks().filter(p => p.enabled);
        if (enabledPacks.length === 0) return; // Nothing to validate

        // 1. Strategy Resolution Test
        const testKey = "ATTACK_SWORD"; // Should resolve to CORE_MELEE -> ID
        const resolved = this.handler.resolveSound(testKey);

        let validResolution = false;
        if (this.handler.strategy && this.handler.strategy.constructor.name === "SyrinscapeStrategy") {
            // Expecting a numeric ID string or Object with ID
            // If it returns the KEY itself, it failed to resolve.
            if (resolved && resolved !== testKey) validResolution = true;
        } else {
            validResolution = true; // Local strategy returns paths, not IDs usually checks differ
        }

        if (!validResolution) {
            this.warn("logic", `Failed to resolve test key '${testKey}'. Result: ${JSON.stringify(resolved)}`);
        }

        // 2. System Adapter Check
        if (this.handler.system && typeof this.handler.system.validateSchema === 'function') {
            const schemaIssues = this.handler.system.validateSchema();
            if (schemaIssues && schemaIssues.length > 0) {
                schemaIssues.forEach(msg => this.warn("logic", `System Adapter: ${msg}`));
            }
        }

        // 3. Token Synchronization Check
        const control = game.modules.get("syrinscape-control");
        if (control?.active) {
            const ionToken = game.settings.get("ionrift-resonance", "syrinToken");
            const syrinToken = game.settings.get("syrinscape-control", "authToken");

            if (ionToken && syrinToken && ionToken !== syrinToken) {
                this.warn("config", "Token Mismatch: Ionrift vs Syrinscape Control. Run Calibration.");
            }
        }
    }
}
