import { SystemAdapter } from "../../SystemAdapter.js";
import { SOUND_EVENTS } from "../../../data/constants.js";
import { Logger } from "../../../utils/Logger.js";

export class WFRP4eAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeWFRP4e]";

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${WFRP4eAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${WFRP4eAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${WFRP4eAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${WFRP4eAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "npc"].includes(a.type));
        if (!actor) return issues;

        if (foundry.utils.getProperty(actor, "system.status.wounds.value") === undefined) {
            issues.push("Wounds (Current) missing at 'system.status.wounds.value'");
        }
        return issues;
    }

    registerHooks() {
        Logger.log("WFRP4e Adapter Active");

        const attackHooks = [
            "wfrp4e:rollWeaponTest",
            "wfrp4e:rollCastTest",
            "wfrp4e:rollPrayerTest",
            "wfrp4e:rollChannelTest",
        ];

        for (const hookName of attackHooks) {
            Hooks.on(hookName, (test) => {
                if (!game.user.isGM) return;
                this._handleTestRoll(test, hookName);
            });
        }

        Hooks.on("wfrp4e:opposedTestResult", (opposedTest, attackerTest, defenderTest) => {
            if (!game.user.isGM) return;
            this._handleOpposedResult(opposedTest, attackerTest, defenderTest);
        });

        Hooks.on("wfrp4e:applyDamage", (scriptArgs) => {
            if (!game.user.isGM) return;
            this._handleApplyDamage(scriptArgs);
        });

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatFallback(message);
        });
    }

    _handleTestRoll(test, hookName) {
        const item = test?.item ?? test?.weapon;
        const actor = test?.actor ?? item?.actor;
        if (!item) return;

        this._trace("testRoll", { hook: hookName, item: item.name, type: item.type });

        const soundKey = this.handler.pickSound(item, actor?.name, actor);
        if (item.type === "spell" || hookName.includes("Cast") || hookName.includes("Prayer") || hookName.includes("Channel")) {
            this.handler.playItemSoundWithFallback(soundKey, SOUND_EVENTS.ASK_GENERIC_MAGIC, item);
        } else {
            this.handler.playItemSound(soundKey, item);
        }
    }

    _handleOpposedResult(opposedTest, attackerTest, defenderTest) {
        const item = attackerTest?.item ?? attackerTest?.weapon;
        const attackerWins = opposedTest?.result?.winner === "attacker"
            || (attackerTest?.result?.SL ?? 0) > (defenderTest?.result?.SL ?? 0);

        this._trace("opposedResult", {
            item: item?.name ?? null,
            attackerWins,
            winner: opposedTest?.result?.winner ?? null,
            attackerSL: attackerTest?.result?.SL ?? null,
            defenderSL: defenderTest?.result?.SL ?? null
        });

        if (!attackerWins) {
            this.play(this._getMissKey(item));
            return;
        }

        const attackerSL = attackerTest?.result?.SL ?? 0;
        if (attackerSL >= 6) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleApplyDamage(scriptArgs) {
        const actor = scriptArgs?.actor;
        const sourceItem = scriptArgs?.sourceItem;
        const loss = scriptArgs?.totalWoundLoss ?? 0;

        if (!actor || loss <= 0) return;

        const sig = `${actor.id}:${loss}:${scriptArgs?.loc ?? "body"}`;
        if (this._lastDamageSig === sig) return;
        this._lastDamageSig = sig;

        this._trace("applyDamage", { target: actor.name, loss, item: sourceItem?.name ?? null });

        this.play(SOUND_EVENTS.BLOODY_HIT);

        const wounds = actor.system?.status?.wounds;
        const current = wounds?.value ?? 0;
        const max = wounds?.max ?? 1;
        const isPC = actor.type === "character";
        const estimated = current - loss;
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

    _handleChatFallback(message) {
        const template = message.flags?.wfrp4e?.template ?? message.flags?.wfrp4e?.type;
        if (!template) return;

        const templateStr = String(template).toLowerCase();
        if (!templateStr.includes("weapon") && !templateStr.includes("spell") && !templateStr.includes("test")) {
            return;
        }

        const item = this._getItemFromMessage(message);
        const actor = message.speakerActor ?? item?.actor;
        if (!item) return;

        this._trace("chatFallback", { template: templateStr, item: item.name });
        const soundKey = this.handler.pickSound(item, actor?.name, actor);
        this.handler.playItemSound(soundKey, item);
    }

    _getMissKey(item) {
        if (!item) return SOUND_EVENTS.MISS;
        if (item.type === "spell") return SOUND_EVENTS.CORE_MISS_MAGIC;
        if (item.type === "weapon" && item.system?.weaponGroup?.value !== "basic") {
            const group = item.system?.weaponGroup?.value ?? "";
            if (["bow", "crossbow", "blackpowder", "throwing"].includes(group)) {
                return SOUND_EVENTS.CORE_MISS_RANGED;
            }
        }
        return SOUND_EVENTS.MISS;
    }

    _getItemFromMessage(message) {
        const uuid = message.flags?.wfrp4e?.origin?.uuid ?? message.flags?.wfrp4e?.itemUuid;
        if (uuid) {
            try {
                const doc = fromUuidSync(uuid);
                if (doc?.documentName === "Item") return doc;
            } catch {
                Logger.log(`WFRP4e | fromUuidSync failed for ${uuid}`);
            }
        }
        return message.item ?? null;
    }
}
