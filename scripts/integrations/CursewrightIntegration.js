import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * CursewrightIntegration
 * Listens to Ionrift Cursewright curse moments and routes each to its audience.
 *
 * Cursewright fires every `ionrift-cursewright.*` hook once, on the primary GM,
 * so listeners gate to the GM and pick the audience from there:
 *   - Bearer only: playTargeted to the bearer's players (GM hears it if no player owns the bearer).
 *   - GM only: playLocal on the GM client (secret progress the table should not hear).
 *   - Everyone: play() broadcast.
 * Unbound keys stay silent. No default bindings are seeded.
 */
export class CursewrightIntegration {
    static MODULE_ID = "ionrift-cursewright";
    static MIN_VERSION = "1.3.0";
    static HOOK_PREFIX = "ionrift-cursewright";

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

    registerHooks() {
        if (!CursewrightIntegration.isActive) {
            Logger.log("CursewrightIntegration | ionrift-cursewright is not active, skipping hooks.");
            return;
        }

        if (!CursewrightIntegration.isCompatible) {
            Logger.warn(`CursewrightIntegration | ionrift-cursewright is outdated (v${CursewrightIntegration.version} installed, v${CursewrightIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("CursewrightIntegration | Registering Cursewright sound hooks.");

        const on = (name, fn) => {
            Hooks.on(`${CursewrightIntegration.HOOK_PREFIX}.${name}`, (...args) => {
                if (!game.user?.isGM) return;
                fn(...args);
            });
        };

        // Bearer only
        on("removalAttempted", (data = {}) => {
            this._playToBearer(SOUND_EVENTS.CURSEWRIGHT_REMOVAL_ATTEMPTED, data.ownerUserIds);
        });

        on("whisperSent", (data = {}) => {
            const recipients = Array.isArray(data.recipientIds) && data.recipientIds.length
                ? data.recipientIds
                : data.ownerUserIds;
            this._playToBearer(SOUND_EVENTS.CURSEWRIGHT_WHISPER_SENT, recipients);
        });

        // GM only
        on("curseLocked", () => this._playToGM(SOUND_EVENTS.CURSEWRIGHT_CURSE_LOCKED));
        on("phaseAdvanced", () => this._playToGM(SOUND_EVENTS.CURSEWRIGHT_PHASE_ADVANCED));
        on("devoured", () => this._playToGM(SOUND_EVENTS.CURSEWRIGHT_DEVOURED));

        // Everyone
        on("curseActivated", () => this._playToTable(SOUND_EVENTS.CURSEWRIGHT_CURSE_ACTIVATED));

        on("devourReveal", (data = {}) => {
            const key = data.stage === "full"
                ? SOUND_EVENTS.CURSEWRIGHT_DEVOUR_REVEAL_FULL
                : SOUND_EVENTS.CURSEWRIGHT_DEVOUR_REVEAL_FIRST;
            this._playToTable(key);
        });

        on("armPull", (data = {}) => {
            this._playToTable(CursewrightIntegration.armPullSoundKey(data.stage));
        });

        on("detonation", () => this._playToTable(SOUND_EVENTS.CURSEWRIGHT_DETONATION));
        on("tributeDemanded", () => this._playToTable(SOUND_EVENTS.CURSEWRIGHT_TRIBUTE_DEMANDED));
        on("tributeMissed", () => this._playToTable(SOUND_EVENTS.CURSEWRIGHT_TRIBUTE_MISSED));

        on("removeCurseResolved", (...args) => {
            const key = CursewrightIntegration.isRemovalResisted(...args)
                ? SOUND_EVENTS.CURSEWRIGHT_CURSE_RESISTED
                : SOUND_EVENTS.CURSEWRIGHT_CURSE_BROKEN;
            this._playToTable(key);
        });
    }

    /**
     * Arm pull stage to sound key. grip before each save, caught when the
     * first save fails, pulled when the bearer is dragged inside.
     * @param {string} stage
     * @returns {string}
     */
    static armPullSoundKey(stage) {
        if (stage === "pulled") return SOUND_EVENTS.CURSEWRIGHT_ARM_PULLED;
        if (stage === "caught") return SOUND_EVENTS.CURSEWRIGHT_ARM_CAUGHT;
        return SOUND_EVENTS.CURSEWRIGHT_ARM_GRIP;
    }

    /**
     * Remove Curse outcome. Supports both the standard payload object and the
     * older positional form `(actor, results, spellLevel)`.
     * Resisted only when every item resisted; any break counts as broken.
     * @returns {boolean}
     */
    static isRemovalResisted(first, second) {
        const results = Array.isArray(second)
            ? second
            : (Array.isArray(first?.results) ? first.results : null);
        if (results) {
            if (!results.length) return false;
            return results.every(r => !!(r?.resisted ?? r?.outcome?.resisted));
        }
        if (typeof first?.resisted === "boolean") return first.resisted;
        if (typeof first?.outcome?.resisted === "boolean") return first.outcome.resisted;
        return false;
    }

    _playToBearer(key, recipientIds) {
        const recipients = (Array.isArray(recipientIds) ? recipientIds : [])
            .filter(id => typeof id === "string" && id.length);
        if (!recipients.length) {
            Logger.log(`CursewrightIntegration | ${key}: no player bearer, playing for GM.`);
            this.handler.playLocal(key);
            return;
        }
        Logger.log(`CursewrightIntegration | ${key} -> bearer (${recipients.join(", ")})`);
        this.handler.playTargeted(recipients, key);
    }

    _playToGM(key) {
        Logger.log(`CursewrightIntegration | ${key} -> GM only`);
        this.handler.playLocal(key);
    }

    _playToTable(key) {
        Logger.log(`CursewrightIntegration | ${key} -> everyone`);
        this.handler.play(key);
    }
}
