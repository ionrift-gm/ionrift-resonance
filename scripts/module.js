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
        name: "Resonance Setup",
        label: "Open Resonance Setup",
        hint: "First-time setup: Core SFX Pack and optional Syrinscape connection.",
        icon: "fas fa-sliders-h"
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
        hint: "Configure custom sounds and per-actor overrides.",
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

        for (const app of Object.values(ui.applications ?? {})) {
            if (!app) continue;
            const isAttunement = app.id === "ionrift-resonance-attunement";
            const isCalibration = app.id === "ionrift-sound-config" || app instanceof SoundConfigApp;
            if (!isAttunement && !isCalibration) continue;
            try {
                if (isCalibration) {
                    app.render(true);
                } else {
                    app.render();
                }
            } catch (e) {
                Logger.warn("overlayContentChanged | re-render failed:", e?.message ?? e);
            }
        }
    });

    Hooks.on("ionrift.collectDestructiveWarnings", ({ moduleId, action, warnings, context }) => {
        if (moduleId !== "ionrift-resonance") return;
        try {
            _appendResonanceDestructiveWarnings(warnings, action, context);
        } catch (e) {
            Logger.warn("collectDestructiveWarnings | resonance check failed:", e?.message ?? e);
        }
    });



    // Register the shared pack-nudge configuration with the library
    // service. Settings panel and Calibration surfaces both inject via
    // game.ionrift.library.packNudge.inject() once registered.
    try {
        const { registerSfxPackNudge } = await import("./sfxPackNudge.js");
        registerSfxPackNudge();
    } catch (e) {
        Logger.warn("Pack nudge registration failed:", e);
    }

    // Start Engine (After Settings Registered & Modules Ready)
    Hooks.once('ready', async () => {
        // Load sound packs before the handler reads config, so pack
        // bindings are available to ResonanceConfig.getEffectiveBindings().
        await SoundPackLoader.init();

        // Expose SoundPackLoader for plug-in architecture (MonsterVocalMap
        // reads dynamic classifier bindings from pack manifests)
        game.ionrift.resonance.SoundPackLoader = SoundPackLoader;

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
                    const ionToken = game.settings.get('ionrift-resonance', 'syrinToken');

                    const { hasActiveSfxContent } = await import("./sfxPackNudge.js");
                    const enabledPacks = SoundPackLoader.getLoadedPacks().filter(
                        (pack) => pack.enabled && pack.bindingCount > 0
                    );
                    if (hasActiveSfxContent()) {
                        const names = enabledPacks.map(p => p.name).join(", ");
                        return {
                            status: game.ionrift.integration.STATUS.CONNECTED,
                            label: 'Ready',
                            message: `Sound packs active (${names}). Local audio does not require Syrinscape.`
                        };
                    }

                    if (game.ionrift?.library?.isOverlayDistributionActive?.()) {
                        try {
                            const overlayState = await game.ionrift.library.getOverlayState(
                                "resonance-core-overlay",
                                "ionrift-resonance",
                                "free"
                            );
                            if (overlayState?.installed && overlayState?.active) {
                                return {
                                    status: game.ionrift.integration.STATUS.WARNING,
                                    label: 'Pack bindings missing',
                                    message: 'Core SFX overlay is on but Calibration has no pack bindings. Install the Core SFX zip from Patreon Library so slots populate.'
                                };
                            }
                        } catch (e) {
                            Logger.warn("Resonance status | Overlay check failed:", e);
                        }
                    }
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
                    if (!ionToken) {
                        return {
                            status: game.ionrift.integration.STATUS.WARNING,
                            label: 'Setup needed',
                            message: 'Install the Core SFX Pack or connect Syrinscape in Resonance Setup.'
                        };
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
 * Build the resonance-specific destructive-action warnings for the
 * `ionrift.collectDestructiveWarnings` hook. Pushes preserved/replaced/note
 * entries describing what a content-pack install or reinstall will affect.
 *
 * @param {Array} warnings   Mutable list to append to.
 * @param {string} action    "install" | "reinstall" | "zipImport"
 * @param {Object} [context]
 */
function _appendResonanceDestructiveWarnings(warnings, action, context = {}) {
    const incomingPackId = typeof context?.packId === "string" ? context.packId : null;
    const candidatePackIds = new Set();
    if (incomingPackId) candidatePackIds.add(incomingPackId);

    const existingPacks = SoundPackLoader.loaded ? SoundPackLoader.getLoadedPacks() : [];
    for (const pack of existingPacks) {
        if (candidatePackIds.has(pack.id) || pack.id === incomingPackId || action === "reinstall") {
            warnings.push({
                severity: "replaced",
                title: `Pack "${pack.name || pack.id}" (v${pack.version})`,
                detail: pack.source === "overlay"
                    ? "Currently installed via Patreon Library. Files will be overwritten."
                    : "Already installed from a .zip. Shadowed by the new copy until removed."
            });
            break;
        }
    }

    if (action === "reinstall" || existingPacks.length > 0) {
        const customRaw = (() => {
            try {
                return game.settings.get("ionrift-resonance", "customSoundBindings") || "";
            } catch {
                return "";
            }
        })();
        const trimmed = customRaw.trim();
        const hasCustom = trimmed && trimmed !== "{}";
        if (hasCustom) {
            warnings.push({
                severity: "preserved",
                title: "Custom sound bindings",
                detail: "Resonance Calibration overrides stay in place across installs."
            });
        }

        const flagsCount = _countResonanceFlags();
        if (flagsCount > 0) {
            warnings.push({
                severity: "preserved",
                title: `Per-actor and per-item sound overrides (${flagsCount})`,
                detail: "Token and item flags assigned in Calibration are untouched."
            });
        }
    }
}

/**
 * Cheap presence-count for actor/item ionrift-resonance flags. Mirrors the
 * filter in SoundConfigApp._getAuditorData. Used only for destructive-action
 * detection, not for rendering, so it returns a count and stops at the first
 * meaningful flag per actor.
 * @returns {number}
 */
function _countResonanceFlags() {
    let count = 0;
    const IGNORED = new Set(["identity", "soundPreset", "sound_config"]);
    const meaningful = (key, val) => {
        if (!val) return false;
        if (IGNORED.has(key)) return false;
        if (key.endsWith("_name") || key.endsWith("_meta")) return false;
        return true;
    };

    for (const actor of game.actors ?? []) {
        const flags = actor.flags?.["ionrift-resonance"];
        if (!flags) continue;
        for (const [key, val] of Object.entries(flags)) {
            if (meaningful(key, val)) { count++; break; }
        }
    }
    for (const item of game.items ?? []) {
        const flags = item.flags?.["ionrift-resonance"];
        if (!flags) continue;
        for (const [key, val] of Object.entries(flags)) {
            if (meaningful(key, val)) { count++; break; }
        }
    }
    return count;
}

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



// Hook into Settings Config to display status icon on load.
// Pack-nudge banner injection is handled centrally by ionrift-library
// (PackNudgeService.injectAllInSettings) once the module registers its config.
Hooks.on('renderSettingsConfig', (app, html, data) => {
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
