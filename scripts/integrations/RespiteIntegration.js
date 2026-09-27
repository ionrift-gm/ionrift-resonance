import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

export class RespiteIntegration {
    static MIN_VERSION = "3.6.2";
    /** Let the ignition sting land before the crackle loop starts. */
    static FIRE_LIT_LEAD_MS = 1200;

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        this._activeEmitterId = null;
        this._loopDelayTimer = null;
        this._lastFireLitAt = 0;
    }

    static get isInstalled() {
        return game.modules.has("ionrift-respite");
    }

    static get isActive() {
        return game.modules.get("ionrift-respite")?.active ?? false;
    }

    static get version() {
        return game.modules.get("ionrift-respite")?.version ?? null;
    }

    static get isCompatible() {
        if (!this.isActive) return false;
        const current = this.version;
        if (!current) return true;
        return !foundry.utils.isNewerVersion(this.MIN_VERSION, current);
    }

    registerHooks() {
        if (!RespiteIntegration.isActive) {
            Logger.log("RespiteIntegration | ionrift-respite is not active, skipping hooks.");
            return;
        }

        if (!RespiteIntegration.isCompatible) {
            Logger.warn(`RespiteIntegration | ionrift-respite is outdated (v${RespiteIntegration.version} installed, v${RespiteIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("RespiteIntegration | Registering Respite sound hooks.");

        // 1. Campfire state changes (lit, fire level changed, doused, or HUD animation)
        Hooks.on("ionrift.respite.campfireStateChanged", async (data = {}) => {
            const { lit } = data;
            Logger.log("RespiteIntegration | campfireStateChanged:", data);

            if (lit) {
                await this._beginCampfireAudio(data);
            } else {
                this._cancelLoopDelay();
                // Fire is unlit or doused
                if (game.user.isGM && canvas?.scene) {
                    await this._removeCampfireEmitters();
                }
                this.handler.stopAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { fadeOutMs: 1500 });
            }
        });

        // 2. Track token movement or deletion to keep spatial emitter synced
        Hooks.on("updateToken", async (tokenDoc, change) => {
            if (!game.user.isGM || !canvas?.scene) return;
            if (change.x === undefined && change.y === undefined) return;
            if (!this._isCampfireToken(tokenDoc)) return;

            await this._syncCampfireEmitter(tokenDoc);
        });

        Hooks.on("deleteToken", async (tokenDoc) => {
            if (!game.user.isGM || !canvas?.scene) return;
            if (!this._isCampfireToken(tokenDoc)) return;

            this._cancelLoopDelay();
            await this._removeCampfireEmitters();
            this.handler.stopAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { fadeOutMs: 1000 });
        });

        // 3. Sleep Started (fired once per rest; handles gritty realism 1-shot guard)
        Hooks.on("ionrift.respite.sleepStarted", (data = {}) => {
            if (!game.user.isGM) return;
            Logger.log("RespiteIntegration | sleepStarted, RESPITE_SLEEP_STARTED", data);
            this.handler.play(SOUND_EVENTS.RESPITE_SLEEP_STARTED);
        });

        // 4. Entered / reached Resolution stage (dawn cockerel / rest resolved)
        Hooks.on("ionrift.respite.resolutionEntered", async (data = {}) => {
            if (!game.user.isGM) return;
            Logger.log("RespiteIntegration | resolutionEntered, RESPITE_RESOLUTION", data);

            // Clean up ambient campfire emitter and audio loop
            this._cancelLoopDelay();
            if (canvas?.scene) {
                await this._removeCampfireEmitters();
            }
            this.handler.stopAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { fadeOutMs: 1500 });

            // Morning dawn call / cockerel stinger
            this.handler.play(SOUND_EVENTS.RESPITE_RESOLUTION);
        });

        // 5. Rest cancelled, abandoned, or cleanup
        Hooks.on("ionrift.respite.restCleanup", async () => {
            Logger.log("RespiteIntegration | restCleanup: stopping ambient fire and removing emitters.");
            this._cancelLoopDelay();
            if (game.user.isGM && canvas?.scene) {
                await this._removeCampfireEmitters();
            }
            this.handler.stopAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { fadeOutMs: 1500 });
        });
    }

    /**
     * Start the crackle. On a fresh light, play the ignition sting first.
     * Tier changes and rest restores skip the sting and keep the loop.
     * @param {{ lit?: boolean, ignite?: boolean, token?: TokenDocument|null, inHud?: boolean }} data
     */
    async _beginCampfireAudio(data) {
        const ignite = !!data.ignite;
        if (!ignite) {
            if (this._loopDelayTimer) return;
            await this._startCampfireLoop(data);
            return;
        }

        const played = this._playFireLitSting();
        if (!played) {
            if (this._loopDelayTimer) return;
            await this._startCampfireLoop(data);
            return;
        }

        this._cancelLoopDelay();
        this._loopDelayTimer = setTimeout(() => {
            this._loopDelayTimer = null;
            void this._startCampfireLoop(data);
        }, RespiteIntegration.FIRE_LIT_LEAD_MS);
    }

    /**
     * One-shot ignition. GM only; playback broadcasts.
     * Unbound slots stay silent. This cue does not borrow a spell sound.
     * @returns {boolean} true when a sting was started
     */
    _playFireLitSting() {
        if (!game.user.isGM) return false;
        const now = Date.now();
        if (now - this._lastFireLitAt < 2000) return false;

        const resolved = this.handler.resolver.resolveKeyDirect(SOUND_EVENTS.RESPITE_FIRE_LIT);
        if (!resolved) {
            Logger.log("RespiteIntegration | RESPITE_FIRE_LIT unbound, skipping ignition sting.");
            return false;
        }

        this._lastFireLitAt = now;
        Logger.log("RespiteIntegration | ignite, RESPITE_FIRE_LIT");
        this.handler.play(SOUND_EVENTS.RESPITE_FIRE_LIT);
        return true;
    }

    /**
     * Spatial crackle on the campfire token, or a HUD loop when there is no token.
     * @param {{ token?: TokenDocument|null, inHud?: boolean }} data
     */
    async _startCampfireLoop(data) {
        const { token, inHud } = data;
        const sceneToken = token ?? (canvas?.scene ? this._findCampfireTokenOnScene() : null);
        if (sceneToken && canvas?.scene) {
            if (game.user.isGM) {
                await this._syncCampfireEmitter(sceneToken);
            }
        }

        if (inHud || !sceneToken) {
            Logger.log("RespiteIntegration | Playing HUD/ambient campfire audio loop.");
            this.handler.playAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { volume: 0.35, fadeInMs: 2000 });
        }
    }

    _cancelLoopDelay() {
        if (!this._loopDelayTimer) return;
        clearTimeout(this._loopDelayTimer);
        this._loopDelayTimer = null;
    }

    /**
     * Determine if a TokenDocument is a Respite campfire token.
     * @param {TokenDocument} tokenDoc
     * @returns {boolean}
     */
    _isCampfireToken(tokenDoc) {
        if (!tokenDoc) return false;
        if (tokenDoc.flags?.["ionrift-respite"]?.isCampfireToken === true) return true;
        const name = (tokenDoc.name ?? "").toLowerCase();
        return name === "campfire";
    }

    /**
     * Locate campfire token on the active scene.
     * @returns {TokenDocument|null}
     */
    _findCampfireTokenOnScene() {
        const scene = canvas?.scene;
        if (!scene) return null;
        return scene.tokens.find(t => this._isCampfireToken(t)) ?? null;
    }

    /**
     * Synchronize or create the spatial AmbientSound emitter on the canvas.
     * @param {TokenDocument} tokenDoc
     */
    async _syncCampfireEmitter(tokenDoc) {
        const scene = canvas?.scene;
        if (!scene || !tokenDoc) return;

        const resolved = this.handler.resolver.resolveKey(SOUND_EVENTS.RESPITE_CAMPFIRE);
        if (!resolved) {
            Logger.log("RespiteIntegration._syncCampfireEmitter | RESPITE_CAMPFIRE unbound, skipping canvas emitter.");
            return;
        }

        // Only create canvas AmbientSound if resolved sound is a playable file path
        const isFilePath = typeof resolved === "string" && (resolved.includes("/") || /\.(wav|mp3|ogg|flac|webm)$/i.test(resolved));
        if (!isFilePath) {
            Logger.log(`RespiteIntegration._syncCampfireEmitter | "${resolved}" is not a file path, routing as ambient loop.`);
            this.handler.playAmbient(SOUND_EVENTS.RESPITE_CAMPFIRE, { volume: 0.35, fadeInMs: 2000 });
            return;
        }

        const gs = canvas.dimensions?.size ?? 100;
        const width = tokenDoc.width ?? 1;
        const height = tokenDoc.height ?? 1;
        const centerX = Math.round(tokenDoc.x + (width * gs) / 2);
        const centerY = Math.round(tokenDoc.y + (height * gs) / 2);

        const existingEmitters = scene.sounds.filter(s => s.flags?.["ionrift-resonance"]?.isCampfireEmitter === true);

        if (existingEmitters.length > 0) {
            for (const emitter of existingEmitters) {
                await emitter.update({
                    path: resolved,
                    x: centerX,
                    y: centerY
                });
            }
            this._activeEmitterId = existingEmitters[0].id;
            Logger.log(`RespiteIntegration | Updated campfire emitter at (${centerX}, ${centerY})`);
        } else {
            const distanceUnit = scene.grid?.units || "ft";
            const radiusInUnits = 15; // 15 ft radius

            const created = await scene.createEmbeddedDocuments("AmbientSound", [{
                path: resolved,
                x: centerX,
                y: centerY,
                radius: radiusInUnits,
                easing: true,
                repeat: true,
                volume: 0.8,
                flags: {
                    "ionrift-resonance": {
                        isCampfireEmitter: true,
                        campfireTokenId: tokenDoc.id
                    }
                }
            }]);

            if (created && created[0]) {
                this._activeEmitterId = created[0].id;
                Logger.log(`RespiteIntegration | Created campfire emitter ${created[0].id} at (${centerX}, ${centerY})`);
            }
        }
    }

    /**
     * Remove any campfire emitters from the active scene.
     */
    async _removeCampfireEmitters() {
        const scene = canvas?.scene;
        if (!scene) return;

        const existing = scene.sounds.filter(s => s.flags?.["ionrift-resonance"]?.isCampfireEmitter === true);
        if (existing.length > 0) {
            await scene.deleteEmbeddedDocuments("AmbientSound", existing.map(s => s.id));
            Logger.log(`RespiteIntegration | Removed ${existing.length} campfire emitter(s) from scene.`);
        }
        this._activeEmitterId = null;
    }
}
