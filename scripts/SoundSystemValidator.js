
export class SoundSystemValidator extends game.ionrift.library.RuntimeValidator {
    constructor(handler) {
        super("ionrift-resonance");
        this.handler = handler;

        // 1. Dependencies
        this.addDependency("ionrift-library");
        this.addDependency("syrinscape-control", {
            optional: true,
            reason: "Required for Embedded Mode"
        });

        // 2. Settings
        this.addSetting("soundPreset", { type: "string" });
        // provider is valid if set
        this.addSetting("provider", {
            validator: (val) => ["syrinscape", "foundry"].includes(val),
            message: "Audio Provider is invalid."
        });

        if (game.settings.get("ionrift-resonance", "provider") === "syrinscape") {
            // Token is optional if module is present
            const hasModule = game.modules.get("syrinscape-control")?.active;
            if (!hasModule) {
                this.addSetting("syrinToken", {
                    message: "Syrinscape Auth Token missing (Required for Direct API)."
                });
            }
        }
    }

    async customTests() {
        if (this.handler.activePreset === "none") return;

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
