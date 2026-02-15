

export function msgContains(msg, possibles) {
    if (msg == null) {
        return false
    }

    if (possibles.some(function (v) { return msg.indexOf(v) >= 0; })) {
        return true;
    }
    return false
}

