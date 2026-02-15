import { SoundConfigApp } from "./apps/SoundConfigApp.js";
import { AttunementApp } from "./apps/AttunementApp.js"; // Standardized Wizard
// import { SetupGuide } from "./apps/SetupGuide.js"; // Deprecated
import { SoundAuditor } from "./apps/SoundAuditor.js";
import { SoundHandler } from "./SoundHandler.js";
import { registerSettings } from "./settings.js";
import { SyrinscapeProvider } from "./providers/SyrinscapeProvider.js";


Hooks.once('init', async function () {
    console.log("Ionrift Resonance v1.4.1 | Initializing Sound Engine");

    // Register Templates
    loadTemplates([
        "modules/ionrift-sounds/templates/partials/auditor-list.hbs",
        "modules/ionrift-sounds/templates/partials/sound-card-row.hbs",
        "modules/ionrift-sounds/templates/partials/sound-group.hbs"
    ]);

    // Register Settings (CRITICAL: Must be done early)
    registerSettings();

    // Internal Setting for Wizard UI State
    game.settings.register("ionrift-sounds", "soundCompleteness", {
        name: "Sound Preset Completeness (Internal)",
        hint: "Tracks whether the user selected Core or Full library.",
        scope: "world",
        config: false,
        type: String,
        default: "full"
    });

    // Expose API
    game.ionrift = game.ionrift || {};
    game.ionrift.sounds = game.ionrift.sounds || {};

    // Import manager (it's a singleton export)
    const { soundManager } = await import("./SoundManager.js");
    game.ionrift.sounds.manager = soundManager;

    // Diagnostic Integration
    const { registerDiagnostics } = await import("./DiagnosticIntegration.js");
    registerDiagnostics();

    // console.log("Ionrift Resonance | Registering Menus...");
    // Register Setup Menu
    // Register Setup Menu
    game.settings.registerMenu("ionrift-sounds", "setupGuide", {
        name: "Attunement Protocol",
        label: "Open Attunement Protocol",
        hint: "Configure Syrinscape Token, Presets, and verify connection.",
        icon: "fas fa-broadcast-tower",
        type: AttunementApp,
        restricted: true
    });

    // Register Wizard Menu
    // Register Wizard Menu
    // Register Wizard Menu
    game.settings.registerMenu('ionrift-sounds', 'soundConfigMenu', {
        name: "Resonance Calibration",
        label: "Open Calibration",
        hint: "Configure custom sounds and attunement.",
        icon: "fas fa-sliders-h",
        type: SoundConfigApp,
        restricted: true
    });

    /* 
    // Register Sound Auditor Menu (Moved to Wizard)
    try {
        if (!SoundAuditor) {
            console.error("Ionrift Resonance | Class 'SoundAuditor' is UNDEFINED!");
        } else {
            // console.log("Ionrift Resonance | Registering SoundAuditor...");
            game.settings.registerMenu('ionrift-sounds', 'soundAuditorMenu', {
                name: "Sound Auditor",
                label: "Open Auditor",
                hint: "Audit and manage custom sound flags on items.",
                icon: "fas fa-search-dollar", // or fa-list-alt
                type: SoundAuditor,
                restricted: true
            });
        }
    } catch (err) {
        console.error("Ionrift Resonance | Failed to register Sound Auditor:", err);
    }
    */

    // console.log("Ionrift Resonance | Settings Registered via settings.js");

    // Start Engine (After Settings Registered & Modules Ready)
    Hooks.once('ready', async () => {
        // Initialize Handler (Main Controller) - IMMEDIATELY to register hooks
        // This sets up game.ionrift.handler
        new SoundHandler();

        // [FIX] Robustly wait for 'syrinscape-control' to initialize its API
        await waitForDependency();

        // Initialize Manager (Audio Player / Soundboard)
        await game.ionrift.sounds.manager.initialize();

        if (game.user.isGM) {
            // Check if we need to show the standardized Attunement Protocol
            // We use the static helper from AbstractWelcomeApp (which AttunementApp extends)
            // Note: We need to import the class or ensure it's available. It is imported above.

            // Check if settings allow
            // const currentVersion = game.modules.get("ionrift-sounds").version;
            // if (AttunementApp.shouldShow("ionrift-sounds", "setupVersion", currentVersion)) {
            //     new AttunementApp().render(true);
            // }

            // Check if version mismatch requires Setup/Attunement

            const currentVersion = game.modules.get("ionrift-sounds").version;
            const lastVersion = game.settings.get("ionrift-sounds", "setupVersion");

            if (currentVersion !== lastVersion) {
                new AttunementApp().render(true);
            }
        }
        // Register Status Indicator (Generic Integration)
        if (game.ionrift?.integration) {
            game.ionrift.integration.registerApp('ionrift-sounds', {
                settingsKey: ['ionrift-sounds.setupGuide'],
                checkStatus: async () => {
                    // console.log("Ionrift Sounds | Running Status Check...");

                    const ionToken = game.settings.get('ionrift-sounds', 'syrinToken');
                    const controlModule = game.modules.get("syrinscape-control");
                    const controlActive = controlModule?.active || !!globalThis.syrinscapeControl;
                    const controlToken = controlActive ? game.settings.get("syrinscape-control", "authToken") : null;

                    // 1. Mismatch Detection (Robust)
                    const t1 = (ionToken || "").trim();
                    const t2 = (controlToken || "").trim();
                    const mismatch = controlActive && t1 && (t1 !== t2);

                    if (mismatch) {
                        console.warn("Ionrift Sounds | Token Mismatch Detected. Falling back to Direct API.");
                        // Fallback: Use Ionrift Token directly (ignoring Control Module)
                        try {
                            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
                            const response = await fetch(url, { method: 'GET' });
                            if (response.ok) {
                                return {
                                    status: game.ionrift.integration.STATUS.WARNING,
                                    label: 'Fallback Mode',
                                    message: 'Token Mismatch: The tokens in Resonance and Syrinscape Control are out of sync.\nFalling back to Resonance configuration to ensure stability.'
                                };
                            } else {
                                return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Auth Failed', message: `Syrinscape Rejected Resonance Token (${response.status})` };
                            }
                        } catch (e) {
                            return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Unreachable', message: 'Network Error (Direct)' };
                        }
                    }

                    // 2. Control Module Integration (Synced)
                    if (controlActive) {
                        // Trust the module state to avoid conflicts
                        const player = game.syrinscape?.player || globalThis.syrinscapeControl?.player;
                        const state = player?.state || "Idle";

                        if (state === "Active") {
                            return { status: game.ionrift.integration.STATUS.CONNECTED, label: 'Connected', message: 'Syrinscape Online Ready (Control)' };
                        } else if (state === "Connecting") {
                            return { status: game.ionrift.integration.STATUS.WARNING, label: 'Connecting', message: 'Establishing Link...' };
                        } else if (state === "Error") {
                            return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Error', message: 'Syrinscape Control Error' };
                        }
                        // Verify connectivity via Direct API if Control state is ambiguous (Idle/Other)
                        // console.log(`Ionrift Sounds | Control State: ${state}. Verifying via Direct API...`);
                        try {
                            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
                            const response = await fetch(url, { method: 'GET' });
                            if (response.ok) {
                                return { status: game.ionrift.integration.STATUS.CONNECTED, label: 'Connected', message: `Syrinscape Online Ready (Direct check: ${state})` };
                            } else {
                                return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Offline', message: `Syrinscape Control: ${state} (Auth Failed)` };
                            }
                        } catch (e) {
                            return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Offline', message: `Syrinscape Control: ${state}` };
                        }
                    }

                    // 3. Standard Direct API (No Control Module)
                    if (!ionToken) {
                        return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Missing Token', message: 'No Auth Token Configured. (Run Calibration)' };
                    }

                    try {
                        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
                        const response = await fetch(url, { method: 'GET' });
                        if (response.ok) {
                            return { status: game.ionrift.integration.STATUS.CONNECTED, label: 'Connected', message: 'Syrinscape Online Ready (Direct)' };
                        } else {
                            return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Auth Failed', message: `Syrinscape Rejected Token (${response.status})` };
                        }
                    } catch (e) {
                        return { status: game.ionrift.integration.STATUS.OFFLINE, label: 'Unreachable', message: 'Network Error' };
                    }
                }
            });
        }
    });
});

/**
 * Polls for the existence of the Syrinscape Control API.
 * Resolves immediately if found, or waits up to 2 seconds.
 */
async function waitForDependency() {
    const maxRetries = 20; // 2 seconds total
    const interval = 100;

    for (let i = 0; i < maxRetries; i++) {
        const v1 = game.syrinscape;
        const v2 = globalThis.syrinscapeControl;

        if (v1 || v2) {
            // if (i > 0) console.log(`Ionrift Sounds | Dependency found after ${i * interval}ms.`);
            return;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    console.warn("Ionrift Sounds | Syrinscape Control API not found after waiting. Initialization may be partial.");
}



// Hook to prevent accidental preset switches if overrides exist
// Hook to prevent accidental preset switches if overrides exist
Hooks.on('preUpdateSetting', (setting, changes, options, userId) => {
    if (setting.key !== 'ionrift-sounds.soundPreset') return;
    if (options.ionriftConfirmed) return;

    const current = game.settings.get("ionrift-sounds", "soundPreset");
    const target = changes.value;

    // Clean values (remove quotes and whitespace)
    const cleanCurrent = (typeof current === "string") ? current.replace(/^["']|["']$/g, '').trim() : current;
    const cleanTarget = (typeof target === "string") ? target.replace(/^["']|["']$/g, '').trim() : target;

    // Ignore identical updates
    if (cleanCurrent === cleanTarget) return;

    // BLOCK SYNC & Launch Async Check
    // We strictly block the update here, then re-fire it if confirmed.
    (async () => {
        // Dynamic Import
        const { PresetSafetyCheck } = await import("./PresetSafetyCheck.js");

        // MITIGATION: Lock the Settings Config window
        const settingsApp = Object.values(ui.windows).find(w => w.id === "client-settings");
        if (settingsApp) {
            settingsApp.element.css("pointer-events", "none");
            settingsApp.element.css("opacity", "0.5");
            settingsApp.element.find("button").prop("disabled", true);
        }

        try {
            const safe = await PresetSafetyCheck.confirmSwitch(cleanCurrent, cleanTarget);

            if (safe) {
                // Re-apply the setting with the confirmation flag (and CLEANED value)
                game.settings.set("ionrift-sounds", "soundPreset", cleanTarget, { ionriftConfirmed: true });
            } else {
                ui.notifications.warn("Ionrift Sounds: Preset switch cancelled.");
            }
        } finally {
            // Unlock UI
            if (settingsApp) {
                settingsApp.element.css("pointer-events", "auto");
                settingsApp.element.css("opacity", "1.0");
                settingsApp.element.find("button").prop("disabled", false);
            }
        }
    })();

    return false; // Block the original request
});

// Hook into Settings Config to display status icon on load
Hooks.on('renderSettingsConfig', (app, html, data) => {
    // Check if we have the library helper
    // Check if we have the library helper
    // Check if we have the centralized status interface
    if (game.ionrift?.integration) {
        game.ionrift.integration.renderSettingsIndicator(html, app);
    }

});

// Sidebar Injection (Playlist Directory)
Hooks.on("renderPlaylistDirectory", (app, html, data) => {
    if (!game.user.isGM) return;

    // Inject button
    const $html = $(html);
    if ($html.find(".ionrift-sound-manager-btn").length > 0) return;

    const btn = $(`<button class="ionrift-sound-manager-btn"><i class="fas fa-sliders-h"></i> Resonance Calibration</button>`);
    btn.click(() => {
        // Instantiate the Sound Wizard
        new SoundConfigApp().render(true);
    });

    $html.find(".header-actions").append(btn);
});
