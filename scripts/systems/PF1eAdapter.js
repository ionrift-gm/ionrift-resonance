import { SystemAdapter } from "./SystemAdapter.js";
import { SOUND_EVENTS } from "../constants.js";
import { Logger } from "../Logger.js";

/**
 * Pathfinder 1e (pf1) adapter.
 * Uses native pf1AttackRoll / pf1ApplyDamage hooks with chat fallback.
 */
export class PF1eAdapter extends SystemAdapter {
    static TRACE_PREFIX = "[NativePF1]";

    _trace(step, detail = null) {
        if (detail === null || detail === undefined) {
            Logger.info(`${PF1eAdapter.TRACE_PREFIX} ${step}`);
            return;
        }
        if (typeof detail === "string") {
            Logger.info(`${PF1eAdapter.TRACE_PREFIX} ${step} | ${detail}`);
            return;
        }
        try {
            Logger.info(`${PF1eAdapter.TRACE_PREFIX} ${step} | ${JSON.stringify(detail)}`);
        } catch {
            Logger.info(`${PF1eAdapter.TRACE_PREFIX} ${step} | (detail not serializable)`);
        }
    }

    validateSchema() {
        const issues = [];
        const actor = game.actors.find(a => ["character", "npc"].includes(a.type));
        if (!actor) return issues;

        const checks = [
            { path: "system.attributes.hp.value", desc: "HP (Current)" },
            { path: "system.attributes.hp.max", desc: "HP (Max)" },
        ];
        for (const check of checks) {
            if (foundry.utils.getProperty(actor, check.path) === undefined) {
                issues.push(`${check.desc} missing at '${check.path}'`);
            }
        }
        return issues;
    }

    registerHooks() {
        Logger.log("PF1 Adapter Active");

        Hooks.on("pf1AttackRoll", (item, actor, roll, _attackOptions) => {
            if (!game.user.isGM) return;
            this._handleAttackRoll(item, actor, roll);
        });

        Hooks.on("pf1ApplyDamage", (damage, target, _source, item, _type) => {
            if (!game.user.isGM) return;
            this._handleApplyDamage(damage, target, item);
        });

        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return;
            this._handleChatFallback(message);
        });

        Hooks.on("preUpdateActor", (actor, changes) => {
            if (!game.user.isGM) return;
            this._handleHpChange(actor, changes);
        });
    }

    _handleAttackRoll(item, actor, roll) {
        if (!item) return;

        this._trace("attackRoll", { item: item.name, actor: actor?.name ?? null });

        const soundKey = this.handler.pickSound(item, actor?.name, actor);
        if (item.type === "spell") {
            const schoolKey = this._getSchoolKey(item.system?.school);
            if (schoolKey) {
                this.handler.playItemSoundWithFallback(soundKey, schoolKey, item);
            } else {
                this.handler.playItemSoundWithFallback(soundKey, SOUND_EVENTS.ASK_GENERIC_MAGIC, item);
            }
        } else {
            this.handler.playItemSound(soundKey, item);
        }

        if (roll?.isCritical === true || roll?.options?.critical === true) {
            this.play(SOUND_EVENTS.ROLL_CRIT);
        } else if (roll?.isFumble === true || roll?.options?.fumble === true) {
            this.play(SOUND_EVENTS.ROLL_FUMBLE);
            this.play(SOUND_EVENTS.MISS, 200);
        }
    }

    _handleApplyDamage(damage, target, item) {
        const amount = typeof damage === "number" ? damage : (damage?.total ?? damage?.value ?? 0);
        if (!target || amount <= 0) return;

        const sig = `${target.id}:${amount}:${item?.id ?? "none"}`;
        if (this._lastDamageSig === sig) return;
        this._lastDamageSig = sig;

        this._trace("applyDamage", { target: target.name, amount, item: item?.name ?? null });
        this.play(SOUND_EVENTS.BLOODY_HIT);
        this._playTargetVocal(target, item);
    }

    _handleChatFallback(message) {
        const pf1 = message.flags?.pf1;
        if (!pf1) return;

        const rollType = pf1.messageType ?? pf1.type ?? pf1.rollType;
        if (!rollType) return;

        const typeStr = String(rollType).toLowerCase();
        if (typeStr.includes("attack") || typeStr.includes("action")) {
            this._handleChatAttack(message, pf1);
        } else if (typeStr.includes("damage")) {
            this._handleChatDamage(message);
        }
    }

    _handleChatAttack(message, pf1) {
        if (this._lastAttackMessageId === message.id) return;
        this._lastAttackMessageId = message.id;

        const actor = message.speakerActor ?? this._resolveActor(pf1.actorUuid ?? message.speaker?.actor);
        const item = this._resolveItem(pf1.itemUuid ?? pf1.itemId, actor);

        this._trace("chat.attack", { actor: actor?.name ?? null, item: item?.name ?? null });

        if (item) {
            const soundKey = this.handler.pickSound(item, actor?.name, actor);
            const fallback = item.type === "spell" ? SOUND_EVENTS.ASK_GENERIC_MAGIC : SOUND_EVENTS.ASK_GENERIC_MELEE;
            this.handler.playItemSoundWithFallback(soundKey, fallback, item);
        } else {
            this.play(SOUND_EVENTS.ASK_GENERIC_MELEE);
        }
    }

    _handleChatDamage(message) {
        if (this._lastDamageMessageId === message.id) return;
        this._lastDamageMessageId = message.id;

        this._trace("chat.damage", { id: message.id });
        this.play(SOUND_EVENTS.BLOODY_HIT);
    }

    _handleHpChange(actor, changes) {
        const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
        if (newHp === undefined) return;

        const hp = actor.system?.attributes?.hp;
        if (!hp) return;

        const oldHp = hp.value ?? 0;
        if (!this.isDamage(oldHp, newHp)) return;

        const sig = `${actor.id}:${oldHp}->${newHp}`;
        if (this._lastHpSig === sig) return;
        this._lastHpSig = sig;

        this._trace("hpDown", { actor: actor.name, oldHp, newHp });
        this._playTargetVocal(actor);
    }

    _playTargetVocal(actor, item = null) {
        const hp = actor.system?.attributes?.hp;
        const currentHp = hp?.value ?? 0;
        const maxHp = hp?.max ?? 1;
        const isPC = actor.hasPlayerOwner ?? actor.type === "character";
        const isDead = this.isDeath(currentHp, maxHp, isPC);

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

    _getSchoolKey(school) {
        if (!school) return null;
        const normalized = String(school).toLowerCase().replace(/\s+/g, "");
        const schoolMap = {
            abjuration: "SCHOOL_ABJURATION",
            conjuration: "SCHOOL_CONJURATION",
            divination: "SCHOOL_DIVINATION",
            enchantment: "SCHOOL_ENCHANTMENT",
            evocation: "SCHOOL_EVOCATION",
            illusion: "SCHOOL_ILLUSION",
            necromancy: "SCHOOL_NECROMANCY",
            transmutation: "SCHOOL_TRANSMUTATION",
        };
        return schoolMap[normalized] ?? null;
    }

    _resolveItem(uuidOrId, actor) {
        if (uuidOrId) {
            try {
                const doc = fromUuidSync(uuidOrId);
                if (doc?.documentName === "Item") return doc;
            } catch { /* fall through */ }
            if (actor?.items?.get(uuidOrId)) return actor.items.get(uuidOrId);
        }
        return null;
    }

    _resolveActor(uuidOrId) {
        if (!uuidOrId) return null;
        try {
            const doc = fromUuidSync(uuidOrId);
            if (doc?.documentName === "Actor") return doc;
            if (doc?.actor) return doc.actor;
        } catch { /* fall through */ }
        return game.actors.get(uuidOrId) ?? null;
    }
}
