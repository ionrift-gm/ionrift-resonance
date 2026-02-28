export const registerSettings = function () {
    // Debug Mode
    game.settings.register('ionrift-resonance', 'debug', {
        name: "Enable Debug Logging",
        hint: "Visible only in console. Useful for troubleshooting.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });

    // Auth Token
    game.settings.register('ionrift-resonance', 'syrinToken', {
        name: "Auth Token",
        hint: "Your Syrinscape Online Authentication Token.",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    // Auth Verified Status (Legacy)
    game.settings.register('ionrift-resonance', 'authVerified', {
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    // Setup Wizard Version Tracking (New)
    game.settings.register("ionrift-resonance", "setupVersion", {
        name: "Setup Version",
        hint: "Tracks the last setup version run.",
        scope: "world",
        config: false,
        type: String,
        default: "0.0.0"
    });

    // Custom Bindings Map (JSON)
    game.settings.register("ionrift-resonance", "customSoundBindings", {
        scope: "world",
        config: false,
        type: String,
        default: "{}"
    });

    // Config Overrides (Campaign/Audit)
    game.settings.register("ionrift-resonance", "configOverrides", {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    // Hidden Oneshot Cache (Local Library)
    game.settings.register('ionrift-resonance', 'oneshotCache', {
        scope: "world",
        config: false,
        type: Object, // Store JSON object { timestamp: 0, results: [] }
        default: { timestamp: 0, results: [] }
    });

    // Audio Provider (Deprecated — routing is now per-sound based on ID format)
    // Kept hidden for migration; no longer user-configurable.
    game.settings.register('ionrift-resonance', 'provider', {
        name: "Audio Provider",
        scope: "world",
        config: false,
        type: String,
        default: "syrinscape"
    });

    // Active Sound Preset
    game.settings.register("ionrift-resonance", "soundPreset", {
        name: "Sound Preset",
        hint: "Choose the default library of sounds.",
        scope: "world",
        config: false,
        type: String,
        choices: {
            "none": "Standard Setup (Manual)",
            // "fantasy": "Fantasy / Core (DnD, Daggerheart)", // Disabled for Initial Release
            "local": "Local Demo SFX",
            "pack": "Ionrift SFX Pack"
        },
        onChange: () => game.ionrift.handler?.loadConfig(),
        default: "none"
    });

    // Orchestrator Config — per-category budget windows + per-key timing offsets (GM only)
    game.settings.register("ionrift-resonance", "orchestratorConfig", {
        name: "Orchestrator Configuration",
        hint: "Sound budget and timing settings. Managed via the Orchestration tab in Resonance Calibration.",
        scope: "world",
        config: false,
        type: String,
        default: "{}"
    });
};
