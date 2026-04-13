

export function msgContains(msg, possibles) {
    if (msg == null) {
        return false
    }

    const upper = msg.toUpperCase();
    if (possibles.some(function (v) { return upper.indexOf(v.toUpperCase()) >= 0; })) {
        return true;
    }
    return false
}

