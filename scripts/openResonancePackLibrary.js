/**
 * Opens Patreon Library on the Resonance detail panel, or the legacy pack manager.
 */
export async function openResonancePackLibrary() {
    const lib = game.ionrift?.library;
    if (lib?.isOverlayDistributionActive?.()) {
        await lib.openPatreonLibrary?.({ moduleId: "ionrift-resonance" });
        return;
    }

    const PackApp = game.ionrift?.resonance?.ResonancePackRegistryApp;
    if (PackApp) {
        new PackApp().render(true);
        return;
    }

    ui.notifications.warn("Ionrift Library is required to manage sound packs.");
}
