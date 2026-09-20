/**
 * Feature Flags for Ionrift Resonance.
 * Allows gating experimental or unreleased features.
 */
export const FEATURE_FLAGS = {
    SPELL_VOCAL_LAYER: false
};

/**
 * Checks if a feature flag is enabled.
 * Allows runtime overrides via CONFIG.ionrift.flags or globalThis.IONRIFT_DEV_FLAGS.
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
    return !!FEATURE_FLAGS[flag];
}
