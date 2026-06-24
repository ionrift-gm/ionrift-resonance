/**
 * Shared subtype vocal key map used by all system adapters.
 * Maps classifier type+subtype composite keys to sound event IDs
 * used in the monster config hierarchy.
 */
export const SUBTYPE_VOCAL_MAP = {
    // Elementals
    elemental_fire: "SFX_FIRE",
    elemental_water: "SFX_WATER_ENTITY",
    elemental_air: "SFX_WIND",
    elemental_earth: "elemental_earth",
    // Beasts
    beast_ursine: "MONSTER_BEAR",
    beast_canine: "MONSTER_WOLF",
    beast_feline: "MONSTER_CAT",
    beast_avian: "MONSTER_BIRD",
    beast_equine: "MONSTER_HORSE",
    beast_reptile: "MONSTER_REPTILE",
    beast_insect: "SFX_INSECT",
    // Undead
    undead_zombie: "MONSTER_ZOMBIE",
    undead_skeleton: "MONSTER_SKELETON",
    undead_ghost: "MONSTER_GHOST",
    // Fiends
    fiend_demon: "MONSTER_DEMON",
    // Humanoids
    humanoid_goblin: "MONSTER_GOBLIN",
    humanoid_lycanthrope: "MONSTER_LYCANTHROPE",
    // Constructs
    construct_golem: "construct_golem",
    construct_animated_object: "construct_animated_object",
    // Dragons
    dragon_wyvern: "dragon_wyvern",
    // Aberrations
    aberration_beholder: "aberration_beholder",
    aberration_mind_flayer: "aberration_mind_flayer",
    aberration_chuul: "aberration_chuul",
    // Plants
    plant_treant: "plant_treant",
    plant_myconid: "plant_myconid",
    plant_shambling_mound: "plant_shambling_mound"
};

/**
 * Look up the sound key for a given creature type + subtype.
 * Checks dynamic (pack-contributed) classifier bindings first,
 * then the static SUBTYPE_VOCAL_MAP, then prefix fallback.
 * @param {string} type - Creature type (e.g. "elemental", "beast")
 * @param {string} subtype - Creature subtype (e.g. "fire", "ursine")
 * @returns {string|null}
 */
export function getSubtypeVocalKey(type, subtype) {
    if (!type || !subtype) return null;

    const composite = `${type}_${subtype}`;

    // Check pack-declared classifier bindings first (plug-in architecture)
    try {
        const { SoundPackLoader } = game.ionrift?.resonance ?? {};
        if (SoundPackLoader) {
            const dynamicKey = SoundPackLoader.getDynamicClassifierBinding(composite);
            if (dynamicKey) return dynamicKey;
        }
    } catch { /* SoundPackLoader not available yet — fall through */ }

    // Check static map (hardcoded known subtypes)
    if (SUBTYPE_VOCAL_MAP[composite]) return SUBTYPE_VOCAL_MAP[composite];

    // Prefix fallback: beast_canine_domestic -> beast_canine -> MONSTER_WOLF
    const parts = subtype.split("_");
    while (parts.length > 1) {
        parts.pop();
        const shorter = `${type}_${parts.join("_")}`;

        // Check dynamic bindings for shorter key too
        try {
            const { SoundPackLoader } = game.ionrift?.resonance ?? {};
            if (SoundPackLoader) {
                const dynamicKey = SoundPackLoader.getDynamicClassifierBinding(shorter);
                if (dynamicKey) return dynamicKey;
            }
        } catch { /* fall through */ }

        if (SUBTYPE_VOCAL_MAP[shorter]) return SUBTYPE_VOCAL_MAP[shorter];
    }

    return null;
}

/**
 * Resolve the primary monster sound key (e.g. "MONSTER_LICH") from a
 * classifier output. Used by both attack and spell attack pickers to
 * look up the creature's attackBinding entry.
 * Checks dynamic pack bindings first, then the static SUBTYPE_VOCAL_MAP,
 * then the type-level prefix.
 * @param {object|null} classification - Output from classifyCreature()
 * @returns {string|null}
 */
export function resolveMonsterKeyFromClassification(classification) {
    if (!classification) return null;

    // 1. Subtype composite key (pack dynamic or static map)
    if (classification.type && classification.subtype) {
        const subtypeKey = getSubtypeVocalKey(classification.type, classification.subtype);
        if (subtypeKey) return subtypeKey;
    }

    // 2. Explicit sound key from classifier
    if (classification.sound) return classification.sound;

    // 3. Type-level key (e.g. MONSTER_UNDEAD)
    if (classification.type) {
        return `MONSTER_${String(classification.type).toUpperCase()}`;
    }

    return null;
}

/**
 * Evaluate a single spell matcher's criteria against the current spell context.
 * All specified criteria must match (AND logic). An empty or missing match
 * object is a catch-all that matches everything.
 * @param {object} match - { school?: string[], delivery?: string }
 * @param {{ school: string, delivery: string }} context
 * @returns {boolean}
 */
export function matchesSpellCriteria(match, context) {
    if (!match || Object.keys(match).length === 0) return true; // catch-all

    if (Array.isArray(match.school) && match.school.length > 0) {
        if (!match.school.includes(context.school)) return false;
    }

    if (typeof match.delivery === "string") {
        if (match.delivery !== context.delivery) return false;
    }

    return true;
}

/**
 * Pick the monster's spell attack vocal key by matching the spell context
 * against the `spellAttacks` matcher list declared by an active pack.
 * Evaluated top-down — first match wins.
 *
 * Returns null when:
 *   - The creature has no attack binding in any active pack
 *   - The binding has no `spellAttacks` array
 *   - No matcher matches the spell context
 *   - The matched key has no audio binding (resolveKeyDirect returns null)
 *
 * @param {object|null} classification - Output from classifyCreature()
 * @param {import("../SoundResolver.js").SoundResolver} resolver
 * @param {{ school: string, delivery: string }} spellContext
 * @returns {{ key: string, overrideSpellEffect: boolean } | null}
 */
export function pickBoundMonsterSpellAttackKey(classification, resolver, spellContext) {
    if (!classification || !resolver || !spellContext) return null;

    const monsterKey = resolveMonsterKeyFromClassification(classification);
    if (!monsterKey) return null;

    let SoundPackLoader;
    try {
        SoundPackLoader = game.ionrift?.resonance?.SoundPackLoader;
    } catch { /* SoundPackLoader not available yet */ }
    if (!SoundPackLoader) return null;

    const attackBinding = SoundPackLoader.getAttackBinding(monsterKey);
    if (!attackBinding?.spellAttacks?.length) return null;

    for (const matcher of attackBinding.spellAttacks) {
        if (!matcher?.key) continue;
        if (matchesSpellCriteria(matcher.match ?? {}, spellContext)) {
            // Only use this key if a binding actually exists for it
            if (resolver.resolveKeyDirect(matcher.key)) {
                return {
                    key: matcher.key,
                    overrideSpellEffect: matcher.overrideSpellEffect ?? false
                };
            }
        }
    }

    return null;
}

/**
 * Pick the first monster pain key that has an audio binding in the active pack.
 * @param {object|null} classification  Output from ionrift-library classifyCreature()
 * @param {import("../SoundResolver.js").SoundResolver} resolver
 * @param {object} soundEvents            SOUND_EVENTS constant object
 * @returns {string|null}
 */
export function pickBoundMonsterPainKey(classification, resolver, soundEvents) {
    if (!resolver) return soundEvents.VOCAL_GENERIC_PAIN ?? soundEvents.CORE_MONSTER_PAIN ?? null;

    const candidates = [];

    if (classification?.type && classification?.subtype) {
        const subtypeKey = getSubtypeVocalKey(classification.type, classification.subtype);
        if (subtypeKey) candidates.push(subtypeKey);
    }

    if (classification?.sound) candidates.push(classification.sound);

    if (classification?.type) {
        const typeUpper = String(classification.type).toUpperCase();
        candidates.push(`MONSTER_${typeUpper}`);
    }

    candidates.push(
        soundEvents.MONSTER_GENERIC,
        soundEvents.VOCAL_GENERIC_PAIN,
        soundEvents.CORE_MONSTER_PAIN
    );

    const seen = new Set();
    for (const key of candidates) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (resolver.resolveKey(key)) return key;
    }

    return soundEvents.VOCAL_GENERIC_PAIN ?? soundEvents.CORE_MONSTER_PAIN ?? null;
}

/**
 * Pick the first bound monster *attack* key for Phase 1 (swing/cast).
 * Only considers explicit attack slots (*_ATTACK, *_BITE, *_CLAW, *_SLAM).
 * Vocal keys (MONSTER_WOLF, CORE_MONSTER_PAIN) are damage-phase only; when no
 * attack slot is bound, returns null so weapon/item taxonomy handles the swing.
 * @param {object|null} classification
 * @param {import("../SoundResolver.js").SoundResolver} resolver
 * @param {object} _soundEvents
 * @param {string} [itemName=""]
 * @returns {string|null}
 */
export function pickBoundMonsterAttackKey(classification, resolver, _soundEvents, itemName = "") {
    if (!resolver || !classification) return null;

    const lower = (itemName || "").toLowerCase();
    const candidates = [];

    const subtypeBase = classification.type && classification.subtype
        ? getSubtypeVocalKey(classification.type, classification.subtype)
        : null;

    // Check pack-declared explicit attack key first (highest priority)
    // A pack that ships MONSTER_LICH_ATTACK explicitly knows what the creature
    // sounds like on a basic attack — trust that over name synthesis.
    const monsterKey = resolveMonsterKeyFromClassification(classification);
    if (monsterKey) {
        try {
            const SoundPackLoader = game.ionrift?.resonance?.SoundPackLoader;
            if (SoundPackLoader) {
                const attackBinding = SoundPackLoader.getAttackBinding(monsterKey);
                if (attackBinding?.attack && resolver.resolveKeyDirect(attackBinding.attack)) {
                    return attackBinding.attack;
                }
            }
        } catch { /* fall through to composite synthesis */ }
    }

    if (subtypeBase) {
        if (lower.includes("bite")) candidates.push(`${subtypeBase}_BITE`);
        if (lower.includes("claw") || lower.includes("scratch")) candidates.push(`${subtypeBase}_CLAW`);
        if (lower.includes("slam") || lower.includes("smash")) candidates.push(`${subtypeBase}_SLAM`);
        candidates.push(`${subtypeBase}_ATTACK`);
    }

    if (classification.type) {
        candidates.push(`MONSTER_${String(classification.type).toUpperCase()}_ATTACK`);
    }

    if (classification.sound) {
        candidates.push(`${classification.sound}_ATTACK`);
    }

    const seen = new Set();
    for (const key of candidates) {
        if (!key || seen.has(key)) continue;
        seen.add(key);

        // Attack slots must not chase the combat fallback chain (MONSTER_*_ATTACK -> CORE_MELEE -> sword)
        if (key.endsWith("_ATTACK") || key.endsWith("_BITE") || key.endsWith("_CLAW") || key.endsWith("_SLAM")) {
            if (resolver.resolveKeyDirect(key)) return key;
        }
    }

    return null;
}
