import { BaseStrategy } from "./BaseStrategy.js";
import { Logger } from "../Logger.js";
import { SYRINSCAPE_DEFAULTS } from "../data/syrinscape_defaults.js";

export class SyrinscapeStrategy extends BaseStrategy {

    get isAvailable() {
        const hasToken = !!game.settings.get("ionrift-sounds", "syrinToken");
        const hasModule = game.modules.get("fvtt-syrin-control")?.active || game.modules.get("syrinscape-control")?.active || !!game.syrinscape;
        return hasToken || hasModule;
    }

    async init() {
        super.init();
        if (!this.isAvailable) {
            Logger.warn("No Syrinscape Integration found (Token or Module missing).");
        } else {
            const hasModule = game.modules.get("fvtt-syrin-control")?.active || game.modules.get("syrinscape-control")?.active || !!game.syrinscape;
            const mode = hasModule ? "Embedded (Module)" : "Broadcast (Direct API)";
            Logger.log(`Audio Strategy Ready. Mode: ${mode}`);
        }
    }

    getBindings() {
        // Parse User Overrides
        const overridesStr = game.settings.get("ionrift-sounds", "customSoundBindings") || "{}";
        let overrides = {};
        try {
            overrides = JSON.parse(overridesStr);
        } catch (e) {
            Logger.error("Failed to parse custom bindings JSON:", e);
        }

        // Use loaded config from Handler (fantasy.json) if available
        const handlerConfig = (this.handler && this.handler.config) ? this.handler.config : {};

        // Return merged: Defaults -> Handler Config -> User Overrides
        // This ensures that even if fantasy.json is missing keys (like new ATTACK_SWORD_SLASH),
        // the hardcoded defaults will fill the gap.
        return { ...SYRINSCAPE_DEFAULTS, ...handlerConfig, ...overrides };
    }

    resolve(soundId) {
        if (!soundId) return null;

        const bindings = this.getBindings();
        let realId = bindings[soundId];

        // Fallback Logic: Map Specific -> Core
        if (!realId) {
            const coreKey = this._getFallbackKey(soundId);
            if (coreKey && bindings[coreKey]) {
                realId = bindings[coreKey];
                // Logger.log(`Fallback: ${soundId} -> ${coreKey}`);
            }
        }

        if (!realId) realId = soundId;

        // Normalize Object/Array-of-Objects to just IDs
        if (Array.isArray(realId)) {
            return realId.map(d => (typeof d === 'object') ? d.id : d);
        } else if (typeof realId === 'object') {
            return realId.id;
        }

        return realId;
    }

    _getFallbackKey(specificKey) {
        // Melee
        if (["ATTACK_SWORD", "ATTACK_DAGGER", "ATTACK_AXE", "ATTACK_MACE", "ATTACK_BLUDGEON", "ATTACK_CLAW", "ATTACK_BITE", "ATTACK_SLAM"].includes(specificKey)) return "CORE_MELEE";

        // Ranged
        if (["ATTACK_BOW", "ATTACK_CROSSBOW", "ATTACK_SLING", "ATTACK_JAVELIN", "ATTACK_THROWN"].includes(specificKey)) return "CORE_RANGED";

        // Magic
        if (specificKey.startsWith("SPELL_")) return "CORE_MAGIC";

        // Hits & Results
        if (specificKey.endsWith("_HIT") || specificKey === "BLOODY_HIT") return "CORE_HIT";
        if (["MISS", "ATTACK_MISS"].includes(specificKey)) return "CORE_MISS";
        if (specificKey === "WHOOSH") return "CORE_WHOOSH";
        if (specificKey === "CRIT_DECORATION") return "CORE_CRIT";
        if (specificKey === "FUMBLE_DECORATION") return "CORE_FUMBLE";

        // Vocals - PC
        if (specificKey === "PC_PAIN_MALE") return "CORE_PAIN_MASCULINE";
        if (specificKey === "PC_PAIN_FEMALE") return "CORE_PAIN_FEMININE";
        if (specificKey === "PC_DEATH_MALE") return "CORE_DEATH_MASCULINE";
        if (specificKey === "PC_DEATH_FEMALE") return "CORE_DEATH_FEMININE";

        // Vocals - Monster
        if (specificKey.startsWith("MONSTER_") && !specificKey.includes("DEATH")) return "CORE_MONSTER_PAIN";
        if (specificKey.startsWith("MONSTER_") && specificKey.includes("DEATH")) return "CORE_MONSTER_DEATH";

        return null;
    }

    /**
     * Play a sound via Syrinscape
     * @param {string} soundId - The abstract key (e.g. "ATTACK_SWORD")
     * @param {string|number} [type="mood"] - The type ("mood", "element", "oneshot") OR volume (ignored for now)
     */
    async play(soundId, type = "mood") {
        if (!soundId) {
            Logger.warn("No sound ID provided.");
            return;
        }

        // Handle volume passed as type argument (legacy support)
        if (typeof type === "number") {
            // Logger.log("Volume passed to play(), ignoring for Syrinscape:", type);
            type = "mood"; // Reset to default, we will resolve actual type below
        }

        let realId;

        // 1. If soundId is already a resolved object (from Preview/DragDrop)
        if (typeof soundId === 'object') {
            realId = soundId;
        } else {
            // 2. Resolve from bindings
            const bindings = this.getBindings();
            realId = bindings[soundId];

            // 3. Fallback Logic (Only for string keys)
            if (!realId) {
                const coreKey = this._getFallbackKey(soundId);
                if (coreKey && bindings[coreKey]) {
                    realId = bindings[coreKey];
                }
            }

            // If not found in bindings, assume it's a raw ID if it looks like one
            if (!realId) realId = soundId;
        }

        // Debug Wrapper Handling
        // If the binding is { id: ..., name: ..., config: ... }, extract the config and unwrap the ID
        let delayConfig = null;
        if (typeof realId === 'object' && realId.config) {
            delayConfig = realId.config;
            realId = realId.id; // Unwrap
        }

        // Handle Array of IDs (Variety)
        if (Array.isArray(realId)) {
            const index = Math.floor(Math.random() * realId.length);
            realId = realId[index];
        }

        // DEBUG: Inspect resolved Sound Object
        Logger.log(`DEBUG | Play Request: ${soundId}`);
        Logger.log(`DEBUG | Real ID (After Resolve):`, JSON.stringify(realId));
        if (delayConfig) Logger.log(`DEBUG | Delay Config Found:`, delayConfig);

        // Handle Object {id, name, type}
        if (typeof realId === 'object') {
            if (realId.type) type = realId.type;
            if (realId.id) realId = realId.id;
        } else {
            // If realId is just a string/number, attempt to recover type from defaults
            if (SYRINSCAPE_DEFAULTS[soundId]) {
                const defaultEntry = Array.isArray(SYRINSCAPE_DEFAULTS[soundId])
                    ? SYRINSCAPE_DEFAULTS[soundId][0]
                    : SYRINSCAPE_DEFAULTS[soundId];

                if (defaultEntry && defaultEntry.type) {
                    // Only overwrite if we are currently defaulting to "mood"
                    if (type === "mood") {
                        type = defaultEntry.type;
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // NEW: Variable Delay Logic (Global/Custom Config)
        // -------------------------------------------------------------
        if (delayConfig) {
            // realId is currently the string ID (or object id if flattened)
            const keyId = (typeof realId === 'object') ? realId.id : realId;
            const cfg = delayConfig[keyId];

            if (cfg && cfg.delayMax > 0) {
                const min = cfg.delayMin || 0;
                const max = cfg.delayMax;
                if (max >= min) {
                    const randomSeconds = Math.random() * (max - min) + min;
                    const delayMs = randomSeconds * 1000;
                    if (delayMs > 0) {
                        Logger.log(`Applying variable delay: ${delayMs.toFixed(0)}ms`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // Prefix Detection Logic (Matches SyrinscapeProvider)
        // -------------------------------------------------------------
        if (typeof realId === "string") {
            if (realId.startsWith("mood:")) {
                type = "mood";
                realId = realId.substring(5);
            } else if (realId.startsWith("element:")) {
                type = "element";
                realId = realId.substring(8);
            } else if (realId.startsWith("global:")) {
                type = "global-element";
                realId = realId.substring(7);
            }
        }

        // Map "music" / "oneshot" to standard "mood" / "element"
        if (type === "music") type = "mood";
        if (type === "oneshot") type = "element";

        this._playRaw(type, realId);
    }

    /**
     * Low-level play command that handles the API differences
     * @param {string} type - "mood" or "element"
     * @param {number|string} id - The Syrinscape ID
     */
    async _playRaw(type, id) {
        if (!id) return;

        // 1. Try Module Integration (V2 - syrinscape-control)
        // Uses globalThis.syrinscapeControl
        if (globalThis.syrinscapeControl?.utils) {
            try {
                if (type === "mood") {
                    await globalThis.syrinscapeControl.utils.playMood(id);
                } else {
                    await globalThis.syrinscapeControl.utils.playElement(id);
                }
                return;
            } catch (err) {
                Logger.error("Syrinscape Module V2 Error:", err);
            }
        }

        // 2. Try Module Integration (V1 - Legacy)
        if (game.syrinscape) {
            const method = type === "mood" ? "playMood" : "playElement";
            if (typeof game.syrinscape[method] === 'function') {
                game.syrinscape[method](id);
                return;
            }
        }

        // Debug Module Detection
        Logger.log("DEBUG | Detection:", {
            moduleV2: !!globalThis.syrinscapeControl,
            moduleV1: !!game.syrinscape
        });

        // 3. Fallback to Direct API
        const token = game.settings.get("ionrift-sounds", "syrinToken");
        if (!token) {
            // Only warn if they strictly need it (no module)
            if (!globalThis.syrinscapeControl && !game.syrinscape) {
                ui.notifications.warn("Ionrift: Syrinscape Token missing for Direct API.");
            }
            return;
        }

        Logger.log(`Broadcasting via Direct API: ${type} ${id}`);

        let endpoint = "elements";
        if (type === "mood") endpoint = "moods";
        else if (type === "global-element") endpoint = "global-elements";

        const url = `https://syrinscape.com/online/frontend-api/${endpoint}/${id}/play/?auth_token=${token}`;

        try {
            await fetch(url);
        } catch (e) {
            Logger.error("Direct API Play Failed", e);
        }
    }

    async stopAll() {
        // 1. Try Module (V2)
        if (globalThis.syrinscapeControl?.utils?.stopAll) {
            await globalThis.syrinscapeControl.utils.stopAll();
            return;
        }

        // 2. Try Module (Legacy)
        if (game.syrinscape?.stopAll) {
            await game.syrinscape.stopAll();
            return;
        }

        // 3. Fallback Direct API
        const token = game.settings.get("ionrift-sounds", "syrinToken");
        if (token) {
            try {
                await fetch(`https://syrinscape.com/online/frontend-api/stop-all/?auth_token=${token}`);
            } catch (e) {
                Logger.warn("Stop All failed via Direct API", e);
            }
        }
    }
}
