import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";
import { originFromToken } from "../services/playback/SoundOrigin.js";

/**
 * LuminanceIntegration
 * Spatial handheld torch audio loop and ignition/extinguish cues for Ionrift Luminance.
 *
 * Spawns a single Foundry AmbientSound emitter (`LUMINANCE_TORCH_LOOP`, choosing from
 * the pack's standalone loop variations) at the torch-bearing token's center coordinates
 * (`radius: 20`, `easing: true`, `walls: true`), moving smoothly with the token on
 * `updateToken` (`x`/`y` only so the loop never restarts) and cleaning up when snuffed.
 */
export class LuminanceIntegration {
    static MODULE_ID = "ionrift-luminance";
    static MIN_VERSION = "0.1.0";
    /** Let the ignition cue land before the steady torch loop begins. */
    static TORCH_LIT_LEAD_MS = 550;
    /** Default audible radius in scene grid units (matches 20 ft torch bright light). */
    static TORCH_AUDIO_RADIUS = 20;
    /** Default AmbientSound volume for the handheld torch loop emitter. */
    static TORCH_LOOP_VOLUME = 0.45;

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        /** @type {Map<string, ReturnType<typeof setTimeout>>} tokenId -> timer */
        this._loopDelayTimers = new Map();
        /** @type {Map<string, number>} debounceKey -> timestamp */
        this._lastCueAt = new Map();
        /** @type {Set<string>} tokenIds currently being synced */
        this._syncLocks = new Set();
    }

    static get isInstalled() {
        return game.modules.has(this.MODULE_ID);
    }

    static get isActive() {
        return game.modules.get(this.MODULE_ID)?.active ?? false;
    }

    static get version() {
        return game.modules.get(this.MODULE_ID)?.version ?? null;
    }

    static get isCompatible() {
        if (!this.isActive) return false;
        const current = this.version;
        if (!current) return true;
        return !foundry.utils.isNewerVersion(this.MIN_VERSION, current);
    }

    registerHooks() {
        if (!LuminanceIntegration.isActive) {
            Logger.log("LuminanceIntegration | ionrift-luminance is not active, skipping hooks.");
            return;
        }

        if (!LuminanceIntegration.isCompatible) {
            Logger.warn(`LuminanceIntegration | ionrift-luminance is outdated (v${LuminanceIntegration.version} installed, v${LuminanceIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("LuminanceIntegration | Registering Luminance handheld torch sound hooks.");

        // 1. Explicit hook from Luminance FuelEngine / BlowoutEngine
        Hooks.on("ionrift.luminance.torchStateChanged", async (data = {}) => {
            if (!game.user?.isGM || !canvas?.scene) return;
            await this._onTorchStateChanged(data);
        });

        // 2. Item flag / equip changes on actors (e.g. player toggling torch on character sheet or HUD)
        Hooks.on("updateItem", async (item, change) => {
            if (!game.user?.isGM || !canvas?.scene) return;
            const actor = item?.parent;
            if (!actor || actor.documentName !== "Actor") return;
            if (!this._isTorchItem(item)) return;

            const lumFlags = change?.flags?.["ionrift-luminance"];
            const sysEquipped = change?.system?.equipped;
            const sysQuantity = change?.system?.quantity;
            if (!lumFlags && sysEquipped === undefined && sysQuantity === undefined) return;

            const tokens = actor.getActiveTokens?.(true, true) ?? [];
            for (const tokenDoc of tokens) {
                const nowHoldingTorch = this._tokenHasLitTorch(tokenDoc);
                const hasEmitters = this._getTokenTorchEmitters(tokenDoc.id).length > 0;
                if (nowHoldingTorch && !hasEmitters && !this._loopDelayTimers.has(tokenDoc.id)) {
                    const justIgnited = lumFlags?.isLit === true || lumFlags?.commandLightActive === true || sysEquipped === true;
                    await this._onTorchStateChanged({
                        actor,
                        token: tokenDoc,
                        item,
                        lit: true,
                        ignite: justIgnited
                    });
                } else if (!nowHoldingTorch && (hasEmitters || this._loopDelayTimers.has(tokenDoc.id))) {
                    const justExtinguished = lumFlags?.isLit === false || lumFlags?.commandLightActive === false || sysEquipped === false;
                    await this._onTorchStateChanged({
                        actor,
                        token: tokenDoc,
                        item,
                        lit: false,
                        extinguish: justExtinguished
                    });
                }
            }
        });

        Hooks.on("deleteItem", async (item) => {
            if (!game.user?.isGM || !canvas?.scene) return;
            const actor = item?.parent;
            if (!actor || actor.documentName !== "Actor") return;
            if (!this._isTorchItem(item)) return;

            const tokens = actor.getActiveTokens?.(true, true) ?? [];
            for (const tokenDoc of tokens) {
                if (!this._tokenHasLitTorch(tokenDoc)) {
                    this._cancelLoopDelay(tokenDoc.id);
                    await this._removeTorchEmittersForToken(tokenDoc.id);
                }
            }
        });

        // 3. Token position and light state updates
        Hooks.on("updateToken", async (tokenDoc, change) => {
            if (!game.user?.isGM || !canvas?.scene) return;

            // A. Position changed -> move any attached torch emitter smoothly
            if (change.x !== undefined || change.y !== undefined) {
                await this._moveTorchEmittersForToken(tokenDoc);
            }

            // B. Light turned completely off (e.g. Blowout or manual light reset)
            if (change.light && (change.light.dim === 0 || change.light.bright === 0)) {
                const dim = tokenDoc.light?.dim ?? 0;
                const bright = tokenDoc.light?.bright ?? 0;
                if (dim <= 0 && bright <= 0) {
                    const existing = this._getTokenTorchEmitters(tokenDoc.id);
                    if (existing.length > 0 || this._loopDelayTimers.has(tokenDoc.id)) {
                        this._cancelLoopDelay(tokenDoc.id);
                        await this._removeTorchEmittersForToken(tokenDoc.id);
                    }
                }
            }
        });

        // 4. Clean up emitters if a token is deleted from the scene
        Hooks.on("deleteToken", async (tokenDoc) => {
            if (!game.user?.isGM || !canvas?.scene) return;
            this._cancelLoopDelay(tokenDoc.id);
            await this._removeTorchEmittersForToken(tokenDoc.id);
        });

        // 5. Reconcile scene emitters on canvasReady so lit torches always have their spatial loop
        Hooks.on("canvasReady", async () => {
            if (!game.user?.isGM || !canvas?.scene) return;
            await this._reconcileSceneTorches();
        });
    }

    /**
     * Handle a torch ignition or extinguish state change for a token.
     * @param {{ actor?: Actor, token?: Token|TokenDocument, item?: Item, lit?: boolean, ignite?: boolean, extinguish?: boolean }} data
     */
    async _onTorchStateChanged(data = {}) {
        const tokenDoc = this._resolveTokenDoc(data.token, data.actor);
        if (!tokenDoc) return;

        if (data.item && !this._isTorchItem(data.item)) return;

        const isLit = data.lit !== undefined ? Boolean(data.lit) : this._tokenHasLitTorch(tokenDoc);

        if (isLit) {
            if (data.ignite) {
                this._playTorchSting(SOUND_EVENTS.LUMINANCE_TORCH_LIT, tokenDoc);
                this._cancelLoopDelay(tokenDoc.id);
                const timer = setTimeout(() => {
                    this._loopDelayTimers.delete(tokenDoc.id);
                    if (this._tokenHasLitTorch(tokenDoc)) {
                        void this._syncTorchEmittersForToken(tokenDoc);
                    }
                }, LuminanceIntegration.TORCH_LIT_LEAD_MS);
                this._loopDelayTimers.set(tokenDoc.id, timer);
            } else {
                await this._syncTorchEmittersForToken(tokenDoc);
            }
        } else {
            const hadPending = this._loopDelayTimers.has(tokenDoc.id);
            this._cancelLoopDelay(tokenDoc.id);
            const hadEmitters = this._getTokenTorchEmitters(tokenDoc.id).length > 0;
            if (data.extinguish && (hadEmitters || hadPending)) {
                this._playTorchSting(SOUND_EVENTS.LUMINANCE_TORCH_EXTINGUISH, tokenDoc);
            }
            await this._removeTorchEmittersForToken(tokenDoc.id);
        }
    }

    /**
     * Play one-shot torch ignition or extinguish cue at the token's spatial position.
     * @param {string} eventKey
     * @param {TokenDocument} tokenDoc
     */
    _playTorchSting(eventKey, tokenDoc) {
        if (!game.user?.isGM || !tokenDoc) return false;
        const debounceKey = `${tokenDoc.id}:${eventKey}`;
        const now = Date.now();
        const last = this._lastCueAt.get(debounceKey) ?? 0;
        if (now - last < 1200) return false;

        const resolved = this.handler.resolver.resolveKeyDirect(eventKey);
        if (!resolved) return false;

        this._lastCueAt.set(debounceKey, now);
        const origin = originFromToken(tokenDoc);
        Logger.log(`LuminanceIntegration | Playing ${eventKey} for token ${tokenDoc.name}`);
        this.handler.play(eventKey, origin ? { origin } : 0);
        return true;
    }

    /**
     * Create or synchronize the single AmbientSound torch loop emitter at the token's center coordinates.
     * @param {TokenDocument} tokenDoc
     */
    async _syncTorchEmittersForToken(tokenDoc) {
        const scene = canvas?.scene;
        if (!scene || !tokenDoc) return;
        if (this._syncLocks.has(tokenDoc.id)) return;
        this._syncLocks.add(tokenDoc.id);

        try {
            const { centerX, centerY } = this._getTokenCenter(tokenDoc);
            const existing = this._getTokenTorchEmitters(tokenDoc.id);

            // If multiple legacy emitters exist on this token, remove extras and keep at most one
            if (existing.length > 1) {
                const extras = existing.slice(1).map(s => s.id);
                await scene.deleteEmbeddedDocuments("AmbientSound", extras);
            }

            const currentEmitter = existing[0] ?? null;
            if (currentEmitter) {
                if (currentEmitter.x !== centerX || currentEmitter.y !== centerY) {
                    await scene.updateEmbeddedDocuments("AmbientSound", [{
                        _id: currentEmitter.id,
                        x: centerX,
                        y: centerY
                    }]);
                }
                return;
            }

            const resolved = this.handler.resolver.resolveKey(SOUND_EVENTS.LUMINANCE_TORCH_LOOP);
            const isFilePath = typeof resolved === "string" && (resolved.includes("/") || /\.(wav|mp3|ogg|flac|webm)$/i.test(resolved));
            if (!isFilePath) return;

            await scene.createEmbeddedDocuments("AmbientSound", [{
                path: resolved,
                x: centerX,
                y: centerY,
                radius: LuminanceIntegration.TORCH_AUDIO_RADIUS,
                easing: true,
                walls: true,
                repeat: true,
                volume: LuminanceIntegration.TORCH_LOOP_VOLUME,
                flags: {
                    "ionrift-resonance": {
                        isTorchEmitter: true,
                        torchTokenId: tokenDoc.id
                    }
                }
            }]);
            Logger.log(`LuminanceIntegration | Spawned handheld torch loop (${resolved}) on ${tokenDoc.name} at (${centerX}, ${centerY})`);
        } finally {
            this._syncLocks.delete(tokenDoc.id);
        }
    }

    /**
     * Smoothly move existing torch emitter when a token moves on the canvas.
     * Only updates `(x, y)` so the audio loop keeps playing without restarting.
     * @param {TokenDocument} tokenDoc
     */
    async _moveTorchEmittersForToken(tokenDoc) {
        const scene = canvas?.scene;
        if (!scene || !tokenDoc) return;

        const existing = this._getTokenTorchEmitters(tokenDoc.id);
        if (existing.length === 0) return;

        const { centerX, centerY } = this._getTokenCenter(tokenDoc);
        const updates = [];
        for (const emitter of existing) {
            if (emitter.x !== centerX || emitter.y !== centerY) {
                updates.push({
                    _id: emitter.id,
                    x: centerX,
                    y: centerY
                });
            }
        }

        if (updates.length > 0) {
            await scene.updateEmbeddedDocuments("AmbientSound", updates);
        }
    }

    /**
     * Remove any torch emitter associated with a token ID.
     * @param {string} tokenId
     */
    async _removeTorchEmittersForToken(tokenId) {
        const scene = canvas?.scene;
        if (!scene || !tokenId) return;

        const existing = this._getTokenTorchEmitters(tokenId);
        if (existing.length > 0) {
            await scene.deleteEmbeddedDocuments("AmbientSound", existing.map(s => s.id));
            Logger.log(`LuminanceIntegration | Removed torch loop emitter for token ${tokenId}`);
        }
    }

    /**
     * Reconcile all tokens and torch emitters on the active scene (runs on canvasReady).
     */
    async _reconcileSceneTorches() {
        const scene = canvas?.scene;
        if (!scene) return;

        const activeTorchTokenIds = new Set();
        for (const tokenDoc of scene.tokens) {
            if (this._tokenHasLitTorch(tokenDoc)) {
                activeTorchTokenIds.add(tokenDoc.id);
                await this._syncTorchEmittersForToken(tokenDoc);
            }
        }

        // Clean up any orphaned torch emitters whose token no longer exists or is no longer holding a lit torch
        const orphanedIds = [];
        for (const soundDoc of scene.sounds) {
            const flags = soundDoc.flags?.["ionrift-resonance"];
            if (!flags?.isTorchEmitter) continue;
            if (!flags.torchTokenId || !activeTorchTokenIds.has(flags.torchTokenId)) {
                orphanedIds.push(soundDoc.id);
            }
        }

        if (orphanedIds.length > 0) {
            await scene.deleteEmbeddedDocuments("AmbientSound", orphanedIds);
            Logger.log(`LuminanceIntegration | Cleaned up ${orphanedIds.length} orphaned torch emitter(s).`);
        }
    }

    /**
     * Return all AmbientSound documents on the current scene belonging to a token's handheld torch.
     * @param {string} tokenId
     * @returns {AmbientSoundDocument[]}
     */
    _getTokenTorchEmitters(tokenId) {
        const scene = canvas?.scene;
        if (!scene || !tokenId) return [];
        return scene.sounds.filter(s => {
            const flags = s.flags?.["ionrift-resonance"];
            return flags?.isTorchEmitter === true && flags?.torchTokenId === tokenId;
        });
    }

    /**
     * Check whether an Item is a handheld torch (rather than a lantern, candle, or spell).
     * @param {Item} item
     * @returns {boolean}
     */
    _isTorchItem(item) {
        if (!item) return false;
        const fuelType = item.getFlag?.("ionrift-luminance", "fuelType");
        if (fuelType === "torch") return true;
        const name = (item.name ?? "").toLowerCase();
        return /\btorch\b/.test(name);
    }

    /**
     * Check whether a TokenDocument currently has a lit handheld torch in hand.
     * @param {TokenDocument} tokenDoc
     * @returns {boolean}
     */
    _tokenHasLitTorch(tokenDoc) {
        if (!tokenDoc) return false;
        const actor = tokenDoc.actor;
        if (!actor?.items) return false;

        for (const item of actor.items) {
            if (!this._isTorchItem(item)) continue;
            const isLit = item.getFlag?.("ionrift-luminance", "isLit") === true
                || item.getFlag?.("ionrift-luminance", "commandLightActive") === true
                || (item.system?.equipped === true && (tokenDoc.light?.animation?.type === "torch") && ((tokenDoc.light?.dim ?? 0) > 0 || (tokenDoc.light?.bright ?? 0) > 0));
            if (isLit) return true;
        }
        return false;
    }

    /**
     * Compute pixel center of a TokenDocument on the active canvas.
     * @param {TokenDocument} tokenDoc
     * @returns {{ centerX: number, centerY: number }}
     */
    _getTokenCenter(tokenDoc) {
        const gs = canvas.dimensions?.size ?? 100;
        const width = tokenDoc.width ?? 1;
        const height = tokenDoc.height ?? 1;
        const centerX = Math.round(tokenDoc.x + (width * gs) / 2);
        const centerY = Math.round(tokenDoc.y + (height * gs) / 2);
        return { centerX, centerY };
    }

    /**
     * Resolve a TokenDocument from a Token placeable, TokenDocument, or Actor.
     * @param {Token|TokenDocument|null} token
     * @param {Actor|null} actor
     * @returns {TokenDocument|null}
     */
    _resolveTokenDoc(token, actor) {
        if (token) return token.document ?? token;
        if (actor) {
            const active = actor.getActiveTokens?.(true, true)?.[0];
            if (active) return active.document ?? active;
        }
        return null;
    }

    _cancelLoopDelay(tokenId) {
        const timer = this._loopDelayTimers.get(tokenId);
        if (timer) {
            clearTimeout(timer);
            this._loopDelayTimers.delete(tokenId);
        }
    }
}
