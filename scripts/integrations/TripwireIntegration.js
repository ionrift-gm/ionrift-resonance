import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * TripwireIntegration
 * Listens to Ionrift Tripwire doors, locks, and trap moments.
 *
 * Tripwire fires hooks on the GM client or during game actions,
 * so listeners gate to the primary GM and trigger audio via Resonance:
 *   - Door Opened: play DOOR_WOOD_OPEN / DOOR_IRON_OPEN / DOOR_STONE_OPEN with spatial origin
 *   - Door Closed: play DOOR_WOOD_CLOSE / DOOR_IRON_CLOSE / DOOR_STONE_CLOSE with spatial origin
 *   - Lock Locked: play LOCK_LOCKED with spatial origin at the lockable
 *   - Lock Unlocked: play LOCK_PICK_SUCCESS (when route === "pick") or LOCK_UNLOCKED
 *   - Trap Disarmed: play TRAP_DISARM_SUCCESS with spatial origin at the hazard
 *   - Trap Triggered: play type-specific trap sound (TRAP_DARTS, TRAP_PIT, TRAP_ROCKFALL,
 *     TRAP_SPEARS, TRAP_SNAPPING, TRAP_TELEPORT, TRAP_MAGICAL) or TRIPWIRE_TRAP_SPRING
 */
export class TripwireIntegration {
    static MODULE_ID = "ionrift-tripwire";
    static MIN_VERSION = "0.1.0";
    static HOOK_PREFIX = "ionrift-tripwire";

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
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

    /**
     * Resolve material-specific door sound key.
     * @param {string} material "wood" | "iron" | "stone"
     * @param {"open"|"close"} action
     * @returns {string}
     */
    static doorSoundKey(material, action = "open") {
        const mat = (material ?? "wood").toLowerCase();
        if (mat === "iron" || mat === "metal" || mat === "vault") {
            return action === "close" ? SOUND_EVENTS.DOOR_IRON_CLOSE : SOUND_EVENTS.DOOR_IRON_OPEN;
        }
        if (mat === "stone") {
            return action === "close" ? SOUND_EVENTS.DOOR_STONE_CLOSE : SOUND_EVENTS.DOOR_STONE_OPEN;
        }
        return action === "close" ? SOUND_EVENTS.DOOR_WOOD_CLOSE : SOUND_EVENTS.DOOR_WOOD_OPEN;
    }

    /**
     * Resolve trap-type-specific sound key.
     * @param {string} trapType
     * @returns {string}
     */
    static trapSoundKey(trapType) {
        const t = (trapType ?? "").toLowerCase();
        if (t === "none" || t === "silent" || t === "mute") return null;
        if (t === "darts" || t === "dart") return SOUND_EVENTS.TRAP_DARTS;
        if (t === "pit") return SOUND_EVENTS.TRAP_PIT;
        if (t === "rockfall" || t === "collapse" || t === "rubble") return SOUND_EVENTS.TRAP_ROCKFALL;
        if (t === "spears" || t === "spear" || t === "spikes") return SOUND_EVENTS.TRAP_SPEARS;
        if (t === "snapping" || t === "snare" || t === "jaws" || t === "beam") return SOUND_EVENTS.TRAP_SNAPPING;
        if (t === "teleport" || t === "portal") return SOUND_EVENTS.TRAP_TELEPORT;
        if (t === "magical" || t === "magic" || t === "glyph" || t === "arcane") return SOUND_EVENTS.TRAP_MAGICAL;
        return SOUND_EVENTS.TRIPWIRE_TRAP_SPRING;
    }

    registerHooks() {
        if (!TripwireIntegration.isActive) {
            Logger.log("TripwireIntegration | ionrift-tripwire is not active, skipping hooks.");
            return;
        }

        if (!TripwireIntegration.isCompatible) {
            Logger.warn(`TripwireIntegration | ionrift-tripwire is outdated (v${TripwireIntegration.version} installed, v${TripwireIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("TripwireIntegration | Registering Tripwire sound hooks.");

        const on = (name, fn) => {
            const wrapped = (...args) => {
                if (!game.user?.isGM) return;
                fn(...args);
            };
            Hooks.on(`${TripwireIntegration.HOOK_PREFIX}.${name}`, wrapped);
            Hooks.on(`tripwire.${name}`, wrapped);
        };

        // Door Opened
        on("doorOpened", (data = {}) => {
            const key = TripwireIntegration.doorSoundKey(data.material, "open");
            Logger.log(`TripwireIntegration | doorOpened (${data.material ?? "wood"}) -> ${key}`, data);
            this.handler.play(key, {
                origin: data.origin || undefined
            });
        });

        // Door Closed
        on("doorClosed", (data = {}) => {
            const key = TripwireIntegration.doorSoundKey(data.material, "close");
            Logger.log(`TripwireIntegration | doorClosed (${data.material ?? "wood"}) -> ${key}`, data);
            this.handler.play(key, {
                origin: data.origin || undefined
            });
        });

        // Lock Locked
        on("lockLocked", (data = {}) => {
            Logger.log("TripwireIntegration | lockLocked -> LOCK_LOCKED", data);
            this.handler.play(SOUND_EVENTS.LOCK_LOCKED, {
                origin: data.origin || undefined
            });
        });

        // Lock Unlocked (or Picked)
        on("lockUnlocked", (data = {}) => {
            const key = data.route === "pick"
                ? SOUND_EVENTS.LOCK_PICK_SUCCESS
                : SOUND_EVENTS.LOCK_UNLOCKED;
            Logger.log(`TripwireIntegration | lockUnlocked (route=${data.route ?? "default"}) -> ${key}`, data);
            this.handler.play(key, {
                origin: data.origin || undefined
            });
        });

        // Trap Disarmed
        on("trapDisarmed", (data = {}) => {
            Logger.log("TripwireIntegration | trapDisarmed -> TRAP_DISARM_SUCCESS", data);
            const origin = data.origin
                || (data.hazardDoc ? { x: data.hazardDoc.x, y: data.hazardDoc.y } : null)
                || (data.tokenDoc ? { x: data.tokenDoc.x, y: data.tokenDoc.y } : null);
            this.handler.play(SOUND_EVENTS.TRAP_DISARM_SUCCESS, {
                origin: origin || undefined
            });
        });

        // Trap Triggered
        on("trapTriggered", (data = {}) => {
            const key = TripwireIntegration.trapSoundKey(data.trapType);
            if (!key) return;
            Logger.log(`TripwireIntegration | trapTriggered (${data.trapType ?? "default"}) -> ${key}`, data);
            const origin = data.origin
                || (data.hazardDoc ? { x: data.hazardDoc.x, y: data.hazardDoc.y } : null)
                || (data.tokenDoc ? { x: data.tokenDoc.x, y: data.tokenDoc.y } : null);
            this.handler.play(key, {
                origin: origin || undefined
            });
        });
    }
}
