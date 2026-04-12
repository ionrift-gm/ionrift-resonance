// Applies Ionrift SFX Pack preset directly to world settings.

(async () => {
    try {
        // Clear overrides
        await game.settings.set("ionrift-resonance", "configOverrides", {});

        // Load pack.json
        const res = await fetch("modules/ionrift-resonance/scripts/presets/pack.json");
        const packData = await res.json();
        await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(packData.bindings || {}));

        // Set preset flags
        await game.settings.set("ionrift-resonance", "soundPreset", "pack", { ionriftConfirmed: true });
        await game.settings.set("ionrift-resonance", "soundCompleteness", "pack");

        // Refresh Calibration UI if open
        const calibrationWin = Object.values(ui.windows).find(w => w.id === "ionrift-sound-config");
        if (calibrationWin) calibrationWin.render(true, { focus: false });

        ui.notifications.info("Resonance | SFX Pack force-applied.");
    } catch (e) {
        console.error("Force-apply failed:", e);
        ui.notifications.error("Resonance | Force-apply failed. Check console.");
    }
})();
