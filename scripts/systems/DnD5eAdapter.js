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

        // Phase 1: Weapon/cast sound fires after the player confirms the dialog
        // dnd5e.postUseActivity fires AFTER confirmation dialog + activity processing
        Hooks.on("dnd5e.postUseActivity", (activity, config, results) => {
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
        // Skip non-combat items unless they have an explicit sound binding
        if (item.type !== "weapon" && item.type !== "spell") {
            const hasBinding = item.getFlag("ionrift-resonance", "sound_attack");
            if (!hasBinding) {
                Logger.log(`5e Weapon Sound: Skipping ${item.name} (${item.type}) — no binding`);
                return;
            }
        }

        Logger.log(`5e Weapon Sound: ${item.name} (${item.type})`);
        const actor = item.actor || activity?.actor;
        const soundKey = this.handler.pickSound(item, actor?.name, actor);

        // For spells: also try the school key if the effect key has no direct binding
        if (item.type === "spell" && item.system?.school) {
            const schoolKey = this._getSchoolKey(item.system.school);
            if (schoolKey) {
                Logger.log(`5e Weapon Sound: spell school ${item.system.school} → ${schoolKey}`);
                this.handler.playItemSoundWithFallback(soundKey, schoolKey, item);
                return;
            }
        }

        this.handler.playItemSound(soundKey, item);
    }

    _getSchoolKey(school) {
        const schoolMap = {
            abj: "SCHOOL_ABJURATION",
            con: "SCHOOL_CONJURATION",
            div: "SCHOOL_DIVINATION",
            enc: "SCHOOL_ENCHANTMENT",
            evo: "SCHOOL_EVOCATION",
            evoc: "SCHOOL_EVOCATION",
            ill: "SCHOOL_ILLUSION",
            nec: "SCHOOL_NECROMANCY",
            tra: "SCHOOL_TRANSMUTATION"
        };
        return schoolMap[school] || null;
    }

    // Phase 2: Result stinger — fires AFTER dice roll (the "answer")
    handleAttackResult(workflow) {
        const item = workflow.item;
        if (!item) return;

        Logger.log(`5e Attack Result: ${item.name} — hitTargets: ${workflow.hitTargets.size}, crit: ${workflow.isCritical}`);

        if (workflow.hitTargets.size === 0) {
            // Weapon-type-aware miss sound
            const missKey = this._getMissKey(item);
            Logger.log(`DnD5e | Miss type: ${missKey}`);
            this.play(missKey);
        } else if (workflow.isCritical) {
            this.play(SOUND_EVENTS.CRIT_DECORATION);
        }
        // Normal hits: damage hook handles CORE_HIT + pain/death
    }

    _getMissKey(item) {
        if (item.type === "spell") return SOUND_EVENTS.CORE_MISS_MAGIC;

        if (item.type === "weapon") {
            const lower = item.name.toLowerCase();
            const isRanged = lower.includes("bow") || lower.includes("crossbow")
                || lower.includes("sling") || lower.includes("javelin")
                || lower.includes("dart") || lower.includes("gun")
                || item.system?.range?.long > 0;
            if (isRanged) return SOUND_EVENTS.CORE_MISS_RANGED;
        }

        return SOUND_EVENTS.MISS;
    }

    handleDamage(workflow) {
        // Deduplicate: Midi-QOL may fire DamageRollComplete multiple times per workflow
        const wfId = workflow.id ?? workflow.uuid ?? workflow.itemCardId;
        if (wfId && this._lastDamageWorkflowId === wfId) {
            Logger.log(`DnD5e | Duplicate DamageRollComplete for workflow ${wfId}, skipping`);
            return;
        }
        if (wfId) this._lastDamageWorkflowId = wfId;

        Logger.log(`5e Damage: hitTargets=${workflow.hitTargets?.size}, targets=${workflow.targets?.size}, saves=${workflow.saves?.size}`);

        // Skip non-harmful items (potions, healing spells, utility consumables)
        const item = workflow.item;
        if (item?.type === "consumable") {
            Logger.log(`DnD5e | Skipping damage sounds for consumable: ${item.name}`);
            return;
        }

        // Check for healing damage types — healing is not damage
        const isHealing = workflow.defaultDamageType === "healing"
            || workflow.defaultDamageType === "temphp"
            || workflow.damageDetail?.every(d => d.type === "healing" || d.type === "temphp");
        if (isHealing) {
            Logger.log(`DnD5e | Skipping damage sounds — healing effect`);
            return;
        }

        // Midi-QOL provides damage totals on the workflow
        const totalDamage = workflow.damageTotal
            ?? workflow.damageDetail?.reduce((sum, d) => sum + (d.damage || 0), 0)
            ?? 0;

        // AoE mitigation constants
        const MAX_TARGETS = 20;       // Hard cap — never process more than this
        const AOE_THRESHOLD = 3;      // 4+ targets = AoE mode
        const MAX_AOE_VOCALS = 5;     // Max distinct vocals in AoE mode
        const VOCAL_STAGGER = 400;    // Stagger for single-target sequential vocals

        // Build complete target set: hitTargets (failed saves) + saves (made saves, half dmg)
        // For save-based AoE, workflow.targets has the full scope
        const targetSet = new Set();
        if (workflow.hitTargets) for (const t of workflow.hitTargets) targetSet.add(t);
        if (workflow.saves) for (const t of workflow.saves) targetSet.add(t);

        // Use workflow.targets (full AoE scope) for threshold detection if available
        const scopeSize = workflow.targets?.size ?? targetSet.size;
        const allTargets = [...targetSet].slice(0, MAX_TARGETS);
        const isAoE = scopeSize > AOE_THRESHOLD;

        Logger.log(`DnD5e | Damage scope: ${scopeSize} total targets, ${allTargets.length} to process, AoE=${isAoE}`);

        if (isAoE) {
            Logger.log(`DnD5e | AoE detected. Playing single hit + up to ${MAX_AOE_VOCALS} vocals.`);

            // Single impact sound for the entire AoE
            this.play(SOUND_EVENTS.BLOODY_HIT);

            // Classify each target (dead/alive) for vocal selection
            const vocalCandidates = [];
            for (const token of allTargets) {
                const actor = token.actor;
                if (!actor) continue;

                const hp = actor.system?.attributes?.hp;
                const isPC = actor.type === 'character';
                const currentHp = hp?.value ?? 0;
                const estimatedHp = currentHp - totalDamage;
                const maxHp = hp?.max ?? 1;

                let isDead;
                if (isPC) {
                    const overflow = Math.abs(Math.min(0, estimatedHp));
                    isDead = overflow >= maxHp;
                } else {
                    isDead = estimatedHp <= 0;
                }

                vocalCandidates.push({ token, actor, isPC, isDead });
            }

            // Pick up to MAX_AOE_VOCALS random targets for vocals
            const shuffled = vocalCandidates.sort(() => Math.random() - 0.5);
            const vocalTargets = shuffled.slice(0, MAX_AOE_VOCALS);

            vocalTargets.forEach((target) => {
                // Random micro-stagger (0–400ms) so vocals overlap like a chorus
                const stagger = Math.floor(Math.random() * 400);
                this._playVocalForTarget(target.actor, target.isPC, target.isDead, stagger);
            });

        } else {
            // Standard per-target handling (1–3 targets)
            for (const token of allTargets) {
                const actor = token.actor;
                if (!actor) {
                    Logger.log("DnD5e | No actor for token, skipping");
                    continue;
                }

                const hp = actor.system?.attributes?.hp;
                const isPC = actor.type === 'character';
                const currentHp = hp?.value ?? 0;
                const estimatedHp = currentHp - totalDamage;
                Logger.log(`DnD5e | ${actor.name} HP: ${currentHp}/${hp?.max} → est. ${estimatedHp} after ${totalDamage} dmg (PC: ${isPC})`);

                const maxHp = hp?.max ?? 1;
                let isDead;
                if (isPC) {
                    const overflow = Math.abs(Math.min(0, estimatedHp));
                    isDead = overflow >= maxHp;
                    Logger.log(`DnD5e | PC death check: overflow ${overflow} vs maxHP ${maxHp} → ${isDead ? "INSTANT DEATH" : "unconscious/pain"}`);
                } else {
                    isDead = estimatedHp <= 0;
                }

                this.play(SOUND_EVENTS.BLOODY_HIT);
                this._playVocalForTarget(actor, isPC, isDead, VOCAL_STAGGER);
            }
        }
    }

    /**
     * Play the appropriate pain or death vocal for a single target.
     */
    _playVocalForTarget(actor, isPC, isDead, delay) {
        if (isDead) {
            Logger.log(`DnD5e | ${actor.name} killed! Playing death sound`);
            const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
            if (deathOverride) {
                this.handler.play(deathOverride, delay);
            } else if (isPC) {
                this.play(this.handler.getPCSound(actor, "DEATH"), delay);
            } else {
                this.play(SOUND_EVENTS.PC_DEATH, delay);
            }
        } else {
            Logger.log(`DnD5e | ${actor.name} took damage, playing pain`);
            const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
            if (painOverride) {
                this.handler.play(painOverride, delay);
            } else if (isPC) {
                const pcPain = this.handler.getPCSound(actor, "PAIN");
                Logger.log(`DnD5e | PC Pain sound: ${pcPain} (delay: ${delay}ms)`);
                this.play(pcPain, delay);
            } else {
                const painSound = this.detectMonsterPain(actor);
                Logger.log(`DnD5e | Monster pain sound: ${painSound}`);
                if (painSound) this.play(painSound, delay);
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

        if (!classification) return SOUND_EVENTS.MONSTER_GENERIC;

        // Try subtype-specific key first (e.g. SFX_FIRE for elemental_fire)
        if (classification.subtype) {
            const subtypeKey = this._getSubtypeVocalKey(classification.type, classification.subtype);
            if (subtypeKey) {
                const resolved = this.handler.resolver.resolveKey(subtypeKey);
                if (resolved) {
                    Logger.log(`DnD5e | Monster pain: subtype ${subtypeKey} has binding → using it`);
                    return subtypeKey;
                }
                Logger.log(`DnD5e | Monster pain: subtype ${subtypeKey} unbound, trying category`);
            }
        }

        // Fall back to broad classifier key (e.g. MONSTER_ELEMENTAL)
        if (classification.sound) {
            if (Object.values(SOUND_EVENTS).includes(classification.sound)) return classification.sound;
            if (SOUND_EVENTS[classification.sound]) return SOUND_EVENTS[classification.sound];
        }
        return SOUND_EVENTS.MONSTER_GENERIC;
    }

    /**
     * Maps classifier type+subtype to the UI sound key used in the Monsters config.
     * These must match the `id` values in SoundConfigApp's monster hierarchy.
     */
    _getSubtypeVocalKey(type, subtype) {
        const subtypeMap = {
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

        const compositeKey = `${type}_${subtype}`;
        return subtypeMap[compositeKey] || null;
    }

    async handleNativeAttack(item, roll) {
        if (!item) return;
        // Resolver handles Metadata fallback now
        const soundKey = this.handler.pickSound(item, item.actor?.name, item.actor);
        if (soundKey) this.handler.playItemSound(soundKey);
    }
}
