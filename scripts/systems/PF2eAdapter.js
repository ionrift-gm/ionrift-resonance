import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

export class PF2eAdapter extends SystemAdapter {

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

        const checks = [
            { path: "system.attributes.hp.value", desc: "HP (Current)" },
            { path: "system.attributes.hp.max", desc: "HP (Max)" },
        ];

        for (const check of checks) {
            const val = foundry.utils.getProperty(actor, check.path);
            if (val === undefined) {
                issues.push(`${check.desc} missing at '${check.path}'`);
            }
        }

        return issues;
    }

    registerHooks() {
        Logger.log("PF2e Adapter Active");

        Hooks.on("createChatMessage", (message, options, userId) => {
            if (!game.user.isGM) return;

            const pf2e = message.flags?.pf2e;
            if (!pf2e) return;

            const context = pf2e.context;
            if (!context?.type) return;

            if (context.type === "strike-attack-roll" || context.type === "spell-attack-roll") {
                this._handleAttackRoll(message, context);
            } else if (context.type === "damage-roll") {
                this._handleDamageRoll(message, context);
            }
        });
    }

    // ── Phase 1 + 2: Attack roll (ASK swing + ANSWER outcome) ───────────

    _handleAttackRoll(message, context) {
        const item = this._getItemFromMessage(message);
        const actor = message.actor ?? (item?.actor || null);

        // Phase 1 (ASK): weapon swing / spell cast
        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);

            if (item.type === "spell") {
                const traitKey = this._getSpellTraitKey(item);
                if (traitKey) {
                    Logger.log(`PF2e | Spell trait key: ${traitKey}`);
                    this.handler.playItemSoundWithFallback(soundKey, traitKey, item);
                } else {
                    this.handler.playItemSound(soundKey, item);
                }
            } else {
                this.handler.playItemSound(soundKey, item);
            }
        }

        // Phase 2 (ANSWER): outcome stinger
        const outcome = this._normaliseOutcome(context.outcome);
        this._handleOutcome(outcome, item);
    }

    /**
     * PF2e stores outcome as a string ("criticalFailure", "failure", "success",
     * "criticalSuccess") or occasionally as a numeric DoS (0-3).
     * Normalise to a consistent string.
     */
    _normaliseOutcome(raw) {
        if (typeof raw === "number") {
            return ["criticalFailure", "failure", "success", "criticalSuccess"][raw] ?? null;
        }
        return raw ?? null;
    }

    _handleOutcome(outcome, item) {
        const orch = this.handler?.orchestrator;

        if (outcome === "criticalFailure") {
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
            const missKey = this._getMissKey(item);
            const fumbleDelay = orch?.getNamedOffset("FUMBLE_MISS_DELAY") ?? 200;
            this.play(missKey, fumbleDelay);

        } else if (outcome === "failure") {
            const missKey = this._getMissKey(item);
            Logger.log(`PF2e | Miss type: ${missKey}`);
            this.play(missKey);

        } else if (outcome === "criticalSuccess") {
            this.play(SOUND_EVENTS.ROLL_CRIT);
            const critDelay = orch?.getNamedOffset("CRIT_DECORATION_DELAY") ?? 300;
            this.play(SOUND_EVENTS.CRIT_DECORATION, critDelay);
        }
        // "success" (normal hit): damage roll hook handles CORE_HIT + vocals
    }

    _getMissKey(item) {
        if (!item) return SOUND_EVENTS.MISS;

        if (item.type === "spell") return SOUND_EVENTS.CORE_MISS_MAGIC;

        if (item.type === "weapon") {
            const group = item.system?.group;
            const traits = item.system?.traits?.value ?? [];
            const isRanged = group === "bow" || group === "dart" || group === "sling"
                || traits.some(t => t === "thrown" || t.startsWith("thrown-"));
            if (isRanged) return SOUND_EVENTS.CORE_MISS_RANGED;
        }

        return SOUND_EVENTS.MISS;
    }

    // ── Phase 3: Damage roll (hit impact + vocals) ──────────────────────

    _handleDamageRoll(message, context) {
        const item = this._getItemFromMessage(message);

        // Skip healing
        if (this._isHealing(message, item)) {
            Logger.log("PF2e | Skipping damage sounds for healing effect");
            return;
        }

        // Deduplicate: track last processed message
        if (message.id && this._lastDamageMessageId === message.id) {
            Logger.log(`PF2e | Duplicate damage message ${message.id}, skipping`);
            return;
        }
        if (message.id) this._lastDamageMessageId = message.id;

        // Collect targets from flags or game targeting
        const targets = this._getTargets(message);
        const totalDamage = message.rolls?.[0]?.total ?? 0;

        const MAX_TARGETS = 20;
        const AOE_THRESHOLD = 3;
        const MAX_AOE_VOCALS = 5;

        const orch = this.handler?.orchestrator;
        const VOCAL_STAGGER = orch?.getNamedOffset("VOCAL_STAGGER") ?? 1400;
        const AOE_VOCAL_MAX = orch?.getNamedOffset("AOE_VOCAL_MAX") ?? 400;
        const SPELL_BONUS = (item?.type === "spell") ? (orch?.getNamedOffset("SPELL_AUDIO_BONUS") ?? 150) : 0;

        const allTargets = targets.slice(0, MAX_TARGETS);
        const isAoE = allTargets.length > AOE_THRESHOLD;

        Logger.log(`PF2e | Damage: ${totalDamage} to ${allTargets.length} targets, AoE=${isAoE}`);

        if (isAoE) {
            this.play(SOUND_EVENTS.BLOODY_HIT);

            const vocalCandidates = [];
            for (const token of allTargets) {
                const actor = token.actor;
                if (!actor) continue;
                const { isDead, isPC } = this._assessTarget(actor, totalDamage);
                vocalCandidates.push({ actor, isPC, isDead });
            }

            const shuffled = vocalCandidates.sort(() => Math.random() - 0.5);
            shuffled.slice(0, MAX_AOE_VOCALS).forEach((target) => {
                const stagger = Math.floor(Math.random() * AOE_VOCAL_MAX) + SPELL_BONUS;
                this._playVocalForTarget(target.actor, target.isPC, target.isDead, stagger);
            });

        } else if (allTargets.length > 0) {
            for (const token of allTargets) {
                const actor = token.actor;
                if (!actor) {
                    Logger.log("PF2e | No actor for token, skipping");
                    continue;
                }
                const { isDead, isPC, currentHp, maxHp, estimatedHp } = this._assessTarget(actor, totalDamage);
                Logger.log(`PF2e | ${actor.name} HP: ${currentHp}/${maxHp} -> est. ${estimatedHp} after ${totalDamage} dmg (PC: ${isPC})`);

                this.play(SOUND_EVENTS.BLOODY_HIT);
                this._playVocalForTarget(actor, isPC, isDead, VOCAL_STAGGER + SPELL_BONUS);
            }
        } else {
            // No targets resolved (player didn't target before rolling).
            // Still play a generic hit impact so damage isn't silent.
            Logger.log("PF2e | No targets resolved, playing generic hit impact");
            this.play(SOUND_EVENTS.BLOODY_HIT);
        }
    }

    _assessTarget(actor, totalDamage) {
        const hp = actor.system?.attributes?.hp;
        const isPC = actor.type === "character";
        const currentHp = hp?.value ?? 0;
        const maxHp = hp?.max ?? 1;
        const estimatedHp = currentHp - totalDamage;

        let isDead;
        if (isPC) {
            // PF2e: dying at 0 HP, instant death if overflow >= max
            const overflow = Math.abs(Math.min(0, estimatedHp));
            isDead = overflow >= maxHp;
        } else {
            isDead = estimatedHp <= 0;
        }

        return { isDead, isPC, currentHp, maxHp, estimatedHp };
    }

    _isHealing(message, item) {
        const traits = item?.system?.traits?.value ?? [];
        if (traits.includes("healing")) return true;

        // Check damage types on the roll
        const damageInstances = message.flags?.pf2e?.damageRoll?.instances;
        if (Array.isArray(damageInstances)) {
            return damageInstances.every(i => i.type === "healing" || i.type === "temphp");
        }
        return false;
    }

    // ── Vocal layer (ported from DnD5eAdapter) ──────────────────────────

    _playVocalForTarget(actor, isPC, isDead, delay) {
        if (isDead) {
            Logger.log(`PF2e | ${actor.name} killed! Playing death sound`);
            const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
            if (deathOverride) {
                this.handler.play(deathOverride, delay);
            } else if (isPC) {
                this.play(this.handler.getPCSound(actor, "DEATH"), delay);
            } else {
                this.play(SOUND_EVENTS.CORE_MONSTER_DEATH, delay);
            }
        } else {
            Logger.log(`PF2e | ${actor.name} took damage, playing pain`);
            const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
            if (painOverride) {
                this.handler.play(painOverride, delay);
            } else if (isPC) {
                const pcPain = this.handler.getPCSound(actor, "PAIN");
                Logger.log(`PF2e | PC Pain sound: ${pcPain} (delay: ${delay}ms)`);
                this.play(pcPain, delay);
            } else {
                const painSound = this._detectMonsterPain(actor);
                Logger.log(`PF2e | Monster pain sound: ${painSound}`);
                if (painSound) this.play(painSound, delay);
            }
        }
    }

    _detectMonsterPain(actor) {
        if (!game.ionrift?.library?.classifyCreature) {
            Logger.warn("PF2e | Library not loaded, using generic monster sound");
            return SOUND_EVENTS.VOCAL_GENERIC_PAIN;
        }

        const classification = game.ionrift.library.classifyCreature(actor);
        Logger.log(`PF2e | Classification for ${actor.name}:`, classification);

        if (!classification) return SOUND_EVENTS.VOCAL_GENERIC_PAIN;

        if (classification.subtype) {
            const subtypeKey = this._getSubtypeVocalKey(classification.type, classification.subtype);
            if (subtypeKey) {
                const resolved = this.handler.resolver.resolveKey(subtypeKey);
                if (resolved) return subtypeKey;
            }
        }

        if (classification.sound) {
            if (Object.values(SOUND_EVENTS).includes(classification.sound)) return classification.sound;
            if (SOUND_EVENTS[classification.sound]) return SOUND_EVENTS[classification.sound];
        }

        return SOUND_EVENTS.VOCAL_GENERIC_PAIN;
    }

    _getSubtypeVocalKey(type, subtype) {
        const subtypeMap = {
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

        return subtypeMap[`${type}_${subtype}`] || null;
    }

    // ── PF2e-specific spell trait mapping ────────────────────────────────

    _getSpellTraitKey(item) {
        const traits = item?.system?.traits?.value ?? [];

        if (traits.includes("fire")) return SOUND_EVENTS.SPELL_FIRE;
        if (traits.includes("cold")) return SOUND_EVENTS.SPELL_ICE;
        if (traits.includes("electricity")) return SOUND_EVENTS.SPELL_LIGHTNING;
        if (traits.includes("acid")) return SOUND_EVENTS.SPELL_ACID;
        if (traits.includes("mental") || traits.includes("sonic")) return SOUND_EVENTS.SPELL_PSYCHIC;
        if (traits.includes("void") || traits.includes("negative")) return SOUND_EVENTS.SPELL_VOID;
        if (traits.includes("healing") || traits.includes("vitality") || traits.includes("positive")) return SOUND_EVENTS.SPELL_HEAL;

        return null;
    }

    // ── Utilities ────────────────────────────────────────────────────────

    _getItemFromMessage(message) {
        try {
            const origin = message.flags?.pf2e?.origin;
            if (origin?.uuid) {
                const item = fromUuidSync(origin.uuid);
                if (item) return item;
            }
        } catch (e) {
            Logger.log(`PF2e | fromUuidSync failed: ${e.message}`);
        }

        // Fallback: try message.item (available in some PF2e versions)
        if (message.item) return message.item;

        return null;
    }

    _getTargets(message) {
        // PF2e stores target UUIDs in flags
        const targetFlags = message.flags?.pf2e?.target;
        if (targetFlags?.token) {
            try {
                const token = fromUuidSync(targetFlags.token);
                if (token) return [token];
            } catch {}
        }

        // Fallback: current user targets (unreliable after-the-fact, but better than nothing)
        const userTargets = game.user.targets;
        if (userTargets?.size > 0) return [...userTargets];

        return [];
    }
}
