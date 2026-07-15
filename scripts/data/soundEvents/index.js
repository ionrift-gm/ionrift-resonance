import { COMBAT_EVENTS } from "./combat.js";
import { SPELL_EVENTS } from "./spells.js";
import { WEAPON_EVENTS } from "./weapons.js";
import { MONSTER_EVENTS } from "./monsters.js";
import { SFX_EVENTS } from "./sfx.js";
import { SYSTEM_EVENTS } from "./systems.js";
import { ALIAS_EVENTS } from "./aliases.js";
import { MILESTONE_EVENTS } from "./milestones.js";
import { SPELL_VOCAL_EVENTS } from "./spellVocals.js";

export const SOUND_EVENTS = {
    ...COMBAT_EVENTS,
    ...SPELL_EVENTS,
    ...WEAPON_EVENTS,
    ...MONSTER_EVENTS,
    ...SFX_EVENTS,
    ...SYSTEM_EVENTS,
    ...ALIAS_EVENTS,
    ...MILESTONE_EVENTS,
    ...SPELL_VOCAL_EVENTS
};

export {
    COMBAT_EVENTS,
    SPELL_EVENTS,
    WEAPON_EVENTS,
    MONSTER_EVENTS,
    SFX_EVENTS,
    SYSTEM_EVENTS,
    ALIAS_EVENTS,
    MILESTONE_EVENTS,
    SPELL_VOCAL_EVENTS
};