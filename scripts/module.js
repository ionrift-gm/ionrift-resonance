import { Logger } from "./utils/Logger.js";
import { SoundConfigApp } from "./apps/config/SoundConfigApp.js";
import { SyrinscapeConfigApp } from "./apps/config/SyrinscapeConfigApp.js";
import { registerSettings } from "./settings.js";
import { SOUND_EVENTS } from "./data/constants.js";
import { hasCoreSfxPack } from "./data/coreSfxPacks.js";
import { SoundPackLoader } from "./services/packs/SoundPackLoader.js";
import { ResonancePackRegistryApp } from "./apps/packs/ResonancePackRegistryApp.js";
import {
    createResonanceContext,
    startResonanceRuntime
} from "./composition/createResonanceContext.js";
import { registerResonanceStatusIndicator } from "./services/config/ResonanceStatusService.js";

Hooks.once("init", async function () {
    Logger.log("Initializing Sound Engine");

    const _loadTemplates = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
    _loadTemplates([
        "modules/ionrift-resonance/templates/partials/auditor-list.hbs",
        "modules/ionrift-resonance/templates/partials/sound-card-row.hbs",
        "modules/ionrift-resonance/templates/partials/sound-group.hbs",
        "modules/ionrift-resonance/templates/partials/sound-picker-row.hbs"
    ]);

    registerSettings();

    game.settings.register("ionrift-resonance", "soundCompleteness", {
        name: "Sound Preset Completeness (Internal)",
        hint: "Tracks whether the user selected Core or Full library.",
        scope: "world",
        config: false,
        type: String,
        default: "full"
    });

    const ctx = createResonanceContext();
    game.ionrift.resonance.SOUND_EVENTS = SOUND_EVENTS;

    try {
        const { registerDiagnostics } = await import("./diagnostics/DiagnosticIntegration.js");
        registerDiagnostics();
    } catch (e) {
        console.warn("Ionrift Resonance | Diagnostics unavailable:", e.message);
    }

    const { SettingsLayout } = await import("../../ionrift-library/scripts/utils/SettingsLayout.js");
    SettingsLayout.registerHeader("ionrift-resonance", SyrinscapeConfigApp, {
        name: "Audio Mode",
        label: "Configure Audio Mode",
        hint: "Choose Foundry audio only or add Syrinscape for per-slot overrides in Calibration.",
        icon: "fas fa-volume-up"
    });

    if (!game.ionrift?.library?.isOverlayDistributionActive?.()) {
        SettingsLayout.registerPackButton("ionrift-resonance", ResonancePackRegistryApp, {
            name: "Sound Packs",
            label: "Manage Sound Packs",
            hint: "Enable or disable installed sound packs. Packs add sound bindings at lower priority than presets.",
            icon: "fas fa-music"
        });
    }

    game.settings.registerMenu("ionrift-resonance", "soundConfigMenu", {
        name: "Resonance Calibration",
        label: "Open Calibration",
        hint: "Configure custom sounds and per-actor overrides.",
        icon: "fas fa-sliders-h",
        type: SoundConfigApp,
        restricted: true
    });

    SettingsLayout.registerFooter("ionrift-resonance");

    Hooks.on("ionrift.overlayContentChanged", async (detail) => {
        if (detail?.moduleId !== "ionrift-resonance") return;
        await SoundPackLoader.init();

        for (const app of Object.values(ui.applications ?? {})) {
            if (!app) continue;
            const isSyrinscapeConfig = app.id === "ionrift-resonance-syrinscape";
            const isCalibration = app.id === "ionrift-sound-config" || app instanceof SoundConfigApp;
            if (!isSyrinscapeConfig && !isCalibration) continue;
            try {
                app.render(true);
            } catch (e) {
                Logger.warn("overlayContentChanged | re-render failed:", e?.message ?? e);
            }
        }
    });

    Hooks.on("ionrift.collectDestructiveWarnings", ({ moduleId, action, warnings, context }) => {
        if (moduleId !== "ionrift-resonance") return;
        try {
            appendResonanceDestructiveWarnings(warnings, action, context);
        } catch (e) {
            Logger.warn("collectDestructiveWarnings | resonance check failed:", e?.message ?? e);
        }
    });

    Hooks.once("ready", async () => {
        await startResonanceRuntime(ctx);

        if (game.modules.get("syrinscape-control")?.active) {
            await waitForDependency();
        }

        await ctx.manager.initialize();

        await migrateStalePackBindings();
        await migrateSoundPreset();

        registerResonanceStatusIndicator();
    });
});

function appendResonanceDestructiveWarnings(warnings, action, context = {}) {
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

        const flagsCount = countResonanceFlags();
        if (flagsCount > 0) {
            warnings.push({
                severity: "preserved",
                title: `Per-actor and per-item sound overrides (${flagsCount})`,
                detail: "Token and item flags assigned in Calibration are untouched."
            });
        }
    }
}

function countResonanceFlags() {
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

async function migrateStalePackBindings() {
    if (!game.user.isGM || game.settings.get("ionrift-resonance", "stalePackMigrated")) return;

    const raw = game.settings.get("ionrift-resonance", "customSoundBindings") || "{}";
    const hasStale = raw.includes("modules/ionrift-resonance/sounds/pack/");

    if (hasStale) {
        const loadedPacks = SoundPackLoader.getLoadedPacks();
        const coreInstalled = hasCoreSfxPack(loadedPacks);

        if (coreInstalled) {
            await game.settings.set("ionrift-resonance", "customSoundBindings", "{}");
            await game.settings.set("ionrift-resonance", "stalePackMigrated", true);
            Logger.log("Stale pack bindings cleared. Local sound pack provides sounds.");
            ui.notifications.info("Ionrift Resonance: Sounds migrated to the installed local sound pack.");
        } else {
            ui.notifications.warn(
                "Ionrift Resonance: Built-in sound files have been removed. Place a local sound pack on disk, then reload.",
                { permanent: true }
            );
        }
    } else {
        await game.settings.set("ionrift-resonance", "stalePackMigrated", true);
    }
}

async function migrateSoundPreset() {
    if (!game.user.isGM) return;
    const currentPreset = game.settings.get("ionrift-resonance", "soundPreset");
    if (currentPreset && currentPreset !== "none") {
        await game.settings.set("ionrift-resonance", "soundPreset", "none");
        Logger.log(`Migrated: soundPreset "${currentPreset}" to "none" (now handled by SoundPackLoader).`);
    }
}

async function waitForDependency() {
    const maxRetries = 20;
    const interval = 100;

    for (let i = 0; i < maxRetries; i++) {
        if (game.syrinscape || globalThis.syrinscapeControl) return;
        await new Promise((r) => setTimeout(r, interval));
    }
    Logger.log("Ionrift Sounds | Syrinscape Control module is active but its API did not initialize within 2s. Audio integration may be limited.");
}

Hooks.on("renderSettingsConfig", (app, html) => {
    if (game.ionrift?.integration) {
        game.ionrift.integration.renderSettingsIndicator(html, app);
    }
});

Hooks.on("renderPlaylistDirectory", (app, html) => {
    if (!game.user.isGM) return;

    const $html = $(html);
    if ($html.find(".ionrift-sound-manager-btn").length > 0) return;

    const btn = $(`<button class="ionrift-sound-manager-btn"><i class="fas fa-sliders-h"></i> Resonance Calibration</button>`);
    btn.click(() => {
        new SoundConfigApp().render(true);
    });

    $html.find(".header-actions").append(btn);

    if (game.modules.get("ionrift-devtools")?.active) {
        if ($html.find(".ionrift-viz-btn").length > 0) return;
        const vizBtn = $(`<button class="ionrift-viz-btn" title="Toggle Audio Visualizer"><i class="fas fa-wave-square"></i></button>`);
        vizBtn.click(() => {
            game.ionrift?.devtools?.visualizer?.toggle();
        });
        $html.find(".header-actions").append(vizBtn);
    }
});
