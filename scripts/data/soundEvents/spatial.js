import { ALIAS_EVENTS } from "./aliases.js";
import { COMBAT_EVENTS } from "./combat.js";
import { CURSEWRIGHT_EVENTS } from "./cursewright.js";
import { MILESTONE_EVENTS } from "./milestones.js";
import { MONSTER_EVENTS } from "./monsters.js";
import { QUIZ_NIGHT_EVENTS } from "./quizNight.js";
import { RESPITE_EVENTS } from "./respite.js";
import { SFX_EVENTS } from "./sfx.js";
import { SPELL_EVENTS } from "./spells.js";
import { SPELL_VOCAL_EVENTS } from "./spellVocals.js";
import { SYSTEM_EVENTS } from "./systems.js";
import { VOICE_EVENTS } from "./voice.js";
import { WEAPON_EVENTS } from "./weapons.js";

const RESPITE_ORIGIN = new Set(["RESPITE_FIRE_LIT", "RESPITE_CAMPFIRE"]);
const RESPITE_GLOBAL = new Set(["RESPITE_SLEEP_STARTED", "RESPITE_RESOLUTION"]);

const ORIGIN_GROUPS = [
    WEAPON_EVENTS,
    COMBAT_EVENTS,
    SPELL_EVENTS,
    SPELL_VOCAL_EVENTS,
    MONSTER_EVENTS,
    SFX_EVENTS
];

const GLOBAL_GROUPS = [
    SYSTEM_EVENTS,
    MILESTONE_EVENTS,
    QUIZ_NIGHT_EVENTS,
    CURSEWRIGHT_EVENTS,
    VOICE_EVENTS
];

const CLASS_BY_KEY = new Map();
const VALUE_OWNER = new Map();

function remember(group, cls) {
    for (const [key, value] of Object.entries(group)) {
        if (!CLASS_BY_KEY.has(key)) CLASS_BY_KEY.set(key, cls);
        if (typeof value === "string" && !VALUE_OWNER.has(value)) VALUE_OWNER.set(value, key);
    }
}

for (const group of ORIGIN_GROUPS) remember(group, "origin");
for (const group of GLOBAL_GROUPS) remember(group, "global");
remember(RESPITE_EVENTS, "global");
for (const key of RESPITE_ORIGIN) CLASS_BY_KEY.set(key, "origin");

const KIND = {
    weapon: WEAPON_EVENTS,
    combat: COMBAT_EVENTS,
    spell: SPELL_EVENTS,
    spellVocal: SPELL_VOCAL_EVENTS,
    monster: MONSTER_EVENTS,
    sfx: SFX_EVENTS
};

function inGroup(key, group) {
    return Object.prototype.hasOwnProperty.call(group, key);
}

/**
 * Follow alias redirects to the event key that owns the class.
 * Identity aliases (value equals the key) are not followed.
 * Binding ids such as CORE_HIT resolve to the group key that uses them.
 * @param {string} key
 * @returns {string}
 */
export function resolveSpatialKey(key) {
    let current = key;
    const seen = new Set();
    for (let hop = 0; hop < 6; hop++) {
        if (!current || seen.has(current)) break;
        seen.add(current);
        const alias = ALIAS_EVENTS[current];
        if (alias && alias !== current) {
            current = alias;
            continue;
        }
        if (CLASS_BY_KEY.has(current)) return current;
        const owner = VALUE_OWNER.get(current);
        if (owner) return owner;
        return current;
    }
    return current;
}

/**
 * @param {string} key
 * @returns {"global"|"origin"}
 */
export function getSpatialClass(key) {
    if (typeof key !== "string" || !key) return "global";
    const resolved = resolveSpatialKey(key);
    if (RESPITE_GLOBAL.has(resolved)) return "global";
    if (RESPITE_ORIGIN.has(resolved)) return "origin";
    if (CLASS_BY_KEY.has(resolved)) return CLASS_BY_KEY.get(resolved);
    if (/PAIN|DEATH/.test(resolved) && !/MONSTER/.test(resolved)) return "origin";
    return "global";
}

/**
 * Category toggle id, or null when no category applies.
 * @param {string} key
 * @returns {"weapons"|"spells"|"creatures"|"vocals"|"campfire"|null}
 */
export function getSpatialCategory(key) {
    if (typeof key !== "string" || !key) return null;
    const resolved = resolveSpatialKey(key);
    if (RESPITE_ORIGIN.has(resolved)) return "campfire";
    if (inGroup(resolved, KIND.spell) || inGroup(resolved, KIND.spellVocal)) return "spells";
    if (inGroup(resolved, KIND.monster) || /MONSTER/.test(resolved)) return "creatures";
    if (/PAIN|DEATH/.test(resolved)) return "vocals";
    if (inGroup(resolved, KIND.weapon) || inGroup(resolved, KIND.combat)) return "weapons";
    return null;
}

/**
 * @param {string} key
 * @returns {"attacker"|"target"|"caster"|"creature"|"damaged"|"caller"|"campfire"|null}
 */
export function getOriginRole(key) {
    if (getSpatialClass(key) !== "origin") return null;
    const resolved = resolveSpatialKey(key);
    if (RESPITE_ORIGIN.has(resolved)) return "campfire";
    if (inGroup(resolved, KIND.spellVocal)) return "caster";
    if (inGroup(resolved, KIND.spell)) return "target";
    if (inGroup(resolved, KIND.monster) || /MONSTER/.test(resolved)) return "creature";
    if (inGroup(resolved, KIND.sfx)) return "caller";
    if (/PAIN|DEATH/.test(resolved)) return "damaged";
    if (inGroup(resolved, KIND.weapon)) return "attacker";
    if (/HIT|MISS|IMPACT|CRIT|FUMBLE|BLOODY/.test(resolved)) return "target";
    if (inGroup(resolved, KIND.combat)) return "attacker";
    return "caller";
}
