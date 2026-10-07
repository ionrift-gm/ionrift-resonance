/**
 * @param {object|null|undefined} token
 * @returns {{ tokenId: string }|null}
 */
export function originFromToken(token) {
    if (!token) return null;
    const id = token.id || token.document?.id;
    if (!id) return null;
    return { tokenId: id };
}

/**
 * @param {object|null|undefined} actor
 * @returns {{ tokenId: string }|null}
 */
export function originFromActor(actor) {
    if (!actor) return null;
    const tokens = typeof actor.getActiveTokens === "function" ? actor.getActiveTokens(true, true) : null;
    const token = tokens?.[0] || actor.token || null;
    return originFromToken(token);
}

/**
 * True when the caller supplied a token or map coordinates.
 * @param {object|null|undefined} origin
 * @returns {boolean}
 */
export function originIsPlace(origin) {
    if (!origin || typeof origin !== "object") return false;
    if (origin.tokenId) return true;
    return Number.isFinite(Number(origin.x)) && Number.isFinite(Number(origin.y));
}

/**
 * Resolve a token id to map coordinates. Coordinates already on the origin win.
 * @param {object|null|undefined} origin
 * @returns {{ tokenId: string|null, x: number, y: number, elevation: number }|null}
 */
export function normalizeOrigin(origin) {
    if (!originIsPlace(origin)) return null;
    const x = Number(origin.x);
    const y = Number(origin.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
        return {
            tokenId: origin.tokenId || null,
            x,
            y,
            elevation: Number(origin.elevation) || 0
        };
    }
    const token = globalThis.canvas?.tokens?.get?.(origin.tokenId);
    const doc = token?.document;
    if (!doc || !Number.isFinite(Number(doc.x)) || !Number.isFinite(Number(doc.y))) return null;
    const grid = Number(globalThis.canvas?.grid?.size) || 0;
    const width = Number(doc.width) || 1;
    const height = Number(doc.height) || 1;
    return {
        tokenId: origin.tokenId,
        x: Number(doc.x) + (width * grid) / 2,
        y: Number(doc.y) + (height * grid) / 2,
        elevation: Number(doc.elevation) || 0
    };
}
