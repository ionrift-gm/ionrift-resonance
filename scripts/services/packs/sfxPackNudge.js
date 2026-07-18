import { SoundPackLoader } from "./SoundPackLoader.js";
import { openResonancePackLibrary } from "./openResonancePackLibrary.js";

const MODULE_ID = "ionrift-resonance";

export function hasActiveSfxContent() {
    if (!SoundPackLoader.loaded) return false;

    const hasEnabledPackBindings = SoundPackLoader.getLoadedPacks().some(
        (pack) => pack.enabled && pack.bindingCount > 0
    );
    if (hasEnabledPackBindings) return true;

    return Object.keys(SoundPackLoader.getMergedBindings()).length > 0;
}

export function registerSfxPackNudge() {
    const packNudge = game.ionrift?.library?.packNudge;
    if (!packNudge) return;
    if (packNudge.isRegistered(MODULE_ID)) return;

    packNudge.register({
        moduleId: MODULE_ID,
        isContentInstalled: () => hasActiveSfxContent(),
        openInstaller: () => openResonancePackLibrary(),
        title: "No local sound pack installed.",
        subtitle: "Resonance plays packs already present on this machine. Pack downloads are outside the listed module.",
        icon: "fas fa-music",
        primaryLabel: "Manage Packs",
        primaryIcon: "fas fa-sliders",
        settings: {
            suppressed: "sfxNudgeSuppressed",
            snoozedUntil: "sfxNudgeSnoozedUntil"
        },
        findSettingsAnchor: ($html) => {
            const candidates = [
                { selector: 'button[data-key="ionrift-resonance.setupWizard"]', requireVisible: false },
                { selector: 'button[data-key="ionrift-resonance.contentPacks"]', requireVisible: true }
            ];
            for (const { selector, requireVisible } of candidates) {
                const $btn = $html.find(selector);
                if (!$btn.length) continue;
                const $group = $btn.closest(".form-group");
                if (!$group.length) continue;
                if (requireVisible && !$group.is(":visible")) continue;
                return { $anchor: $group, position: "after" };
            }
            return null;
        }
    });
}
