import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKDOWN_PATH = path.resolve(__dirname, '../../free_tier_candidates.md');
const DEFAULTS_PATH = path.resolve(__dirname, '../../scripts/data/syrinscape_defaults.js');

// Mapping Search Terms (from Markdown headers) to Core Keys
const TERM_MAPPING = {
    // Combat Actions
    "sword clash": "CORE_MELEE",
    "bow fire": "CORE_RANGED",
    "punch": "CORE_BRAWL",
    "fire spell": "CORE_MAGIC",
    "ice spell": "CORE_MAGIC",
    "lightning spell": "CORE_MAGIC",

    // Combat Results
    "flesh hit": "CORE_HIT",
    "whoosh": "CORE_WHOOSH",
    "miss": "CORE_MISS",
    "critical hit": "CORE_CRIT",
    "fail": "CORE_FUMBLE",

    // Vocals - Heuristics needed for Male/Female
    "grunt": ["CORE_PAIN_MASCULINE", "CORE_PAIN_FEMININE"],
    "yell": ["CORE_PAIN_MASCULINE", "CORE_PAIN_FEMININE"],
    "humanoid death": ["CORE_DEATH_MASCULINE", "CORE_DEATH_FEMININE"],

    // Monster
    "goblin pain": "CORE_MONSTER_PAIN",
    "monster growl": "CORE_MONSTER_PAIN",
    "creature cry": "CORE_MONSTER_PAIN",

    // Recovery
    "breath": "CORE_RECOVERY",
    "healing": "CORE_HEAL",

    // Atmosphere
    "rain loop": "CORE_WEATHER",
    "storm loop": "CORE_WEATHER", // Or specifically CORE_WEATHER_STORM if we had it, but keeping to CORE_WEATHER for now as var
    "wind loop": "CORE_WEATHER",
    "silence": "CORE_WEATHER"
};

function parseCandidates() {
    const content = fs.readFileSync(MARKDOWN_PATH, 'utf8');
    const lines = content.split('\n');

    const candidates = {};
    let currentSearchTerm = "";

    for (const line of lines) {
        // ### Search: "sword clash"
        const searchMatch = line.match(/^### Search: "(.*)"/);
        if (searchMatch) {
            currentSearchTerm = searchMatch[1].trim();
            // console.log(`Search Term Found: '${currentSearchTerm}'`);
            continue;
        }

        // - [ ] **Name** (ID: `123`, Type: OneShot)
        const itemMatch = line.match(/^- \[.\] \*\*(.*)\*\* \(ID: `(\d+|.*?)`, Type: (.*)\)/);
        if (itemMatch && currentSearchTerm) {
            const [_, name, id, type] = itemMatch;

            // Map to Keys
            let keys = TERM_MAPPING[currentSearchTerm];
            console.log(`Match: ${name} (${id}) under '${currentSearchTerm}' -> Keys: ${keys}`);

            if (!keys) {
                console.warn(`No mapping for '${currentSearchTerm}'`);
                continue;
            }

            if (!Array.isArray(keys)) keys = [keys];

            for (const key of keys) {
                // Name-based filtering for Vocal split
                if (key.includes("MASCULINE") && name.toLowerCase().includes("female")) continue;
                if (key.includes("FEMININE") && name.toLowerCase().includes("male") && !name.toLowerCase().includes("female")) continue;

                // Strict check: if name says "Male", don't put in Feminine. If "Female", don't put in Masculine.
                if (key === "CORE_PAIN_FEMININE" || key === "CORE_DEATH_FEMININE") {
                    if (name.toLowerCase().includes("male") && !name.toLowerCase().includes("female")) continue;
                }
                if (key === "CORE_PAIN_MASCULINE" || key === "CORE_DEATH_MASCULINE") {
                    if (name.toLowerCase().includes("female")) continue;
                }

                if (!candidates[key]) candidates[key] = [];
                candidates[key].push({ id, name });
            }
        } else {
            console.log(`Skipping line: ${line}`);
        }
    }
    return candidates;
}

function writeDefaults(candidates) {
    let jsContent = `export const SYRINSCAPE_DEFAULTS = {\n`;

    // Write Core Keys
    const sortedKeys = Object.keys(candidates).sort();
    for (const key of sortedKeys) {
        const objs = candidates[key];
        // Deduplicate using Map on ID
        const unique = new Map();
        objs.forEach(o => unique.set(o.id, o));
        const finalObjs = Array.from(unique.values());

        const json = JSON.stringify(finalObjs, null, 4).replace(/\n/g, "\n    "); // Indent
        jsContent += `    "${key}": ${json},\n`;
    }

    jsContent += `};\n`;

    fs.writeFileSync(DEFAULTS_PATH, jsContent);
    console.log(`Defaults written to ${DEFAULTS_PATH}`);
}

const data = parseCandidates();
writeDefaults(data);
