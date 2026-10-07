import { getSpatialCategory, getSpatialClass } from "../../data/soundEvents/spatial.js";
import { isLocalFileSource } from "./PlaybackSource.js";
import { decideSpatialPlayback } from "./SpatialPolicy.js";
import { originIsPlace } from "./SoundOrigin.js";

const MODULE_ID = "ionrift-resonance";

export const POSITIONAL_HINT = "Sounds with a place on the map are heard from that place, through walls and doors. Needs Ionrift Voice. Syrinscape sounds always play normally.";

export const SPATIAL_CATEGORY_DEFS = [
    { id: "weapons", label: "Weapons & impacts" },
    { id: "spells", label: "Spells" },
    { id: "creatures", label: "Creatures" },
    { id: "vocals", label: "Character vocals" },
    { id: "campfire", label: "Campfire" }
];

export const DEFAULT_POSITIONAL_CATEGORIES = {
    weapons: true,
    spells: true,
    creatures: true,
    vocals: true,
    campfire: true
};

export function readConfigOverrides() {
    const raw = safeSetting("configOverrides", {});
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw) || {};
        } catch {
            return {};
        }
    }
    return raw;
}

/**
 * @param {string} key
 * @returns {"default"|"positional"|"everywhere"}
 */
export function readSpatialPlace(key) {
    const place = readConfigOverrides().spatial?.[key];
    if (place === "positional" || place === "everywhere") return place;
    return "default";
}

export function voiceModuleActive() {
    return globalThis.game?.modules?.get?.("ionrift-voice")?.active === true;
}

export function voiceApiPresent() {
    const resolve = globalThis.game?.modules?.get?.("ionrift-voice")?.api?.acoustics?.resolveForLocalListener;
    return typeof resolve === "function";
}

/**
 * @param {{ key: string, origin?: object|null, privatePath?: boolean, src?: string|null }} args
 */
export function gatherSpatialDecision({ key, origin = null, privatePath = false, src = null } = {}) {
    const stored = safeSetting("positionalCategories", {}) || {};
    // Listener opt-out is applied when each client plays, not when the sender emits.
    return decideSpatialPlayback({
        private: !!privatePath,
        clientMode: "follow",
        master: safeSetting("positionalSfx", false) === true,
        override: readSpatialPlace(key),
        spatialClass: getSpatialClass(key),
        category: getSpatialCategory(key),
        categories: { ...DEFAULT_POSITIONAL_CATEGORIES, ...stored },
        origin: originIsPlace(origin),
        localFiles: isLocalFileSource(src),
        voiceApi: voiceApiPresent()
    });
}

export function positionalPanelData() {
    const stored = safeSetting("positionalCategories", {}) || {};
    const categories = { ...DEFAULT_POSITIONAL_CATEGORIES, ...stored };
    return {
        master: safeSetting("positionalSfx", false) === true,
        voiceActive: voiceModuleActive(),
        hint: POSITIONAL_HINT,
        hearMode: safeSetting("hearPositionalSfx", "follow") === "normal" ? "normal" : "follow",
        hearFollow: safeSetting("hearPositionalSfx", "follow") !== "normal",
        hearNormal: safeSetting("hearPositionalSfx", "follow") === "normal",
        categories: SPATIAL_CATEGORY_DEFS.map((def) => ({
            ...def,
            enabled: categories[def.id] !== false
        }))
    };
}

function safeSetting(key, fallback) {
    try {
        const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
        return value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}
