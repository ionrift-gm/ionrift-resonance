import { Logger } from "./utils/Logger.js";
import { SoundConfigApp } from "./apps/config/SoundConfigApp.js";
import { SyrinscapeConfigApp } from "./apps/config/SyrinscapeConfigApp.js";
import { registerSettings } from "./settings.js";
import { SOUND_EVENTS } from "./data/constants.js";
import { SoundPackLoader } from "./services/packs/SoundPackLoader.js";
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

    game.settings.registerMenu("ionrift-resonance", "soundConfigMenu", {
        name: "Resonance Calibration",
        label: "Open Calibration",
        hint: "",
        icon: "fas fa-sliders-h",
        type: SoundConfigApp,
        restricted: true
    });

    SettingsLayout.registerFooter("ionrift-resonance");

    Hooks.on("renderSettingsConfig", (app, html) => {
        const isElement = typeof HTMLElement !== "undefined" && html instanceof HTMLElement;
        const root = isElement ? html : (html?.[0] ?? html);
        if (!root?.querySelector) return;

        const select = root.querySelector('select[name="ionrift-resonance.hearPositionalSfx"]');
        if (!select) return;

        const isVoiceActive = Boolean(game.modules.get("ionrift-voice")?.active);
        if (!isVoiceActive) {
            select.disabled = true;
            select.setAttribute("disabled", "disabled");
            select.title = "Requires Ionrift Voice module to be installed and active.";
            const formGroup = select.closest(".form-group");
            if (formGroup) {
                formGroup.style.opacity = "0.55";
            }
        }
    });

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

async function migrateStalePackBindings() {
    if (!game.user.isGM || game.settings.get("ionrift-resonance", "stalePackMigrated")) return;

    const raw = game.settings.get("ionrift-resonance", "customSoundBindings") || "{}";
    const hasStale = raw.includes("modules/ionrift-resonance/sounds/pack/");

    if (hasStale) {
        const loadedPacks = SoundPackLoader.getLoadedPacks();
        const packInstalled = loadedPacks.some((p) => p.enabled);

        if (packInstalled) {
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

    const root = html instanceof HTMLElement ? html : (html?.[0] ?? html);
    if (!root) return;

    if (game.ionrift?.hud?.injectDirectoryButton) {
        game.ionrift.hud.injectDirectoryButton("playlists", root, {
            id: "resonance-calibration",
            className: "ionrift-sound-manager-btn",
            label: "Resonance",
            title: "Resonance Calibration",
            icon: "fas fa-sliders-h",
            onClick: () => new SoundConfigApp().render(true),
            restricted: true,
            order: 10
        });

        if (game.modules.get("ionrift-devtools")?.active) {
            game.ionrift.hud.injectDirectoryButton("playlists", root, {
                id: "resonance-viz",
                className: "ionrift-viz-btn",
                icon: "fas fa-wave-square",
                title: "Toggle Audio Visualizer",
                compact: true,
                onClick: () => game.ionrift?.devtools?.visualizer?.toggle(),
                restricted: true,
                order: 90
            });
        }
        return;
    }

    const header = root.querySelector(".directory-header") || root;
    const actions = header.querySelector(".header-actions, .action-buttons");
    let toolbar = header.querySelector(".ionrift-directory-toolbar");
    if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = "ionrift-directory-toolbar";
        if (actions && actions.parentNode) actions.after(toolbar);
        else header.prepend(toolbar);
    }

    if (!toolbar.querySelector(".ionrift-sound-manager-btn")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ionrift-directory-btn ionrift-sound-manager-btn";
        btn.dataset.order = "10";
        btn.title = "Resonance Calibration";
        btn.innerHTML = '<i class="fas fa-sliders-h" aria-hidden="true"></i> <span class="ionrift-btn-label">Resonance</span>';
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            new SoundConfigApp().render(true);
        });
        toolbar.appendChild(btn);
    }

    if (game.modules.get("ionrift-devtools")?.active && !toolbar.querySelector(".ionrift-viz-btn")) {
        const vizBtn = document.createElement("button");
        vizBtn.type = "button";
        vizBtn.className = "ionrift-directory-btn ionrift-viz-btn is-compact";
        vizBtn.dataset.order = "90";
        vizBtn.title = "Toggle Audio Visualizer";
        vizBtn.innerHTML = '<i class="fas fa-wave-square" aria-hidden="true"></i>';
        vizBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            game.ionrift?.devtools?.visualizer?.toggle();
        });
        toolbar.appendChild(vizBtn);
    }
});
