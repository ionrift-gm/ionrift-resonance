/**
 * DnD5eNativeTargetResolver — Native dnd5e target & AC resolution methods
 * mixed into DnD5eAdapter.prototype.
 */

import { Logger } from "../../../utils/Logger.js";

export const dnd5eNativeTargetResolverMethods = {

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
    },

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
    },

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
    },

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
    },

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
    },

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
};
