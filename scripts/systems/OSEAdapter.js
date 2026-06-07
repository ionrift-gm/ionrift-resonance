import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

/**
 * Old-School Essentials (ose) adapter.
 * Attack rolls post chat cards with flags.ose.roll; damage via applyDamage / HP updates.
 */
export class OSEAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeOSE]";

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${OSEAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${OSEAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${OSEAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${OSEAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "monster"].includes(a.type));
        if (!actor) return issues;

        if (foundry.utils.getProperty(actor, "system.hp.value") === undefined) {
            issues.push("HP (Current) missing at 'system.hp.value'");
        }
        if (foundry.utils.getProperty(actor, "system.hp.max") === undefined) {
            issues.push("HP (Max) missing at 'system.hp.max'");
        }
        return issues;
    }

    registerHooks() {
        Logger.log("OSE Adapter Active");

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatMessage(message);
        });

        Hooks.on("preUpdateActor", (actor, changes) => {
            if (!game.user.isGM) return;
            this._handleHpChange(actor, changes);
        });
    }

    _handleChatMessage(message) {
        const oseFlag = message.flags?.ose;
        const rollData = oseFlag?.roll ?? oseFlag?.data?.roll;

        if (oseFlag?.roll === "attack" || rollData?.type === "melee" || rollData?.type === "missile") {
            this._handleAttackMessage(message, oseFlag);
            return;
        }

        const content = message.content ?? "";
        if (content.includes("damage-roll") || rollData?.type === "damage") {
            this._handleDamageMessage(message);
        }
    }

    _handleAttackMessage(message, oseFlag) {
        if (this._lastAttackMessageId === message.id) return;
        this._lastAttackMessageId = message.id;

        const actor = message.speakerActor;
        const itemId = oseFlag?.itemId ?? oseFlag?.data?.itemId;
        const item = itemId ? actor?.items?.get(itemId) : null;

        this._trace("attack", { actor: actor?.name ?? null, item: item?.name ?? null, type: oseFlag?.data?.roll?.type });

        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);
            const rollType = oseFlag?.data?.roll?.type ?? "";
            const fallback = rollType === "missile" ? SOUND_EVENTS.ASK_GENERIC_RANGED : SOUND_EVENTS.ASK_GENERIC_MELEE;
            this.handler.playItemSoundWithFallback(soundKey, fallback, item);
        } else if (oseFlag?.data?.roll?.type === "missile") {
            this.play(SOUND_EVENTS.ASK_GENERIC_RANGED);
        } else {
            this.play(SOUND_EVENTS.ASK_GENERIC_MELEE);
        }
    }

    _handleDamageMessage(message) {
        if (this._lastDamageMessageId === message.id) return;
        this._lastDamageMessageId = message.id;

        this._trace("damage", { id: message.id });
        this.play(SOUND_EVENTS.BLOODY_HIT);
    }

    _handleHpChange(actor, changes) {
        const newHp = foundry.utils.getProperty(changes, "system.hp.value");
        if (newHp === undefined) return;

        const hp = actor.system?.hp;
        if (!hp) return;

        const oldHp = hp.value ?? 0;
        if (!this.isDamage(oldHp, newHp)) return;

        const sig = `${actor.id}:${oldHp}->${newHp}`;
        if (this._lastHpSig === sig) return;
        this._lastHpSig = sig;

        this._trace("hpDown", { actor: actor.name, oldHp, newHp });

        const maxHp = hp.max ?? 1;
        const isPC = actor.type === "character";
        const isDead = this.isDeath(newHp, maxHp, isPC);

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
}
