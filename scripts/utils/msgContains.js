

export function msgContains(msg, possibles) {
    if (msg == null) return false;
    const upper = msg.toUpperCase();
    return possibles.some(v => new RegExp(`\\b${v.toUpperCase()}\\b`).test(upper));
}

