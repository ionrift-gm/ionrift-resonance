import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";



export class DnD5eAdapter extends SystemAdapter {
    validateSchema() {
        const issues = [];
        let actor = game.actors.find(a => a.type === "character" || a.type === "npc");

        if (!actor) {
            try {
                Logger.log("No World Actors found. Creating Synthetic Actor for Schema Check.");
                actor = new Actor({ name: "Schema Validator", type: "character" });
            } catch (e) {
                return ["Critical: Could not create test Actor for validation."];
            }
        }

        const data = actor;
        const checks = [
            { path: "system.attributes.hp.value", desc: "HP (Current)" },
            { path: "system.attributes.hp.max", desc: "HP (Max)" },
        ];

        for (const check of checks) {
            const val = foundry.utils.getProperty(data, check.path);
            if (val === undefined) {
                issues.push(`${check.desc} missing at '${check.path}'`);
            }
        }

        return issues;
    }

    registerHooks() {
        Logger.log("DnD5e Adapter Active");

        if (game.modules.get("midi-qol")?.active) {
            Logger.log("Hooking into Midi-QOL...");
            Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
                this.handleAttack(workflow);
            });
            Hooks.on("midi-qol.DamageRollComplete", (workflow) => {
                this.handleDamage(workflow);
            });
        } else {
            Logger.log("Midi-QOL inactive. Usage native dnd5e hooks.");
            if (!game.modules.get("midi-qol")?.active) {
                Logger.log("Hooking into Native DnD5e...");

                // V2 Hooks
                Hooks.on("dnd5e.rollAttackV2", (roll, data) => {
                    let item = data.subject || data.item;
                    if (item && item.item) item = item.item;
                    this.handleNativeAttack(item, roll);
                });

                Hooks.on("dnd5e.rollDamageV2", (roll, data) => {
                    let item = data.subject || data.item;
                    if (item && item.item) item = item.item;
                    // Native damage currently no-op until mapped
                });
            }
        }
    }

    handleAttack(workflow) {
        const item = workflow.item;
        if (!item) return;

        Logger.log(`5e Attack: ${item.name} (${item.type})`);

        if (workflow.hitTargets.size === 0) {
            this.play(SOUND_EVENTS.MISS);
            return;
        }

        // Use Resolver via Handler
        // pickSound now handles 5e Metadata fallback natively via SoundResolver
        let soundKey = this.handler.pickSound(item, workflow.actor?.name, workflow.actor);

        this.handler.playItemSound(soundKey, item);

        if (workflow.isCritical) {
            this.play(SOUND_EVENTS.CRIT_DECORATION, 500);
        }
    }

    handleDamage(workflow) {
        // Check for Death of Targets
        for (const token of workflow.hitTargets) {
            const actor = token.actor;
            if (!actor) continue;

            const hp = actor.system?.attributes?.hp;
            if (hp?.value <= 0) {
                if (actor.hasPlayerOwner) {
                    this.play(this.handler.getPCSound(actor, "DEATH"));
                } else {
                    this.play(SOUND_EVENTS.PC_DEATH);
                }
            } else {
                this.play(SOUND_EVENTS.BLOODY_HIT);

                if (actor.hasPlayerOwner) {
                    this.play(this.handler.getPCSound(actor, "PAIN"));
                } else {
                    const painSound = this.detectMonsterPain(actor);
                    if (painSound) this.play(painSound);
                }
            }
        }
    }

    detectMonsterPain(actor) {
        const classification = game.ionrift.library.classifyCreature(actor);
        if (classification && classification.sound) {
            if (Object.values(SOUND_EVENTS).includes(classification.sound)) return classification.sound;
            if (SOUND_EVENTS[classification.sound]) return SOUND_EVENTS[classification.sound];
        }
        return SOUND_EVENTS.MONSTER_GENERIC;
    }

    async handleNativeAttack(item, roll) {
        if (!item) return;
        // Resolver handles Metadata fallback now
        const soundKey = this.handler.pickSound(item, item.actor?.name, item.actor);
        if (soundKey) this.handler.playItemSound(soundKey);
    }
}

// 1. Get a sample Actor to inspect
let actor = game.actors.find(a => a.type === "character" || a.type === "npc");

if (!actor) {
    try {
        // Create a temporary in-memory actor
        Logger.log("No World Actors found. Creating Synthetic Actor for Schema Check.");
        actor = new Actor({ name: "Schema Validator", type: "character" });
    } catch (e) {
        return ["Critical: Could not create test Actor for validation."];
    }
}

Logger.log(`Validating 5e Schema against Actor: ${actor.name} (${actor.type})`);
const data = actor;

// 2. Critical Paths
const checks = [
    { path: "system.attributes.hp.value", desc: "HP (Current)" },
    { path: "system.attributes.hp.max", desc: "HP (Max)" },
    { path: "system.attributes.ac.value", desc: "Armor Class" },
    { path: "system.abilities.str.value", desc: "Strength Score" } // Verify ability structure
];

// 3. Run Checks
for (const check of checks) {
    const val = foundry.utils.getProperty(data, check.path);
    if (val === undefined) {
        issues.push(`${check.desc} missing at '${check.path}'`);
    }
}

return issues;
    }

registerHooks() {
    Logger.log("DnD5e Adapter Active");

    if (game.modules.get("midi-qol")?.active) {
        Logger.log("Hooking into Midi-QOL...");
        // Attack Rolls
        Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
            this.handleAttack(workflow);
        });
        // Damage Rolls
        Hooks.on("midi-qol.DamageRollComplete", (workflow) => {
            this.handleDamage(workflow); // Note: capitalization fix from previous code if needed
        });
    } else {
        Logger.log("Midi-QOL inactive. Usage native dnd5e hooks.");
    }

    // 2. Native DnD5e Support (Fallback/Parallel)
    // Listen to native hooks only if Midi-QOL is not active to prevent double sounds.


    if (!game.modules.get("midi-qol")?.active) {
        Logger.log("Hooking into Native DnD5e...");

        // Legacy Hooks (v2.x)
        Hooks.on("dnd5e.rollAttack", (item, roll) => {
            this.handleNativeAttack(item, roll);
        });

        Hooks.on("dnd5e.rollDamage", (item, roll) => {
            this.handleNativeDamage(item, roll);
        });

        // Modern Hooks (v3.x+)
        Hooks.on("dnd5e.rollAttackV2", (roll, data) => {
            Logger.log("V2 Attack Hook Fired", { roll, data });

            // V2 Data structure: subject is an Activity (v3) or Item (v2 legacy/shim)
            // If it's an Activity, the Item is usually at .item
            let item = data.subject || data.item;
            if (item && item.item) item = item.item; // Unwrap Activity -> Item

            this.handleNativeAttack(item, roll);
        });

        Hooks.on("dnd5e.rollDamageV2", (roll, data) => {
            Logger.log("V2 Damage Hook Fired", { roll, data });

            let item = data.subject || data.item;
            if (item && item.item) item = item.item; // Unwrap Activity -> Item

            this.handleNativeDamage(item, roll);
        });

        Hooks.on("dnd5e.useItem", (item, config, options) => {
            // Reserved for future item consumption logic.
        });
    }
}

handleAttack(workflow) {
    const item = workflow.item;
    if (!item) return;

    Logger.log(`5e Attack: ${item.name} (${item.type})`);

    // 1. Check for hits/misses
    if (workflow.hitTargets.size === 0) {
        Logger.log("Attack Missed (No targets hit)");
        // We could play a miss sound here, or rely on the specific weapon miss sound
        this.play(SOUND_EVENTS.MISS);
        return;
    }

    // 2. Resolve Sound Key based on Item Name first (Priority)
    // This lets users override specific items in config
    let soundKey = this.handler.pickSound(item, workflow.actor?.name, workflow.actor);

    // If pickSound returned WHOOSH (default), try 5e specific logic detection
    if (soundKey === SOUND_EVENTS.WHOOSH) {
        soundKey = this.detect5eSound(item);
    }

    // 3. Play Sound
    this.handler.playItemSound(soundKey, item);

    // 4. Critical Hit?
    if (workflow.isCritical) {
        this.play(SOUND_EVENTS.CRIT_DECORATION, 500);
    }
}

handleDamage(workflow) {
    // Check for Death of Targets
    for (const token of workflow.hitTargets) {
        const actor = token.actor;
        if (!actor) continue;

        const hp = actor.system?.attributes?.hp;
        if (hp?.value <= 0) {
            Logger.log(`Target ${actor.name} died/unconscious.`);

            if (actor.hasPlayerOwner) {
                this.play(this.handler.getPCSound(actor, "DEATH"));
            } else {
                this.play(SOUND_EVENTS.PC_DEATH); // Or we could have MONSTER_DEATH later. Reusing generic PC death for now or silence.
            }
        } else {
            // Blood Splat
            this.play(SOUND_EVENTS.BLOODY_HIT);

            // Pain Sound
            if (actor.hasPlayerOwner) {
                this.play(this.handler.getPCSound(actor, "PAIN"));
            } else {
                const painSound = this.detectMonsterPain(actor);
                if (painSound) {
                    this.play(painSound);
                }
            }
        }
    }
}

detectMonsterPain(actor) {
    if (!actor) return null;

    // 1. Try Advanced Classification (Library)
    // This checks name, race, ancestry, etc against our expanded data
    const classification = game.ionrift.library.classifyCreature(actor);
    if (classification && classification.sound) {
        // Map the classifier's sound ID (e.g. "MONSTER_GOBLIN") to our local constant if needed
        // But usually they match. Let's return strictly if it's a valid sound event.
        if (Object.values(SOUND_EVENTS).includes(classification.sound)) {
            return classification.sound;
        }
        // If the library returns a raw string that matches a key in SOUND_EVENTS, lookup:
        if (SOUND_EVENTS[classification.sound]) {
            return SOUND_EVENTS[classification.sound];
        }
    }

    // 2. Fallback to basic Type check (Legacy/SRD simple match)
    const typeObj = actor.system?.details?.type;
    const type = (typeof typeObj === 'string') ? typeObj : typeObj?.value; // Handle string vs object

    if (!type) return SOUND_EVENTS.MONSTER_GENERIC;

    const lowerType = type.toLowerCase();

    switch (lowerType) {
        case "undead": return SOUND_EVENTS.MONSTER_UNDEAD;
        case "beast": return SOUND_EVENTS.MONSTER_BEAST;
        case "fiend": return SOUND_EVENTS.MONSTER_FIEND;
        case "humanoid": return SOUND_EVENTS.MONSTER_HUMANOID;
        case "plant": return SOUND_EVENTS.MONSTER_PLANT;
        // Best effort mapping for others
        case "dragon": return SOUND_EVENTS.MONSTER_REPTILE;
        case "construct": return SOUND_EVENTS.MONSTER_GENERIC;
        case "goblin":
        case "orc":
            return SOUND_EVENTS.MONSTER_GOBLIN;
        default: return SOUND_EVENTS.MONSTER_GENERIC;
    }
}

detect5eSound(item) {
    // Fallback logic if string matching didn't suffice

    if (item.type === "spell") {
        const school = item.system?.school;
        switch (school) {
            case "evoc": return SOUND_EVENTS.SPELL_FIRE; // Generalized
            case "nec": return SOUND_EVENTS.SPELL_VOID;
            case "div": return SOUND_EVENTS.SPELL_PSYCHIC;
            case "abj": return SOUND_EVENTS.SPELL_HEAL; // Sort of
            default: return SOUND_EVENTS.SPELL_FIRE;
        }

    }

    if (item.type === "weapon") {
        const range = item.system?.actionType; // mwak, rwak
        if (['rwak', 'rsak'].includes(range)) {
            if (item.name.toLowerCase().includes("sling")) return SOUND_EVENTS.ATTACK_SLING;
            if (item.name.toLowerCase().includes("crossbow")) return SOUND_EVENTS.ATTACK_CROSSBOW;
            return SOUND_EVENTS.ATTACK_BOW_FIRE;
        }

        // Melee defaults
        const dmgParts = item.system?.damage?.parts;
        if (dmgParts && dmgParts.length > 0) {
            const type = dmgParts[0][1]; // e.g. "slashing"
            if (type === "slashing") return SOUND_EVENTS.ATTACK_SWORD_SLASH;
            if (type === "bludgeoning") return SOUND_EVENTS.ATTACK_BLUDGEON_SWING;
            if (type === "piercing") return SOUND_EVENTS.ATTACK_DAGGER_SLASH;
        }

        return SOUND_EVENTS.ATTACK_SWORD_SLASH;
    }

    return SOUND_EVENTS.WHOOSH;
}



    async handleNativeAttack(item, roll) {
    if (!item) return;

    // 1. Determine Sound Key
    const soundKey = this.detect5eSound(item);
    const itemName = item.name || "Unknown Item";
    Logger.log(`Native Attack (5e): ${itemName} -> ${soundKey}`);

    // 2. Play Sound (Items are Elements/Oneshots)
    if (soundKey) this.handler.playItemSound(soundKey);
}

    async handleNativeDamage(item, roll) {
    if (!item) return;

    // TODO: Map specific damage types to unique impacts.

}
}
