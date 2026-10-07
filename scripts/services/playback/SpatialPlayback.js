export const SPATIAL_RAMP_MS = 50;

/**
 * Socket body for one positional one-shot. The sender already chose src.
 * @param {{ key: string, src: string, volume: number, origin: object, senderId?: string|null }} payload
 */
export function buildSpatialMessage({ key, src, volume, origin, senderId = null }) {
    return {
        type: "audio:spatial",
        key,
        src,
        volume,
        origin,
        senderId
    };
}

/**
 * Play a positional one-shot on this client only.
 * Voice null, or no listener, plays at the full volume.
 * @param {{ key?: string, src: string, volume?: number, origin?: object }} payload
 * @param {{
 *   playDry?: (src: string, volume: number) => Promise<object|null>,
 *   voiceApi?: object|null,
 *   hearMode?: string,
 *   rampMs?: number
 * }} [deps]
 */
export async function playSpatialClip(payload, deps = {}) {
    const base = Number.isFinite(Number(payload?.volume)) ? Number(payload.volume) : 1;
    const playDry = deps.playDry || defaultPlayDry;
    const hearMode = deps.hearMode ?? readHearMode();
    const voice = deps.voiceApi !== undefined ? deps.voiceApi : readVoiceAcoustics();
    const origin = payload?.origin;

    if (hearMode === "normal" || !voice?.resolveForLocalListener || !hasCoords(origin)) {
        return playDry(payload.src, base);
    }

    const resolved = voice.resolveForLocalListener({
        kind: "sfx",
        id: payload.key || payload.src,
        pos: {
            x: Number(origin.x),
            y: Number(origin.y),
            elevation: Number(origin.elevation) || 0
        }
    });
    if (!resolved) return playDry(payload.src, base);

    const nowGain = finiteGain(resolved.now?.gain) * base;
    const sound = await playDry(payload.src, nowGain);
    tryApplyLowpass(sound, resolved.now?.cutoffHz);

    if (resolved.later && typeof resolved.later.then === "function") {
        resolved.later.then((params) => {
            if (!params) return;
            const next = finiteGain(params.gain) * base;
            rampSpatialGain(sound, nowGain, next, deps.rampMs ?? SPATIAL_RAMP_MS);
            tryApplyLowpass(sound, params.cutoffHz);
        }).catch(() => {});
    }
    return sound;
}

/**
 * @param {object|null} sound
 * @param {number} fromGain
 * @param {number} toGain
 * @param {number} [rampMs]
 */
export function rampSpatialGain(sound, fromGain, toGain, rampMs = SPATIAL_RAMP_MS) {
    if (!sound) return false;
    const from = Number(fromGain) || 0;
    const to = Number(toGain) || 0;
    const ctx = sound.gain?.context;
    const param = sound.gain?.gain;
    if (ctx && param && typeof param.setValueAtTime === "function" && typeof param.linearRampToValueAtTime === "function") {
        const now = ctx.currentTime;
        try {
            param.cancelScheduledValues?.(now);
            param.setValueAtTime(from, now);
            param.linearRampToValueAtTime(to, now + rampMs / 1000);
            return true;
        } catch {
            /* volume fallback below */
        }
    }
    if ("volume" in sound) sound.volume = to;
    return false;
}

/**
 * Insert a lowpass between source and gain when the Sound graph allows it.
 * @param {object|null} sound
 * @param {number} cutoffHz
 * @returns {boolean} true when a filter was applied
 */
export function tryApplyLowpass(sound, cutoffHz) {
    const cutoff = Number(cutoffHz);
    if (!sound || !Number.isFinite(cutoff)) return false;
    const ctx = sound.context || sound.gain?.context || sound.source?.context;
    if (!ctx || typeof ctx.createBiquadFilter !== "function") return false;

    let filter = sound._ionriftSpatialLowpass;
    if (!filter) {
        filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        if (!wireLowpass(sound, filter)) return false;
        sound._ionriftSpatialLowpass = filter;
    }
    const freq = filter.frequency;
    if (freq && typeof freq.setTargetAtTime === "function") {
        try {
            freq.setTargetAtTime(cutoff, ctx.currentTime || 0, 0.015);
            return true;
        } catch {
            /* set value directly */
        }
    }
    if (freq) freq.value = cutoff;
    return true;
}

function wireLowpass(sound, filter) {
    const source = sound.source;
    const gain = sound.gain;
    if (!source?.disconnect || !gain || typeof source.connect !== "function" || typeof filter.connect !== "function") {
        return false;
    }
    try {
        source.disconnect();
        source.connect(filter);
        filter.connect(gain);
        if (Array.isArray(sound.effects) && !sound.effects.includes(filter)) sound.effects.push(filter);
        return true;
    } catch {
        return false;
    }
}

function hasCoords(origin) {
    return !!origin && Number.isFinite(Number(origin.x)) && Number.isFinite(Number(origin.y));
}

function finiteGain(value) {
    const gain = Number(value);
    return Number.isFinite(gain) ? gain : 0;
}

function readHearMode() {
    try {
        return globalThis.game?.settings?.get?.("ionrift-resonance", "hearPositionalSfx") || "follow";
    } catch {
        return "follow";
    }
}

function readVoiceAcoustics() {
    const api = globalThis.game?.modules?.get?.("ionrift-voice")?.api?.acoustics;
    if (typeof api?.resolveForLocalListener !== "function") return null;
    return api;
}

async function defaultPlayDry(src, volume) {
    const play = globalThis.foundry?.audio?.AudioHelper?.play;
    if (!src || typeof play !== "function") return null;
    return play({ src, volume, loop: false }, false);
}
