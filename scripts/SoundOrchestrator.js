import { Logger } from "./Logger.js";

/**
 * SoundOrchestrator - Sound Budget Manager + Timing Coordinator.
 *
 * Sits between SoundHandler.play() and SoundManager to enforce:
 *   1. Per-category budget windows (throttle) - prevents sound spam.
 *   2. Per-key timing offsets - consistent stagger between layered sounds.
 *
 * Categories group semantically related keys. Budget window is shared across
 * all keys in a category. Crossing FEAR_LOW -> FEAR_MED -> FEAR_HIGH all
 * consume the same FEAR_STINGER budget.
 *
 * Keys not assigned to any category always play (no throttle).
 */
export class SoundOrchestrator {

    // -------------------------------------------------------------------------
    // Category definitions - which keys share a budget window.
    // -------------------------------------------------------------------------
    static CATEGORIES = {
        FEAR_STINGER: [
            "DAGGERHEART_FEAR_LOW",
            "DAGGERHEART_FEAR_MED",
            "DAGGERHEART_FEAR_HIGH"
        ],
        FEAR_USE: [
            "DAGGERHEART_FEAR_USE_LOW",
            "DAGGERHEART_FEAR_USE_MED",
            "DAGGERHEART_FEAR_USE_HIGH"
        ],
        // Fine-grained DH resource categories - allow Hope+Stress to fire together.
        DH_HOPE_GAIN: ["DAGGERHEART_HOPE"],
        DH_HOPE_USE: ["DAGGERHEART_HOPE_USE"],
        DH_STRESS_GAIN: ["DAGGERHEART_STRESS"],
        DH_STRESS_CLEAR: ["DAGGERHEART_STRESS_CLEAR"],
        DH_ARMOR_USE: ["DAGGERHEART_ARMOR_USE"],
        DH_ARMOR_REPAIR: ["DAGGERHEART_ARMOR_REPAIR"],
        // Outcome stingers - never throttled (crit/fumble/hope/fear are per-roll events).
        DH_OUTCOME: [
            "DAGGERHEART_CRIT",
            "DAGGERHEART_SUCCESS",
            "DAGGERHEART_FAIL"
        ],
        // All monster vocalisations share one window (AoE mitigation layer 2).
        MONSTER_VOCAL: [
            "MONSTER_HUMANOID", "MONSTER_GOBLIN", "MONSTER_LYCANTHROPE",
            "MONSTER_UNDEAD", "MONSTER_ZOMBIE", "MONSTER_SKELETON", "MONSTER_GHOST",
            "MONSTER_BEAST", "MONSTER_BEAR", "MONSTER_WOLF", "MONSTER_CAT",
            "MONSTER_BIRD", "MONSTER_HORSE", "MONSTER_REPTILE",
            "MONSTER_INSECT", "MONSTER_FIEND", "MONSTER_DEMON", "MONSTER_DRAGON",
            "MONSTER_GIANT", "MONSTER_CONSTRUCT", "MONSTER_PLANT", "MONSTER_ORC",
            "MONSTER_SPIDER", "MONSTER_ALIEN",
            "MONSTER_ELEMENTAL", "MONSTER_ELEMENTAL_fire", "MONSTER_ELEMENTAL_water",
            "MONSTER_ELEMENTAL_air", "MONSTER_ELEMENTAL_earth",
            "MONSTER_FIEND_FERAL", "MONSTER_FIEND_INTELLIGENT",
            "dragon_wyvern", "plant_treant", "plant_myconid", "plant_shambling_mound",
            "construct_golem", "construct_animated_object",
            "aberration_beholder", "aberration_mind_flayer", "aberration_chuul",
            "SFX_INSECT", "SFX_FIRE", "SFX_WATER_ENTITY", "SFX_WIND", "SFX_SLIME",
            "elemental_earth"
        ],
        // PC vocals - always play (deaths/pain are important individual events).
        PC_VOCAL: [
            "CORE_PAIN_MASCULINE", "CORE_PAIN_FEMININE",
            "CORE_DEATH_MASCULINE", "CORE_DEATH_FEMININE",
            "PC_DEATH", "VOCAL_GENERIC_DEATH"
        ]
    };

    // -------------------------------------------------------------------------
    // Default budget windows (ms). 0 = unlimited.
    // User overrides via world setting `orchestratorConfig`.
    // -------------------------------------------------------------------------
    static DEFAULT_BUDGETS = {
        FEAR_STINGER: 5000,
        FEAR_USE: 5000,
        DH_HOPE_GAIN: 5000,
        DH_HOPE_USE: 5000,
        DH_STRESS_GAIN: 3000,
        DH_STRESS_CLEAR: 5000,
        DH_ARMOR_USE: 2000,
        DH_ARMOR_REPAIR: 5000,
        DH_OUTCOME: 0,       // unlimited - per-roll outcome events
        MONSTER_VOCAL: 2000,
        PC_VOCAL: 0        // unlimited - PC deaths/pain always play
    };

    // -------------------------------------------------------------------------
    // Named timing offsets (ms) - configurable stagger presets.
    // Adapters reference these by name instead of hardcoding constants.
    // -------------------------------------------------------------------------
    static DEFAULT_OFFSETS = {
        VOCAL_STAGGER: 1400,      // Delay between impact sound and pain/death vocal
        AOE_VOCAL_MAX: 400,       // Max random stagger for AoE chorus effect
        SPELL_AUDIO_BONUS: 150,   // Extra clearance for spell audio effects
        FUMBLE_MISS_DELAY: 200,   // Delay before miss sound after fumble stinger
        CRIT_DECORATION_DELAY: 300 // Delay before decoration sound after crit stinger
    };

    static OFFSET_LABELS = {
        VOCAL_STAGGER: "Vocal Delay (after impact)",
        AOE_VOCAL_MAX: "AoE Vocal Stagger (max)",
        SPELL_AUDIO_BONUS: "Spell Audio Bonus",
        FUMBLE_MISS_DELAY: "Fumble -> Miss Delay",
        CRIT_DECORATION_DELAY: "Crit -> Decoration Delay"
    };

    constructor() {
        // In-memory: category -> last-fired timestamp (resets on reload).
        this.lastPlayed = new Map();
        // Persisted config: budget overrides + timing offsets + named offsets.
        this.budgetConfig = {};
        this.timingConfig = {};
        this.offsetConfig = {};
    }

    /**
     * Load configuration from the world setting.
     * Call on init and whenever orchestratorConfig setting changes.
     */
    loadConfig() {
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            const parsed = raw ? JSON.parse(raw) : {};
            this.budgetConfig = parsed.budgets ?? {};
            this.timingConfig = parsed.timing ?? {};
            this.offsetConfig = parsed.offsets ?? {};
            Logger.log(`SoundOrchestrator | Config loaded. Budget overrides: ${Object.keys(this.budgetConfig).length}, Offset overrides: ${Object.keys(this.offsetConfig).length}`);
        } catch (e) {
            Logger.error("SoundOrchestrator | Failed to load config:", e);
            this.budgetConfig = {};
            this.timingConfig = {};
            this.offsetConfig = {};
        }
    }

    /**
     * Get which category a key belongs to.
     * @param {string} key
     * @returns {string|null}
     */
    getCategory(key) {
        for (const [cat, keys] of Object.entries(SoundOrchestrator.CATEGORIES)) {
            if (keys.includes(key)) return cat;
        }
        return null;
    }

    /**
     * Check if a key is allowed to play under its budget window.
     * Keys not in any category always play.
     *
     * @param {string} key
     * @returns {boolean} true = play, false = throttled
     */
    allow(key) {
        const category = this.getCategory(key);
        if (!category) return true;    // uncategorised - always play

        const budgetMs = this.budgetConfig[category]?.budgetMs
            ?? SoundOrchestrator.DEFAULT_BUDGETS[category]
            ?? 0;
        if (!budgetMs) return true;    // 0 = unlimited

        const last = this.lastPlayed.get(category) ?? 0;
        const elapsed = Date.now() - last;

        if (elapsed < budgetMs) {
            Logger.log(`SoundOrchestrator | Throttled [${category}] "${key}" (${elapsed}ms < ${budgetMs}ms budget)`);
            return false;
        }

        this.lastPlayed.set(category, Date.now());
        return true;
    }

    /**
     * Get the configured delay offset for a key (ms).
     * Used to stagger layered sounds (e.g. crit stinger fires 150ms after impact).
     *
     * @param {string} key
     * @returns {number} offset in ms (default 0)
     */
    getOffset(key) {
        return this.timingConfig[key]?.offsetMs ?? 0;
    }

    /**
     * Get a named offset value (ms), with config override support.
     * Used by adapters for configurable stagger constants.
     *
     * @param {string} name - Offset name (e.g. 'VOCAL_STAGGER')
     * @returns {number} offset in ms
     */
    getNamedOffset(name) {
        return this.offsetConfig[name] ?? SoundOrchestrator.DEFAULT_OFFSETS[name] ?? 0;
    }

    /**
     * Manually reset a category's budget window.
     * Useful for testing or GM override scenarios.
     *
     * @param {string} category
     */
    resetCategory(category) {
        this.lastPlayed.delete(category);
        Logger.log(`SoundOrchestrator | Reset budget for category: ${category}`);
    }

    /**
     * Reset all in-memory budget state.
     */
    resetAll() {
        this.lastPlayed.clear();
        Logger.log("SoundOrchestrator | All budget windows reset.");
    }
}
