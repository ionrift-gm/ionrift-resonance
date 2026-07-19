import { SoundPackLoader } from "./SoundPackLoader.js";

/**
 * Shared SFX readiness check for Resonance status surfaces.
 * Acquisition instructions live on the pack post.
 */
export function hasActiveSfxContent() {
    if (!SoundPackLoader.loaded) return false;

    const hasEnabledPackBindings = SoundPackLoader.getLoadedPacks().some(
        (pack) => pack.enabled && pack.bindingCount > 0
    );
    if (hasEnabledPackBindings) return true;

    return Object.keys(SoundPackLoader.getMergedBindings()).length > 0;
}
