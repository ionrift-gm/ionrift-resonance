import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";
import { getSubtypeVocalKey, pickBoundMonsterPainKey } from "../data/MonsterVocalMap.js";



export class DnD5eAdapter extends SystemAdapter {
    static NATIVE_TRACE_PREFIX = "[Native5e]";

    /**
     * Always-on combat trace for native (no Midi) debugging.
     * Filter the browser console on "Native5e" to see only these lines.
     * Verbose Logger.log lines still require game.settings debug mode.
     */
    _traceNative(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    _summarizeToken(token) {
        if (!token) return null;
        return {
            id: token.id ?? token.document?.id ?? null,
            name: token.name ?? token.document?.name ?? null,
            actor: token.actor?.name ?? null,
            actorUuid: token.actor?.uuid ?? null,
            actorType: token.actor?.type ?? null
        };
    }

    _summarizeItem(item) {
        if (!item) return null;
        return { id: item.id ?? null, name: item.name ?? null, type: item.type ?? null };
    }

    _summarizeActivity(activity) {
        if (!activity) return null;
        return {
            uuid: activity.uuid ?? null,
            type: activity.type ?? null,
            item: this._summarizeItem(activity.item)
        };
    }

    _summarizeRoll(roll) {
        if (!roll) return null;
        return {
            total: roll.total ?? null,
            formula: roll.formula ?? null,
            isCritical: roll.isCritical ?? false,
            isFumble: roll.isFumble ?? false,
            rollTargetAc: roll.options?.target ?? null,
            damageType: roll.options?.type ?? null
        };
    }

    _playTraced(key, delay, reason) {
        const resolved = this.handler?.resolver?.resolveKey(key);
        const orch = this.handler?.orchestrator;
        const category = orch?.getCategory?.(key) ?? null;
        this._traceNative("play.request", {
            reason,
            key,
            delayMs: delay,
            resolved: resolved ?? null,
            orchestratorCategory: category
        });
        if (!resolved && /^[A-Z][A-Z0-9_]+$/.test(key)) {
            Logger.warn(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} play blocked? semantic key has no binding: ${key} (${reason})`);
        }
        this.play(key, delay);
    }

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
            if (!game.modules.get("midi-qol")?.active) {
                this._traceNative("hook.postUseActivity", {
                    activity: this._summarizeActivity(activity),
                    item: this._summarizeItem(item),
                    userTargetCount: game.user?.targets?.size ?? 0
                });
            }
            if (item) this.handleWeaponSound(item, activity);
        });

        if (game.modules.get("midi-qol")?.active) {
            Logger.log("Hooking into Midi-QOL...");
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} Midi-QOL active. Native trace OFF. Damage/attack use midi-qol hooks.`);

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
            Logger.info(`${DnD5eAdapter.NATIVE_TRACE_PREFIX} Native combat trace ON. Filter console on "Native5e". Verbose logs: game.settings.set("ionrift-resonance", "debug", true)`);

            // V2 Hooks
            Hooks.on("dnd5e.rollAttackV2", (roll, data) => {
                let item = data?.subject?.item ?? data?.subject ?? data?.item;
                if (item?.item) item = item.item;
                this._traceNative("hook.rollAttackV2", {
                    item: this._summarizeItem(item),
                    activity: this._summarizeActivity(data?.subject),
                    rollCount: Array.isArray(roll) ? roll.length : (roll ? 1 : 0),
                    firstRoll: this._summarizeRoll(Array.isArray(roll) ? roll[0] : roll),
                    userTargetCount: game.user?.targets?.size ?? 0
                });
                this._cacheNativeAttackContext(item, data?.subject);
                this.handleNativeAttack(item, roll, data?.subject);
            });

            Hooks.on("dnd5e.rollDamageV2", (rolls, data) => {
                const rollArray = Array.isArray(rolls) ? rolls : (rolls ? [rolls] : []);
                this._traceNative("hook.rollDamageV2", {
                    activity: this._summarizeActivity(data?.subject),
                    item: this._summarizeItem(data?.subject?.item),
                    rollCount: rollArray.length,
                    rolls: rollArray.map(r => this._summarizeRoll(r)),
                    userTargetCount: game.user?.targets?.size ?? 0,
                    cachePresent: Boolean(this._cachedNativeAttackContext)
                });
                this.handleNativeDamage(rolls, data?.subject);
            });
        }
    }

    // Phase 1: Weapon swing - fires BEFORE dice roll (the "ask")
    handleWeaponSound(item, activity) {
        // Skip non-combat items unless they have an explicit sound binding
        if (item.type !== "weapon" && item.type !== "spell") {
            const hasBinding = item.getFlag("ionrift-resonance", "sound_attack");
            if (!hasBinding) {
                Logger.log(`5e Weapon Sound: Skipping ${item.name} (${item.type}) - no binding`);
                return;
            }
        }

        // Skip utility spells that have no attack or save action type.
        // Spells like Fly, Haste, and Mage Armor fire postUseActivity but are not
        // combat sounds - they would otherwise fall through to CORE_WHOOSH.
        if (item.type === "spell") {
            const actionType = activity?.actionType ?? item.system?.actionType ?? "";
            const hasCombatAction = ["mwak", "rwak", "msak", "rsak", "save", "heal", "abil"].includes(actionType);
            const hasExplicitBinding = item.getFlag("ionrift-resonance", "sound_attack");
            if (!hasCombatAction && !hasExplicitBinding) {
                Logger.log(`5e Weapon Sound: Skipping utility spell ${item.name} (actionType: '${actionType}')`);
                return;
            }
        }

        Logger.log(`5e Weapon Sound: ${item.name} (${item.type})`);
        const actor = item.actor || activity?.actor;
        const soundKey = this.handler.pickSound(item, actor?.name, actor);

        // For spells: try school key first; fall back to ASK_GENERIC_MAGIC rather
        // than letting the call bottom out at CORE_WHOOSH (a melee swing sound).
        if (item.type === "spell") {
            const schoolKey = item.system?.school ? this._getSchoolKey(item.system.school) : null;
            const fallback = schoolKey ?? SOUND_EVENTS.ASK_GENERIC_MAGIC;
            if (schoolKey) {
                Logger.log(`5e Weapon Sound: spell school ${item.system.school} -> ${schoolKey}`);
            } else {
                Logger.log(`5e Weapon Sound: no school key for ${item.name} -> falling back to ASK_GENERIC_MAGIC`);
            }
            this.handler.playItemSoundWithFallback(soundKey, fallback, item);
            return;
        }

        this.handler.playItemSound(soundKey, item);
    }

    _getSchoolKey(school) {
        // All eight schools mapped. Keys that have a sound pack binding will play;
        // unbound keys fall through to ASK_GENERIC_MAGIC in the caller.
        const schoolMap = {
            // Damage / attack schools
            evo:  "SCHOOL_EVOCATION",
            evoc: "SCHOOL_EVOCATION",
            nec:  "SCHOOL_NECROMANCY",
            // Utility / defensive schools
            abj:  "SCHOOL_ABJURATION",
            div:  "SCHOOL_DIVINATION",
            // Formerly unmapped - now route to generic magic as final fallback
            con:  "SCHOOL_CONJURATION",
            enc:  "SCHOOL_ENCHANTMENT",
            ill:  "SCHOOL_ILLUSION",
            tra:  "SCHOOL_TRANSMUTATION",
        };
        return schoolMap[school] ?? null;
    }

    handleAttackResult(workflow) {
        const item = workflow.item;
        if (!item) return;

        const orch = this.handler?.orchestrator;

        Logger.log(`5e Attack Result: ${item.name} - hitTargets: ${workflow.hitTargets.size}, crit: ${workflow.isCritical}, fumble: ${workflow.isFumble}`);

        if (workflow.isFumble) {
            // Nat 1: roll fumble stinger + miss sound
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
            const missKey = this._getMissKey(item);
            const fumbleDelay = orch?.getNamedOffset("FUMBLE_MISS_DELAY") ?? 200;
            this.play(missKey, fumbleDelay);
        } else if (workflow.hitTargets.size === 0) {
            // Weapon-type-aware miss sound
            const missKey = this._getMissKey(item);
            Logger.log(`DnD5e | Miss type: ${missKey}`);
            this.play(missKey);
        } else if (workflow.isCritical) {
            // Nat 20: roll crit stinger + weapon impact decoration
            this.play(SOUND_EVENTS.ROLL_CRIT);
            const critDelay = orch?.getNamedOffset("CRIT_DECORATION_DELAY") ?? 300;
            this.play(SOUND_EVENTS.CRIT_DECORATION, critDelay);
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

        // Check for healing damage types - healing is not damage
        const isHealing = workflow.defaultDamageType === "healing"
            || workflow.defaultDamageType === "temphp"
            || workflow.damageDetail?.every(d => d.type === "healing" || d.type === "temphp");
        if (isHealing) {
            Logger.log(`DnD5e | Skipping damage sounds - healing effect`);
            return;
        }

        // Midi-QOL provides damage totals on the workflow
        const totalDamage = workflow.damageTotal
            ?? workflow.damageDetail?.reduce((sum, d) => sum + (d.damage || 0), 0)
            ?? 0;

        // AoE mitigation constants
        const MAX_TARGETS = 20;       // Hard cap - never process more than this

        // Build complete target set: hitTargets (failed saves) + saves (made saves, half dmg)
        // For save-based AoE, workflow.targets has the full scope
        const targetSet = new Set();
        if (workflow.hitTargets) for (const t of workflow.hitTargets) targetSet.add(t);
        if (workflow.saves) for (const t of workflow.saves) targetSet.add(t);

        // Use workflow.targets (full AoE scope) for threshold detection if available
        const scopeSize = workflow.targets?.size ?? targetSet.size;
        const allTargets = [...targetSet].slice(0, MAX_TARGETS);

        this._processDamageTargets(allTargets, totalDamage, item, scopeSize, "DnD5e");
    }

    /**
     * Shared impact + vocal routing for Midi-QOL and native damage rolls.
     */
    _processDamageTargets(allTargets, totalDamage, item, scopeSize, logPrefix = "DnD5e", trace = false) {
        const AOE_THRESHOLD = 3;
        const MAX_AOE_VOCALS = 5;

        const orch = this.handler?.orchestrator;
        const VOCAL_STAGGER = orch?.getNamedOffset("VOCAL_STAGGER") ?? 400;
        const AOE_VOCAL_MAX = orch?.getNamedOffset("AOE_VOCAL_MAX") ?? 400;
        const SPELL_BONUS = (item?.type === "spell") ? (orch?.getNamedOffset("SPELL_AUDIO_BONUS") ?? 150) : 0;
        const isAoE = scopeSize > AOE_THRESHOLD;
        const emit = (key, delay, reason) => trace ? this._playTraced(key, delay, reason) : this.play(key, delay);

        if (trace) {
            this._traceNative("damage.process", {
                scopeSize,
                targetCount: allTargets.length,
                totalDamage,
                isAoE,
                vocalStaggerMs: VOCAL_STAGGER + SPELL_BONUS,
                targets: allTargets.map(t => this._summarizeToken(t))
            });
        }

        Logger.log(`${logPrefix} | Damage scope: ${scopeSize} total targets, ${allTargets.length} to process, AoE=${isAoE}`);

        if (isAoE) {
            Logger.log(`${logPrefix} | AoE detected. Playing single hit + up to ${MAX_AOE_VOCALS} vocals.`);
            emit(SOUND_EVENTS.BLOODY_HIT, 0, "aoe-impact");

            const vocalCandidates = [];
            for (const token of allTargets) {
                const actor = token.actor;
                if (!actor) continue;
                vocalCandidates.push({ actor, ...this._assessDamageTarget(actor, totalDamage) });
            }

            const shuffled = vocalCandidates.sort(() => Math.random() - 0.5);
            shuffled.slice(0, MAX_AOE_VOCALS).forEach((target) => {
                const stagger = Math.floor(Math.random() * AOE_VOCAL_MAX) + SPELL_BONUS;
                this._playVocalForTarget(target.actor, target.isPC, target.isDead, stagger, trace);
            });
            return;
        }

        if (allTargets.length === 0) {
            if (trace) this._traceNative("damage.noTargets", "playing generic CORE_HIT only; no pain/death vocals");
            Logger.log(`${logPrefix} | No targets resolved, playing generic hit impact`);
            emit(SOUND_EVENTS.BLOODY_HIT, 0, "generic-impact-no-targets");
            return;
        }

        for (const token of allTargets) {
            const actor = token.actor;
            if (!actor) {
                Logger.log(`${logPrefix} | No actor for token, skipping`);
                if (trace) this._traceNative("damage.skipToken", { reason: "no actor on token", token: this._summarizeToken(token) });
                continue;
            }

            const { isDead, isPC, currentHp, maxHp, estimatedHp } = this._assessDamageTarget(actor, totalDamage);
            Logger.log(`${logPrefix} | ${actor.name} HP: ${currentHp}/${maxHp} -> est. ${estimatedHp} after ${totalDamage} dmg (PC: ${isPC})`);
            if (trace) {
                this._traceNative("damage.target", {
                    actor: actor.name,
                    isPC,
                    isDead,
                    currentHp,
                    maxHp,
                    estimatedHp,
                    totalDamage
                });
            }

            emit(SOUND_EVENTS.BLOODY_HIT, 0, `impact-${actor.name}`);
            this._playVocalForTarget(actor, isPC, isDead, VOCAL_STAGGER + SPELL_BONUS, trace);
        }
    }

    _assessDamageTarget(actor, totalDamage) {
        const hp = actor.system?.attributes?.hp;
        const isPC = actor.type === "character";
        const currentHp = hp?.value ?? 0;
        const maxHp = hp?.max ?? 1;
        const estimatedHp = currentHp - totalDamage;

        let isDead;
        if (isPC) {
            const overflow = Math.abs(Math.min(0, estimatedHp));
            isDead = overflow >= maxHp;
            Logger.log(`DnD5e | PC death check: overflow ${overflow} vs maxHP ${maxHp} -> ${isDead ? "INSTANT DEATH" : "unconscious/pain"}`);
        } else {
            isDead = estimatedHp <= 0;
        }

        return { isDead, isPC, currentHp, maxHp, estimatedHp };
    }

    /**
     * Play the appropriate pain or death vocal for a single target.
     */
    _playVocalForTarget(actor, isPC, isDead, delay, trace = false) {
        const emit = (key, reason) => trace ? this._playTraced(key, delay, reason) : this.play(key, delay);
        const emitRaw = (key, reason) => trace ? this._playTraced(key, delay, reason) : this.handler.play(key, delay);

        if (isDead) {
            Logger.log(`DnD5e | ${actor.name} killed! Playing death sound`);
            const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
            if (trace) this._traceNative("vocal.death", { actor: actor.name, override: deathOverride ?? null, isPC });
            if (deathOverride) {
                emitRaw(deathOverride, `death-override-${actor.name}`);
            } else if (isPC) {
                emit(this.handler.getPCSound(actor, "DEATH"), `pc-death-${actor.name}`);
            } else {
                emit(SOUND_EVENTS.CORE_MONSTER_DEATH, `monster-death-${actor.name}`);
            }
        } else {
            Logger.log(`DnD5e | ${actor.name} took damage, playing pain`);
            const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
            if (trace) this._traceNative("vocal.pain", { actor: actor.name, override: painOverride ?? null, isPC });
            if (painOverride) {
                emitRaw(painOverride, `pain-override-${actor.name}`);
            } else if (isPC) {
                const pcPain = this.handler.getPCSound(actor, "PAIN");
                Logger.log(`DnD5e | PC Pain sound: ${pcPain} (delay: ${delay}ms)`);
                emit(pcPain, `pc-pain-${actor.name}`);
            } else {
                const painSound = this.detectMonsterPain(actor);
                Logger.log(`DnD5e | Monster pain sound: ${painSound}`);
                if (trace) this._traceNative("vocal.monsterPainKey", { actor: actor.name, painSound });
                if (painSound) emit(painSound, `monster-pain-${actor.name}`);
                else if (trace) this._traceNative("vocal.monsterPainKey", "detectMonsterPain returned empty key");
            }
        }
    }

    detectMonsterPain(actor) {
        if (!game.ionrift?.library?.classifyCreature) {
            Logger.warn("DnD5e | Library not loaded, using generic monster sound");
            return pickBoundMonsterPainKey(null, this.handler?.resolver, SOUND_EVENTS);
        }

        const classification = game.ionrift.library.classifyCreature(actor);
        Logger.log(`DnD5e | Classification for ${actor.name}:`, classification);
        Logger.log(`DnD5e | -> type: "${classification?.type}", subtype: "${classification?.subtype}", sound: "${classification?.sound}"`);

        const subtypeKey = classification?.type && classification?.subtype
            ? getSubtypeVocalKey(classification.type, classification.subtype)
            : null;
        if (subtypeKey) {
            Logger.log(`DnD5e | -> subtypeKey (with prefix fallback): "${subtypeKey}"`);
        }

        const painKey = pickBoundMonsterPainKey(classification, this.handler?.resolver, SOUND_EVENTS);
        Logger.log(`DnD5e | Monster pain resolved to bound key: ${painKey}`);
        return painKey;
    }

    _getSubtypeVocalKey(type, subtype) {
        return getSubtypeVocalKey(type, subtype);
    }

    /**
     * Native dnd5e attack result handler (no Midi-QOL).
     * Called from dnd5e.rollAttackV2 with the full D20Roll array and subject data.
     *
     * Phase 1 (swing sound) already fired via postUseActivity -> handleWeaponSound.
     * This handler is Phase 2: play the hit/miss/crit RESULT stinger based on the roll.
     *
     * Hit/miss detection logic (mirrors dnd5e's own chat card rendering):
     *   isMiss = !isCritical && (total < target || isFumble)
     *   isCritical = nat 20 (or criticalThreshold)
     *   isFumble   = nat 1
     *
     * Limitations:
     * - options.target (the single targeted AC) is only populated when exactly 1 target
     *   is selected. With 0 or 2+ targets it is undefined -- we skip result sounds in that
     *   case since we cannot determine hit/miss without Midi-QOL.
     * - Normal hits defer impact and pain sounds to handleNativeDamage (dnd5e.rollDamageV2).
     *
     * @param {Item5e}         item      The item that was used.
     * @param {D20Roll[]}      rolls     The rolls array from dnd5e.rollAttackV2.
     * @param {Activity|null}  activity  The attack activity, when available.
     */
    handleNativeAttack(item, rolls, activity = null) {
        if (!item) {
            this._traceNative("attack.skip", "no item on rollAttackV2 payload");
            return;
        }

        // rolls is the D20Roll[] array from rollAttackV2 -- not a single Roll object.
        // Guard: if caller passes a single Roll (legacy code path), wrap it.
        const rollArray = Array.isArray(rolls) ? rolls : (rolls ? [rolls] : []);
        const roll = rollArray[0];

        if (!roll) {
            this._traceNative("attack.skip", "no roll object in rollAttackV2 payload");
            Logger.log("DnD5e Native | No roll object received, skipping result stinger");
            return;
        }

        const isFumble   = roll.isFumble   ?? false;
        const isCritical = roll.isCritical ?? false;
        const total      = roll.total      ?? 0;
        const rollTargetAc = roll.options?.target ?? null;
        const target     = this._resolveNativeAttackAc(roll);

        this._traceNative("attack.evaluate", {
            item: this._summarizeItem(item),
            activity: this._summarizeActivity(activity),
            roll: this._summarizeRoll(roll),
            rollTargetAc,
            resolvedTargetAc: target,
            isFumble,
            isCritical,
            total
        });

        Logger.log(`DnD5e Native | Attack result - total:${total}, target(AC):${target ?? "?"}, crit:${isCritical}, fumble:${isFumble}`);

        const orch = this.handler?.orchestrator;

        if (isFumble) {
            this._traceNative("attack.outcome", "fumble -> ROLL_FUMBLE + miss");
            Logger.log("DnD5e Native | Fumble! Playing fumble + miss stingers");
            this._playTraced(SOUND_EVENTS.ROLL_FUMBLE, 0, "attack-fumble");
            const missKey = this._getMissKey(item);
            const fumbleDelay = orch?.getNamedOffset("FUMBLE_MISS_DELAY") ?? 200;
            this._playTraced(missKey, fumbleDelay, "attack-fumble-miss");
            return;
        }

        if (isCritical) {
            this._traceNative("attack.outcome", "critical -> ROLL_CRIT + decoration");
            Logger.log("DnD5e Native | Critical hit! Playing crit stinger");
            this._playTraced(SOUND_EVENTS.ROLL_CRIT, 0, "attack-crit");
            const critDelay = orch?.getNamedOffset("CRIT_DECORATION_DELAY") ?? 300;
            this._playTraced(SOUND_EVENTS.CRIT_DECORATION, critDelay, "attack-crit-decoration");
            return;
        }

        if (target === undefined || target === null) {
            this._traceNative("attack.outcome", "skip stinger -> could not resolve target AC (need exactly 1 target with known AC)");
            Logger.log("DnD5e Native | No single target selected - skipping result stinger (no Midi-QOL)");
            return;
        }

        const isMiss = total < target;
        if (isMiss) {
            const missKey = this._getMissKey(item);
            this._traceNative("attack.outcome", { result: "miss", missKey, total, targetAc: target });
            Logger.log(`DnD5e Native | Miss (${total} < AC ${target}) - playing ${missKey}`);
            this._playTraced(missKey, 0, "attack-miss");
        } else {
            this._traceNative("attack.outcome", { result: "hit", total, targetAc: target, note: "impact deferred to rollDamageV2" });
            Logger.log(`DnD5e Native | Hit (${total} >= AC ${target}) - deferring impact to damage roll`);
        }
    }

    /**
     * Native dnd5e damage handler (no Midi-QOL).
     * Called from dnd5e.rollDamageV2 after the damage roll resolves.
     *
     * Phase 1 (swing) fires via postUseActivity. Phase 2 (miss/crit/fumble) fires via
     * rollAttackV2. This handler is Phase 3: strike landed + target pain/death vocals.
     *
     * Targets come from game.user.targets at roll time. If none are selected, a generic
     * impact still plays so damage rolls are not silent.
     *
     * @param {DamageRoll[]} rolls
     * @param {Activity|null} activity
     */
    handleNativeDamage(rolls, activity) {
        const rollArray = Array.isArray(rolls) ? rolls : (rolls ? [rolls] : []);
        if (!rollArray.length) {
            this._traceNative("damage.skip", "no rolls in rollDamageV2 payload");
            Logger.log("DnD5e Native | No damage rolls received, skipping");
            return;
        }

        const item = activity?.item ?? null;
        const totalDamage = rollArray.reduce((sum, roll) => sum + Math.max(0, roll.total ?? 0), 0);

        const sig = `${item?.id ?? "unknown"}:${totalDamage}:${rollArray.map(r => r.formula).join("|")}`;
        if (sig && this._lastNativeDamageSig === sig) {
            this._traceNative("damage.skip", { reason: "duplicate signature", sig });
            Logger.log(`DnD5e Native | Duplicate damage roll ${sig}, skipping`);
            return;
        }
        this._lastNativeDamageSig = sig;

        this._traceNative("damage.start", {
            item: this._summarizeItem(item),
            activity: this._summarizeActivity(activity),
            totalDamage,
            rollTypes: rollArray.map(r => r.options?.type ?? null)
        });

        Logger.log(`DnD5e Native | Damage roll - total:${totalDamage}, item:${item?.name ?? "unknown"}`);

        if (item?.type === "consumable") {
            this._traceNative("damage.skip", { reason: "consumable", item: item.name });
            Logger.log(`DnD5e Native | Skipping damage sounds for consumable: ${item.name}`);
            return;
        }

        const healingTypes = CONFIG.DND5E?.healingTypes ?? {};
        const isHealing = rollArray.every((roll) => {
            const type = roll.options?.type;
            return type === "healing" || type === "temphp" || type in healingTypes;
        });
        if (isHealing) {
            this._traceNative("damage.skip", { reason: "healing roll types", types: rollArray.map(r => r.options?.type ?? null) });
            Logger.log("DnD5e Native | Skipping damage sounds - healing effect");
            return;
        }

        const MAX_TARGETS = 20;
        const targets = this._getNativeTargets(item, activity, true);
        const scopeSize = targets.length;
        const allTargets = targets.slice(0, MAX_TARGETS);

        this._processDamageTargets(allTargets, totalDamage, item, scopeSize, "DnD5e Native", true);
        this._cachedNativeAttackContext = null;
    }

    _cacheNativeAttackContext(item, activity) {
        const targets = game.user?.targets?.size ? [...game.user.targets] : [];
        const descriptors = this._buildTargetDescriptors(targets);

        this._cachedNativeAttackContext = {
            itemId: item?.id ?? null,
            activityUuid: activity?.uuid ?? null,
            targets,
            descriptors,
            at: Date.now()
        };

        this._traceNative("attack.cacheContext", {
            item: this._summarizeItem(item),
            activityUuid: activity?.uuid ?? null,
            targetCount: targets.length,
            targets: targets.map(t => this._summarizeToken(t)),
            descriptors
        });
    }

    _buildTargetDescriptors(tokens) {
        const descriptors = [];
        for (const token of tokens) {
            const actor = token.actor;
            if (!actor?.uuid) continue;
            const hasTotalCover = actor.statuses?.has?.("coverTotal") ?? false;
            const ac = hasTotalCover ? null : actor.system?.attributes?.ac?.value;
            descriptors.push({ uuid: actor.uuid, ac: ac ?? null, name: token.name ?? actor.name });
        }
        return descriptors;
    }

    _resolveNativeAttackAc(roll) {
        if (Number.isNumeric(roll?.options?.target)) {
            this._traceNative("attack.acSource", { source: "roll.options.target", ac: roll.options.target });
            return roll.options.target;
        }

        const ctx = this._cachedNativeAttackContext;
        if (ctx?.descriptors?.length === 1 && Number.isNumeric(ctx.descriptors[0].ac)) {
            this._traceNative("attack.acSource", { source: "cached descriptor", ac: ctx.descriptors[0].ac, name: ctx.descriptors[0].name });
            return ctx.descriptors[0].ac;
        }

        const userTargets = game.user?.targets;
        if (userTargets?.size === 1) {
            const ac = userTargets.first().actor?.system?.attributes?.ac?.value;
            if (Number.isNumeric(ac)) {
                this._traceNative("attack.acSource", { source: "live user.targets", ac, target: this._summarizeToken(userTargets.first()) });
                return ac;
            }
        }

        this._traceNative("attack.acSource", {
            source: "none",
            rollTargetAc: roll?.options?.target ?? null,
            cachedDescriptorCount: ctx?.descriptors?.length ?? 0,
            userTargetCount: userTargets?.size ?? 0
        });
        return null;
    }

    _getNativeTargets(item, activity = null, trace = false) {
        const traceStep = (step, detail) => { if (trace) this._traceNative(step, detail); };

        const userTargets = game.user?.targets;
        if (userTargets?.size > 0) {
            const resolved = [...userTargets];
            traceStep("targets.source", { source: "game.user.targets", count: resolved.length, targets: resolved.map(t => this._summarizeToken(t)) });
            return resolved;
        }
        traceStep("targets.source.miss", "game.user.targets empty at damage time");

        const ctx = this._cachedNativeAttackContext;
        const cacheAgeMs = ctx ? (Date.now() - ctx.at) : Infinity;
        const cacheValid = ctx && cacheAgeMs < 120000;
        const itemMatches = !item?.id || !ctx?.itemId || ctx.itemId === item.id;

        traceStep("targets.cacheState", {
            cacheValid,
            cacheAgeMs,
            itemMatches,
            cachedItemId: ctx?.itemId ?? null,
            incomingItemId: item?.id ?? null,
            cachedTargetCount: ctx?.targets?.length ?? 0,
            cachedDescriptorCount: ctx?.descriptors?.length ?? 0,
            cachedActivityUuid: ctx?.activityUuid ?? null
        });

        if (cacheValid && itemMatches) {
            if (ctx.targets?.length) {
                traceStep("targets.source", { source: "attack cache tokens", count: ctx.targets.length });
                Logger.log(`DnD5e Native | Using cached targets from attack roll (${ctx.targets.length})`);
                return ctx.targets;
            }

            const fromDescriptors = this._tokensFromDescriptors(ctx.descriptors, trace);
            if (fromDescriptors.length) {
                traceStep("targets.source", { source: "attack cache descriptors", count: fromDescriptors.length });
                Logger.log(`DnD5e Native | Resolved ${fromDescriptors.length} target(s) from attack descriptors`);
                return fromDescriptors;
            }
            traceStep("targets.cacheMiss", "cache valid but no tokens resolved from descriptors");
        } else if (!cacheValid) {
            traceStep("targets.cacheMiss", "cache missing or expired");
        } else if (!itemMatches) {
            traceStep("targets.cacheMiss", "cache item id mismatch");
        }

        const activityUuid = activity?.uuid ?? ctx?.activityUuid ?? null;
        traceStep("targets.messageLookup", { activityUuid });
        const fromAttackMessage = this._resolveTargetsFromAttackMessage(activityUuid, trace);
        if (fromAttackMessage.length) {
            traceStep("targets.source", { source: "attack chat message flags", count: fromAttackMessage.length });
            Logger.log(`DnD5e Native | Resolved ${fromAttackMessage.length} target(s) from attack chat message`);
            return fromAttackMessage;
        }

        traceStep("targets.source", { source: "none", count: 0 });
        return [];
    }

    _resolveTargetsFromAttackMessage(activityUuid, trace = false) {
        if (!activityUuid) {
            if (trace) this._traceNative("targets.messageMiss", "no activity UUID for message lookup");
            return [];
        }

        const recent = game.messages.contents.slice(-30).reverse();
        const attackMessages = recent.filter(msg => msg.flags?.dnd5e?.roll?.type === "attack");
        if (trace) {
            this._traceNative("targets.messageScan", {
                activityUuid,
                recentMessageCount: recent.length,
                attackMessageCount: attackMessages.length,
                attackActivityUuids: attackMessages.map(m => m.flags?.dnd5e?.activity?.uuid ?? null)
            });
        }

        for (const msg of recent) {
            const dnd5e = msg.flags?.dnd5e;
            if (dnd5e?.roll?.type !== "attack") continue;
            if (dnd5e?.activity?.uuid !== activityUuid) continue;
            if (trace) {
                this._traceNative("targets.messageHit", {
                    messageId: msg.id,
                    targetDescriptors: dnd5e.targets ?? []
                });
            }
            return this._tokensFromDescriptors(dnd5e.targets ?? [], trace);
        }

        if (trace) this._traceNative("targets.messageMiss", "no attack message matched activity UUID");
        return [];
    }

    _tokensFromDescriptors(descriptors, trace = false) {
        if (!Array.isArray(descriptors) || !descriptors.length) {
            if (trace) this._traceNative("targets.descriptorMiss", "empty descriptor list");
            return [];
        }

        const tokens = [];
        for (const desc of descriptors) {
            if (!desc?.uuid) {
                if (trace) this._traceNative("targets.descriptorSkip", { reason: "missing uuid", desc });
                continue;
            }
            try {
                const doc = fromUuidSync(desc.uuid);
                let token = doc?.object ?? null;

                if (!token && doc instanceof Actor) {
                    token = doc.getActiveTokens()?.[0]
                        ?? canvas.tokens?.placeables?.find(t => t.actor?.uuid === doc.uuid)
                        ?? null;
                }

                if (token) {
                    tokens.push(token);
                    if (trace) this._traceNative("targets.descriptorResolved", { uuid: desc.uuid, token: this._summarizeToken(token) });
                } else if (trace) {
                    this._traceNative("targets.descriptorMiss", { uuid: desc.uuid, docType: doc?.constructor?.name ?? "unknown" });
                }
            } catch (err) {
                if (trace) this._traceNative("targets.descriptorError", { uuid: desc.uuid, error: err.message });
                Logger.log(`DnD5e Native | Failed to resolve target ${desc.uuid}: ${err.message}`);
            }
        }

        return tokens;
    }
}
