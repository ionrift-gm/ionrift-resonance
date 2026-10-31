import { SOUND_EVENTS, isFeatureFlagEnabled } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

/**
 * PuzzlesIntegration (Incubated)
 * Listens to Ionrift Puzzles hooks for The Starlight Clavier (`arcane-piano`):
 *   - `ionriftPuzzles.keyPlayed`: plays `PUZZLE_PIANO_KEY_1..5` (C4, Db4, D4, Eb4, E4) from the piano's map coordinate
 *   - `ionriftPuzzles.solved`: plays `PUZZLE_PIANO_SOLVED` (harmonic chord & levitating stone mechanism)
 *   - `ionriftPuzzles.reversed`: plays `PUZZLE_PIANO_REVERSED` (dissonant cadence & secret passage sealing shut)
 *
 * Gated behind `isFeatureFlagEnabled("PUZZLES_INCUBATION")` (auto-enabled in local dev when
 * `ionrift-devtools` is active; hidden and inactive in production builds).
 */
export class PuzzlesIntegration {
    static MODULE_ID = "ionrift-puzzles";
    static MIN_VERSION = "0.1.0";
    static HOOK_PREFIX = "ionriftPuzzles";

    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
    }

    static get isIncubationEnabled() {
        return isFeatureFlagEnabled("PUZZLES_INCUBATION");
    }

    static get isInstalled() {
        return this.isIncubationEnabled && (game.modules?.has?.(this.MODULE_ID) ?? false);
    }

    static get isActive() {
        return this.isIncubationEnabled && (game.modules?.get?.(this.MODULE_ID)?.active ?? false);
    }

    static get version() {
        return game.modules?.get?.(this.MODULE_ID)?.version ?? null;
    }

    static get isCompatible() {
        if (!this.isActive) return false;
        const current = this.version;
        if (!current) return true;
        return !foundry.utils.isNewerVersion(this.MIN_VERSION, current);
    }

    registerHooks() {
        if (!PuzzlesIntegration.isIncubationEnabled) {
            return;
        }

        if (!PuzzlesIntegration.isActive) {
            Logger.log("PuzzlesIntegration | ionrift-puzzles is not active, skipping hooks.");
            return;
        }

        if (!PuzzlesIntegration.isCompatible) {
            Logger.warn(`PuzzlesIntegration | ionrift-puzzles is outdated (v${PuzzlesIntegration.version} installed, v${PuzzlesIntegration.MIN_VERSION}+ required). Sound hooks disabled.`);
            return;
        }

        Logger.log("PuzzlesIntegration | Registering incubated Starlight Clavier sound hooks.");

        const on = (name, fn) => {
            const wrapped = (...args) => {
                if (!game.user?.isGM) return;
                if (!PuzzlesIntegration.isIncubationEnabled) return;
                fn(...args);
            };
            Hooks.on(`${PuzzlesIntegration.HOOK_PREFIX}.${name}`, wrapped);
        };

        // Individual Starlight Clavier key struck (W1, B1, W2, B2, W3 -> PUZZLE_PIANO_KEY_1..5)
        on("keyPlayed", (data = {}) => {
            const key = data.soundEventKey || SOUND_EVENTS[`PUZZLE_PIANO_KEY_${data.noteIndex || 1}`];
            if (!key) return;
            const origin = data.origin || data.anchorWorldPt || undefined;
            Logger.log(`PuzzlesIntegration | keyPlayed (${data.keyId ?? "?"} / ${data.noteName ?? ""}) -> ${key}`, data);
            this.handler.play(key, { origin });
        });

        // Starlight Clavier sequence solved (5th note completes phrase -> piano levitates aside)
        on("solved", (data = {}) => {
            const isPiano = data.archetype === "arcane-piano" || data.puzzleId === "unlit-star-piano";
            if (!isPiano) return;
            const origin = data.origin || data.anchorWorldPt || undefined;
            Logger.log("PuzzlesIntegration | solved (arcane-piano) -> PUZZLE_PIANO_SOLVED", data);
            this.handler.play(SOUND_EVENTS.PUZZLE_PIANO_SOLVED, {
                delay: 380,
                origin
            });
        });

        // Starlight Clavier reversed (key struck after solving -> piano settles back and secret passage seals)
        on("reversed", (data = {}) => {
            const isPiano = data.archetype === "arcane-piano" || data.puzzleId === "unlit-star-piano";
            if (!isPiano) return;
            const origin = data.origin || data.anchorWorldPt || undefined;
            Logger.log("PuzzlesIntegration | reversed (arcane-piano) -> PUZZLE_PIANO_REVERSED", data);
            this.handler.play(SOUND_EVENTS.PUZZLE_PIANO_REVERSED, {
                delay: 260,
                origin
            });
        });

        // Tarnished Brass Mirror fleeting shadow-visage apparition shriek (spatialized from the mirror spot)
        on("mirrorShriek", (data = {}) => {
            const origin = data.origin || data.anchorWorldPt || undefined;
            Logger.log("PuzzlesIntegration | mirrorShriek (tarnished-mirror) -> PUZZLE_MIRROR_SHRIEK", data);
            this.handler.play(SOUND_EVENTS.PUZZLE_MIRROR_SHRIEK, {
                origin,
                volume: 1.0,
                cinematicExempt: true
            });
        });
    }
}
