/**
 * Pure gate for one-shot positional playback.
 * Private cues fail first. After that the order is:
 * client opt-out, master, per-sound override, category, class,
 * origin, local file, Voice api.
 *
 * @param {{
 *   private?: boolean,
 *   clientMode?: string,
 *   master?: boolean,
 *   override?: string,
 *   spatialClass?: string,
 *   category?: string|null,
 *   categories?: Record<string, boolean>,
 *   origin?: boolean,
 *   localFiles?: boolean,
 *   voiceApi?: boolean
 * }} input
 * @returns {{ positional: boolean, reason: string }}
 */
export function decideSpatialPlayback(input = {}) {
    if (input.private) return decline("private");
    if (input.clientMode === "normal") return decline("client");
    if (!input.master) return decline("master");

    const override = input.override === "positional" || input.override === "everywhere"
        ? input.override
        : "default";
    if (override === "everywhere") return decline("override");

    const category = input.category;
    if (category && input.categories && input.categories[category] === false) {
        return decline("category");
    }

    const spatialClass = override === "positional" ? "origin" : input.spatialClass;
    if (spatialClass !== "origin") return decline("class");
    if (!input.origin) return decline("origin");
    if (!input.localFiles) return decline("provider");
    if (!input.voiceApi) return decline("voice");
    return { positional: true, reason: "positional" };
}

function decline(reason) {
    return { positional: false, reason };
}
