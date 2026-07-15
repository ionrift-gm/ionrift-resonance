import { SystemAdapter } from "../../SystemAdapter.js";
import { SOUND_EVENTS } from "../../../data/constants.js";
import { Logger } from "../../../utils/Logger.js";

const COC7_FLAG = "CoC7";

export class CoC7Adapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeCoC7]";

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${CoC7Adapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${CoC7Adapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${CoC7Adapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${CoC7Adapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "npc", "creature"].includes(a.type));
        if (!actor) return issues;

        if (foundry.utils.getProperty(actor, "system.attribs.hp.value") === undefined) {
            issues.push("HP (Current) missing at 'system.attribs.hp.value'");
        }
        if (foundry.utils.getProperty(actor, "system.attribs.hp.max") === undefined) {
            issues.push("HP (Max) missing at 'system.attribs.hp.max'");
        }
        return issues;
    }

    registerHooks() {
        Logger.log("CoC7 Adapter Active");

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatMessage(message);
        });

        Hooks.on("updateChatMessage", (message, changes) => {
            if (!game.user.isGM) return;
            if (changes.flags?.[COC7_FLAG]?.load?.isDamageInflicted === true) {
                this._handleDamageInflicted(message);
            }
        });

        Hooks.on("messageUpdatedCoC7", (messageId) => {
            if (!game.user.isGM) return;
            const message = game.messages.get(messageId);
            if (message) this._handleCombatUpdate(message);
        });
    }

    _handleChatMessage(message) {
        const load = message.flags?.[COC7_FLAG]?.load;
        if (!load?.as) return;

        this._trace("chat.create", { as: load.as, id: message.id });

        switch (load.as) {
            case "CoC7ChatCombatMelee":
            case "CoC7ChatCombatRanged":
                this._handleCombatCard(message, load);
                break;
            case "CoC7ChatDamage":
                if (message.rolls?.length || load.rollDamage) {
                    this._handleDamageCard(message, load);
                }
                break;
            default:
                break;
        }
    }

    _handleCombatUpdate(message) {
        const load = message.flags?.[COC7_FLAG]?.load;
        if (!load) return;

        if (load.as === "CoC7ChatCombatMelee" || load.as === "CoC7ChatCombatRanged") {
            const pool = load.dicePool;
            if (pool?.rolledDice?.length && load.responded) {
                this._playAttackFromLoad(load, message);
                this._handleCombatOutcome(pool, load);
            }
        }
    }

    _handleCombatCard(message, load) {
        if (load.participant === "initiator" && message.rolls?.length) {
            this._playAttackFromLoad(load, message);
        }
    }

    _handleCombatOutcome(pool, load) {
        if (!pool?.threshold) return;

        const success = pool.isSuccess ?? (pool.rolledDice?.some(d => d.selected && d.value <= pool.threshold));
        if (success === false) {
            const item = this._resolveItem(load.itemUuid);
            this.play(this._getMissKey(item));
            return;
        }
        if (load.isCritical || pool.isCritical) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleDamageCard(message, load) {
        if (this._lastDamageMessageId === message.id) return;
        this._lastDamageMessageId = message.id;

        const item = this._resolveItem(load.itemUuid);
        this._trace("damage.card", { item: item?.name ?? null, critical: load.isCritical });

        this.play(SOUND_EVENTS.BLOODY_HIT);

        if (load.isCritical) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }

        const target = this._resolveActor(load.targetUuid);
        if (target) {
            this._playTargetVocal(target, load.isCritical);
        }
    }

    _handleDamageInflicted(message) {
        const load = message.flags?.[COC7_FLAG]?.load;
        if (!load || this._lastInflictedMessageId === message.id) return;
        this._lastInflictedMessageId = message.id;

        this._trace("damage.inflicted", { target: load.targetUuid ?? null });
        this.play(SOUND_EVENTS.BLOODY_HIT);

        const target = this._resolveActor(load.targetUuid);
        if (target) {
            this._playTargetVocal(target, load.isCritical);
        }
    }

    _playAttackFromLoad(load, message) {
        const item = this._resolveItem(load.itemUuid);
        const actor = this._resolveActor(load.attackerUuid ?? load.actorUuid ?? message.speaker?.actor);
        if (!item && !actor) {
            this.play(SOUND_EVENTS.ASK_GENERIC_MELEE);
            return;
        }

        const soundKey = this.handler.pickSound(item, actor?.name, actor);
        if (item?.type === "spell") {
            this.handler.playItemSoundWithFallback(soundKey, SOUND_EVENTS.ASK_GENERIC_MAGIC, item);
        } else {
            this.handler.playItemSound(soundKey, item);
        }
    }

    _playTargetVocal(actor, isCritical) {
        const hp = actor.system?.attribs?.hp;
        const currentHp = hp?.value ?? 0;
        const maxHp = hp?.max ?? 1;
        const isPC = actor.hasPlayerOwner ?? actor.type === "character";
        const estimatedHp = Math.max(0, currentHp - (isCritical ? 2 : 1));
        const isDead = this.isDeath(estimatedHp, maxHp, isPC);

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
        if (item?.type === "spell") return SOUND_EVENTS.CORE_MISS_MAGIC;
        if (item?.type === "weapon" && item.system?.properties?.rngd) return SOUND_EVENTS.CORE_MISS_RANGED;
        return SOUND_EVENTS.MISS;
    }

    _resolveItem(uuid) {
        if (!uuid) return null;
        try {
            const doc = fromUuidSync(uuid);
            return doc?.documentName === "Item" ? doc : null;
        } catch {
            return null;
        }
    }

    _resolveActor(uuid) {
        if (!uuid) return null;
        try {
            const doc = fromUuidSync(uuid);
            if (doc?.documentName === "Actor") return doc;
            if (doc?.actor) return doc.actor;
        } catch {
            return null;
        }
        return null;
    }
}
