import { SOUND_EVENTS } from "../data/constants.js";
import { SoundPackLoader } from "../services/packs/SoundPackLoader.js";
import { SoundHandler } from "../services/playback/SoundHandler.js";
import { SoundOrchestrator } from "../services/playback/SoundOrchestrator.js";
import { ResonanceConfig } from "../services/config/ResonanceConfig.js";
import { SoundResolver } from "../services/playback/SoundResolver.js";
import { SyrinscapeProvider } from "../providers/concrete/SyrinscapeProvider.js";
import { ResonancePackRegistryApp } from "../apps/packs/ResonancePackRegistryApp.js";
import { soundManager } from "../services/playback/SoundManager.js";

export function createResonanceContext() {
    const config = new ResonanceConfig();
    const resolver = new SoundResolver(config);
    const orchestrator = new SoundOrchestrator();

    const ctx = {
        SOUND_EVENTS,
        config,
        resolver,
        orchestrator,
        manager: soundManager,
        SoundPackLoader,
        SoundOrchestrator,
        SyrinscapeProvider,
        ResonancePackRegistryApp,
        handler: null
    };

    exposeResonanceApi(ctx);
    return ctx;
}

export async function startResonanceRuntime(ctx) {
    game.ionrift.resonance.SoundPackLoader = SoundPackLoader;
    game.ionrift.resonance.ResonancePackRegistryApp = ResonancePackRegistryApp;

    await Promise.allSettled([
        SoundPackLoader.init(),
        Promise.resolve().then(() => {
            ctx.handler = new SoundHandler({
                config: ctx.config,
                resolver: ctx.resolver,
                orchestrator: ctx.orchestrator,
                manager: ctx.manager,
                packLoader: SoundPackLoader
            });
        })
    ]);

    exposeResonanceApi(ctx);
    return ctx;
}

/** Temporary aliases: keep game.ionrift.handler / sounds.manager until dependents are cleared. */
export function exposeResonanceApi(ctx) {
    game.ionrift = game.ionrift || {};
    game.ionrift.resonance = {
        ...(game.ionrift.resonance || {}),
        SOUND_EVENTS: ctx.SOUND_EVENTS,
        handler: ctx.handler,
        manager: ctx.manager,
        SoundPackLoader: ctx.SoundPackLoader,
        SoundOrchestrator: ctx.SoundOrchestrator,
        SyrinscapeProvider: ctx.SyrinscapeProvider,
        ResonancePackRegistryApp: ctx.ResonancePackRegistryApp
    };

    if (ctx.handler) {
        game.ionrift.handler = ctx.handler;
    }
    game.ionrift.sounds = game.ionrift.sounds || {};
    game.ionrift.sounds.manager = ctx.manager;
}
