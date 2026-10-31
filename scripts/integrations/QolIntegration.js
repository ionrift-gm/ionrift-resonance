import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * QolIntegration
 * Couples Ionrift QOL cinematic story moments with bespoke Resonance chapter stingers
 * and the campaign lobby bookend theme:
 *   - QOL_CINEMATIC_LOBBY_THEME: Lobby & Campaign Theme Bookend (intro/outro connecting bars)
 *   - QOL_CINEMATIC_INTRO:       Chapter Reveal (standard arrival stinger)
 *   - QOL_CINEMATIC_OMINOUS:     Ominous & Foreboding (crypts, dungeons, threats)
 *   - QOL_CINEMATIC_HEROIC:      Vista & Discovery (landmarks, sanctuaries, grand reveals)
 *   - QOL_CINEMATIC_MYSTERY:     Mystery & Arcane (ancient ruins, sanctums, secrets)
 *   - QOL_CINEMATIC_DANGER:      Peril & Ambush (boss arenas, lairs, sudden danger)
 *   - QOL_CINEMATIC_TRIUMPH:     Triumph & Milestone (story beats, chapter completions)
 */
export class QolIntegration {
    static MODULE_ID = "ionrift-qol";
    static MIN_VERSION = "0.1.0";
    static HOOK_PREFIX = "ionrift-qol";

    static ALLOWED_KEYS = new Set([
        SOUND_EVENTS.QOL_CINEMATIC_LOBBY_THEME,
        SOUND_EVENTS.QOL_CINEMATIC_INTRO,
        SOUND_EVENTS.QOL_CINEMATIC_OMINOUS,
        SOUND_EVENTS.QOL_CINEMATIC_HEROIC,
        SOUND_EVENTS.QOL_CINEMATIC_MYSTERY,
        SOUND_EVENTS.QOL_CINEMATIC_DANGER,
        SOUND_EVENTS.QOL_CINEMATIC_TRIUMPH
    ]);

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
        if (!QolIntegration.isActive) {
            Logger.log("QolIntegration | ionrift-qol is not active, skipping hooks.");
            return;
        }

        if (!QolIntegration.isCompatible) {
            Logger.warn(`QolIntegration | ionrift-qol is outdated (v${QolIntegration.version} installed, v${QolIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("QolIntegration | Registering Ionrift QOL cinematic stinger sound hooks.");

        Hooks.on(`${QolIntegration.HOOK_PREFIX}.cinematicStinger`, (data = {}) => {
            const rawKey = typeof data === "string" ? data : data?.key;
            if (!rawKey) return;
            const key = SOUND_EVENTS[rawKey] || rawKey;
            Logger.log(`QolIntegration | cinematicStinger -> ${key}`, data);

            if (data?.broadcast === true) {
                this.handler.play(key);
            } else {
                this.handler.playLocal(key);
            }
        });
    }
}
