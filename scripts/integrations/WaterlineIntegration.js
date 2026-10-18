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
    /** Minimum interval between repeated identical cues on the same token. */
    static DEBOUNCE_MS = 140;

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        /** @type {Map<string, { x: number, y: number, elevation: number }>} tokenId -> canonical center */
        this._tokenPositions = new Map();
        /** @type {Map<string, { x: number, y: number, elevation: number }>} tokenId -> pre-update center */
        this._preUpdatePositions = new Map();
        /** @type {Map<string, { at: number, key: string }>} tokenId -> last cue metadata */
        this._lastStep = new Map();
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
            this._preUpdatePositions.clear();
            this._lastStep.clear();
            this._snapshotSceneTokens();
        });

        // 2. Keep token position map synced across token lifecycle
        Hooks.on("createToken", (tokenDoc) => {
            if (!tokenDoc?.id) return;
            this._tokenPositions.set(tokenDoc.id, this._getTokenCenter(tokenDoc));
        });

        Hooks.on("deleteToken", (tokenDoc) => {
            if (!tokenDoc?.id) return;
            this._preUpdatePositions.delete(tokenDoc.id);
            this._tokenPositions.delete(tokenDoc.id);
            this._lastStep.delete(tokenDoc.id);
        });

        Hooks.on("preUpdateToken", (tokenDoc, change) => {
            if (!tokenDoc?.id) return;
            if (change.x === undefined && change.y === undefined && change.elevation === undefined) return;
            const prePos = this._getTokenCenter(tokenDoc);
            this._preUpdatePositions.set(tokenDoc.id, prePos);
            if (!this._tokenPositions.has(tokenDoc.id)) {
                this._tokenPositions.set(tokenDoc.id, prePos);
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
     * Uses canonical document _source / change coordinates rather than tokenDoc.x/y,
     * because Foundry resets tokenDoc.x/y to the pre-move origin at updateToken time
     * to interpolate canvas movement animations.
     * @param {TokenDocument} tokenDoc
     * @param {object} change
     * @param {object} [options]
     */
    _onUpdateToken(tokenDoc, change, options = {}) {
        if (!tokenDoc?.id || !canvas?.scene) return;
        if (change.x === undefined && change.y === undefined && change.elevation === undefined) return;

        const oldPos = this._preUpdatePositions.get(tokenDoc.id) ?? this._tokenPositions.get(tokenDoc.id);
        this._preUpdatePositions.delete(tokenDoc.id);

        const newPos = this._getTokenCenter(tokenDoc, change);
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
        if (options?.teleport === true || distPx > gridSize * 10) return;

        const startWet = this._isPointInWater(oldPos.x, oldPos.y, oldPos.elevation);
        const endWet = this._isPointInWater(newPos.x, newPos.y, newPos.elevation);

        let cueKey = null;
        let cueOrigin = newPos;

        if (!startWet && endWet) {
            // Stepped from dry land into water
            cueKey = SOUND_EVENTS.WATERLINE_ENTER;
            cueOrigin = newPos;
        } else if (startWet && !endWet) {
            // Stepped out of water onto dry land
            cueKey = SOUND_EVENTS.WATERLINE_EXIT;
            cueOrigin = newPos;
        } else if (startWet && endWet) {
            // Waded from one water position to another
            cueKey = SOUND_EVENTS.WATERLINE_WADE;
            cueOrigin = newPos;
        } else if (distPx > gridSize * 1.75) {
            // Multi-square drag from dry bank to dry bank across a narrow stream
            const midX = Math.round((oldPos.x + newPos.x) / 2);
            const midY = Math.round((oldPos.y + newPos.y) / 2);
            if (this._isPointInWater(midX, midY, newPos.elevation)) {
                cueKey = SOUND_EVENTS.WATERLINE_WADE;
                cueOrigin = { x: midX, y: midY };
            }
        }

        if (!cueKey) return;

        // Only debounce rapid repeats of the same cue; never suppress Enter/Exit boundary transitions
        const now = Date.now();
        const prev = this._lastStep.get(tokenDoc.id);
        if (prev && prev.key === cueKey && (now - prev.at) < WaterlineIntegration.DEBOUNCE_MS) {
            return;
        }
        this._lastStep.set(tokenDoc.id, { at: now, key: cueKey });

        this._playWaterCue(cueKey, cueOrigin);
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
     * Snapshot current canonical centers for all tokens on the active scene.
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
     * Compute world-space pixel center and elevation for a TokenDocument using canonical
     * _source / change coordinates (never the animated tokenDoc.x/y interpolated by Foundry).
     * @param {TokenDocument} tokenDoc
     * @param {object|null} [change=null]
     * @returns {{ x: number, y: number, elevation: number }}
     */
    _getTokenCenter(tokenDoc, change = null) {
        const gs = canvas?.dimensions?.size ?? canvas?.grid?.size ?? 100;
        const width = (change?.width !== undefined)
            ? change.width
            : (tokenDoc._source?.width ?? tokenDoc.width ?? 1);
        const height = (change?.height !== undefined)
            ? change.height
            : (tokenDoc._source?.height ?? tokenDoc.height ?? 1);
        const rawX = (change?.x !== undefined)
            ? change.x
            : (tokenDoc._source?.x ?? tokenDoc.x ?? 0);
        const rawY = (change?.y !== undefined)
            ? change.y
            : (tokenDoc._source?.y ?? tokenDoc.y ?? 0);
        const rawElev = (change?.elevation !== undefined)
            ? change.elevation
            : (tokenDoc._source?.elevation ?? tokenDoc.elevation ?? 0);
        return {
            x: Math.round(rawX + (width * gs) / 2),
            y: Math.round(rawY + (height * gs) / 2),
            elevation: rawElev
        };
    }
}
