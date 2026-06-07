import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

const HARM_WEIGHTS = { light: 1, medium: 3, heavy: 9 };

/**
 * Blades in the Dark adapter.
 * Harm clocks replace HP; stress is tracked separately. Uses harm score for damage/death checks.
 */
export class BladesInTheDarkAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeBITD]";

    /**
     * Harm score rises when new harm boxes are marked.
     */
    isDamage(oldScore, newScore) {
        return newScore > oldScore;
    }

    isDeath(newScore, _maxScore, _isPC) {
        return newScore >= 999;
    }

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${BladesInTheDarkAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${BladesInTheDarkAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${BladesInTheDarkAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${BladesInTheDarkAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => a.type === "character");
        if (!actor) return issues;

        if (foundry.utils.getProperty(actor, "system.harm") === undefined) {
            issues.push("Harm missing at 'system.harm'");
        }
        return issues;
    }

    registerHooks() {
        Logger.log("Blades in the Dark Adapter Active");

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatMessage(message);
        });

        Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
            if (!game.user.isGM) return;
            this._handleHarmChange(actor, changes);
        });
    }

    _handleChatMessage(message) {
        if (!message.rolls?.length) return;

        const content = (message.content ?? "").toLowerCase();
        const flavor = (message.flavor ?? "").toLowerCase();
        const isActionRoll = content.includes("blades") || content.includes("bitd")
            || flavor.includes("roll") || flavor.includes("action")
            || message.rolls.some(r => r.formula?.includes("d6"));

        if (!isActionRoll) return;

        if (this._lastRollMessageId === message.id) return;
        this._lastRollMessageId = message.id;

        const actor = message.speakerActor ?? game.actors.get(message.speaker?.actor);
        const item = this._resolveItemFromMessage(message, actor);

        this._trace("actionRoll", { actor: actor?.name ?? null, item: item?.name ?? null, flavor: message.flavor ?? null });

        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);
            this.handler.playItemSound(soundKey, item);
        } else {
            this.play(SOUND_EVENTS.ASK_GENERIC_MELEE);
        }

        const primaryRoll = message.rolls[0];
        const result = primaryRoll?.total ?? 0;
        if (result <= 3) {
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
        } else if (result >= 6) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleHarmChange(actor, changes) {
        const harmChange = foundry.utils.getProperty(changes, "system.harm");
        if (!harmChange) return;

        const oldScore = this._harmScore(actor.system?.harm);
        const mergedHarm = foundry.utils.mergeObject(
            foundry.utils.deepClone(actor.system?.harm ?? {}),
            harmChange,
            { inplace: false }
        );
        const newScore = this._harmScore(mergedHarm);

        if (!this.isDamage(oldScore, newScore)) return;

        const sig = `${actor.id}:${oldScore}->${newScore}`;
        if (this._lastHarmSig === sig) return;
        this._lastHarmSig = sig;

        this._trace("harmUp", { actor: actor.name, oldScore, newScore });

        this.play(SOUND_EVENTS.BLOODY_HIT);

        const isPC = actor.type === "character";
        const isDead = this.isDeath(newScore, 18, isPC);

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

    _harmScore(harm) {
        if (!harm) return 0;

        for (const entry of Object.values(harm.deadly ?? {})) {
            if (entry && String(entry).trim() !== "") return 999;
        }

        let score = 0;
        for (const [level, weight] of Object.entries(HARM_WEIGHTS)) {
            for (const entry of Object.values(harm[level] ?? {})) {
                if (entry && String(entry).trim() !== "") score += weight;
            }
        }
        return score;
    }

    _resolveItemFromMessage(message, actor) {
        if (!actor?.items?.size) return null;

        const text = `${message.flavor ?? ""} ${message.content ?? ""}`;
        for (const item of actor.items) {
            if (text.includes(item.name)) return item;
        }
        return null;
    }
}
