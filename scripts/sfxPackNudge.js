import { SoundPackLoader } from "./services/SoundPackLoader.js";
import { CORE_SFX_PATREON_URL } from "./constants.js";
import { openResonancePackLibrary } from "./openResonancePackLibrary.js";

const MODULE_ID = "ionrift-resonance";

/**
 * True when Calibration can resolve pack bindings (enabled pack with bindings loaded).
 * Overlay install alone does not count; SoundPackLoader reads ionrift-data/resonance/packs/.
 * @returns {boolean}
 */
export function hasActiveSfxContent() {
    if (!SoundPackLoader.loaded) return false;

    const hasEnabledPackBindings = SoundPackLoader.getLoadedPacks().some(
        (pack) => pack.enabled && pack.bindingCount > 0
    );
    if (hasEnabledPackBindings) return true;

    return Object.keys(SoundPackLoader.getMergedBindings()).length > 0;
}

/**
 * Registers the Resonance Core SFX Pack nudge with the shared library service.
 * Idempotent. Settings panel injection then runs centrally from ionrift-library.
 */
export function registerSfxPackNudge() {
    const packNudge = game.ionrift?.library?.packNudge;
    if (!packNudge) return;
    if (packNudge.isRegistered(MODULE_ID)) return;

    packNudge.register({
        moduleId: MODULE_ID,
        packUrl: CORE_SFX_PATREON_URL,
        isContentInstalled: () => hasActiveSfxContent(),
        openInstaller: () => openResonancePackLibrary(),
        title: "No sound pack installed.",
        subtitle: "Download the Core SFX Pack, then install the zip from Patreon Library (Resonance).",
        icon: "fas fa-music",
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
