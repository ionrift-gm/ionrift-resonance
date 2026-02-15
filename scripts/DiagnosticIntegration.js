import { SoundSystemValidator } from "./SoundSystemValidator.js";

import { checkSheetCompatibility } from "./diagnostics/SheetCompatibility.js";
import { Logger } from "./Logger.js";

/**
 * Registers the diagnostic hook for Ionrift Resonance.
 */
export function registerDiagnostics() {
    Hooks.on("ionrift.runDiagnostics", (builder) => {
        // Register async test functions
        builder.addAsync(runSoundDiagnostics(builder));
        builder.addAsync(checkSheetCompatibility(builder));
    });
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
