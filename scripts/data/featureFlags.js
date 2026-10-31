/**
 * Feature Flags for Ionrift Resonance.
 * Allows gating experimental or unreleased features.
 */
export const FEATURE_FLAGS = {
    SPELL_VOCAL_LAYER: false,
    PUZZLES_INCUBATION: false
};

/**
 * Flags that automatically enable in the local dev environment when `ionrift-devtools` is active,
 * while remaining disabled (hidden/unregistered) for production users unless explicitly overridden.
 */
const DEVTOOLS_INCUBATION_FLAGS = new Set([
    "PUZZLES_INCUBATION"
]);

/**
 * Checks if a feature flag is enabled.
 * Allows runtime overrides via CONFIG.ionrift.flags or globalThis.IONRIFT_DEV_FLAGS,
 * and auto-enables incubation flags when `ionrift-devtools` is active.
 * @param {string} flag
 * @returns {boolean}
 */
export function isFeatureFlagEnabled(flag) {
    if (globalThis.IONRIFT_DEV_FLAGS?.[flag] !== undefined) {
        return !!globalThis.IONRIFT_DEV_FLAGS[flag];
    }
    if (globalThis.CONFIG?.ionrift?.flags?.[flag] !== undefined) {
        return !!globalThis.CONFIG.ionrift.flags[flag];
    }
    if (DEVTOOLS_INCUBATION_FLAGS.has(flag) && globalThis.game?.modules?.get?.("ionrift-devtools")?.active) {
        return true;
    }
    return !!FEATURE_FLAGS[flag];
}
