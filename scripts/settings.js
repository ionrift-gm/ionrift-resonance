export const registerSettings = function () {
    // Debug Mode
    game.settings.register('ionrift-resonance', 'debug', {
        name: "Enable Debug Logging",
        hint: "Visible only in console. Useful for troubleshooting.",
        scope: "world",
        config: false,
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

    // Audio Provider (Deprecated - routing is now per-sound based on ID format)
    // Kept hidden for migration; no longer user-configurable.
    game.settings.register('ionrift-resonance', 'provider', {
        name: "Audio Provider",
        scope: "world",
        config: false,
        type: String,
        default: "syrinscape"
    });

    // DEPRECATED: Sound preset is no longer used for binding resolution.
    // SoundPackLoader + customSoundBindings now handle all binding layers.
    // Retained for migration compatibility -- existing worlds may still have
    // a stored value that migration logic reads and clears.
    game.settings.register("ionrift-resonance", "soundPreset", {
        scope: "world",
        config: false,
        type: String,
        default: "none"
    });

    // Orchestrator Config - per-category budget windows + per-key timing offsets (GM only)
    game.settings.register("ionrift-resonance", "orchestratorConfig", {
        name: "Orchestrator Configuration",
        hint: "Sound budget and timing settings. Managed via the Orchestration tab in Resonance Calibration.",
        scope: "world",
        config: false,
        type: String,
        default: "{}"
    });

    // Upgrade Notification Tracking - prevents repeated toasts
    game.settings.register("ionrift-resonance", "lastNotifiedVersion", {
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    // Per-taxonomy-root volume multipliers (JSON map: { "CORE_MAGIC": 0.5, ... })
    game.settings.register("ionrift-resonance", "taxonomyVolume", {
        scope: "world",
        config: false,
        type: String,
        default: "{}"
    });

    // Sound Pack enable/disable state: { packId: boolean }
    game.settings.register("ionrift-resonance", "installedSoundPacks", {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    // One-shot migration gate: true once stale modules/ionrift-resonance/sounds/pack/
    // bindings have been cleaned (or confirmed absent). Prevents re-checking every boot.
    game.settings.register("ionrift-resonance", "stalePackMigrated", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    // SFX nudge banner suppression: when true, the "no sound packs installed"
    // banner in Module Settings will not appear. Set by the dismiss button.
    game.settings.register("ionrift-resonance", "sfxNudgeSuppressed", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("ionrift-resonance", "sfxNudgeSnoozedUntil", {
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

};
