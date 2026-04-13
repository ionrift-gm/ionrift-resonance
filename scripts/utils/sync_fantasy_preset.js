
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SYRINSCAPE_DEFAULTS } from '../data/syrinscape_defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESET_PATH = path.resolve(__dirname, '../../scripts/presets/fantasy.json');

function syncPreset() {
    // console.log(`Reading preset from: ${PRESET_PATH}`);

    let preset = {};
    try {
        const content = fs.readFileSync(PRESET_PATH, 'utf8');
        preset = JSON.parse(content);
    } catch (e) {
        console.error("Failed to read preset:", e);
        process.exit(1);
    }

    // console.log("Syncing keys from SYRINSCAPE_DEFAULTS...");
    let added = 0;

    for (const [key, value] of Object.entries(SYRINSCAPE_DEFAULTS)) {
        // If key exists in preset root, skip (or update?)
        // We want to ENSURE it exists.

        let idToUse = "";

        // Value in DEFAULTS is an Array of Objects [{id, name}, ...]
        if (Array.isArray(value) && value.length > 0) {
            // Pick the first one as default
            idToUse = value[0].id;
        } else if (typeof value === 'object' && value.id) {
            idToUse = value.id;
        } else if (typeof value === 'string') {
            idToUse = value;
        }

        if (idToUse) {
            if (!preset[key]) {
                // console.log(`+ Adding ${key}: ${idToUse}`);
                preset[key] = idToUse;
                added++;
            } else {
                // Optional: Update if different? 
                // For now, let's just fill missing.
                if (preset[key] !== idToUse) {
                    // console.log(`~ Updating ${key}: ${preset[key]} -> ${idToUse}`);
                    preset[key] = idToUse;
                    added++;
                }
            }
        }
    }

    // Explicit Aliasing for PC keys (satisfies Integrity Check + Explicit Config)
    const aliases = {
        "PC_PAIN_MALE": "CORE_PAIN_MASCULINE",
        "PC_PAIN_FEMALE": "CORE_PAIN_FEMININE",
        "PC_DEATH_MALE": "CORE_DEATH_MASCULINE",
        "PC_DEATH_FEMALE": "CORE_DEATH_FEMININE",
        "PC_DEATH": "PC_DEATH" // Ensure this maps to itself or default if needed
    };

    for (const [pcKey, coreKey] of Object.entries(aliases)) {
        if (preset[coreKey]) {
            if (preset[pcKey] !== preset[coreKey]) {
                // console.log(`+ Aliasing ${pcKey} -> ${coreKey} (${preset[coreKey]})`);
                preset[pcKey] = preset[coreKey];
                added++;
            }
        }
    }

    // Also, ensure `mappings` structure exists if not present
    if (!preset.mappings) preset.mappings = { adversaries: {}, weapons: {}, spells: {}, generic: {} };

    if (added > 0) {
        fs.writeFileSync(PRESET_PATH, JSON.stringify(preset, null, 4));
        // console.log(`\nSuccessfully synced ${added} keys to fantasy.json`);
    } else {
        // console.log("\nNo changes needed. Preset is in sync.");
    }
}

syncPreset();
