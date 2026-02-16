import { Logger } from "./Logger.js";
import { SOUND_EVENTS } from "./constants.js";

export class SoundResolver {
    constructor(configService) {
        this.configService = configService;
    }

    /**
     * Main entry point to determine a sound key for an item/actor interaction.
     * @param {string|Item} itemOrName 
     * @param {string} actorName 
     * @param {Actor} actor 
     * @param {string} flagType 
     */
    pickSound(itemOrName, actorName, actor = null, flagType = "sound_attack") {
        const mappings = this.configService.getMappings();
        let itemName = "";
        let item = null;

        // 0. Resolve Item/Name
        if (typeof itemOrName === "object" && itemOrName?.name) {
            item = itemOrName;
            itemName = item.name;
        } else {
            itemName = itemOrName || "";
        }

        // 1. Check Item Flags (Highest Priority)
        if (item) {
            const flagVal = item.getFlag("ionrift-resonance", flagType);
            if (flagVal) {
                // Support Randomization (comma-separated strings)
                if (typeof flagVal === 'string' && flagVal.includes(',')) {
                    const options = flagVal.split(',').map(s => s.trim());
                    return options[Math.floor(Math.random() * options.length)];
                }
                return flagVal;
            }
        }

        // 2. Check Adversary Specifics
        if (actorName && mappings.adversaries && mappings.adversaries[actorName]) {
            const advMaps = mappings.adversaries[actorName];
            if (advMaps[itemName]) return advMaps[itemName];
        }

        // 3. Check Global Weapon/Spell Mappings
        if (mappings.weapons && mappings.weapons[itemName]) return mappings.weapons[itemName];
        if (mappings.spells && mappings.spells[itemName]) return mappings.spells[itemName];

        const lower = itemName.toLowerCase();

        // 4. Classifier Logic (Ionrift Library)
        if (actor && game.ionrift?.library?.classifyCreature) {
            const classifierResult = game.ionrift.library.classifyCreature(actor);
            const monsterKey = classifierResult?.sound;

            if (monsterKey && monsterKey !== "MONSTER_GENERIC") {
                let action = "";
                if (lower.includes("bite")) action = "BITE";
                else if (lower.includes("claw") || lower.includes("scratch")) action = "CLAW";
                else if (lower.includes("slam") || lower.includes("smash")) action = "SLAM";

                if (action) {
                    return `${monsterKey}_${action}`;
                }
            }
        }

        // 5. Fallback Matching (Unified Logic)
        return this.detectSoundKey(itemName, item ? item.type : null, item) ||
            (mappings.default || SOUND_EVENTS.WHOOSH);
    }

    /**
     * Pure string/metadata analysis to guess the sound.
     * Consolidates logic from DnD5eAdapter and SoundHandler.
     */
    detectSoundKey(name, type = null, item = null) {
        const lower = name.toLowerCase();

        // 5e System Metadata Checks (if Item object provided)
        if (item && item.system) {
            // Spells (School check)
            if (type === "spell" && item.system.school) {
                const school = item.system.school;
                switch (school) {
                    case "evoc": return SOUND_EVENTS.SPELL_FIRE; // Generalized
                    case "nec": return SOUND_EVENTS.SPELL_VOID;
                    case "div": return SOUND_EVENTS.SPELL_PSYCHIC;
                    case "abj": return SOUND_EVENTS.SPELL_HEAL;
                    // default fall through to string match
                }
            }

            // Weapons (Damage Type check)
            if (type === "weapon" && item.system.damage?.parts?.length > 0) {
                const dtype = item.system.damage.parts[0][1];
                if (dtype === "slashing") return SOUND_EVENTS.ATTACK_SWORD_SLASH;
                if (dtype === "bludgeoning") return SOUND_EVENTS.ATTACK_BLUDGEON_SWING;
                if (dtype === "piercing") return SOUND_EVENTS.ATTACK_DAGGER_SLASH;
            }
        }

        // String Matching (Universal Configurable Mappings or Hardcoded Fallbacks)
        const mappings = this.configService.getMappings();

        // Spells
        if (lower.includes("fire") || lower.includes("flame") || lower.includes("burn") || lower.includes("scorching")) return SOUND_EVENTS.SPELL_FIRE;
        if (lower.includes("ice") || lower.includes("frost") || lower.includes("cold") || lower.includes("chill")) return SOUND_EVENTS.SPELL_ICE;
        if (lower.includes("zap") || lower.includes("light") || lower.includes("shock") || lower.includes("thunder")) return SOUND_EVENTS.SPELL_LIGHTNING;
        if (lower.includes("chaos") || lower.includes("void") || lower.includes("blast") || lower.includes("necro")) return SOUND_EVENTS.SPELL_VOID;
        if (lower.includes("heal") || lower.includes("cure") || lower.includes("life") || lower.includes("preserve")) return SOUND_EVENTS.SPELL_HEAL;
        if (lower.includes("mind") || lower.includes("psychic") || lower.includes("mock") || lower.includes("vicious")) return SOUND_EVENTS.SPELL_PSYCHIC;
        if (lower.includes("acid") || lower.includes("poison") || lower.includes("toxic")) return SOUND_EVENTS.SPELL_ACID;

        // Generic Actions
        if (lower.includes("claw") || lower.includes("scratch")) return (mappings.generic?.claw || SOUND_EVENTS.ATTACK_CLAW);
        if (lower.includes("bite")) return (mappings.generic?.bite || SOUND_EVENTS.ATTACK_BITE);
        if (lower.includes("slam")) return (mappings.generic?.slam || SOUND_EVENTS.ATTACK_SLAM);

        // Weapons
        if (lower.includes("bow") || lower.includes("arrow")) return (mappings.generic?.bow || SOUND_EVENTS.ATTACK_BOW);
        if (lower.includes("crossbow") || lower.includes("bolt")) return SOUND_EVENTS.ATTACK_CROSSBOW;
        if (lower.includes("axe") || lower.includes("hammer") || lower.includes("maul")) return SOUND_EVENTS.ATTACK_BLUDGEON;
        if (lower.includes("dagger") || lower.includes("knife")) return SOUND_EVENTS.ATTACK_DAGGER;
        if (lower.includes("sword") || lower.includes("blade") || lower.includes("scimitar")) return (mappings.generic?.sword || SOUND_EVENTS.ATTACK_SWORD);

        return null; // No match found
    }

    /**
 * Maps an Abstract Key (e.g. ATTACK_SWORD) to a Concrete ID, handling fallback keys.
 * Recursively traverses the fallback chain until a binding is found or max depth is reached.
 */
    resolveKey(key, depth = 0) {
        if (depth > 5) return null; // Prevent infinite loops

        const bindings = this.configService.getEffectiveBindings();
        let resolved = bindings[key];

        // Unpack arrays from SYRINSCAPE_DEFAULTS structure: [{id, name, type}]
        if (Array.isArray(resolved) && resolved.length > 0 && resolved[0].id) {
            resolved = resolved[0].id;
        }

        if (resolved) {
            if (depth > 0) Logger.log(`SoundResolver | ${key} → resolved at depth ${depth} → ${resolved}`);
            return resolved;
        }

        // Chase the fallback chain recursively
        const fallback = this.getFallbackKey(key);
        if (fallback) {
            Logger.log(`SoundResolver | ${key} → fallback → ${fallback}`);
            return this.resolveKey(fallback, depth + 1);
        }

        return null;
    }

    getFallbackKey(specificKey) {
        // Guard against undefined/null keys
        if (!specificKey || typeof specificKey !== 'string') {
            return null;
        }

        // Core Groups
        if (["ATTACK_SWORD", "ATTACK_DAGGER", "ATTACK_AXE", "ATTACK_MACE", "ATTACK_BLUDGEON", "ATTACK_CLAW", "ATTACK_BITE", "ATTACK_SLAM", "ATTACK_SWORD_SLASH", "ATTACK_BLUDGEON_SWING", "ATTACK_DAGGER_SLASH"].includes(specificKey)) return "CORE_MELEE";

        if (["ATTACK_BOW", "ATTACK_CROSSBOW", "ATTACK_SLING", "ATTACK_JAVELIN", "ATTACK_THROWN", "ATTACK_BOW_FIRE"].includes(specificKey)) return "CORE_RANGED";

        // Physical weapon groups → generic swing fallback (spells do NOT swing)
        if (specificKey === "CORE_MELEE" || specificKey === "CORE_RANGED") return "CORE_WHOOSH";

        if (specificKey.startsWith("SPELL_") || specificKey.startsWith("SCHOOL_") || specificKey.startsWith("DOMAIN_")) return "CORE_MAGIC";
        if (specificKey === "CORE_SCHOOL" || specificKey === "CORE_DOMAIN") return "CORE_MAGIC";

        // Hits & Results (Category-Aware → Generic)
        if (specificKey === "CORE_HIT_RANGED" || specificKey === "CORE_HIT_MAGIC") return "CORE_HIT";
        if (specificKey === "CORE_MISS_RANGED" || specificKey === "CORE_MISS_MAGIC") return "CORE_MISS";
        if (specificKey.endsWith("_HIT") || specificKey === "BLOODY_HIT") return "CORE_HIT";
        if (["MISS", "ATTACK_MISS"].includes(specificKey)) return "CORE_MISS";
        if (specificKey === "WHOOSH") return "CORE_WHOOSH";
        if (specificKey === "CRIT_DECORATION") return "CORE_CRIT";
        if (specificKey === "FUMBLE_DECORATION") return "CORE_FUMBLE";

        // Vocals - PC
        if (specificKey === "PC_PAIN_MALE") return "CORE_PAIN_MASCULINE";
        if (specificKey === "PC_PAIN_FEMALE") return "CORE_PAIN_FEMININE";
        if (specificKey === "PC_DEATH_MALE") return "CORE_DEATH_MASCULINE";
        if (specificKey === "PC_DEATH_FEMALE") return "CORE_DEATH_FEMININE";

        // Vocals - Monster (weapon suffix → monster attack → weapon type → catch-all)
        // MONSTER_BEAR_CLAW → MONSTER_BEAR_ATTACK → ATTACK_CLAW → CORE_MELEE
        if (specificKey.startsWith("MONSTER_")) {
            // Step 1: Weapon-specific composite → Monster Default Attack
            if (specificKey.endsWith("_CLAW") || specificKey.endsWith("_BITE") || specificKey.endsWith("_SLAM")) {
                // Extract monster base: MONSTER_BEAR_CLAW → MONSTER_BEAR
                const suffix = specificKey.endsWith("_CLAW") ? "_CLAW" : specificKey.endsWith("_BITE") ? "_BITE" : "_SLAM";
                const monsterBase = specificKey.slice(0, -suffix.length);
                return `${monsterBase}_ATTACK`;
            }

            // Step 2: Monster Default Attack → Generic weapon type
            if (specificKey.endsWith("_ATTACK")) {
                return "CORE_MELEE"; // Broadest weapon catch-all
            }

            // Pain vocals
            if (specificKey.includes("DEATH")) return "CORE_MONSTER_DEATH";
            return "CORE_MONSTER_PAIN";
        }

        return null;
    }

    getPCSound(actor, type = "PAIN") {
        let identity = actor.getFlag("ionrift-resonance", "identity");

        if (!identity) {
            // Check Config Override
            const players = this.configService.getPlayers();
            if (players[actor.name]) {
                const cfg = players[actor.name];
                // Simplify: Map override to identity or return keys directly?
                // Let's assume override provides keys, but standard flow uses identity.
                // For now, let's assume identity priority.
            }
        }

        // Default to Masculine if not set (or Log warning)
        if (!identity) return type === "DEATH" ? SOUND_EVENTS.PC_DEATH_MASCULINE : SOUND_EVENTS.PC_PAIN_MASCULINE;

        const isFem = identity.toLowerCase() === "feminine";
        if (type === "DEATH") {
            return isFem ? SOUND_EVENTS.PC_DEATH_FEMININE : SOUND_EVENTS.PC_DEATH_MASCULINE;
        } else {
            return isFem ? SOUND_EVENTS.PC_PAIN_FEMININE : SOUND_EVENTS.PC_PAIN_MASCULINE;
        }
    }
}
