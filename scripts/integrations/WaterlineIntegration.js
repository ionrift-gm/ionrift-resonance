import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * WaterlineIntegration
 * Couples Ionrift Waterline regions with Ionrift Resonance spatial water movement foley:
 *   - WATERLINE_ENTER: Token steps from dry land into a water body
 *   - WATERLINE_WADE:  Token moves/sloshes from one water space to another
 *   - WATERLINE_EXIT:  Token steps out of a water body onto dry land
 *
 * Tracks TokenDocument coordinates across canvasReady, createToken, preUpdateToken,
 * and updateToken, evaluating points against WaterManager.isPointInWater (with a
 * synchronous RegionDocument#testPoint fallback while shaders are warming up).
 */
export class WaterlineIntegration {
    static MODULE_ID = "ionrift-waterline";
    static MIN_VERSION = "1.0.0";
    static HOOK_PREFIX = "ionrift-waterline";
    /** Cadence between discrete footsteps when a token drags across multiple water squares. */
    static STEP_CADENCE_MS = 320;
    /** Maximum queued water footsteps for a single multi-square drag move. */
    static MAX_DRAG_STEPS = 4;
    /** Minimum interval between immediate single-step triggers on the same token. */
    static DEBOUNCE_MS = 160;

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        /** @type {Map<string, { x: number, y: number, elevation: number }>} tokenId -> center */
        this._tokenPositions = new Map();
        /** @type {Map<string, number>} tokenId -> timestamp */
        this._lastStepAt = new Map();
        /** @type {Map<string, Set<ReturnType<typeof setTimeout>>>} tokenId -> active timers */
        this._stepTimers = new Map();
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
        if (!WaterlineIntegration.isActive) {
            Logger.log("WaterlineIntegration | ionrift-waterline is not active, skipping hooks.");
            return;
        }

        if (!WaterlineIntegration.isCompatible) {
            Logger.warn(`WaterlineIntegration | ionrift-waterline is outdated (v${WaterlineIntegration.version} installed, v${WaterlineIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("WaterlineIntegration | Registering Waterline movement sound hooks.");

        // 1. Seed token positions on canvasReady (and immediately if canvas is already ready)
        if (canvas?.ready) {
            this._snapshotSceneTokens();
        }
        Hooks.on("canvasReady", () => {
            this._clearAllTimers();
            this._snapshotSceneTokens();
        });

        // 2. Keep token position map synced across token lifecycle
        Hooks.on("createToken", (tokenDoc) => {
            if (!tokenDoc?.id) return;
            this._tokenPositions.set(tokenDoc.id, this._getTokenCenter(tokenDoc));
        });

        Hooks.on("deleteToken", (tokenDoc) => {
            if (!tokenDoc?.id) return;
            this._cancelTokenTimers(tokenDoc.id);
            this._tokenPositions.delete(tokenDoc.id);
            this._lastStepAt.delete(tokenDoc.id);
        });

        Hooks.on("preUpdateToken", (tokenDoc, change) => {
            if (!tokenDoc?.id) return;
            if (change.x === undefined && change.y === undefined && change.elevation === undefined) return;
            if (!this._tokenPositions.has(tokenDoc.id)) {
                this._tokenPositions.set(tokenDoc.id, this._getTokenCenter(tokenDoc));
            }
        });

        // 3. Evaluate water entry, wading, and exit on token movement
        Hooks.on("updateToken", (tokenDoc, change, options) => {
            this._onUpdateToken(tokenDoc, change, options);
        });

        // 4. Explicit hook listeners for external / macro triggers
        const onExplicit = (name, key) => {
            const handler = (data = {}) => {
                if (!game.user?.isGM) return;
                const origin = data.origin
                    || (data.tokenDoc ? this._getTokenCenter(data.tokenDoc) : undefined);
                this._playWaterCue(key, origin);
            };
            Hooks.on(`${WaterlineIntegration.HOOK_PREFIX}.${name}`, handler);
            Hooks.on(`waterline.${name}`, handler);
        };

        onExplicit("waterEnter", SOUND_EVENTS.WATERLINE_ENTER);
        onExplicit("waterWade", SOUND_EVENTS.WATERLINE_WADE);
        onExplicit("waterExit", SOUND_EVENTS.WATERLINE_EXIT);
    }

    /**
     * Handle token position updates and emit appropriate Enter / Wade / Exit cues.
     * @param {TokenDocument} tokenDoc
     * @param {object} change
     * @param {object} [options]
     */
    _onUpdateToken(tokenDoc, change, options = {}) {
        if (!tokenDoc?.id || !canvas?.scene) return;
        if (change.x === undefined && change.y === undefined && change.elevation === undefined) return;

        const oldPos = this._tokenPositions.get(tokenDoc.id);
        const newPos = this._getTokenCenter(tokenDoc);
        this._tokenPositions.set(tokenDoc.id, newPos);

        // Only the active GM triggers broadcast playback so all clients hear a single unified cue
        if (!game.user?.isGM) return;
        if (!oldPos) return;

        // Do not leak splash audio for GM-hidden tokens or tokens opting out of water ripples (e.g. flying / boats)
        if (tokenDoc.hidden) return;
        if (tokenDoc.getFlag?.(WaterlineIntegration.MODULE_ID, "noRipple")) return;

        const dx = newPos.x - oldPos.x;
        const dy = newPos.y - oldPos.y;
        const distPx = Math.hypot(dx, dy);
        const gridSize = canvas.grid?.size ?? canvas.dimensions?.size ?? 100;

        // Ignore sub-pixel jitter
        if (distPx < Math.max(4, gridSize * 0.15) && oldPos.elevation === newPos.elevation) return;

        // Ignore long teleports or non-animated jumps across the map
        if (options?.teleport === true || distPx > gridSize * 10) {
            this._cancelTokenTimers(tokenDoc.id);
            return;
        }

        const numSteps = Math.max(1, Math.min(8, Math.round(distPx / gridSize)));
        let prevWet = this._isPointInWater(oldPos.x, oldPos.y, oldPos.elevation);

        /** @type {Array<{ key: string, origin: { x: number, y: number } }>} */
        const rawEvents = [];

        for (let i = 1; i <= numSteps; i++) {
            const t = i / numSteps;
            const sx = Math.round(oldPos.x + dx * t);
            const sy = Math.round(oldPos.y + dy * t);
            const currWet = this._isPointInWater(sx, sy, newPos.elevation);

            if (!prevWet && currWet) {
                rawEvents.push({ key: SOUND_EVENTS.WATERLINE_ENTER, origin: { x: sx, y: sy } });
            } else if (prevWet && currWet) {
                rawEvents.push({ key: SOUND_EVENTS.WATERLINE_WADE, origin: { x: sx, y: sy } });
            } else if (prevWet && !currWet) {
                rawEvents.push({ key: SOUND_EVENTS.WATERLINE_EXIT, origin: { x: sx, y: sy } });
            }
            prevWet = currWet;
        }

        if (rawEvents.length === 0) return;

        // Cancel any earlier queued steps from a previous move on this token
        this._cancelTokenTimers(tokenDoc.id);

        // Cap multi-step drag sequences so long drags stay discreet while preserving Enter/Exit transitions
        const events = this._capDragEvents(rawEvents, WaterlineIntegration.MAX_DRAG_STEPS);

        if (events.length === 1) {
            const now = Date.now();
            const last = this._lastStepAt.get(tokenDoc.id) ?? 0;
            if (now - last < WaterlineIntegration.DEBOUNCE_MS) return;
            this._lastStepAt.set(tokenDoc.id, now);
            this._playWaterCue(events[0].key, events[0].origin);
            return;
        }

        // Schedule multi-square drag steps along the token's movement cadence
        const timerSet = new Set();
        this._stepTimers.set(tokenDoc.id, timerSet);

        events.forEach((ev, idx) => {
            const delayMs = idx * WaterlineIntegration.STEP_CADENCE_MS;
            if (delayMs === 0) {
                this._lastStepAt.set(tokenDoc.id, Date.now());
                this._playWaterCue(ev.key, ev.origin);
            } else {
                const timer = setTimeout(() => {
                    timerSet.delete(timer);
                    if (timerSet.size === 0) this._stepTimers.delete(tokenDoc.id);
                    if (!canvas?.scene || tokenDoc.hidden) return;
                    this._lastStepAt.set(tokenDoc.id, Date.now());
                    this._playWaterCue(ev.key, ev.origin);
                }, delayMs);
                timerSet.add(timer);
            }
        });
    }

    /**
     * Play a resolved water cue with spatial origin if bound.
     * @param {string} key
     * @param {{ x: number, y: number }|undefined} origin
     */
    _playWaterCue(key, origin) {
        if (!key) return;
        const resolved = this.handler.resolver.resolveKeyDirect(key);
        if (!resolved) return;

        Logger.log(`WaterlineIntegration | Playing ${key}`, origin);
        this.handler.play(key, {
            origin: origin ? { x: origin.x, y: origin.y } : undefined
        });
    }

    /**
     * Trim a multi-step drag event list to at most `maxSteps`, preserving Enter and Exit boundary cues.
     * @param {Array<{ key: string, origin: { x: number, y: number } }>} events
     * @param {number} maxSteps
     */
    _capDragEvents(events, maxSteps) {
        if (events.length <= maxSteps) return events;
        const first = events[0];
        const last = events[events.length - 1];
        const middleBudget = Math.max(0, maxSteps - 2);
        const middlePool = events.slice(1, -1);
        const pickedMiddle = [];
        for (let i = 0; i < middleBudget && i < middlePool.length; i++) {
            const idx = Math.floor(((i + 0.5) / middleBudget) * middlePool.length);
            pickedMiddle.push(middlePool[idx]);
        }
        return [first, ...pickedMiddle, last];
    }

    /**
     * Test whether a canvas world point is inside an active Waterline water body.
     * Uses WaterManager.isPointInWater first, falling back to RegionDocument#testPoint
     * if WaterManager polygons are still initializing after canvasReady.
     * @param {number} x
     * @param {number} y
     * @param {number} [elevation=0]
     * @returns {boolean}
     */
    _isPointInWater(x, y, elevation = 0) {
        const wm = game.ionrift?.waterManager ?? globalThis.WaterManager;
        if (typeof wm?.isPointInWater === "function") {
            if (wm.isPointInWater(x, y, elevation)) return true;
        }

        // Synchronous fallback via scene RegionDocuments with active waterFX behaviors
        const regions = canvas?.scene?.regions;
        if (!regions) return false;
        for (const regionDoc of regions) {
            const behaviors = regionDoc.behaviors?.contents ?? regionDoc.behaviors ?? [];
            let hasWaterBehavior = false;
            for (const b of behaviors) {
                if (b?.type === `${WaterlineIntegration.MODULE_ID}.waterFX` && !b.disabled) {
                    hasWaterBehavior = true;
                    break;
                }
            }
            if (!hasWaterBehavior) continue;
            if (typeof regionDoc.testPoint === "function") {
                try {
                    if (regionDoc.testPoint({ x, y, elevation: elevation ?? 0 })) return true;
                } catch { /* ignore */ }
            }
        }
        return false;
    }

    /**
     * Snapshot current centers for all tokens on the active scene.
     */
    _snapshotSceneTokens() {
        this._tokenPositions.clear();
        const tokens = canvas?.scene?.tokens ?? [];
        for (const tokenDoc of tokens) {
            if (!tokenDoc?.id) continue;
            this._tokenPositions.set(tokenDoc.id, this._getTokenCenter(tokenDoc));
        }
    }

    /**
     * Compute world-space pixel center and elevation for a TokenDocument.
     * @param {TokenDocument} tokenDoc
     * @returns {{ x: number, y: number, elevation: number }}
     */
    _getTokenCenter(tokenDoc) {
        const gs = canvas?.dimensions?.size ?? canvas?.grid?.size ?? 100;
        const width = tokenDoc.width ?? 1;
        const height = tokenDoc.height ?? 1;
        return {
            x: Math.round((tokenDoc.x ?? 0) + (width * gs) / 2),
            y: Math.round((tokenDoc.y ?? 0) + (height * gs) / 2),
            elevation: tokenDoc.elevation ?? 0
        };
    }

    _cancelTokenTimers(tokenId) {
        const timers = this._stepTimers.get(tokenId);
        if (!timers) return;
        for (const t of timers) clearTimeout(t);
        this._stepTimers.delete(tokenId);
    }

    _clearAllTimers() {
        for (const timers of this._stepTimers.values()) {
            for (const t of timers) clearTimeout(t);
        }
        this._stepTimers.clear();
    }
}
