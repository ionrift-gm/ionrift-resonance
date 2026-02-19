import { Logger } from "./Logger.js";
import { SYRINSCAPE_DEFAULTS } from "./data/syrinscape_defaults.js";

export class ResonanceConfig {
    constructor() {
        this.config = { mappings: { adversaries: {}, weapons: {}, spells: {} }, players: {} };
        this.activePreset = "fantasy";
    }

    /**
     * Loads the active preset and merges it with user overrides.
     */
    async load() {
        // 1. Determine Preset File
        let preset = game.settings.get("ionrift-resonance", "soundPreset") || "fantasy";
        // Defensive Clean (remove quotes if corrupted)
        if (typeof preset === 'string') preset = preset.replace(/^["']|["']$/g, '').trim();

        this.activePreset = preset;

        // Initialize default safe config
        let loadedConfig = {};

        try {
            if (preset !== "none") {
                const fileUrl = `/modules/ionrift-resonance/scripts/presets/${preset}.json`;
                Logger.log(`Loading Preset: ${preset} from ${fileUrl}`);

                // Wrap fetch in a timeout
                const fetchPromise = fetch(fileUrl);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Request timed out")), 2000)
                );

                const response = await Promise.race([fetchPromise, timeoutPromise]);
                if (response.ok) {
                    loadedConfig = await response.json();
                } else {
                    Logger.warn(`Failed to load preset '${preset}': ${response.statusText}`);
                }
            }
        } catch (e) {
            Logger.error("Error loading preset:", e);
        }

        // 2. Load User Overrides
        const overrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

        // 3. Merge Strategies
        // Start with deep copy of loaded config
        this.config = foundry.utils.deepClone(loadedConfig);

        // Merge Players (Array -> Object Map)
        if (overrides.players && Array.isArray(overrides.players)) {
            if (!this.config.players) this.config.players = {};
            for (const p of overrides.players) {
                if (p.name) this.config.players[p.name] = { pain: p.pain, death: p.death };
            }
        }

        // Merge Campaign Specifics
        if (overrides.campaign && Array.isArray(overrides.campaign)) {
            if (!this.config.mappings) this.config.mappings = { adversaries: {}, weapons: {}, spells: {} };

            for (const c of overrides.campaign) {
                if (c.actor && c.item && c.sound) {
                    if (!this.config.mappings.adversaries[c.actor]) this.config.mappings.adversaries[c.actor] = {};
                    this.config.mappings.adversaries[c.actor][c.item] = c.sound;
                } else if (c.type === "weapon" && c.item && c.sound) {
                    this.config.mappings.weapons[c.item] = c.sound;
                } else if (c.type === "spell" && c.item && c.sound) {
                    this.config.mappings.spells[c.item] = c.sound;
                } else if (!c.actor && c.item && c.sound) {
                    this.config.mappings.weapons[c.item] = c.sound;
                }
            }
        }

        Logger.log("ResonanceConfig: Loaded & Merged", this.config);
    }

    /**
     * returns a composed object of all effective bindings
     * Defaults -> Preset -> User Overrides
     */
    getEffectiveBindings() {
        const rawBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        // Parse user bindings: Extract IDs from complex JSON structures
        const userBindings = {};
        for (const [key, value] of Object.entries(rawBindings)) {
            if (!value) continue;

            // If value is a JSON string, parse it and extract ID
            if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                    const parsed = JSON.parse(value);
                    // Extract ID from parsed object
                    if (parsed.id) {
                        userBindings[key] = parsed.id;
                    } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
                        // Multi-select: comma-separated IDs
                        userBindings[key] = parsed.map(item => item.id).join(',');
                    } else {
                        userBindings[key] = value; // Fallback: use as-is
                    }
                } catch (e) {
                    userBindings[key] = value; // Parse failed, use raw value
                }
            } else {
                userBindings[key] = value; // Simple ID string
            }
        }

        let effectiveBindings;
        if (this.activePreset === "none" || this.activePreset === "local") {
            effectiveBindings = { ...this.config, ...userBindings };
            Logger.log(`ResonanceConfig | Preset: "${this.activePreset}", Keys: ${Object.keys(effectiveBindings).length}`);
        } else {
            effectiveBindings = { ...SYRINSCAPE_DEFAULTS, ...this.config, ...userBindings };
            Logger.log(`ResonanceConfig | Preset: "${this.activePreset}", Default Keys: ${Object.keys(SYRINSCAPE_DEFAULTS).length}, Total Keys: ${Object.keys(effectiveBindings).length}`);
            Logger.log(`ResonanceConfig | Has BLOODY_HIT: ${!!effectiveBindings.BLOODY_HIT}, Has MONSTER_WOLF: ${!!effectiveBindings.MONSTER_WOLF}`);
        }

        return effectiveBindings;
    }

    /**
     * Direct lookup for specific mappings (Adversaries, Weapons, Spells)
     */
    getMappings() {
        return this.config.mappings || { adversaries: {}, weapons: {}, spells: {} };
    }

    getPlayers() {
        return this.config.players || {};
    }
}
