import { SoundSystemValidator } from "./SoundSystemValidator.js";

import { checkSheetCompatibility } from "./diagnostics/SheetCompatibility.js";
import { OrchestratorDiagnostics } from "./diagnostics/OrchestratorDiagnostics.js";
import { SoundPackLoader } from "./services/SoundPackLoader.js";
import { Logger } from "./Logger.js";

/**
 * Registers the diagnostic hook for Ionrift Resonance.
 */
export function registerDiagnostics() {
    Hooks.on("ionrift.runDiagnostics", (builder) => {
        builder.addAsync(runSoundDiagnostics(builder));
        builder.addAsync(checkSheetCompatibility(builder));
        reportSoundPacks(builder);
    });

    // Expose Orchestrator test runner for console/macro access:
    // game.ionrift.resonance.runOrchestratorTests()
    game.ionrift = game.ionrift || {};
    game.ionrift.resonance = game.ionrift.resonance || {};
    game.ionrift.resonance.runOrchestratorTests = () => new OrchestratorDiagnostics().run();
}

/**
 * Runs the SoundSystemValidator and reports results to the builder.
 * @param {ReportBuilder} builder 
 */
async function runSoundDiagnostics(builder) {
    // Ensure SoundSystemValidator exists (it depends on ionrift-lib)
    if (!game.ionrift?.library?.RuntimeValidator) {
        builder.addResult("Ionrift Resonance", "Dependency Check", "FAIL", "Ionrift Library (RuntimeValidator) missing.");
        return;
    }

    try {
        // Instantiate the validator
        // usage: new SoundSystemValidator(game.ionrift.handler)
        // Ensure handler exists
        if (!game.ionrift.handler) {
            builder.addResult("Ionrift Resonance", "Handler Check", "FAIL", "SoundHandler not initialized.");
            return;
        }

        const validator = new SoundSystemValidator(game.ionrift.handler);

        // Run validation (this populates validator.results)
        // Note: This nominally logs to console too via .report()
        await validator.run();

        // 1. Check for Issues
        if (validator.hasIssues) {
            const categories = ["dependencies", "settings", "logic"];

            for (const cat of categories) {
                for (const issue of validator.results[cat]) {
                    builder.addResult(
                        "Ionrift Resonance",
                        `Validation (${cat})`,
                        issue.type === "error" ? "FAIL" : "WARN",
                        issue.message
                    );
                }
            }
        } else {
            // 2. Report Success
            builder.addResult("Ionrift Resonance", "System Health", "PASS", "All systems nominal.");
        }

        // 3. Run New Diagnostic Suite (SoundDiagnostics)
        // This unifies /iondebug logic with the main report
        const { SoundDiagnostics } = await import("./diagnostics/SoundDiagnostics.js");
        const diagnostic = new SoundDiagnostics(game.ionrift.handler);

        // Hijack the logger to feed the Builder
        diagnostic.log = (msg, type) => {
            // Map types to builder status
            let status = "INFO";
            if (type === "success") status = "PASS";
            else if (type === "warn") status = "WARN";
            else if (type === "error") status = "FAIL";

            builder.addResult("Ionrift Resonance", "Runtime Check", status, msg);
        };

        // Run the suite (which calls our hijacked log)
        await diagnostic.run();

        // Prevent double-logging to chat (since SoundDiagnostics normally does)
        diagnostic._displayResults = () => { };


    } catch (err) {
        Logger.error("Diagnostic Error:", err);
        builder.addResult("Ionrift Resonance", "Critical Error", "FAIL", `Exception: ${err.message}`);
    }
}

/**
 * Reports sound pack status to the diagnostic builder.
 * Informational only: PASS when packs are loaded, INFO otherwise.
 * @param {ReportBuilder} builder
 */
function reportSoundPacks(builder) {
    if (!SoundPackLoader.loaded) {
        builder.addResult("Ionrift Resonance", "Sound Packs", "INFO", "Sound pack loader has not run yet.");
        return;
    }

    const packs = SoundPackLoader.getLoadedPacks();
    if (packs.length === 0) {
        builder.addResult("Ionrift Resonance", "Sound Packs", "INFO", "No sound packs installed.");
        return;
    }

    const enabled = packs.filter(p => p.enabled);
    builder.addResult(
        "Ionrift Resonance",
        "Sound Packs",
        "PASS",
        `${packs.length} pack(s) found, ${enabled.length} enabled.`
    );

    for (const pack of packs) {
        const status = pack.enabled ? "PASS" : "INFO";
        const label = pack.enabled ? "enabled" : "disabled";
        builder.addResult(
            "Ionrift Resonance",
            "Sound Packs",
            status,
            `${pack.name} v${pack.version}: ${pack.bindingCount} bindings (${label})`
        );
    }
}
