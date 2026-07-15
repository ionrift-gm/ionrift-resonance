import { SystemAdapter } from "../../SystemAdapter.js";
import { SOUND_EVENTS } from "../../../data/constants.js";
import { Logger } from "../../../utils/Logger.js";

export class SWADEAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeSWADE]";

    /** Wounds rise on damage (not an HP-down pool). */
    isDamage(oldWounds, newWounds) {
        return newWounds > oldWounds;
    }

    isDeath(newWounds, maxWounds, isPC) {
        if (maxWounds <= 0) return false;
        return newWounds >= maxWounds;
    }

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${SWADEAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${SWADEAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${SWADEAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${SWADEAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "npc"].includes(a.type));
        if (!actor) return issues;

        if (foundry.utils.getProperty(actor, "system.wounds.value") === undefined) {
            issues.push("Wounds (Current) missing at 'system.wounds.value'");
        }
        return issues;
    }

    registerHooks() {
        Logger.log("SWADE Adapter Active");

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatMessage(message);
        });

        Hooks.on("swadeTakeDamage", (actor, damageContext) => {
            if (!game.user.isGM) return;
            this._handleTakeDamage(actor, damageContext);
        });
    }

    _handleChatMessage(message) {
        const roll = message.significantRoll ?? message.rolls?.[message.rolls.length - 1];
        if (!roll) return;

        const rollType = roll.options?.rollType ?? roll.constructor?.name ?? "";
        const rollName = String(rollType).toLowerCase();

        if (this._isDamageRoll(roll, rollName)) {
            this._handleDamageRoll(message, roll);
            return;
        }

        if (this._isTraitRoll(roll, rollName)) {
            this._handleTraitRoll(message, roll);
        }
    }

    _isTraitRoll(roll, rollName) {
        if (rollName.includes("trait") || rollName.includes("traitroll")) return true;
        const TraitRoll = CONFIG.Dice?.TraitRoll;
        return TraitRoll ? roll instanceof TraitRoll : false;
    }

    _isDamageRoll(roll, rollName) {
        if (rollName.includes("damage") || rollName.includes("damageroll")) return true;
        const DamageRoll = CONFIG.Dice?.DamageRoll;
        return DamageRoll ? roll instanceof DamageRoll : false;
    }

    _handleTraitRoll(message, roll) {
        const actor = message.speakerActor ?? game.actors.get(message.speaker?.actor);
        const item = this._resolveItemFromMessage(message, actor);

        this._trace("traitRoll", { actor: actor?.name ?? null, item: item?.name ?? null });

        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);
            if (item.type === "power") {
                this.handler.playItemSoundWithFallback(soundKey, SOUND_EVENTS.ASK_GENERIC_MAGIC, item);
            } else {
                this.handler.playItemSound(soundKey, item);
            }
        } else {
            this.play(SOUND_EVENTS.ASK_GENERIC_MELEE);
        }

        if (roll.isCritfail) {
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
            this.play(this._getMissKey(item), 200);
        } else if (roll.isCritfail === false && roll.successes === 0) {
            this.play(this._getMissKey(item));
        } else if ((roll.successes ?? 0) >= 2) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleDamageRoll(message, roll) {
        if (this._lastDamageRollId === message.id) return;
        this._lastDamageRollId = message.id;

        this._trace("damageRoll", { total: roll.total ?? null, raises: roll.successes ?? null });
        this.play(SOUND_EVENTS.BLOODY_HIT);

        if ((roll.successes ?? 0) >= 2) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleTakeDamage(actor, damageContext) {
        if (!actor) return;

        const sig = `${actor.id}:${damageContext?.damage?.total ?? 0}`;
        if (this._lastTakeDamageSig === sig) return;
        this._lastTakeDamageSig = sig;

        this._trace("swadeTakeDamage", { actor: actor.name, damage: damageContext?.damage?.total ?? null });

        this.play(SOUND_EVENTS.BLOODY_HIT);

        const wounds = actor.system?.wounds;
        const isPC = actor.type === "character";
        const current = wounds?.value ?? 0;
        const max = wounds?.max ?? 1;
        const incoming = damageContext?.woundsInflicted ?? 1;
        const estimated = current + incoming;
        const isDead = this.isDeath(estimated, max, isPC);

        if (isDead) {
            const override = actor.getFlag("ionrift-resonance", "sound_death");
            if (override) this.handler.play(override);
            else if (isPC) this.play(this.handler.getPCSound(actor, "DEATH"));
            else this.play(SOUND_EVENTS.CORE_MONSTER_DEATH);
        } else {
            const override = actor.getFlag("ionrift-resonance", "sound_pain");
            if (override) this.handler.play(override);
            else if (isPC) this.play(this.handler.getPCSound(actor, "PAIN"));
            else this.play(SOUND_EVENTS.CORE_MONSTER_PAIN);
        }
    }

    _getMissKey(item) {
        if (item?.type === "power") return SOUND_EVENTS.CORE_MISS_MAGIC;
        if (item?.type === "weapon") {
            const isRanged = item.system?.range?.includes?.("r") || item.name?.toLowerCase().includes("bow");
            if (isRanged) return SOUND_EVENTS.CORE_MISS_RANGED;
        }
        return SOUND_EVENTS.MISS;
    }

    _resolveItemFromMessage(message, actor) {
        const flavor = message.flavor ?? "";
        if (!actor?.items?.size) return null;

        for (const item of actor.items) {
            if (item.type === "weapon" || item.type === "power") {
                if (flavor.includes(item.name)) return item;
            }
        }
        return actor.items.find(i => i.type === "weapon") ?? null;
    }
}
