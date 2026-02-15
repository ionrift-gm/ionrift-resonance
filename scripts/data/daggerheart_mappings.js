import { SOUND_EVENTS } from "../constants.js";

export const DAGGERHEART_MONSTER_MAP = [
    // Undead
    // Undead
    { keyword: "Skeleton", type: SOUND_EVENTS.MONSTER_SKELETON },
    { keyword: "Warrior", type: SOUND_EVENTS.MONSTER_SKELETON }, // Skeleton Warrior often matches here
    { keyword: "Zombie", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Dredge", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Rotted", type: SOUND_EVENTS.MONSTER_ZOMBIE },
    { keyword: "Undead", type: SOUND_EVENTS.MONSTER_UNDEAD },
    { keyword: "Banshee", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Ghost", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Spirit", type: SOUND_EVENTS.MONSTER_GHOST },
    { keyword: "Wraith", type: SOUND_EVENTS.MONSTER_GHOST },

    // Fiend
    { keyword: "Demon", type: SOUND_EVENTS.MONSTER_FIEND_FERAL }, // Chaotic/Feral
    { keyword: "Devil", type: SOUND_EVENTS.MONSTER_FIEND_INTELLIGENT }, // Lawful/Talkative
    { keyword: "Fiend", type: SOUND_EVENTS.MONSTER_FIEND },

    // Beast (Feral)
    { keyword: "Rat", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Wolf", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Bear", type: SOUND_EVENTS.MONSTER_BEAST },
    { keyword: "Beast", type: SOUND_EVENTS.MONSTER_BEAST },

    // Insect / Arachnid
    { keyword: "Scorpion", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Spider", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Mosquito", type: SOUND_EVENTS.MONSTER_INSECT },
    { keyword: "Stirge", type: SOUND_EVENTS.MONSTER_INSECT },

    // Reptile
    { keyword: "Snake", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Lizard", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Basilisk", type: SOUND_EVENTS.MONSTER_REPTILE },
    { keyword: "Drake", type: SOUND_EVENTS.MONSTER_REPTILE },

    // Plant
    { keyword: "Dryad", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Treant", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Vine", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Root", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Bramble", type: SOUND_EVENTS.MONSTER_PLANT },
    { keyword: "Sylvan", type: SOUND_EVENTS.MONSTER_PLANT },

    // Goblinoid
    { keyword: "Goblin", type: SOUND_EVENTS.MONSTER_GOBLIN },
    { keyword: "Orc", type: SOUND_EVENTS.MONSTER_GOBLIN },

    // Humanoid (Default for civilized roles)
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

    // Oozes and Elementals (Generic for now)
    { keyword: "Ooze", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Elemental", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Construct", type: SOUND_EVENTS.MONSTER_GENERIC },

    // catch-alls
    { keyword: "Swarm", type: SOUND_EVENTS.MONSTER_GENERIC },
    { keyword: "Pack", type: SOUND_EVENTS.MONSTER_GENERIC }
];

export function getDaggerheartMonsterSound(actorOrName) {
    const actorName = (typeof actorOrName === 'string') ? actorOrName : (actorOrName?.name || "");
    if (!actorName) return SOUND_EVENTS.MONSTER_GENERIC;

    // Use Shared Library if available
    if (game.ionrift?.lib?.classifyCreature) {
        // PASS THE FULL OBJECT IF AVAILABLE
        const classification = game.ionrift.lib.classifyCreature(actorOrName);
        if (classification.match || classification.confidence > 0.4) {
            // Map the string key from library (e.g. "MONSTER_SKELETON") to the local Constant Value
            if (SOUND_EVENTS[classification.sound]) {
                return SOUND_EVENTS[classification.sound];
            }
        }
    }

    // Fallback: Check local map (Deprecated/Legacy support if library fails or is missing specific override)
    const lowerName = actorName.toLowerCase();

    for (const mapping of DAGGERHEART_MONSTER_MAP) {
        if (lowerName.includes(mapping.keyword.toLowerCase())) {
            return mapping.type;
        }
    }

    return SOUND_EVENTS.MONSTER_GENERIC;
}
