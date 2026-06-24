import { Logger } from "../Logger.js";

/**
 * VocalLayerService
 *
 * Decides whether a spell incantation (vocal lead-in) should play before a
 * spell effect, and handles key resolution with school-variant → generic fallback.
 *
 * Trigger conditions (any one sufficient):
 *   1. System exposes spell components AND item.system.components.vocal === true  (e.g. dnd5e)
 *   2. Per-item flag  ionrift-resonance.spellVocal === true  (manual override for any system/item)
 *
 * Key resolution order:
 *   1. Per-item flag  ionrift-resonance.spellVocalOverride  (custom clip set in Item Sound Config)
 *   2. School-specific key  SPELL_VOCAL_<SCHOOL>  (if pack has bound it)
 *   3. Generic fallback  SPELL_VOCAL_CAST  (if pack has bound it)
 *   4. No-op — silent if nothing is bound
 */
export class VocalLayerService {

    /**
     * Map dnd5e school codes → SPELL_VOCAL_* key suffixes.
     * @type {Object<string, string>}
     */
    static SCHOOL_VOCAL_MAP = {
        evo:  "SPELL_VOCAL_EVOCATION",
        evoc: "SPELL_VOCAL_EVOCATION",
        nec:  "SPELL_VOCAL_NECROMANCY",
        abj:  "SPELL_VOCAL_ABJURATION",
        div:  "SPELL_VOCAL_DIVINATION",
        con:  "SPELL_VOCAL_CONJURATION",
        enc:  "SPELL_VOCAL_ENCHANTMENT",
        ill:  "SPELL_VOCAL_ILLUSION",
        tra:  "SPELL_VOCAL_TRANSMUTATION"
    };

    /**
     * Check whether the Spell Vocal Layer should trigger for this item.
     *
     * @param {Item|null} item - The spell item being used
     * @returns {boolean}
     */
    static shouldTrigger(item) {
        // Global feature gate (GM setting)
        if (!game.settings.get("ionrift-resonance", "spellVocalLayer")) return false;
        if (!item) return false;

        // Per-item explicit flag (works on any system)
        if (item.getFlag?.("ionrift-resonance", "spellVocal") === true) return true;

        // dnd5e and compatible: system.components.vocal
        if (item.system?.components?.vocal === true) return true;

        return false;
    }

    /**
     * Resolve the vocal key to play for this item.
     * Tries school variant first, falls back to generic SPELL_VOCAL_CAST.
     * Returns null if no pack has bound anything.
     *
     * @param {Item|null}    item     - The spell item
     * @param {SoundHandler} handler  - For resolver access
     * @returns {{ key: string, resolved: string } | null}
     */
    static resolveVocalKey(item, handler) {
        const resolver = handler?.resolver;
        if (!resolver) return null;

        // 1. Per-item override (custom clip — bypasses key resolution entirely)
        const override = item?.getFlag?.("ionrift-resonance", "spellVocalOverride");
        if (override) {
            // Raw file path or Syrinscape ID — pass straight through
            Logger.log(`VocalLayerService | Item override vocal: ${override}`);
            return { key: override, resolved: override, isRaw: true };
        }

        // 2. School-specific key (if pack has bound it)
        const school = item?.system?.school;
        if (school) {
            const schoolKey = VocalLayerService.SCHOOL_VOCAL_MAP[school];
            if (schoolKey) {
                const schoolResolved = resolver.resolveKey(schoolKey);
                if (schoolResolved) {
                    Logger.log(`VocalLayerService | School vocal key: ${schoolKey} -> ${schoolResolved}`);
                    return { key: schoolKey, resolved: schoolResolved };
                }
            }
        }

        // 3. Generic fallback
        const genericResolved = resolver.resolveKey("SPELL_VOCAL_CAST");
        if (genericResolved) {
            Logger.log(`VocalLayerService | Generic vocal key: SPELL_VOCAL_CAST -> ${genericResolved}`);
            return { key: "SPELL_VOCAL_CAST", resolved: genericResolved };
        }

        // 4. Nothing bound — silent fallback
        Logger.log("VocalLayerService | No vocal binding found (SPELL_VOCAL_CAST unbound). Skipping vocal layer.");
        return null;
    }

    /**
     * Play the vocal layer and return the lead-in delay (ms) that the caller
     * should apply to the following spell effect sound.
     *
     * Returns 0 if no vocal fires (silent fallback), so the effect plays
     * immediately with no extra delay — no regression.
     *
     * @param {SoundHandler} handler
     * @param {Item|null}    item
     * @returns {number} lead-in delay in ms
     */
    static playAndGetDelay(handler, item) {
        const vocKey = VocalLayerService.resolveVocalKey(item, handler);
        if (!vocKey) return 0;

        // Play the vocal (immediately, delay=0 — effect is shifted instead)
        if (vocKey.isRaw) {
            // Raw path / ID — play direct via manager
            if (game.ionrift.sounds?.manager) {
                game.ionrift.sounds.manager.play(vocKey.resolved);
            }
        } else {
            handler.play(vocKey.key);
        }

        const leadIn = handler?.orchestrator?.getNamedOffset("SPELL_VOCAL_LEAD_IN") ?? 400;
        Logger.log(`VocalLayerService | Vocal fired (${vocKey.key}). Effect delayed by ${leadIn}ms.`);
        return leadIn;
    }
}
