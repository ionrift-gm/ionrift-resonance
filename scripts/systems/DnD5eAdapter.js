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

        // Phase 1: Weapon sound (always plays — this is the "ask")
        const soundKey = this.handler.pickSound(item, workflow.actor?.name, workflow.actor);
        this.handler.playItemSound(soundKey, item);

        const RESULT_STAGGER = 400;

        // Phase 2: Result decoration (the "answer")
        if (workflow.hitTargets.size === 0) {
            this.play(SOUND_EVENTS.MISS, RESULT_STAGGER);
        } else if (workflow.isCritical) {
            this.play(SOUND_EVENTS.CRIT_DECORATION, RESULT_STAGGER);
        }
        // Normal hits: damage hook handles CORE_HIT + pain/death
    }

    handleDamage(workflow) {
        Logger.log(`5e Damage: ${workflow.hitTargets.size} targets hit`);

        // Check for Death of Targets
        for (const token of workflow.hitTargets) {
            const actor = token.actor;
            if (!actor) {
                Logger.log("DnD5e | No actor for token, skipping");
                continue;
            }

            const hp = actor.system?.attributes?.hp;
            Logger.log(`DnD5e | ${actor.name} HP: ${hp?.value}/${hp?.max}`);

            if (hp?.value <= 0) {
                Logger.log(`DnD5e | ${actor.name} died! Playing death sound`);
                this.play(SOUND_EVENTS.BLOODY_HIT);
                const VOCAL_STAGGER = 400;

                const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
                if (deathOverride) {
                    this.handler.play(deathOverride, VOCAL_STAGGER);
                } else if (actor.hasPlayerOwner) {
                    this.play(this.handler.getPCSound(actor, "DEATH"), VOCAL_STAGGER);
                } else {
                    this.play(SOUND_EVENTS.PC_DEATH, VOCAL_STAGGER);
                }
            } else {
                Logger.log(`DnD5e | ${actor.name} took damage, playing hit + pain`);
                this.play(SOUND_EVENTS.BLOODY_HIT);

                const PAIN_STAGGER = 400;
                const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
                if (painOverride) {
                    this.handler.play(painOverride, PAIN_STAGGER);
                } else if (actor.hasPlayerOwner) {
                    const pcPain = this.handler.getPCSound(actor, "PAIN");
                    Logger.log(`DnD5e | PC Pain sound: ${pcPain} (delay: ${PAIN_STAGGER}ms)`);
                    this.play(pcPain, PAIN_STAGGER);
                } else {
                    const painSound = this.detectMonsterPain(actor);
                    Logger.log(`DnD5e | Monster pain sound: ${painSound}`);
                    if (painSound) this.play(painSound, PAIN_STAGGER);
                }
            }
        }
    }

    detectMonsterPain(actor) {
        // Null check for library
        if (!game.ionrift?.library?.classifyCreature) {
            Logger.warn("DnD5e | Library not loaded, using generic monster sound");
            return SOUND_EVENTS.MONSTER_GENERIC;
        }

        const classification = game.ionrift.library.classifyCreature(actor);
        Logger.log(`DnD5e | Classification for ${actor.name}:`, classification);

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
