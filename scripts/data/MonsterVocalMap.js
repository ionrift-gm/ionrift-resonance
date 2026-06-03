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
 * @param {string} type - Creature type (e.g. "elemental", "beast")
 * @param {string} subtype - Creature subtype (e.g. "fire", "ursine")
 * @returns {string|null}
 */
export function getSubtypeVocalKey(type, subtype) {
    return SUBTYPE_VOCAL_MAP[`${type}_${subtype}`] || null;
}
