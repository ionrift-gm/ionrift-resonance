import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * VoiceIntegration
 * Integrates Ionrift Voice with Resonance to trigger continuous ambient soundscapes
 * for each private whisper type (Light, Neutral, Dark).
 */
export class VoiceIntegration {
    static MIN_VERSION = "0.1.0";

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        this._activeAmbientEvent = null;
    }

    static get isInstalled() {
        return game.modules.has("ionrift-voice");
    }

    static get isActive() {
        return game.modules.get("ionrift-voice")?.active ?? false;
    }

    static get version() {
        return game.modules.get("ionrift-voice")?.version ?? null;
    }

    static get isCompatible() {
        if (!this.isActive) return false;
        const current = this.version;
        if (!current) return true;
        if (typeof foundry !== "undefined" && typeof foundry.utils?.isNewerVersion === "function") {
            return !foundry.utils.isNewerVersion(this.MIN_VERSION, current);
        }
        return true;
    }

    registerHooks() {
        if (!VoiceIntegration.isActive) {
            Logger.log("VoiceIntegration | ionrift-voice is not active, skipping hooks.");
            return;
        }

        if (!VoiceIntegration.isCompatible) {
            Logger.warn(`VoiceIntegration | ionrift-voice is outdated (v${VoiceIntegration.version} installed, v${VoiceIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("VoiceIntegration | Registering Voice sound hooks.");

        // Primary canonical whisper lifecycle hooks
        Hooks.on("ionrift.voice.whisperStart", (data = {}) => this._onWhisperStart(data));
        Hooks.on("ionrift.voice.whisperEnd", (data = {}) => this._onWhisperEnd(data));

        // Profile switch during active locked whisper
        Hooks.on("ionrift.voice.whisperProfileChanged", (data = {}) => this._onWhisperStart(data));

        // Legacy camelCase hook fallbacks
        Hooks.on("ionriftVoiceWhisperStart", (data = {}) => this._onWhisperStart(data));
        Hooks.on("ionriftVoiceWhisperEnd", (data = {}) => this._onWhisperEnd(data));
    }

    /**
     * Maps whisper modes, numeric profile IDs, or semantic names to canonical SOUND_EVENTS.
     * @param {string|number} mode
     * @param {number} [profileMode]
     * @returns {string}
     */
    mapWhisperEvent(mode, profileMode = null) {
        if (profileMode === 1 || mode === "light-whisper" || mode === "light" || mode === 1) {
            return SOUND_EVENTS.VOICE_WHISPER_LIGHT;
        }
        if (profileMode === 3 || mode === "dark-whisper" || mode === "dark" || mode === 3) {
            return SOUND_EVENTS.VOICE_WHISPER_DARK;
        }
        // Neutral / default in-skull telepathy
        return SOUND_EVENTS.VOICE_WHISPER_NEUTRAL;
    }

    /**
     * @param {{ targetUserId?: string, targetUser?: User, targetToken?: Token, mode?: string, profileMode?: number, whisperType?: string, isTarget?: boolean, isGm?: boolean }} data
     */
    _onWhisperStart(data = {}) {
        // Whispers are private auditory channels between the Game Master and the target recipient.
        // Third-party players who are not participating must not hear the whisper ambient.
        const isGm = data.isGm ?? (game.user?.isGM ?? false);
        const isTarget = data.isTarget ?? (data.targetUserId ? game.user?.id === data.targetUserId : false);

        if (!isGm && !isTarget) {
            return;
        }

        const mode = data.mode || data.whisperType || data.profileMode || "mind-whisper";
        let eventKey = this.mapWhisperEvent(mode, data.profileMode);

        const hookPayload = {
            mode,
            profileMode: data.profileMode ?? (mode === "light-whisper" ? 1 : mode === "dark-whisper" ? 3 : 2),
            whisperType: mode === "light-whisper" || data.profileMode === 1 ? "light" : (mode === "dark-whisper" || data.profileMode === 3 ? "dark" : "neutral"),
            eventKey,
            options: {
                volume: 0.35,
                fadeInMs: 1200
            },
            isGm,
            isTarget,
            targetUserId: data.targetUserId,
            targetUser: data.targetUser,
            targetToken: data.targetToken
        };

        // Surface hook to let other modules or world macros inject or calibrate whisper ambients
        Hooks.callAll("ionrift.resonance.whisperAmbientStarting", hookPayload);

        eventKey = hookPayload.eventKey || eventKey;
        const options = hookPayload.options || { volume: 0.35, fadeInMs: 1200 };

        // If the same ambient is already active, ignore duplicate triggers
        if (this._activeAmbientEvent === eventKey) {
            return;
        }

        // If another whisper ambient was already playing (e.g. GM hotkey switched profile during whisper), cross-fade it out
        if (this._activeAmbientEvent) {
            this.handler.stopAmbient(this._activeAmbientEvent, { fadeOutMs: 600 });
            this._activeAmbientEvent = null;
        }

        Logger.log(`VoiceIntegration | Starting whisper ambient loop for ${eventKey} (mode: ${mode})`);
        this._activeAmbientEvent = eventKey;
        this.handler.playAmbient(eventKey, options);
    }

    /**
     * @param {{ targetUserId?: string, targetUser?: User, targetToken?: Token, mode?: string, isTarget?: boolean, isGm?: boolean }} data
     */
    _onWhisperEnd(data = {}) {
        if (this._activeAmbientEvent) {
            const stopOptions = { fadeOutMs: 1000 };
            Hooks.callAll("ionrift.resonance.whisperAmbientStopping", {
                eventKey: this._activeAmbientEvent,
                options: stopOptions,
                isGm: data.isGm ?? (game.user?.isGM ?? false),
                isTarget: data.isTarget ?? (data.targetUserId ? game.user?.id === data.targetUserId : false)
            });

            Logger.log(`VoiceIntegration | Stopping whisper ambient loop for ${this._activeAmbientEvent}`);
            this.handler.stopAmbient(this._activeAmbientEvent, stopOptions);
            this._activeAmbientEvent = null;
        } else {
            // Defensive teardown
            this.handler.stopAmbient(SOUND_EVENTS.VOICE_WHISPER_LIGHT, { fadeOutMs: 1000 });
            this.handler.stopAmbient(SOUND_EVENTS.VOICE_WHISPER_NEUTRAL, { fadeOutMs: 1000 });
            this.handler.stopAmbient(SOUND_EVENTS.VOICE_WHISPER_DARK, { fadeOutMs: 1000 });
        }
    }
}
