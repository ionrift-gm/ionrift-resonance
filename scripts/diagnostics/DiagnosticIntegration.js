import { SoundSystemValidator } from "./SoundSystemValidator.js";
import { checkSheetCompatibility } from "./SheetCompatibility.js";
import { OrchestratorDiagnostics } from "./OrchestratorDiagnostics.js";
import { SoundPackLoader } from "../services/packs/SoundPackLoader.js";
import { Logger } from "../utils/Logger.js";

export function registerDiagnostics() {
    Hooks.on("ionrift.runDiagnostics", (builder) => {
        builder.addAsync(runSoundDiagnostics(builder));
        builder.addAsync(checkSheetCompatibility(builder));
        reportSoundPacks(builder);
    });

    game.ionrift = game.ionrift || {};
    game.ionrift.resonance = game.ionrift.resonance || {};
    game.ionrift.resonance.runOrchestratorTests = () => new OrchestratorDiagnostics().run();
}

async function runSoundDiagnostics(builder) {
    if (!game.ionrift?.library?.RuntimeValidator) {
        builder.addResult("Ionrift Resonance", "Dependency Check", "FAIL", "Ionrift Library (RuntimeValidator) missing.");
        return;
    }

    try {
        if (!game.ionrift.resonance?.handler) {
            builder.addResult("Ionrift Resonance", "Handler Check", "FAIL", "SoundHandler not initialized.");
            return;
        }

        const validator = new SoundSystemValidator(game.ionrift.resonance?.handler);
        await validator.run();

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
            builder.addResult("Ionrift Resonance", "System Health", "PASS", "All systems nominal.");
        }

        const { SoundDiagnostics } = await import("./SoundDiagnostics.js");
        const diagnostic = new SoundDiagnostics(game.ionrift.resonance?.handler);

        diagnostic.log = (msg, type) => {
            let status = "INFO";
            if (type === "success") status = "PASS";
            else if (type === "warn") status = "WARN";
            else if (type === "error") status = "FAIL";
            builder.addResult("Ionrift Resonance", "Runtime Check", status, msg);
        };

        await diagnostic.run();
        diagnostic._displayResults = () => { };
    } catch (err) {
        Logger.error("Diagnostic Error:", err);
        builder.addResult("Ionrift Resonance", "Critical Error", "FAIL", `Exception: ${err.message}`);
    }
}

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

    const enabled = packs.filter((p) => p.enabled);
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
