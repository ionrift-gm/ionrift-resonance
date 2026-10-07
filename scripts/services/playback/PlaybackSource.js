/**
 * Pick one entry from a binding so every client hears the same file.
 * @param {string|object|Array} soundData
 * @returns {string|object|null}
 */
export function pickSoundEntry(soundData) {
    let target = soundData;
    if (typeof target === "string" && target.includes(",")) {
        const parts = target.split(",").map((part) => part.trim()).filter(Boolean);
        if (parts.length) target = parts[Math.floor(Math.random() * parts.length)];
    }
    if (Array.isArray(target)) {
        if (!target.length) return null;
        target = target[Math.floor(Math.random() * target.length)];
    }
    return target ?? null;
}

/**
 * @param {string|object|null} entry
 * @returns {string|null}
 */
export function sourceId(entry) {
    if (entry && typeof entry === "object") return entry.id || null;
    return typeof entry === "string" ? entry : null;
}

/**
 * Local files go through Foundry audio. Anything else is Syrinscape (or unknown).
 * @param {string|null} src
 * @returns {boolean}
 */
export function isLocalFileSource(src) {
    return typeof src === "string" && (src.includes("/") || /\.(wav|mp3|ogg|flac|webm)$/i.test(src));
}
