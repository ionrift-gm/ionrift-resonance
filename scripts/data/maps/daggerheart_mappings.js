import { SOUND_EVENTS } from "../constants.js";

export const DAGGERHEART_MONSTER_MAP = [
    { keyword: "Skeleton", type: SOUND_EVENTS.MONSTER_SKELETON },
    { keyword: "Warrior", type: SOUND_EVENTS.MONSTER_SKELETON },
    { keyword: "Zombie", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Dredge", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Rotted", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Undead", type: SOUND_EVENTS.MONSTER_UNDEAD },
    { keyword: "Banshee", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Ghost", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Spirit", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Wraith", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Demon", type: SOUND_EVENTS.MONSTER_FIEND_FERAL },
    { keyword: "Devil", type: SOUND_EVENTS.MONSTER_FIEND_INTELLIGENT },
    { keyword: "Fiend", type: SOUND_EVENTS.MONSTER_FIEND },
    { keyword: "Rat", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Wolf", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Bear", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Beast", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Scorpion", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Spider", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Mosquito", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Stirge", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Snake", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Lizard", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Basilisk", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Drake", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Dryad", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Treant", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Vine", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Root", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Bramble", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Sylvan", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Goblin", type: SOUND_EVENTS.MONSTER_GOBLIN },
    { keyword: "Orc", type: SOUND_EVENTS.MONSTER_GOBLIN },
    { keyword: "Bandit", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Pirate", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Guard", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Soldier", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Knight", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Noble", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Sniper", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Mercenary", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Kneebreaker", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Lieutenant", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Shadow", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Spellblade", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Harrier", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Courtier", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Sellsword", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Merchant", type: SOUND_EVENTS.MONSTER_HUMANOID },
    { keyword: "Ooze", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Elemental", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Construct", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Swarm", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Pack", type: SOUND_EVENTS.MONSTER_GENERIC }
];

export function getDaggerheartMonsterSound(actorOrName) {
    const actorName = (typeof actorOrName === 'string') ? actorOrName : (actorOrName?.name || "");
    if (!actorName) return SOUND_EVENTS.MONSTER_GENERIC;
    if (game.ionrift?.library?.classifyCreature) {
        const classification = game.ionrift.library.classifyCreature(actorOrName);
        if (classification.match || classification.confidence > 0.4) {
            if (SOUND_EVENTS[classification.sound]) {
                return SOUND_EVENTS[classification.sound];
            }
        }
    }
    const lowerName = actorName.toLowerCase();

    for (const mapping of DAGGERHEART_MONSTER_MAP) {
        if (lowerName.includes(mapping.keyword.toLowerCase())) {
            return mapping.type;
        }
    }

    return SOUND_EVENTS.MONSTER_GENERIC;
}
