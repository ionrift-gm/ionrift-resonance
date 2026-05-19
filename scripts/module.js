import { Logger } from "./Logger.js";
import { SoundConfigApp } from "./apps/SoundConfigApp.js";
import { AttunementApp } from "./apps/AttunementApp.js";
import { SoundAuditor } from "./apps/SoundAuditor.js";
import { SoundHandler } from "./SoundHandler.js";
import { registerSettings } from "./settings.js";
import { SyrinscapeProvider } from "./providers/SyrinscapeProvider.js";
import { SOUND_EVENTS } from "./constants.js";
import { SoundPackLoader } from "./services/SoundPackLoader.js";
import { ResonancePackRegistryApp } from "./apps/ResonancePackRegistryApp.js";

Hooks.once('init', async function () {
    Logger.log("Initializing Sound Engine");

    // Register Templates
    const _loadTemplates = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
    _loadTemplates([
        "modules/ionrift-resonance/templates/partials/auditor-list.hbs",
        "modules/ionrift-resonance/templates/partials/sound-card-row.hbs",
        "modules/ionrift-resonance/templates/partials/sound-group.hbs",
        "modules/ionrift-resonance/templates/partials/sound-picker-row.hbs"
    ]);

    // Register Settings (CRITICAL: Must be done early)
    registerSettings();

    // DEPRECATED: Was set by _applyPreset() in the Attunement wizard. No longer written or read.
    game.settings.register("ionrift-resonance", "soundCompleteness", {
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
    // Expose SOUND_EVENTS for test harness and console access
    game.ionrift.resonance = game.ionrift.resonance || {};
    game.ionrift.resonance.SOUND_EVENTS = SOUND_EVENTS;

    // Import manager (it's a singleton export)
    const { soundManager } = await import("./SoundManager.js");
    game.ionrift.sounds.manager = soundManager;

    // Diagnostic Integration (optional -- must never crash boot)
    try {
        const { registerDiagnostics } = await import("./DiagnosticIntegration.js");
        registerDiagnostics();
    } catch (e) {
        console.warn("Ionrift Resonance | Diagnostics unavailable:", e.message);
    }


    // HEADER
    const { SettingsLayout } = await import("../../ionrift-library/scripts/SettingsLayout.js");
    SettingsLayout.registerHeader("ionrift-resonance", AttunementApp, {
        hint: "First-time setup: install sound packs and optionally connect Syrinscape."
    });

    if (!game.ionrift?.library?.isOverlayDistributionActive?.()) {
        SettingsLayout.registerPackButton("ionrift-resonance", ResonancePackRegistryApp, {
            name: "Sound Packs",
            label: "Manage Sound Packs",
            hint: "Enable or disable installed sound packs. Packs add sound bindings at lower priority than presets.",
            icon: "fas fa-music"
        });
    }

    // BODY: Calibration (resonance-specific tool)
    game.settings.registerMenu('ionrift-resonance', 'soundConfigMenu', {
        name: "Resonance Calibration",
        label: "Open Calibration",
        hint: "Configure custom sounds and attunement.",
        icon: "fas fa-sliders-h",
        type: SoundConfigApp,
        restricted: true
    });

    // FOOTER
    SettingsLayout.registerFooter("ionrift-resonance");

    Hooks.on("ionrift.overlayContentChanged", async (detail) => {
        if (detail?.moduleId !== "ionrift-resonance") return;
        const { SoundPackLoader } = await import("./services/SoundPackLoader.js");
        await SoundPackLoader.init();
    });



    // Start Engine (After Settings Registered & Modules Ready)
    Hooks.once('ready', async () => {
        // Load sound packs before the handler reads config, so pack
        // bindings are available to ResonanceConfig.getEffectiveBindings().
        await SoundPackLoader.init();

        // Expose the registry app for console/macro access
        game.ionrift.resonance.ResonancePackRegistryApp = ResonancePackRegistryApp;

        // Initialize Handler (Main Controller) - IMMEDIATELY to register hooks
        // This sets up game.ionrift.handler
        new SoundHandler();

        // Wait for Syrinscape Control to initialize -- only if it's actually installed.
        // Skips the 2-second polling loop when the module isn't present.
        if (game.modules.get("syrinscape-control")?.active) {
            await waitForDependency();
        }

        // Initialize Manager (Audio Player / Soundboard)
        await game.ionrift.sounds.manager.initialize();

        // Stale pack-preset migration ────────────────────────────────
        // Prior releases baked 552 sound files into modules/ionrift-resonance/sounds/pack/.
        // Those files are now removed; the same content ships as the downloadable
        // Core SFX Pack (ionrift-soundpack-core). Detect and migrate stale bindings.
        if (game.user.isGM && !game.settings.get("ionrift-resonance", "stalePackMigrated")) {
            const raw = game.settings.get("ionrift-resonance", "customSoundBindings") || "{}";
            const hasStale = raw.includes("modules/ionrift-resonance/sounds/pack/");

            if (hasStale) {
                const loadedPacks = SoundPackLoader.getLoadedPacks();
                const coreInstalled = loadedPacks.some(p => p.id === "ionrift-soundpack-core" && p.enabled);

                if (coreInstalled) {
                    // Pack is installed -- silently clear the stale bindings.
                    // The pack layer now provides them via SoundPackLoader.getMergedBindings().
                    await game.settings.set("ionrift-resonance", "customSoundBindings", "{}");
                    await game.settings.set("ionrift-resonance", "stalePackMigrated", true);
                    Logger.log("Stale pack bindings cleared. Core SFX Pack provides sounds.");
                    ui.notifications.info("Ionrift Resonance: Sounds migrated to the installed Core SFX Pack.");
                } else {
                    // Pack not installed -- warn the GM so they can install it.
                    ui.notifications.warn(
                        "Ionrift Resonance: Built-in sound files have been removed. Install the free Core SFX Pack from Module Settings → Sound Packs to restore your sounds.",
                        { permanent: true }
                    );
                }
            } else {
                // No stale paths -- mark as migrated to skip future checks.
                await game.settings.set("ionrift-resonance", "stalePackMigrated", true);
            }
        }

        // soundPreset deprecation migration ─────────────────────────
        // The soundPreset setting is vestigial -- SoundPackLoader handles all
        // binding resolution now. Normalize any non-"none" value so legacy
        // code paths in third-party macros don't accidentally branch on it.
        if (game.user.isGM) {
            const currentPreset = game.settings.get("ionrift-resonance", "soundPreset");
            if (currentPreset && currentPreset !== "none") {
                await game.settings.set("ionrift-resonance", "soundPreset", "none");
                Logger.log(`Migrated: soundPreset "${currentPreset}" → "none" (now handled by SoundPackLoader).`);
            }
        }
        // Forge safety tests (infrastructure, non-IP-sensitive)
        if (game.ionrift?.library?.tests) {
            game.ionrift.library.tests.register("ionrift-resonance-forge", {
                name: "Resonance Forge Safety",
                description: "SoundPackLoader smoke and partial registration checks",
                runFn: async () => {
                    const { ResonanceForgeTestRunner } = await import("./tests/ForgeTestRunner.js");
                    // Pass SoundPackLoader directly -- already imported and initialized above.
                    // ForgeTestRunner must NOT re-import it; relative dynamic imports fail on Forge CDN.
                    return ResonanceForgeTestRunner.runAll(SoundPackLoader, SoundConfigApp);
                }
            });
        }

        // Register Status Indicator (Generic Integration)
        if (game.ionrift?.integration) {
            game.ionrift.integration.registerApp('ionrift-resonance', {
                settingsKey: ['ionrift-resonance.setupWizard'],
                checkStatus: async () => {
                    // console.log("Ionrift Sounds | Running Status Check...");

                    const ionToken = game.settings.get('ionrift-resonance', 'syrinToken');
                    const controlModule = game.modules.get("syrinscape-control");
                    const controlActive = controlModule?.active || !!globalThis.syrinscapeControl;
                    const controlToken = controlActive ? game.settings.get("syrinscape-control", "authToken") : null;

                    // 1. Mismatch Detection (Robust)
                    const t1 = (ionToken || "").trim();
                    const t2 = (controlToken || "").trim();
                    const mismatch = controlActive && t1 && (t1 !== t2);

                    if (mismatch) {
                        Logger.warn("Ionrift Sounds | Token Mismatch Detected. Falling back to Direct API.");
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
                    // A missing token means Syrinscape was never configured -- treat as
                    // unconfigured (informational) rather than failed, so users who only
                    // use local SFX packs don't see alarming red icons on startup.
                    if (!ionToken) {
                        const INFO = game.ionrift.integration.STATUS.INFO
                            ?? game.ionrift.integration.STATUS.WARNING;
                        return { status: INFO, label: 'Not Configured', message: 'Syrinscape not set up. Local audio packs work without it.' };
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
            return;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    Logger.log("Ionrift Sounds | Syrinscape Control module is active but its API did not initialize within 2s. Audio integration may be limited.");
}



// Hook into Settings Config to display status icon on load
Hooks.on('renderSettingsConfig', (app, html, data) => {
    // Inject status icon via centralized interface
    if (game.ionrift?.integration) {
        game.ionrift.integration.renderSettingsIndicator(html, app);
    }

    // SFX Pack Nudge: inline banner when no sound packs are installed
    if (game.user.isGM && !game.settings.get("ionrift-resonance", "sfxNudgeSuppressed")) {
        const loadedPacks = SoundPackLoader.getLoadedPacks();
        const hasSfxPack = loadedPacks.some(p => p.enabled);
        if (!hasSfxPack) {
            _injectSfxNudgeBanner(html);
        }
    }
});

/**
 * Injects the SFX nudge banner into the settings panel under the Resonance section.
 * Uses the kernel's SettingsLayout data-key attribute to find the correct anchor point.
 * Mirrors the Respite art-nudge pattern: dismiss (suppress) or snooze.
 */
function _injectSfxNudgeBanner(html) {
    const $html = $(html);
    // Find the Sound Packs button rendered by SettingsLayout.registerPackButton
    const $packBtn = $html.find(`button[data-key="ionrift-resonance.contentPacks"]`);
    const $anchor = $packBtn.length ? $packBtn.closest(".form-group") : null;
    if (!$anchor?.length) return;

    const banner = $(`
        <div class="sfx-nudge-banner" style="
            background: linear-gradient(135deg, rgba(88, 166, 255, 0.08), rgba(139, 92, 246, 0.08));
            border: 1px solid rgba(88, 166, 255, 0.25);
            border-radius: 8px;
            padding: 12px 16px;
            margin: 8px 0 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 13px;
        ">
            <i class="fas fa-music" style="font-size: 20px; color: #58a6ff; flex-shrink: 0;"></i>
            <div style="flex: 1;">
                <strong style="color: #c9d1d9;">No sound effects configured.</strong>
                <span style="color: #8b949e;">Install the Core SFX Pack to hear combat, spells, and creatures.</span>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button type="button" class="sfx-nudge-get" style="
                    background: rgba(88, 166, 255, 0.15); border: 1px solid rgba(88, 166, 255, 0.3);
                    color: #58a6ff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
                "><i class="fas fa-download"></i> Get Pack</button>
                <button type="button" class="sfx-nudge-open" style="
                    background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3);
                    color: #a78bfa; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
                "><i class="fas fa-folder-open"></i> Sound Packs</button>
                <button type="button" class="sfx-nudge-dismiss" style="
                    background: transparent; border: 1px solid rgba(139, 148, 158, 0.2);
                    color: #8b949e; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
                " title="Don't show again"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `);

    banner.find(".sfx-nudge-get").on("click", () => {
        window.open("https://www.patreon.com/posts/155880618", "_blank");
    });
    banner.find(".sfx-nudge-open").on("click", () => {
        new ResonancePackRegistryApp().render(true);
    });
    banner.find(".sfx-nudge-dismiss").on("click", async () => {
        await game.settings.set("ionrift-resonance", "sfxNudgeSuppressed", true);
        banner.remove();
    });

    $anchor.after(banner);
}

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

    // Visualizer toggle (only if devtools is active)
    if (game.modules.get("ionrift-devtools")?.active) {
        if ($html.find(".ionrift-viz-btn").length > 0) return;
        const vizBtn = $(`<button class="ionrift-viz-btn" title="Toggle Audio Visualizer"><i class="fas fa-wave-square"></i></button>`);
        vizBtn.click(() => {
            game.ionrift?.devtools?.visualizer?.toggle();
        });
        $html.find(".header-actions").append(vizBtn);
    }
});
