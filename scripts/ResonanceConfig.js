import { Logger } from "./Logger.js";
import { SYRINSCAPE_DEFAULTS } from "./data/syrinscape_defaults.js";
import { SoundPackLoader } from "./services/SoundPackLoader.js";
import { SyrinscapeProvider } from "./providers/SyrinscapeProvider.js";

export class ResonanceConfig {
    constructor() {
        this.config = { mappings: { adversaries: {}, weapons: {}, spells: {} }, players: {} };
    }

    /**
     * Loads user overrides and campaign config.
     * Preset file fetch is no longer needed -- SoundPackLoader handles pack bindings.
     */
    async load() {
        // Initialize default safe config
        this.config = {};

        // Load User Overrides
        const overrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

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
     * Returns a composed object of all effective bindings.
     * Cascade: Syrinscape Defaults (if configured) -> Pack Bindings -> User Overrides
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

        // Pack bindings from SoundPackLoader (additive, lower priority than user overrides)
        const packBindings = SoundPackLoader.loaded ? SoundPackLoader.getMergedBindings() : {};
        const packKeyCount = Object.keys(packBindings).length;

        // Syrinscape defaults provide cloud IDs for users with a configured token.
        // Without Syrinscape, these would be unplayable -- skip the layer entirely.
        const hasSyrinscape = SyrinscapeProvider.isConfigured();

        let effectiveBindings;
        if (hasSyrinscape) {
            effectiveBindings = { ...SYRINSCAPE_DEFAULTS, ...packBindings, ...this.config, ...userBindings };
            Logger.log(`ResonanceConfig | Syrinscape configured. Default Keys: ${Object.keys(SYRINSCAPE_DEFAULTS).length}, Pack Keys: ${packKeyCount}, Total Keys: ${Object.keys(effectiveBindings).length}`);
        } else {
            effectiveBindings = { ...packBindings, ...this.config, ...userBindings };
            Logger.log(`ResonanceConfig | Pack Keys: ${packKeyCount}, Total Keys: ${Object.keys(effectiveBindings).length}`);
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
