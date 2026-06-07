import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

const ATTACK_CARD_MARKERS = [
    "cpr-attack-rollcard",
    "cpr-aimed-attack-rollcard",
    "cpr-autofire-rollcard",
    "cpr-suppressive-fire-rollcard",
    "cpr-program-attack-rollcard",
];

const MAGIC_CARD_MARKERS = [
    "cpr-cyberdeck-rollcard",
    "cpr-program-stat-rollcard",
];

const DAMAGE_CARD_MARKERS = [
    "cpr-damage-rollcard",
    "cpr-program-damage-rollcard",
    "cpr-damage-application-card",
];

/**
 * Cyberpunk RED Core adapter.
 * CPR roll cards are HTML templates without standard roll flags; detect via content markers.
 */
export class CyberpunkREDAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativeCPR]";

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${CyberpunkREDAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${CyberpunkREDAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${CyberpunkREDAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${CyberpunkREDAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "mook"].includes(a.type));
        if (!actor) return issues;

        const hpPath = actor.system?.derivedStats?.hp ? "system.derivedStats.hp.value" : "system.stats.rez.value";
        if (foundry.utils.getProperty(actor, hpPath) === undefined) {
            issues.push(`HP missing at '${hpPath}'`);
        }
        return issues;
    }

    registerHooks() {
        Logger.log("Cyberpunk RED Adapter Active");

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatMessage(message);
        });

        Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
            if (!game.user.isGM) return;
            this._handleHpChange(actor, changes);
        });
    }

    _handleChatMessage(message) {
        const content = message.content ?? "";
        if (!content) return;

        if (this._matchesAny(content, DAMAGE_CARD_MARKERS)) {
            this._handleDamageCard(message, content);
            return;
        }

        if (this._matchesAny(content, ATTACK_CARD_MARKERS)) {
            this._handleAttackCard(message, content);
            return;
        }

        if (this._matchesAny(content, MAGIC_CARD_MARKERS)) {
            this._handleMagicCard(message);
        }
    }

    _handleAttackCard(message, content) {
        if (this._lastAttackMessageId === message.id) return;
        this._lastAttackMessageId = message.id;

        const actor = message.speakerActor ?? game.actors.get(message.speaker?.actor);
        const item = this._resolveWeaponFromContent(content, actor);

        this._trace("attackCard", { actor: actor?.name ?? null, item: item?.name ?? null });

        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);
            const fallback = item.type === "weapon" ? SOUND_EVENTS.ASK_GENERIC_RANGED : SOUND_EVENTS.ASK_GENERIC_MAGIC;
            this.handler.playItemSoundWithFallback(soundKey, fallback, item);
        } else {
            this.play(SOUND_EVENTS.ASK_GENERIC_RANGED);
        }

        if (content.includes("critical-success") || content.includes("is-critical")) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        } else if (content.includes("critical-failure") || content.includes("is-fumble")) {
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
            this.play(SOUND_EVENTS.MISS, 200);
        }
    }

    _handleMagicCard(message) {
        if (this._lastMagicMessageId === message.id) return;
        this._lastMagicMessageId = message.id;

        const actor = message.speakerActor;
        this._trace("magicCard", { actor: actor?.name ?? null });
        this.play(SOUND_EVENTS.ASK_GENERIC_MAGIC);
    }

    _handleDamageCard(message, content) {
        if (this._lastDamageMessageId === message.id) return;
        this._lastDamageMessageId = message.id;

        this._trace("damageCard", { id: message.id });
        this.play(SOUND_EVENTS.BLOODY_HIT);

        if (content.includes("critical-success") || content.includes("is-critical")) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        }
    }

    _handleHpChange(actor, changes) {
        const newHp = foundry.utils.getProperty(changes, "system.derivedStats.hp.value")
            ?? foundry.utils.getProperty(changes, "system.stats.rez.value");
        if (newHp === undefined) return;

        const hp = actor.system?.derivedStats?.hp ?? actor.system?.stats?.rez;
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

    _resolveWeaponFromContent(content, actor) {
        if (!actor?.items?.size) return null;

        const itemIdMatch = content.match(/data-item-id=["']([^"']+)["']/);
        if (itemIdMatch) {
            const item = actor.items.get(itemIdMatch[1]);
            if (item) return item;
        }

        for (const item of actor.items) {
            if (item.type === "weapon" && content.includes(item.name)) return item;
        }
        return actor.items.find(i => i.type === "weapon") ?? null;
    }

    _matchesAny(content, markers) {
        return markers.some(marker => content.includes(marker));
    }
}
