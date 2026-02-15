import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const TOKEN = process.argv[2];
if (!TOKEN) {
    console.error("Usage: node audit_syrinscape.js <SYRINSCAPE_AUTH_TOKEN>");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULTS_PATH = path.resolve(__dirname, '../../scripts/data/syrinscape_defaults.js');

let SYRINSCAPE_DEFAULTS = {};

function loadDefaults() {
    try {
        const fileContent = fs.readFileSync(DEFAULTS_PATH, 'utf8');
        const sandbox = {};
        const scriptCode = fileContent.replace('export const', 'const');
        vm.runInNewContext(scriptCode + "; result = SYRINSCAPE_DEFAULTS;", sandbox);
        SYRINSCAPE_DEFAULTS = sandbox.result;
        console.log(`Loaded ${Object.keys(SYRINSCAPE_DEFAULTS).length} default keys.`);
    } catch (e) {
        console.error("Failed to load defaults:", e);
        process.exit(1);
    }
}

const BASE_URL = "https://syrinscape.com/online/frontend-api/elements/";

async function checkId(id) {
    const url = `${BASE_URL}${id}/?auth_token=${TOKEN}`;
    try {
        const response = await fetch(url);
        if (response.ok) return true;
        if (response.status === 429) {
            console.warn("Rate limited! Waiting...");
            await new Promise(r => setTimeout(r, 5000));
            return checkId(id); // Retry
        }
        return false;
    } catch (e) {
        console.error(`Error checking ID ${id}:`, e);
        return false;
    }
}


const SEARCH_URL = "https://syrinscape.com/search/";

async function searchSyrinscape(query) {
    if (!query) return [];
    // Clean query
    const cleanerQuery = query.replace(/\(.*?\)/g, "").trim(); // Remove (Flesh), (Generic) etc
    const url = `${SEARCH_URL}?q=${encodeURIComponent(cleanerQuery)}&format=json&auth_token=${TOKEN}`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            // Filter for available content only
            return (data.results || []).filter(r => r.available_to_play !== false);
        }
    } catch (e) {
        console.error("Search error:", e);
    }
    return [];
}

async function runAudit() {
    await loadDefaults();

    // 1. Extract all unique IDs
    const allIds = new Set();
    for (const value of Object.values(SYRINSCAPE_DEFAULTS)) {
        if (Array.isArray(value)) {
            value.forEach(v => allIds.add(typeof v === 'object' ? String(v.id) : String(v)));
        } else if (typeof value === 'object') {
            allIds.add(String(value.id));
        } else {
            allIds.add(String(value));
        }
    }

    console.log(`Auditing ${allIds.size} unique IDs...`);

    const validIds = new Set();
    let checked = 0;

    // Cache validation results to avoid re-checking same ID
    const validationCache = new Map();

    for (const id of allIds) {
        checked++;
        if (checked % 10 === 0) process.stdout.write('.');

        const isValid = await checkId(id);
        if (isValid) validIds.add(id);

        // Politeness delay
        await new Promise(r => setTimeout(r, 50));
    }
    console.log("\nCheck complete.");

    // 2. Build Report & Suggestions
    // 3. Candidate Generation for Manual Curation - CORE FOCUS
    console.log("Generating candidates for manual curation (CORE FINAL)...");

    // Define Core Categories and their search terms
    const categories = {
        "Core Combat Actions": {
            keys: ["CORE_MELEE", "CORE_RANGED", "CORE_BRAWL", "CORE_MAGIC"],
            search: ["sword clash", "bow", "punch", "fire spell", "ice spell", "lightning spell"],
            excludeType: ["Mood", "SoundSet"]
        },
        "Core Combat Results": {
            keys: ["CORE_HIT", "CORE_MISS", "CORE_CRIT", "CORE_FUMBLE"],
            search: ["arrow hit", "weapon impact", "whoosh", "critical decoration", "fail", "miss"],
            excludeType: ["Mood", "SoundSet"]
        },
        "Core Vocals (Humanoid)": {
            keys: ["CORE_PAIN_MASCULINE", "CORE_PAIN_FEMININE", "CORE_DEATH_MASCULINE", "CORE_DEATH_FEMININE"],
            search: ["grunt", "scream", "shout", "dying", "pain"],
            excludeType: ["Mood", "SoundSet"]
        },
        "Core Vocals (Monster)": {
            keys: ["CORE_MONSTER_PAIN", "CORE_MONSTER_DEATH"],
            search: ["goblin", "orc", "zombie", "roar", "growl", "creature"],
            excludeType: ["Mood", "SoundSet"]
        },
        "Core Recovery": {
            keys: ["CORE_RECOVERY", "CORE_HEAL"],
            search: ["breath", "exhale", "relief", "healing", "divine", "chime"],
            excludeType: ["Mood", "SoundSet"]
        },
        "Core Atmosphere": {
            keys: ["CORE_WEATHER"],
            search: ["rain loop", "storm loop", "wind loop", "silence"],
            excludeType: []
        }
    };

    let markdownContent = "# Final Core Sound Selection\n\n";
    markdownContent += "Please mark **one** option per category with `[x]` to select it as the DEFAULT for that group.\n";
    markdownContent += "These sounds will map to the new abstract `CORE_` keys.\n\n";

    for (const [groupName, groupData] of Object.entries(categories)) {
        markdownContent += `## ${groupName}\n\n`;

        for (const term of groupData.search) {
            const results = await searchSyrinscape(term);
            const excludeTypes = groupData.excludeType || [];
            // STRICT FILTER: No SoundSamples
            excludeTypes.push("SoundSample");

            if (results.length > 0) {
                // Deduplicate by ID
                const uniqueResults = new Map();
                results.forEach(r => uniqueResults.set(String(r.pk), r));

                // Filter and Limit
                let count = 0;
                let hasHeader = false;

                for (const r of uniqueResults.values()) {
                    if (count >= 5) break;

                    const id = r.pk;
                    const name = r.name || r.title;
                    const type = r.kind || r.model_name;

                    if (excludeTypes.includes(type)) continue;

                    if (!hasHeader) {
                        markdownContent += `### Search: "${term}"\n`;
                        hasHeader = true;
                    }

                    markdownContent += `- [ ] **${name}** (ID: \`${id}\`, Type: ${type})\n`;
                    count++;
                }
                if (hasHeader) markdownContent += "\n";
            }
            await new Promise(r => setTimeout(r, 200)); // Rate limit
        }
    }

    // Manual Injections (User Provided)
    markdownContent += "\n## Manual Injections (Verified)\n";
    markdownContent += "- [x] **Core Ranged Default** (ID: `1039`, Manual)\n";
    markdownContent += "- [x] **Core Hit Default** (ID: `3743656`, Manual)\n";

    fs.writeFileSync('free_tier_candidates.md', markdownContent);
    console.log("Candidate list written to 'free_tier_candidates.md'.");
}

runAudit();
