export const SUBTYPE_VOCAL_MAP = {
    elemental_fire: "SFX_FIRE",
    elemental_water: "SFX_WATER_ENTITY",
    elemental_air: "SFX_WIND",
    elemental_earth: "elemental_earth",
    beast_ursine: "MONSTER_BEAR",
    beast_canine: "MONSTER_WOLF",
    beast_feline: "MONSTER_CAT",
    beast_avian: "MONSTER_BIRD",
    beast_equine: "MONSTER_HORSE",
    beast_reptile: "MONSTER_REPTILE",
    beast_insect: "SFX_INSECT",
    undead_zombie: "MONSTER_ZOMBIE",
    undead_skeleton: "MONSTER_SKELETON",
    undead_ghost: "MONSTER_GHOST",
    fiend_demon: "MONSTER_DEMON",
    humanoid_goblin: "MONSTER_GOBLIN",
    humanoid_lycanthrope: "MONSTER_LYCANTHROPE",
    construct_golem: "construct_golem",
    construct_animated_object: "construct_animated_object",
    dragon_wyvern: "dragon_wyvern",
    aberration_beholder: "aberration_beholder",
    aberration_mind_flayer: "aberration_mind_flayer",
    aberration_chuul: "aberration_chuul",
    plant_treant: "plant_treant",
    plant_myconid: "plant_myconid",
    plant_shambling_mound: "plant_shambling_mound"
};

export function getSubtypeVocalKey(type, subtype) {
    if (!type || !subtype) return null;

    const composite = `${type}_${subtype}`;

    try {
        const { SoundPackLoader } = game.ionrift?.resonance ?? {};
        if (SoundPackLoader) {
            const dynamicKey = SoundPackLoader.getDynamicClassifierBinding(composite);
            if (dynamicKey) return dynamicKey;
        }
    } catch { /* pack loader not ready */ }

    if (SUBTYPE_VOCAL_MAP[composite]) return SUBTYPE_VOCAL_MAP[composite];

    const parts = subtype.split("_");
    while (parts.length > 1) {
        parts.pop();
        const shorter = `${type}_${parts.join("_")}`;

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

export function resolveMonsterKeyFromClassification(classification) {
    if (!classification) return null;

    if (classification.type && classification.subtype) {
        const subtypeKey = getSubtypeVocalKey(classification.type, classification.subtype);
        if (subtypeKey) return subtypeKey;
    }

    if (classification.sound) return classification.sound;

    if (classification.type) {
        return `MONSTER_${String(classification.type).toUpperCase()}`;
    }

    return null;
}

export function matchesSpellCriteria(match, context) {
    if (!match || Object.keys(match).length === 0) return true;

    if (Array.isArray(match.school) && match.school.length > 0) {
        if (!match.school.includes(context.school)) return false;
    }

    if (typeof match.delivery === "string") {
        if (match.delivery !== context.delivery) return false;
    }

    return true;
}

export function pickBoundMonsterSpellAttackKey(classification, resolver, spellContext) {
    if (!classification || !resolver || !spellContext) return null;

    const monsterKey = resolveMonsterKeyFromClassification(classification);
    if (!monsterKey) return null;

    let SoundPackLoader;
    try {
        SoundPackLoader = game.ionrift?.resonance?.SoundPackLoader;
    } catch { /* not ready */ }
    if (!SoundPackLoader) return null;

    const attackBinding = SoundPackLoader.getAttackBinding(monsterKey);
    if (!attackBinding?.spellAttacks?.length) return null;

    for (const matcher of attackBinding.spellAttacks) {
        if (!matcher?.key) continue;
        if (matchesSpellCriteria(matcher.match ?? {}, spellContext)) {
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
// Attack Phase 1: only *_ATTACK/_BITE/_CLAW/_SLAM; null leaves swing to weapon taxonomy.
export function pickBoundMonsterAttackKey(classification, resolver, _soundEvents, itemName = "") {
    if (!resolver || !classification) return null;

    const lower = (itemName || "").toLowerCase();
    const candidates = [];

    const subtypeBase = classification.type && classification.subtype
        ? getSubtypeVocalKey(classification.type, classification.subtype)
        : null;

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
        } catch { /* synthesize from composites */ }
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

        if (key.endsWith("_ATTACK") || key.endsWith("_BITE") || key.endsWith("_CLAW") || key.endsWith("_SLAM")) {
            if (resolver.resolveKeyDirect(key)) return key;
        }
    }

    return null;
}
