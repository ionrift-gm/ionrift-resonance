/**
 * Macro: Clear Ionrift Resonance Bindings
 * Purpose: Resets all custom bindings and overrides to allow fresh authoring.
 * Usage: Create a new macro in Foundry VTT, set Type to "Script", and paste this code.
 */

(async () => {
    if (!game.user.isGM) return ui.notifications.warn("Ionrift: Cleanup Macro is GM Only");

    // Confirmation Dialog
    const confirmed = await Dialog.confirm({
        title: "Clear All Sound Bindings?",
        content: `
            <div style="text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: #ff6b6b; margin-bottom: 15px;"></i>
                <p>This will <strong>permanently delete</strong> all:</p>
                <ul style="text-align: left;">
                    <li>Default Bindings (Reset to Empty)</li>
                    <li>Custom Sound Bindings</li>
                    <li>Campaign Overrides</li>
                    <li>Player Identity configs</li>
                </ul>
                <p>Are you sure you want to proceed?</p>
            </div>
        `,
        yes: () => true,
        no: () => false,
        defaultYes: false
    });

    if (!confirmed) return;

    console.log("Ionrift | Clearing configuration...");

    // 1. Clear Custom Bindings (Resonance & Legacy)
    await game.settings.set("ionrift-resonance", "customSoundBindings", "{}");
    if (game.settings.settings.has("ionrift-sounds.customSoundBindings")) {
        await game.settings.set("ionrift-sounds", "customSoundBindings", "{}");
    }

    // 2. Clear Campaign Overrides (Resonance & Legacy)
    await game.settings.set("ionrift-resonance", "configOverrides", {});
    if (game.settings.settings.has("ionrift-sounds.configOverrides")) {
        await game.settings.set("ionrift-sounds", "configOverrides", {});
    }

    // 3. Reset Preset to 'none' for a Clean Slate
    await game.settings.set("ionrift-resonance", "soundPreset", "none");
    console.log("Ionrift | Preset reset to 'none'.");

    // 4. Force Reload/Refresh
    if (game.ionrift?.handler) {
        // Manually trigger reload
        await game.ionrift.handler.loadConfig();

        // Refresh UI if open
        const win = Object.values(ui.windows).find(w => w.id === "ionrift-sound-config");
        if (win) win.render(true);

        ui.notifications.info("Ionrift Resonance: Configuration Cleared.");
    }
})();
