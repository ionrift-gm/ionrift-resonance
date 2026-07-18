/** Canonical Core SFX overlay and legacy zip pack id (both Block / unzip-only). */
export const CORE_SFX_PACK_IDS = Object.freeze([
    "resonance-core-overlay",
    "ionrift-soundpack-core"
]);

export const CANONICAL_CORE_SFX_PACK_ID = "resonance-core-overlay";
export const LEGACY_CORE_SFX_PACK_ID = "ionrift-soundpack-core";

/**
 * True when an enabled Core SFX pack (overlay or legacy zip) is loaded.
 * @param {{ id: string, enabled?: boolean }[]} [loadedPacks]
 */
export function hasCoreSfxPack(loadedPacks) {
    const packs = loadedPacks
        ?? (typeof game !== "undefined"
            ? game.ionrift?.resonance?.SoundPackLoader?.getLoadedPacks?.()
            : null)
        ?? [];
    return packs.some((p) => p.enabled && CORE_SFX_PACK_IDS.includes(p.id));
}
