import { Logger } from "../../utils/Logger.js";

export class SoundOrchestrator {

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
        DH_HOPE_GAIN: ["DAGGERHEART_HOPE"],
        DH_HOPE_USE: ["DAGGERHEART_HOPE_USE"],
        DH_STRESS_GAIN: ["DAGGERHEART_STRESS"],
        DH_STRESS_CLEAR: ["DAGGERHEART_STRESS_CLEAR"],
        DH_ARMOR_USE: ["DAGGERHEART_ARMOR_USE"],
        DH_ARMOR_REPAIR: ["DAGGERHEART_ARMOR_REPAIR"],
        DH_OUTCOME: [
            "DAGGERHEART_CRIT",
            "DAGGERHEART_SUCCESS",
            "DAGGERHEART_FAIL"
        ],
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
            "elemental_earth",
            "MONSTER_VAMPIRE", "MONSTER_VAMPIRE_ATTACK", "MONSTER_VAMPIRE_SPELL",
            "MONSTER_MUMMY", "MONSTER_MUMMY_ATTACK",
            "MONSTER_LICH", "MONSTER_LICH_ATTACK", "MONSTER_LICH_SPELL_TOUCH", "MONSTER_LICH_SPELL_CAST",
            "MONSTER_WRAITH", "MONSTER_WRAITH_ATTACK", "MONSTER_WRAITH_SPELL",
            "MONSTER_RAT", "MONSTER_RAT_ATTACK"
        ],
        PC_VOCAL: [
            "CORE_PAIN_MASCULINE", "CORE_PAIN_FEMININE",
            "CORE_DEATH_MASCULINE", "CORE_DEATH_FEMININE",
            "PC_DEATH", "VOCAL_GENERIC_DEATH"
        ],
        AMBIENT: [
            "AMBIENT_CAMPFIRE",
            "AMBIENT_CAMPFIRE_COOKING",
            "AMBIENT_NIGHT_FOREST"
        ],
        SPELL_VOCAL: [
            "SPELL_VOCAL_CAST",
            "SPELL_VOCAL_EVOCATION",
            "SPELL_VOCAL_NECROMANCY",
            "SPELL_VOCAL_CONJURATION",
            "SPELL_VOCAL_ENCHANTMENT",
            "SPELL_VOCAL_ILLUSION",
            "SPELL_VOCAL_DIVINATION",
            "SPELL_VOCAL_TRANSMUTATION",
            "SPELL_VOCAL_ABJURATION"
        ]
    };
    // 0 = unlimited
    static DEFAULT_BUDGETS = {
        FEAR_STINGER: 5000,
        FEAR_USE: 5000,
        DH_HOPE_GAIN: 5000,
        DH_HOPE_USE: 5000,
        DH_STRESS_GAIN: 3000,
        DH_STRESS_CLEAR: 5000,
        DH_ARMOR_USE: 2000,
        DH_ARMOR_REPAIR: 5000,
        DH_OUTCOME: 0,
        MONSTER_VOCAL: 2000,
        PC_VOCAL: 0,
        AMBIENT: 0,
        SPELL_VOCAL: 0
    };

    static DEFAULT_OFFSETS = {
        VOCAL_STAGGER: 1400,
        AOE_VOCAL_MAX: 400,
        SPELL_AUDIO_BONUS: 150,
        FUMBLE_MISS_DELAY: 200,
        CRIT_DECORATION_DELAY: 300,
        MONSTER_SPELL_EFFECT_DELAY: 250,
        SPELL_VOCAL_LEAD_IN: 400
    };

    static OFFSET_LABELS = {
        VOCAL_STAGGER: "Vocal Delay (after impact)",
        AOE_VOCAL_MAX: "AoE Vocal Stagger (max)",
        SPELL_AUDIO_BONUS: "Spell Audio Bonus",
        FUMBLE_MISS_DELAY: "Fumble to Miss Delay",
        CRIT_DECORATION_DELAY: "Crit to Decoration Delay",
        MONSTER_SPELL_EFFECT_DELAY: "Monster Spell Effect Delay",
        SPELL_VOCAL_LEAD_IN: "Spell Vocal Lead-in (before effect)"
    };

    constructor() {
        this.lastPlayed = new Map();
        this.budgetConfig = {};
        this.timingConfig = {};
        this.offsetConfig = {};
    }

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

    getCategory(key) {
        for (const [cat, keys] of Object.entries(SoundOrchestrator.CATEGORIES)) {
            if (keys.includes(key)) return cat;
        }
        return null;
    }

    allow(key) {
        const category = this.getCategory(key);
        if (!category) return true;

        const budgetMs = this.budgetConfig[category]?.budgetMs
            ?? SoundOrchestrator.DEFAULT_BUDGETS[category]
            ?? 0;
        if (!budgetMs) return true;

        const last = this.lastPlayed.get(category) ?? 0;
        const elapsed = Date.now() - last;

        if (elapsed < budgetMs) {
            Logger.log(`SoundOrchestrator | Throttled [${category}] "${key}" (${elapsed}ms < ${budgetMs}ms budget)`);
            return false;
        }

        this.lastPlayed.set(category, Date.now());
        return true;
    }

    getOffset(key) {
        return this.timingConfig[key]?.offsetMs ?? 0;
    }

    getNamedOffset(name) {
        return this.offsetConfig[name] ?? SoundOrchestrator.DEFAULT_OFFSETS[name] ?? 0;
    }

    resetCategory(category) {
        this.lastPlayed.delete(category);
        Logger.log(`SoundOrchestrator | Reset budget for category: ${category}`);
    }

    resetAll() {
        this.lastPlayed.clear();
        Logger.log("SoundOrchestrator | All budget windows reset.");
    }
}
