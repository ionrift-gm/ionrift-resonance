import { BladesInTheDarkAdapter } from "./concrete/narrative/BladesInTheDarkAdapter.js";
import { CoC7Adapter } from "./concrete/other/CoC7Adapter.js";
import { CyberpunkREDAdapter } from "./concrete/other/CyberpunkREDAdapter.js";
import { DaggerheartAdapter } from "./concrete/narrative/DaggerheartAdapter.js";
import { DnD35eAdapter } from "./concrete/dnd/DnD35eAdapter.js";
import { DnD5eAdapter } from "./concrete/dnd/DnD5eAdapter.js";
import { OSEAdapter } from "./concrete/dnd/OSEAdapter.js";
import { PF1eAdapter } from "./concrete/pathfinder/PF1eAdapter.js";
import { PF2eAdapter } from "./concrete/pathfinder/PF2eAdapter.js";
import { SFRPGAdapter } from "./concrete/pathfinder/SFRPGAdapter.js";
import { SWADEAdapter } from "./concrete/narrative/SWADEAdapter.js";
import { WFRP4eAdapter } from "./concrete/other/WFRP4eAdapter.js";
import { Logger } from "../utils/Logger.js";

const SYSTEM_ADAPTERS = {
    daggerheart: DaggerheartAdapter,
    dnd5e: DnD5eAdapter,
    pf2e: PF2eAdapter,
    sfrpg: SFRPGAdapter,
    pf1: PF1eAdapter,
    D35E: DnD35eAdapter,
    ose: OSEAdapter,
    CoC7: CoC7Adapter,
    swade: SWADEAdapter,
    wfrp4e: WFRP4eAdapter,
    "cyberpunk-red-core": CyberpunkREDAdapter,
    "blades-in-the-dark": BladesInTheDarkAdapter
};

export function createSystemAdapter(handler, systemId = game.system.id) {
    const Adapter = SYSTEM_ADAPTERS[systemId];
    if (Adapter) return new Adapter(handler);

    Logger.warn(`System '${systemId}' not strictly supported. Defaulting to DnD5e generic logic.`);
    return new DnD5eAdapter(handler);
}
