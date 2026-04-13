export class PresetSafetyCheck {
    static async confirmSwitch(currentPreset, newPreset) {
        const overrides = game.settings.get("ionrift-resonance", "configOverrides");
        const hasOverrides = overrides && (
            Object.keys(overrides.players || {}).length > 0 ||
            Object.keys(overrides.campaign || {}).length > 0 ||
            Object.keys(overrides).length > 0
        );

        if (!hasOverrides) return true;

        return new Promise((resolve) => {
            new Dialog({
                title: "⚠️ Confirm Preset Switch",
                content: `
                    <div style="margin-bottom: 10px; padding: 0.5rem;">
                        <p><strong>Warning: You have Custom Sound Overrides active.</strong></p>
                        <p>Switching from <strong>${currentPreset}</strong> to <strong>${newPreset}</strong> changes the underlying default library.</p>
                        <ul style="margin: 5px 0;">
                            <li>Your overrides will <strong>NOT</strong> be deleted.</li>
                            <li>However, the new default sounds (e.g. generic generic hits/misses) might clash stylistically with your custom ones.</li>
                        </ul>
                        <p>Are you sure you want to proceed?</p>
                    </div>
                `,
                buttons: {
                    confirm: {
                        label: "Yes, Switch Preset",
                        icon: "<i class='fas fa-check'></i>",
                        callback: () => resolve(true)
                    },
                    cancel: {
                        label: "Cancel",
                        icon: "<i class='fas fa-times'></i>",
                        callback: () => resolve(false)
                    }
                },
                default: "cancel",
                classes: ["ionrift-window", "glass-ui"],
                render: (html) => {
                    // Force Z-Index above Settings Config (usually around 100)
                    const app = html.closest(".app");
                    app.css("z-index", 1000);

                    // Ensure classes are present (redundant check, but safe)
                    if (!app.hasClass("ionrift-window")) app.addClass("ionrift-window glass-ui");
                }
            }).render(true);
        });
    }
}
