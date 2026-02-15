export const registerSettings = function () {
    // Auth Token
    game.settings.register('ionrift-sounds', 'syrinToken', {
        name: "Auth Token",
        hint: "Your Syrinscape Online Authentication Token.",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    // Auth Verified Status (Legacy)
    game.settings.register('ionrift-sounds', 'authVerified', {
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    // Setup Wizard Version Tracking (New)
    game.settings.register("ionrift-sounds", "setupVersion", {
        name: "Setup Version",
        hint: "Tracks the last setup version run.",
        scope: "world",
        config: false,
        type: String,
        default: "0.0.0"
    });

    // Custom Bindings Map (JSON)
    game.settings.register("ionrift-sounds", "customSoundBindings", {
        scope: "world",
        config: false,
        type: String,
        default: "{}"
    });

    // Config Overrides (Campaign/Audit)
    game.settings.register("ionrift-sounds", "configOverrides", {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    // Hidden Oneshot Cache (Local Library)
    game.settings.register('ionrift-sounds', 'oneshotCache', {
        scope: "world",
        config: false,
        type: Object, // Store JSON object { timestamp: 0, results: [] }
        default: { timestamp: 0, results: [] }
    });

    // Audio Provider Choice
    game.settings.register('ionrift-sounds', 'provider', {
        name: "Audio Provider",
        hint: "Choose between Syrinscape (Streaming) or Local Audio (Foundry Playlists/Files)",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "syrinscape": "Syrinscape (Online)",
            "foundry": "Local Audio (Core)"
        },
        onChange: () => {
            // Re-initialize manager on change to switch providers
            import("./SoundManager.js").then(({ soundManager }) => {
                soundManager.initialize();
            });
            // Also update the Handler's resolution strategy
            if (game.ionrift?.handler) {
                game.ionrift.handler.reloadStrategy();
            }
            ui.notifications.info("Ionrift Resonance: Audio Provider Changed");
        },
        default: "syrinscape"
    });

    // Active Sound Preset
    game.settings.register("ionrift-sounds", "soundPreset", {
        name: "Sound Preset",
        hint: "Choose the default library of sounds.",
        scope: "world",
        config: false,
        type: String,
        choices: {
            "fantasy": "Fantasy / Core (DnD, Daggerheart)",
            "scifi": "Sci-Fi / Future (Warhammer, Starfinder)"
        },
        onChange: () => game.ionrift.handler?.loadConfig(),
        default: "fantasy"
    });
};
