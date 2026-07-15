import { PF1eAdapter } from "../pathfinder/PF1eAdapter.js";
import { Logger } from "../../../utils/Logger.js";

/**
 * D&D 3.5e (D35E) adapter.
 * D35E is a PF1 fork; reuse PF1 hook surface and chat fallbacks.
 */
export class DnD35eAdapter extends PF1eAdapter {

    registerHooks() {
        Logger.log("D35E Adapter Active");
        super.registerHooks();
    }
}
