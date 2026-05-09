import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

/**
 * SFRPGAdapter -- Starfinder (sfrpg) system adapter for Ionrift Resonance.
 *
 * Hook surface (sfrpg v0.03.x):
 *   attackRolled    { actor, item, roll, formula, rollMetadata }
 *   damageRolled    { actor, item, roll, isCritical, formula, rollMetadata }
 *   itemActivationChanged  { actor, item, isActive }   (toggled items, not attacks)
 *
 * Weapon type taxonomy (item.system.weaponType):
 *   basicM    -> basic melee
 *   advancedM -> advanced melee
 *   smallA    -> small arms (pistols)
 *   longA     -> long arms (rifles)
 *   heavy     -> heavy weapons
 *   sniper    -> sniper rifles
 *   grenade   -> grenades (thrown/AoE)
 *   special   -> special weapons
 *   solarian  -> solarian crystals (melee)
 *
 * Spell schools (item.system.school): abj, con, div, enc, evo, ill, nec, trs, uni
 */

// Melee weapon type keys
const MELEE_TYPES = new Set(["basicM", "advancedM", "solarian"]);
// Ranged weapon type keys
const RANGED_TYPES = new Set(["smallA", "longA", "heavy", "sniper", "grenade", "special"]);

export class SFRPGAdapter extends SystemAdapter {

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => a.type === "character" || a.type === "npc");
        if (!actor) return issues;

        const checks = [
            { path: "system.attributes.hp.value", desc: "HP (Current)" },
            { path: "system.attributes.hp.max", desc: "HP (Max)" },
        ];
        for (const check of checks) {
            if (foundry.utils.getProperty(actor, check.path) === undefined) {
                issues.push(`${check.desc} missing at '${check.path}'`);
            }
        }
        return issues;
    }

    registerHooks() {
        Logger.log("SFRPG Adapter Active");

        // Phase 1 -- Attack swing sound: fires after the player confirms and the attack roll resolves.
        // Payload: { actor, item, roll, formula, rollMetadata }
        Hooks.on("attackRolled", ({ actor, item, roll }) => {
            if (!item) return;
            this._handleAttackSound(item, actor, roll);
        });

        // Phase 2 -- Damage / impact sound: fires after the damage roll.
        // Payload: { actor, item, roll, isCritical, formula, rollMetadata }
        Hooks.on("damageRolled", ({ actor, item, roll, isCritical }) => {
            if (!item) return;
            this._handleDamageSound(item, actor, isCritical);
        });

        // Phase 3 -- Generic item use (abilities, equipment activations, etc.)
        // Fires for toggled items (activated/deactivated), NOT for attacks or spells.
        Hooks.on("itemActivationChanged", ({ actor, item, isActive }) => {
            if (!item || !isActive) return; // Only play on activation, not deactivation
            this._handleActivationSound(item, actor);
        });
    }

    // Phase 1: Attack / Cast ──────────────────────────────────────────────

    _handleAttackSound(item, actor, roll) {
        Logger.log(`SFRPG | Attack sound: ${item.name} (type: ${item.type}, weaponType: ${item.system?.weaponType})`);

        const soundKey = this.handler.pickSound(item, actor?.name, actor);

        // Spells: try per-item key first, then fall back to school
        if (item.type === "spell" && item.system?.school) {
            const schoolKey = this._getSchoolKey(item.system.school);
            if (schoolKey) {
                Logger.log(`SFRPG | Spell school ${item.system.school} -> ${schoolKey}`);
                this.handler.playItemSoundWithFallback(soundKey, schoolKey, item);
                return;
            }
        }

        this.handler.playItemSound(soundKey, item);
    }

    // Phase 2: Damage / Impact ────────────────────────────────────────────

    _handleDamageSound(item, actor, isCritical) {
        if (isCritical) {
            Logger.log(`SFRPG | Critical hit!`);
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }

        // Play a hit sound -- Resonance has no target list in this hook,
        // so we play a single generic BLOODY_HIT without per-target vocals.
        this.play(SOUND_EVENTS.BLOODY_HIT);
    }

    // Phase 3: Generic Activation ────────────────────────────────────────

    _handleActivationSound(item, actor) {
        Logger.log(`SFRPG | Item activation: ${item.name} (type: ${item.type})`);

        // Check for explicit item-level override first
        const override = item.getFlag("ionrift-resonance", "sound_attack");
        if (override) {
            this.handler.play(override);
            return;
        }

        // Generic "use" sound for non-weapon/non-spell activations
        this.play(SOUND_EVENTS.CORE_USE);
    }

    // Key Helpers ────────────────────────────────────────────────────────

    /**
     * Maps sfrpg item to an appropriate Resonance semantic key.
     * Called by SoundResolver.pickSound via SoundHandler.pickSound.
     * This adapter extends detectSoundKey to understand Starfinder weapon taxonomy.
     *
     * NOTE: SoundResolver.detectSoundKey already handles generic string matching
     * (fire, ice, etc.) -- we only need to handle sfrpg-specific system data here.
     * SoundResolver.pickSound calls item.getFlag first (highest priority), so
     * any item-level overrides are already handled before this runs.
     */
    _getSoundKeyForItem(item) {
        if (!item?.system) return null;

        const wType = item.system.weaponType;

        // Melee weapons
        if (MELEE_TYPES.has(wType)) {
            // Solarian crystals are energy melee -- no specific key yet, fall to generic melee
            return SOUND_EVENTS.ASK_GENERIC_MELEE;
        }

        // Ranged weapons
        if (RANGED_TYPES.has(wType)) {
            return SOUND_EVENTS.ASK_GENERIC_RANGED;
        }

        // Spells -- handled in _handleAttackSound via school fallback
        if (item.type === "spell") {
            const schoolKey = this._getSchoolKey(item.system?.school);
            return schoolKey ?? SOUND_EVENTS.ASK_GENERIC_MAGIC;
        }

        return null;
    }

    /**
     * Maps sfrpg spell school codes to Resonance SCHOOL_ semantic keys.
     * sfrpg schools share the same codes as dnd5e (abj, con, div, enc, evo, ill, nec)
     * with two differences: "trs" (transmutation) and "uni" (universal).
     */
    _getSchoolKey(school) {
        const schoolMap = {
            abj: "SCHOOL_ABJURATION",
            con: "SCHOOL_CONJURATION",
            div: "SCHOOL_DIVINATION",
            enc: "SCHOOL_ENCHANTMENT",
            evo: "SCHOOL_EVOCATION",
            ill: "SCHOOL_ILLUSION",
            nec: "SCHOOL_NECROMANCY",
            trs: "SCHOOL_TRANSMUTATION",   // sfrpg uses "trs", dnd5e uses "tra"
            tra: "SCHOOL_TRANSMUTATION",   // include dnd5e alias for safety
            uni: "SCHOOL_EVOCATION",       // Universal -> closest generic is evocation
        };
        return schoolMap[school] || null;
    }
}
