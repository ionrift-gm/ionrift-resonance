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
