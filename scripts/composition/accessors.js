/**
 * Accessors over game.ionrift.resonance after boot.
 *
 * Class accessors (PackLoader, SyrinscapeProvider, Orchestrator) return the
 * registered class for static APIs only. Use getHandler / getManager for
 * live instances. Do not call instance methods on a class accessor.
 */

export function getHandler() {
    return game.ionrift?.resonance?.handler ?? null;
}

export function getManager() {
    return game.ionrift?.resonance?.manager ?? null;
}

export function getSoundPackLoader() {
    return game.ionrift?.resonance?.SoundPackLoader ?? null;
}

export function getSyrinscapeProvider() {
    return game.ionrift?.resonance?.SyrinscapeProvider ?? null;
}

export function getSoundOrchestrator() {
    return game.ionrift?.resonance?.SoundOrchestrator ?? null;
}
