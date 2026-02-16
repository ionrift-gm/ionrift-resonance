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

        // Phase 1: Weapon sound fires at the moment the player clicks attack
        // Native DnD5e v4 hook — fires before Midi-QOL workflow starts
        Hooks.on("dnd5e.preUseActivity", (activity, config, dialog) => {
            const item = activity?.item;
            if (item) this.handleWeaponSound(item, activity);
        });

        if (game.modules.get("midi-qol")?.active) {
            Logger.log("Hooking into Midi-QOL...");

            // Phase 2: Result stinger fires after the attack roll resolves
            Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
                this.handleAttackResult(workflow);
            });

            // Phase 3: Damage sounds fire after the damage roll
            Hooks.on("midi-qol.DamageRollComplete", (workflow) => {
                this.handleDamage(workflow);
            });
        } else {
            Logger.log("Midi-QOL inactive. Using native dnd5e hooks.");

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

    // Phase 1: Weapon swing — fires BEFORE dice roll (the "ask")
    handleWeaponSound(item, activity) {
        Logger.log(`5e Weapon Sound: ${item.name} (${item.type})`);
        const actor = item.actor || activity?.actor;
        const soundKey = this.handler.pickSound(item, actor?.name, actor);
        this.handler.playItemSound(soundKey, item);
    }

    // Phase 2: Result stinger — fires AFTER dice roll (the "answer")
    handleAttackResult(workflow) {
        const item = workflow.item;
        if (!item) return;

        Logger.log(`5e Attack Result: ${item.name} — hitTargets: ${workflow.hitTargets.size}, crit: ${workflow.isCritical}`);

        if (workflow.hitTargets.size === 0) {
            this.play(SOUND_EVENTS.MISS);
        } else if (workflow.isCritical) {
            this.play(SOUND_EVENTS.CRIT_DECORATION);
        }
        // Normal hits: damage hook handles CORE_HIT + pain/death
    }

    handleDamage(workflow) {
        Logger.log(`5e Damage: ${workflow.hitTargets.size} targets hit`);

        // Midi-QOL provides damage totals on the workflow
        const totalDamage = workflow.damageTotal
            ?? workflow.damageDetail?.reduce((sum, d) => sum + (d.damage || 0), 0)
            ?? 0;

        const VOCAL_STAGGER = 400;

        for (const token of workflow.hitTargets) {
            const actor = token.actor;
            if (!actor) {
                Logger.log("DnD5e | No actor for token, skipping");
                continue;
            }

            const hp = actor.system?.attributes?.hp;
            const isPC = actor.type === 'character';

            // DamageRollComplete fires BEFORE damage is applied — HP is still pre-damage
            const currentHp = hp?.value ?? 0;
            const estimatedHp = currentHp - totalDamage;
            Logger.log(`DnD5e | ${actor.name} HP: ${currentHp}/${hp?.max} → est. ${estimatedHp} after ${totalDamage} dmg (PC: ${isPC})`);

            const isDead = estimatedHp <= 0;

            if (isDead) {
                Logger.log(`DnD5e | ${actor.name} killed! Playing death sound`);
                this.play(SOUND_EVENTS.BLOODY_HIT);

                const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
                if (deathOverride) {
                    this.handler.play(deathOverride, VOCAL_STAGGER);
                } else if (isPC) {
                    this.play(this.handler.getPCSound(actor, "DEATH"), VOCAL_STAGGER);
                } else {
                    this.play(SOUND_EVENTS.PC_DEATH, VOCAL_STAGGER);
                }
            } else {
                Logger.log(`DnD5e | ${actor.name} took damage, playing hit + pain`);
                this.play(SOUND_EVENTS.BLOODY_HIT);

                const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
                if (painOverride) {
                    this.handler.play(painOverride, VOCAL_STAGGER);
                } else if (isPC) {
                    const pcPain = this.handler.getPCSound(actor, "PAIN");
                    Logger.log(`DnD5e | PC Pain sound: ${pcPain} (delay: ${VOCAL_STAGGER}ms)`);
                    this.play(pcPain, VOCAL_STAGGER);
                } else {
                    const painSound = this.detectMonsterPain(actor);
                    Logger.log(`DnD5e | Monster pain sound: ${painSound}`);
                    if (painSound) this.play(painSound, VOCAL_STAGGER);
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
