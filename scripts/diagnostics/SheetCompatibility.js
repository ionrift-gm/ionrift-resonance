/**
 * Diagnostic check for Actor Sheet compatibility and injection status.
 * @param {ReportBuilder} builder - The report builder instance.
 */
export async function checkSheetCompatibility(builder) {
    const category = "Ionrift Resonance"; // Group under main module label or separate? usually helpful to keep consistent

    // 1. System Version
    const system = game.system;
    const sysId = system.id;
    const sysVer = system.version;

    if (sysId === "dnd5e") {
        const isV3 = foundry.utils.isNewerVersion(sysVer, "3.0.0");
        const status = isV3 ? "PASS" : "WARN";
        builder.addResult(category, "System Version", status, `${sysId} v${sysVer} ${isV3 ? "" : "(Legacy - specific hooks may fail)"}`);
    } else {
        builder.addResult(category, "System", "INFO", `${sysId} v${sysVer} (Non-D&D5e)`);
    }

    // 2. Default Sheet Configuration
    const sheetConfig = CONFIG.Actor?.sheetClasses?.character;
    if (sheetConfig) {
        // Find default
        const defaultID = Object.keys(sheetConfig).find(k => sheetConfig[k].default);
        const defaultClass = sheetConfig[defaultID]?.cls;

        if (defaultClass) {
            const name = defaultClass.name;
            let status = "PASS";
            let msg = `Default: ${name}`;

            // Known Compatible Sheets (Loose matching)
            const compatibleKeywords = ["ActorSheet5eCharacter", "Tidy5e", "CharacterActorSheet"];
            const isKnown = compatibleKeywords.some(c => name.includes(c));

            if (!isKnown) {
                status = "WARN";
                msg += " (Custom Sheet - Injection may require manual configuration)";
            }

            builder.addResult(category, "Sheet Class", status, msg);
        } else {
            builder.addResult(category, "Sheet Class", "FAIL", "No default character sheet configured.");
        }
    }

    // 3. Hook Registration (Header Buttons)
    const hookV1 = "getActorSheetHeaderButtons";
    const hookV2 = "getApplicationHeaderControls";

    const hasV1 = Hooks.events[hookV1] && Hooks.events[hookV1].length > 0;
    const hasV2 = Hooks.events[hookV2] && Hooks.events[hookV2].length > 0;

    if (hasV1 || hasV2) {
        builder.addResult(category, "Injection Hook", "PASS", `Active listeners found (V1: ${hasV1}, V2: ${hasV2}).`);
    } else {
        builder.addResult(category, "Injection Hook", "WARN", `No listeners found for ${hookV1} or ${hookV2}. Sound button will not appear.`);
    }
}
