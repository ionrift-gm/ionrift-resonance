import { SOUND_EVENTS, isFeatureFlagEnabled } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * DirectorIntegration (Incubated)
 * Listens to Ionrift Director & PF2e Sense hooks for creature emergence foley and 4-Degrees-of-Detection cues:
 *   - `ionriftDirector.encounterReveal`: hierarchical creature-index emergence foley (`DIRECTOR_REVEAL_*` -> `DIRECTOR_REVEAL_GENERIC` -> fallback SFX) + optional monster vocal accent
 *   - `ionriftDirector.senseCue`: 4-Degrees-of-Detection cues (`presence`, `seekPinpoint`, `hideSlip`, `pointOut`, `flatWhiff`)
 *
 * Gated behind `isFeatureFlagEnabled("DIRECTOR_INCUBATION")` (auto-enabled in local dev when
 * `ionrift-devtools` is active; hidden and inactive in production builds until Director ships).
 */
export class DirectorIntegration {
    static MODULE_ID = "ionrift-director";
    static MIN_VERSION = "0.1.0";
    static HOOK_PREFIX = "ionriftDirector";

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
    }

    static get isIncubationEnabled() {
        return isFeatureFlagEnabled("DIRECTOR_INCUBATION");
    }

    static get isInstalled() {
        return this.isIncubationEnabled && (game.modules?.has?.(this.MODULE_ID) ?? false);
    }

    static get isActive() {
        return this.isIncubationEnabled && (game.modules?.get?.(this.MODULE_ID)?.active ?? false);
    }

    static get version() {
        return game.modules?.get?.(this.MODULE_ID)?.version ?? null;
    }

    static get isCompatible() {
        if (!this.isActive) return false;
        const current = this.version;
        if (!current) return true;
        return !foundry.utils.isNewerVersion(this.MIN_VERSION, current);
    }

    /**
     * Walk a hierarchical sound cascade (`[specificKey, genericKey, fallbackCoreKey]`)
     * and return the first key that resolves to a bound sound in Resonance.
     * @param {string[]} cascade
     * @returns {string|null}
     */
    resolveCascadeKey(cascade = []) {
        if (!Array.isArray(cascade) || !this.handler?.resolver) return null;
        for (const key of cascade) {
            if (!key) continue;
            if (this.handler.resolver.resolveKey(key)) {
                return key;
            }
        }
        return null;
    }

    registerHooks() {
        if (!DirectorIntegration.isIncubationEnabled) {
            return;
        }

        if (!DirectorIntegration.isActive) {
            Logger.log("DirectorIntegration | ionrift-director is not active, skipping hooks.");
            return;
        }

        if (!DirectorIntegration.isCompatible) {
            Logger.warn(`DirectorIntegration | ionrift-director is outdated (v${DirectorIntegration.version} installed, v${DirectorIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("DirectorIntegration | Registering incubated creature emergence & Sense sound hooks.");

        const on = (name, fn) => {
            const wrapped = (...args) => {
                if (!game.user?.isGM) return;
                if (!DirectorIntegration.isIncubationEnabled) return;
                fn(...args);
            };
            Hooks.on(`${DirectorIntegration.HOOK_PREFIX}.${name}`, wrapped);
        };

        // Creature Emergence & Ambush Reveal (`EncounterRevealChoreographer`)
        on("encounterReveal", (data = {}) => {
            const primaryKey = data.primaryKey
                || (Array.isArray(data.soundCascade) && data.soundCascade[0])
                || SOUND_EVENTS.DIRECTOR_REVEAL_GENERIC;
            const origin = data.origin || undefined;

            Logger.log(`DirectorIntegration | encounterReveal (${data.archetype ?? "generic"} / ${data.mode ?? "ambush"}) -> ${primaryKey}`, data);
            this.handler.play(primaryKey, { origin });
        });

        // 4 Degrees of Detection & Stealth Cues (`ionrift-pf2e` Sense)
        on("senseCue", (data = {}) => {
            const cueType = String(data.type || "").toLowerCase();
            const defaultCascades = {
                presence: [SOUND_EVENTS.DIRECTOR_SENSE_PRESENCE, SOUND_EVENTS.DIRECTOR_REVEAL_SPECTRAL, SOUND_EVENTS.SFX_WIND],
                seekpinpoint: [SOUND_EVENTS.DIRECTOR_SENSE_SEEK_PINPOINT, SOUND_EVENTS.DIRECTOR_REVEAL_GENERIC, SOUND_EVENTS.CORE_WHOOSH],
                hideslip: [SOUND_EVENTS.DIRECTOR_SENSE_HIDE_SLIP, SOUND_EVENTS.DIRECTOR_REVEAL_SPECTRAL, SOUND_EVENTS.CORE_WHOOSH],
                pointout: [SOUND_EVENTS.DIRECTOR_SENSE_POINT_OUT, SOUND_EVENTS.SFX_ARMOR_CLANK],
                flatwhiff: [SOUND_EVENTS.DIRECTOR_SENSE_FLAT_WHIFF, SOUND_EVENTS.CORE_MISS]
            };
            const cascade = Array.isArray(data.soundCascade) && data.soundCascade.length > 0
                ? data.soundCascade
                : (defaultCascades[cueType] || [SOUND_EVENTS.DIRECTOR_REVEAL_GENERIC]);
            const resolvedKey = this.resolveCascadeKey(cascade);
            if (!resolvedKey) return;

            const origin = data.origin || undefined;
            Logger.log(`DirectorIntegration | senseCue (${cueType}) -> ${resolvedKey}`, data);
            this.handler.play(resolvedKey, { origin });
        });
    }
}
