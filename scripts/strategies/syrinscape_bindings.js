import { SOUND_EVENTS } from "../constants.js";

export const SYRINSCAPE_BINDINGS = {
    [SOUND_EVENTS.BLOODY_HIT]: "1497021", // friendly_takes_bloody_hit
    [SOUND_EVENTS.PC_DEATH]: "271386", // sound_combat_pcDeath

    [SOUND_EVENTS.PC_DEATH_MASCULINE]: "81758", // pcUnconciousScream_Male
    [SOUND_EVENTS.PC_DEATH_FEMININE]: "81757", // pcUnconciousScream_Female

    [SOUND_EVENTS.PC_PAIN_MASCULINE]: ["1497025", "2462"], // male hit, exertion
    [SOUND_EVENTS.PC_PAIN_FEMININE]: ["1497014", "1497014"], // female hit (duplicate forweight or array req)

    [SOUND_EVENTS.CRIT_DECORATION]: "1496012", // critical_hit_decoration
    [SOUND_EVENTS.MISS]: ["1497024", "1282", "1312"], // automaticMiss, miss_invulnerable

    // Spells
    [SOUND_EVENTS.SPELL_FIRE]: ["415568", "162576"], // wizard_firebolt_0, fire_breath
    [SOUND_EVENTS.SPELL_ICE]: "595697", // sorc_level_2
    [SOUND_EVENTS.SPELL_LIGHTNING]: "595693", // sorc_level_6
    [SOUND_EVENTS.SPELL_VOID]: ["618135", "618109", "618111"], // eldritch_blast, warlock stuff
    [SOUND_EVENTS.SPELL_HEAL]: "415624", // cleric_level_0
    [SOUND_EVENTS.SPELL_PSYCHIC]: ["618184", "618123"], // vicious_mockery, hypnotic_pattern
    [SOUND_EVENTS.SPELL_ACID]: "144260", // acid_spray

    // Weapons
    [SOUND_EVENTS.ATTACK_CLAW]: ["424274", "2747"], // gemeric_slash, gemeric_slash2
    [SOUND_EVENTS.ATTACK_BITE]: "424292", // sound_combat_bite
    [SOUND_EVENTS.ATTACK_SLAM]: ["2692", "1197", "147650"], // bludgeon_hit, improvised_slam, unarmed_punch

    // Bow
    [SOUND_EVENTS.ATTACK_BOW]: "2480",
    [SOUND_EVENTS.ATTACK_BOW_FIRE]: ["2480", "2478"], // Fire, Draw
    [SOUND_EVENTS.ATTACK_BOW_HIT]: ["1040", "1039", "2481"], // Flesh, Wood, Crit

    // Crossbow
    [SOUND_EVENTS.ATTACK_CROSSBOW]: "2620",
    [SOUND_EVENTS.ATTACK_CROSSBOW_HIT]: ["2703", "2620"],

    // Bludgeon
    [SOUND_EVENTS.ATTACK_BLUDGEON]: "2691",
    [SOUND_EVENTS.ATTACK_BLUDGEON_SWING]: "2691",
    [SOUND_EVENTS.ATTACK_BLUDGEON_HIT]: ["2692", "2695", "1197"],

    // Dagger
    [SOUND_EVENTS.ATTACK_DAGGER]: "2476",
    [SOUND_EVENTS.ATTACK_DAGGER_SLASH]: ["2476", "171901"], // short_blade_slash, pole_arm_slash (reused)
    [SOUND_EVENTS.ATTACK_DAGGER_HIT]: ["2474", "2479"], // hit, crit

    // Sword
    [SOUND_EVENTS.ATTACK_SWORD]: "2782",
    [SOUND_EVENTS.ATTACK_SWORD_SLASH]: ["1497028", "2477"], // lightsword, cimitar
    [SOUND_EVENTS.ATTACK_SWORD_HIT]: ["2782", "2781", "2750"], // long_blade_hit/crit, cimitar_crit

    // Monsters (Pain/Vocals)
    [SOUND_EVENTS.MONSTER_UNDEAD]: ["147668", "162556"], // Generic Hiss/Vocal
    [SOUND_EVENTS.MONSTER_ZOMBIE]: ["4403", "162556"], // Zombie moan
    [SOUND_EVENTS.MONSTER_SKELETON]: ["147668"], // Dry hiss
    [SOUND_EVENTS.MONSTER_GHOST]: ["327998", "1034", "331918"], // Banshee wail, wails, attack

    // Feral Beasts (Fur/Paws)

    // Feral Beasts (Fur/Paws)
    [SOUND_EVENTS.MONSTER_BEAST]: ["1430", "4756", "265797", "4393", "4396"], // wild vocal, ape, wolf attack, werewolf howl/growl

    // Insects and Arachnids (Chitin/Buzz)
    [SOUND_EVENTS.MONSTER_INSECT]: ["424275", "225392", "144201"], // stirge, wasp, sqark

    // Reptiles (Scales/Hiss)
    [SOUND_EVENTS.MONSTER_REPTILE]: ["162547", "162549", "162552", "4757", "225406"], // hisses, dino roar, growl

    // Plants (Wood/Creak)
    [SOUND_EVENTS.MONSTER_PLANT]: ["1039", "1312"], // hit wood, dull impact (best avail)

    [SOUND_EVENTS.MONSTER_HUMANOID]: ["162538", "1033", "2462", "2461"], // grunt, pain, exertion, growl
    [SOUND_EVENTS.MONSTER_FIEND]: ["986", "20343"], // Generic hiss
    [SOUND_EVENTS.MONSTER_FIEND_FERAL]: ["986", "20343", "144269", "20344"], // Hiss, growls
    [SOUND_EVENTS.MONSTER_FIEND_INTELLIGENT]: ["49422", "20345", "1033"], // Taunt, speech, (humanoid pain backup)
    [SOUND_EVENTS.MONSTER_GOBLIN]: ["4398", "331995", "274267", "5196"], // goblin, orc stuff
    [SOUND_EVENTS.MONSTER_GENERIC]: ["144201", "162546", "162553", "162547"], // small monster noises

    // Default
    [SOUND_EVENTS.WHOOSH]: ["1497020", "1497028"]
};
