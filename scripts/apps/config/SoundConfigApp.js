import { SYRINSCAPE_DEFAULTS, SYRINSCAPE_PRESETS } from "../../data/syrinscape/syrinscape_defaults.js";
import { SoundCardState } from "../../models/SoundCardState.js";
import { Logger } from "../../utils/Logger.js";
import { SOUND_TYPES } from "../../data/soundTypes.js";
import {
    getSoundPackLoader,
    getSyrinscapeProvider,
    getSoundOrchestrator
} from "../../composition/accessors.js";
import { isFeatureFlagEnabled } from "../../data/featureFlags.js";
import { QuizNightIntegration } from "../../integrations/QuizNightIntegration.js";
import { RespiteIntegration } from "../../integrations/RespiteIntegration.js";
import { CursewrightIntegration } from "../../integrations/CursewrightIntegration.js";
import { VoiceIntegration } from "../../integrations/VoiceIntegration.js";
import { TripwireIntegration } from "../../integrations/TripwireIntegration.js";
import { LuminanceIntegration } from "../../integrations/LuminanceIntegration.js";
import { WaterlineIntegration } from "../../integrations/WaterlineIntegration.js";
import { DEFAULT_POSITIONAL_CATEGORIES, positionalPanelData, voiceModuleActive } from "../../services/playback/SpatialSettings.js";

const FEATURE_SHARED_MONSTER_VOICES = false;

export class SoundConfigApp extends FormApplication {
    constructor(object, options) {
        super(object, options);
        this._auditorSearch = "";
        this._auditorPage = 1;
        this._auditorLimit = 25;
        // Debounce refresh to prevent UI thrashing during bulk updates (e.g. combat/initiative)
        this._debouncedRefresh = foundry.utils.debounce(() => this.render(true), 250);

        // UI State Tracking
        this._expandedGroups = new Set(); // Stores labels of open details
        this._scrollPositions = {}; // Stores scroll top by selector
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sound-config",
            title: "ionrift-resonance.config.title",
            template: "modules/ionrift-resonance/templates/sound-config.hbs",
            width: 900,
            height: 750,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "tier1" }],
            classes: ["ionrift", "sheet", "ionrift-window", "glass-ui", "resonance-app"],
            dragDrop: [{ dropSelector: null }],
            scrollY: [".content", ".auditor-list"] // Enable built-in scroll preservation
        });
    }

    _getAuditorData() {
        const auditorItems = [];

        // Scan Actors
        for (const actor of game.actors) {
            const flags = actor.flags["ionrift-resonance"];
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    // Filter out non-sound flags
                    if (key === "identity" || key === "soundPreset" || key === "sound_config" || key.endsWith("_name") || key.endsWith("_meta")) continue;
                    if (!val) continue;

                    // Debug Log for troubleshooting
                    // Logger.log(`Auditor | Processing Flag: ${actor.name} -> ${key}:`, val);

                    const nameVal = flags[key + "_name"] || val;

                    // Format slot name nicely
                    let slotLabel = key.replace("sound_", "").replace(/_/g, " ");
                    slotLabel = slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1);

                    auditorItems.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        type: "Actor",
                        img: actor.img,
                        slot: slotLabel,
                        sound: nameVal,
                        key: key,
                        rawId: val
                    });
                }
            }
        }

        // Scan Items
        for (const item of game.items) {
            const flags = item.flags["ionrift-resonance"];
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    // Filter out non-sound flags
                    if (key === "sound_config" || key.endsWith("_name") || key.endsWith("_meta")) continue;
                    if (!val) continue;

                    const nameVal = flags[key + "_name"] || val;

                    let slotLabel = key.replace("sound_", "").replace(/_/g, " ");
                    slotLabel = slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1);

                    // Format Sound Label
                    let soundLabel = nameVal;
                    let soundType = "";

                    if (soundLabel.includes("[OneshotElement]")) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeOneshot");
                        soundLabel = soundLabel.replace("[OneshotElement]", "").trim();
                    } else if (soundLabel.includes("GLOBAL:")) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeGlobal");
                    } else if (soundLabel.match(/^\d+$/)) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeId");
                    }

                    auditorItems.push({
                        uuid: item.uuid,
                        name: item.name,
                        type: "Item",
                        img: item.img,
                        slot: slotLabel,
                        sound: soundLabel,
                        soundType: soundType,
                        key: key,
                        rawId: val
                    });
                }
            }
        }
        // Filter & Paginate
        const search = this._auditorSearch.toLowerCase().trim();
        let filtered = auditorItems;

        if (search) {
            filtered = auditorItems.filter(i =>
                i.name.toLowerCase().includes(search) ||
                (i.sound && i.sound.toLowerCase().includes(search)) ||
                (i.slot && i.slot.toLowerCase().includes(search))
            );
        }

        // Sort roughly by Name
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        const totalCount = filtered.length;
        const totalPages = Math.ceil(totalCount / this._auditorLimit) || 1;

        // Clamp Page
        if (this._auditorPage > totalPages) this._auditorPage = totalPages;
        if (this._auditorPage < 1) this._auditorPage = 1;

        const start = (this._auditorPage - 1) * this._auditorLimit;
        const paginated = filtered.slice(start, start + this._auditorLimit);

        return {
            items: paginated,
            total: totalCount,
            page: this._auditorPage,
            limit: this._auditorLimit,
            totalPages: totalPages,
            search: this._auditorSearch
        };
    }

    getData() {
        const customBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        // configOverrides is retrieved in 'players' section separately or not needed for main structure
        const configOverrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

        // --- Helpers ---
        // 1. Resolve effective value (Cascade: Custom -> Default -> Inherited)
        /* 
         * Note: "Inherited" means "Inherited from Parent Node in Hierarchy".
         * We pass the parent's resolved state down during processing.
         */
        const resolveValue = (key, loopCheck = []) => {
            if (!key) return null;
            if (loopCheck.includes(key)) return null;

            // 1. Custom bindings always win
            if (customBindings[key]) return { value: customBindings[key], source: "custom" };

            // 2. Pack bindings (from SoundPackLoader)
            const packBindings = getSoundPackLoader().loaded ? getSoundPackLoader().getMergedBindings() : {};
            if (packBindings[key]) return { value: packBindings[key], source: "pack" };

            // 3. Syrinscape defaults (only when Syrinscape is configured)
            if (getSyrinscapeProvider().isConfigured()) {
                const def = SYRINSCAPE_DEFAULTS[key];
                if (def) return { value: def, source: "default" };
            }

            return { value: null, source: null };
        };

        // 2. Recursive Hierarchy Processor
        const processHierarchy = (node, parentState = null) => {
            // My State
            let myState = null;
            let myResolved = { value: null, source: null };

            // A. Resolve MY sound if I have a key
            if (node.id) {
                // Initial check (Custom/Default)
                const check = resolveValue(node.id);

                // Inheritance Logic
                if (check.value) {
                    // We have explicit value
                    myResolved = check;
                    const isCustom = check.source === "custom";
                    // Non-custom sources (pack / syrinscape default) populate defaultValue
                    // so the row renders the resolved sounds as default pills. For custom
                    // overrides keep the Syrinscape default for the "reset to default" path.
                    const displayDefault = isCustom
                        ? SYRINSCAPE_DEFAULTS[node.id]
                        : check.value;
                    myState = new SoundCardState(node.id,
                        isCustom ? check.value : null,
                        displayDefault,
                        node.cardLabel || node.label,
                        node.description
                    );
                    // Expose resolved value to child nodes for inheritance lookups even
                    // when there is no explicit user override. _parse() has already run,
                    // so this only affects parentState.value reads by descendants.
                    if (!isCustom) myState.value = check.value;
                } else {
                    // No explicit value -> Check Parent
                    if (parentState && parentState.value) {
                        // Inherit from parent - parent value drives display
                        myResolved = { value: parentState.value, source: "inherited" };
                        myState = new SoundCardState(node.id, null, parentState.value, node.cardLabel || node.label, node.description, parentState.label);
                        myState.value = myResolved.value;
                    } else {
                        // No parent value either -> Empty
                        myState = new SoundCardState(node.id, null, null, node.cardLabel || node.label, node.description);
                    }
                }
            } else {
                // Group Node (No ID) - Pass parent state through
                myState = parentState;
            }

            const groupData = {
                label: node.label,
                key: node.id,
                description: node.description,
                packName: node.packName || null,
                packIcon: node.packIcon || null,
                children: [],
                fields: [], // Leaf nodes
                headerCard: node.id ? myState.getRenderData() : null,
                isOpen: this._expandedGroups.has(node.label) || false,
                volumeControl: null
            };

            if (node.id && VOLUME_ENABLED_ROOTS.has(node.id)) {
                const vol = taxonomyVolumes[node.id];
                const magicVol = taxonomyVolumes["CORE_MAGIC"];
                const isChild = (node.id === "CORE_SCHOOL" || node.id === "CORE_DOMAIN");
                const effectiveVol = vol ?? (isChild ? (magicVol ?? 1.0) : 1.0);
                groupData.volumeControl = {
                    key: node.id,
                    volume: effectiveVol,
                    percent: Math.round(effectiveVol * 100),
                    hasOverride: vol !== undefined,
                    inheritsFromMagic: isChild && vol === undefined && magicVol !== undefined
                };
            }

            // B. Process Children
            if (node.children) {

                node.children.forEach(child => {
                    const childResult = processHierarchy(child, myState); // Pass MY state as parent

                    // Categorize as Group (children present) or Field (leaf node)

                    if (child.children && child.children.length > 0) {
                        groupData.children.push(childResult);
                    } else {
                        // It's a leaf node. 
                        // If it has an ID, effectively it's a field.
                        // But childResult IS a groupData structure (headerCard + empty children).
                        // We want just the card data for 'fields'.
                        if (childResult.headerCard) {
                            groupData.fields.push(childResult.headerCard);
                        } else {
                            // Group with no ID and no children? Dead node.
                        }
                    }
                });
            }

            return groupData;
        };

        // --- Taxonomy Volume Controls ---
        let taxonomyVolumes = {};
        try {
            taxonomyVolumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        const VOLUME_ENABLED_ROOTS = new Set([
            "CORE_MELEE", "CORE_RANGED", "CORE_MAGIC", "CORE_SCHOOL", "CORE_DOMAIN"
        ]);

        // --- TAXONOMY DEFINITIONS ---

        const actionTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.coreMelee.label"),
                id: "CORE_MELEE",
                description: game.i18n.localize("ionrift-resonance.taxonomy.coreMelee.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackBludgeon.label"), id: "ATTACK_BLUDGEON", description: game.i18n.localize("ionrift-resonance.taxonomy.attackBludgeon.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackSword.label"), id: "ATTACK_SWORD", description: game.i18n.localize("ionrift-resonance.taxonomy.attackSword.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackDagger.label"), id: "ATTACK_DAGGER", description: game.i18n.localize("ionrift-resonance.taxonomy.attackDagger.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackClaw.label"), id: "ATTACK_CLAW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackClaw.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.coreBrawl.label"), id: "CORE_BRAWL", description: game.i18n.localize("ionrift-resonance.taxonomy.coreBrawl.description") }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.coreRanged.label"),
                id: "CORE_RANGED",
                description: game.i18n.localize("ionrift-resonance.taxonomy.coreRanged.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackBow.label"), id: "ATTACK_BOW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackBow.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackCrossbow.label"), id: "ATTACK_CROSSBOW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackCrossbow.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.attackSling.label"), id: "ATTACK_SLING", description: game.i18n.localize("ionrift-resonance.taxonomy.attackSling.description") }
                    // Firearm? Thrown?
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.coreMagic.label"),
                id: "CORE_MAGIC",
                description: game.i18n.localize("ionrift-resonance.taxonomy.coreMagic.description"),
                children: []
            }
        ];

        // System-specific spell traditions
        if (game.system.id === 'dnd5e' || game.system.id === 'pf2e') {
            actionTaxonomy[actionTaxonomy.length - 1].children = [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellFire.label"), id: "SPELL_FIRE" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellIce.label"), id: "SPELL_ICE" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellLightning.label"), id: "SPELL_LIGHTNING" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellAcid.label"), id: "SPELL_ACID" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellHeal.label"), id: "SPELL_HEAL" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellPsychic.label"), id: "SPELL_PSYCHIC" },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.spellVoid.label"), id: "SPELL_VOID" }
            ];

            if (game.system.id === 'dnd5e') {
                actionTaxonomy.push({
                    label: game.i18n.localize("ionrift-resonance.taxonomy.coreSchool.label"),
                    id: "CORE_SCHOOL",
                    description: game.i18n.localize("ionrift-resonance.taxonomy.coreSchool.description"),
                    children: [
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolAbjuration.label"), id: "SCHOOL_ABJURATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolAbjuration.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolConjuration.label"), id: "SCHOOL_CONJURATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolConjuration.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolDivination.label"), id: "SCHOOL_DIVINATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolDivination.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolEnchantment.label"), id: "SCHOOL_ENCHANTMENT", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolEnchantment.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolEvocation.label"), id: "SCHOOL_EVOCATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolEvocation.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolIllusion.label"), id: "SCHOOL_ILLUSION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolIllusion.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolNecromancy.label"), id: "SCHOOL_NECROMANCY", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolNecromancy.description") },
                        { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolTransmutation.label"), id: "SCHOOL_TRANSMUTATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolTransmutation.description") }
                    ]
                });
            }
        }

        if (game.system.id === 'daggerheart') {
            actionTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.coreDomain.label"),
                id: "CORE_DOMAIN",
                description: game.i18n.localize("ionrift-resonance.taxonomy.coreDomain.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainArcana.label"), id: "DOMAIN_ARCANA", description: game.i18n.localize("ionrift-resonance.taxonomy.domainArcana.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBlade.label"), id: "DOMAIN_BLADE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBlade.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBlood.label"), id: "DOMAIN_BLOOD", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBlood.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBone.label"), id: "DOMAIN_BONE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBone.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainCodex.label"), id: "DOMAIN_CODEX", description: game.i18n.localize("ionrift-resonance.taxonomy.domainCodex.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainDread.label"), id: "DOMAIN_DREAD", description: game.i18n.localize("ionrift-resonance.taxonomy.domainDread.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainGrace.label"), id: "DOMAIN_GRACE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainGrace.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainMidnight.label"), id: "DOMAIN_MIDNIGHT", description: game.i18n.localize("ionrift-resonance.taxonomy.domainMidnight.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainSage.label"), id: "DOMAIN_SAGE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainSage.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainSplendor.label"), id: "DOMAIN_SPLENDOR", description: game.i18n.localize("ionrift-resonance.taxonomy.domainSplendor.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainValor.label"), id: "DOMAIN_VALOR", description: game.i18n.localize("ionrift-resonance.taxonomy.domainValor.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.domainWonder.label"), id: "DOMAIN_WONDER", description: game.i18n.localize("ionrift-resonance.taxonomy.domainWonder.description") }
                ]
            });
        }

        const monsterTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterHumanoid.label"),
                id: "MONSTER_HUMANOID", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterHumanoid.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_HUMANOID_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGoblin.label"), id: "MONSTER_GOBLIN", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GOBLIN_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterLycanthrope.label"), id: "MONSTER_LYCANTHROPE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_LYCANTHROPE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterUndead.label"),
                id: "MONSTER_UNDEAD", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterUndead.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_UNDEAD_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterZombie.label"), id: "MONSTER_ZOMBIE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ZOMBIE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterSkeleton.label"), id: "MONSTER_SKELETON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_SKELETON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGhost.label"), id: "MONSTER_GHOST", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GHOST_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBeast.label"),
                id: "MONSTER_BEAST", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterBeast.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BEAST_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBear.label"), id: "MONSTER_BEAR", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BEAR_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterWolf.label"), id: "MONSTER_WOLF", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_WOLF_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterCat.label"), id: "MONSTER_CAT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_CAT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBird.label"), id: "MONSTER_BIRD", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BIRD_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterHorse.label"), id: "MONSTER_HORSE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_HORSE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterReptile.label"), id: "MONSTER_REPTILE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_REPTILE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.sfxInsect.label"), id: "SFX_INSECT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_INSECT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterFiend.label"),
                id: "MONSTER_FIEND", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterFiend.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_FIEND_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.monsterDemon.label"), id: "MONSTER_DEMON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_DEMON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterDragon.label"),
                id: "MONSTER_DRAGON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterDragon.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_DRAGON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.dragonWyvern.label"), id: "dragon_wyvern", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "dragon_wyvern_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGiant.label"),
                id: "MONSTER_GIANT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterGiant.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GIANT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterConstruct.label"),
                id: "MONSTER_CONSTRUCT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterConstruct.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_CONSTRUCT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.constructGolem.label"), id: "construct_golem", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "construct_golem_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.constructAnimatedObject.label"), id: "construct_animated_object", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "construct_animated_object_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterElemental.label"),
                id: "MONSTER_ELEMENTAL", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterElemental.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ELEMENTAL_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.sfxFire.label"), id: "SFX_FIRE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_FIRE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.sfxWaterEntity.label"), id: "SFX_WATER_ENTITY", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_WATER_ENTITY_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.sfxWind.label"), id: "SFX_WIND", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_WIND_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.elementalEarth.label"), id: "elemental_earth", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "elemental_earth_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterAlien.label"),
                id: "MONSTER_ALIEN", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterAlien.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ALIEN_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationBeholder.label"), id: "aberration_beholder", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_beholder_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationMindFlayer.label"), id: "aberration_mind_flayer", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_mind_flayer_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationChuul.label"), id: "aberration_chuul", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_chuul_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.monsterPlant.label"),
                id: "MONSTER_PLANT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.monsterPlant.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_PLANT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.plantTreant.label"), id: "plant_treant", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_treant_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.plantMyconid.label"), id: "plant_myconid", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_myconid_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    },
                    {
                        label: game.i18n.localize("ionrift-resonance.taxonomy.plantShamblingMound.label"), id: "plant_shambling_mound", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_shambling_mound_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.sfxSlime.label"),
                id: "SFX_SLIME", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.sfxSlime.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_SLIME_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }
                ]
            }
        ];

        // --- Dynamic Pack Taxonomy Injection ---
        // Sound packs contribute new creature subtypes via classifierBindings.
        // Inject these as child nodes under the appropriate parent group so
        // the GM can preview pack sounds in the calibrator. Nodes appear when
        // the pack is enabled and disappear when it is disabled.
        if (getSoundPackLoader().loaded) {
            const dynamicBindings = getSoundPackLoader().getAllDynamicClassifierBindings();

            if (dynamicBindings.size > 0) {
                // Collect every id already present in the hardcoded taxonomy
                const existingIds = new Set();
                const collectIds = (nodes) => {
                    for (const node of nodes) {
                        if (node.id) existingIds.add(node.id);
                        if (node.children) collectIds(node.children);
                    }
                };
                collectIds(monsterTaxonomy);

                // Classifier type prefix → parent taxonomy node id
                const TYPE_TO_PARENT = {
                    undead:      "MONSTER_UNDEAD",
                    beast:       "MONSTER_BEAST",
                    humanoid:    "MONSTER_HUMANOID",
                    fiend:       "MONSTER_FIEND",
                    elemental:   "MONSTER_ELEMENTAL",
                    dragon:      "MONSTER_DRAGON",
                    giant:       "MONSTER_GIANT",
                    construct:   "MONSTER_CONSTRUCT",
                    aberration:  "MONSTER_ALIEN",
                    plant:       "MONSTER_PLANT",
                    ooze:        "SFX_SLIME"
                };

                // Walk the taxonomy tree to find a node by id
                const findNode = (nodes, targetId) => {
                    for (const node of nodes) {
                        if (node.id === targetId) return node;
                        if (node.children) {
                            const found = findNode(node.children, targetId);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                for (const [compositeKey, binding] of dynamicBindings) {
                    const soundKey = binding.soundKey;
                    const packName = binding.packName;
                    const packIcon = binding.packIcon;

                    // Skip keys that already exist in the hardcoded taxonomy
                    if (existingIds.has(soundKey)) continue;

                    const parts = compositeKey.split("_");
                    const typePart = parts[0];
                    const subtypePart = parts.slice(1).join("_");
                    const parentId = TYPE_TO_PARENT[typePart];
                    if (!parentId) continue;

                    const parent = findNode(monsterTaxonomy, parentId);
                    if (!parent || !parent.children) continue;

                    // Derive a human-readable label from the subtype
                    const label = subtypePart
                        .split("_")
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(" ");

                    parent.children.push({
                        label: label, id: soundKey, cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                        packName: packName,
                        packIcon: packIcon,
                        children: [{
                            label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: `${soundKey}_ATTACK`,
                            description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description")
                        }]
                    });

                    existingIds.add(soundKey);
                }
            }
        }

        // --- CORE TAXONOMY (Tier 1: Results Only) ---
        const coreTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupStrikeResults.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupStrikeResults.description"),
                children: [
                    {
                        id: "CORE_HIT", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHit.description"),
                        children: [
                            { id: "CORE_HIT_RANGED", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHitRanged.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHitRanged.description") },
                            { id: "CORE_HIT_MAGIC", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHitMagic.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHitMagic.description") }
                        ]
                    },
                    {
                        id: "CORE_MISS", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMiss.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMiss.description"),
                        children: [
                            { id: "CORE_MISS_RANGED", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMissRanged.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMissRanged.description") },
                            { id: "CORE_MISS_MAGIC", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMissMagic.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMissMagic.description") }
                        ]
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupWeaponExtras.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupWeaponExtras.description"),
                children: [
                    { id: "CORE_WHOOSH", label: game.i18n.localize("ionrift-resonance.taxonomy.coreWhoosh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreWhoosh.description") },
                    { id: "CORE_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.coreCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreCrit.description") },
                    { id: "CORE_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreFumble.description") }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupVocals.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupVocals.description"),
                children: [
                    { id: "CORE_PAIN_MASCULINE", label: game.i18n.localize("ionrift-resonance.taxonomy.corePainMasculine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.corePainMasculine.description") },
                    { id: "CORE_PAIN_FEMININE", label: game.i18n.localize("ionrift-resonance.taxonomy.corePainFeminine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.corePainFeminine.description") },
                    { id: "CORE_DEATH_MASCULINE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathMasculine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathMasculine.description") },
                    { id: "CORE_DEATH_FEMININE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathFeminine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathFeminine.description") },
                    { id: "CORE_MONSTER_PAIN", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterPain.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterPain.description") },
                    { id: "CORE_MONSTER_DEATH", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterDeath.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterDeath.description") }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupEncounter.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupEncounter.description"),
                children: [
                    { id: "COMBAT_START", label: game.i18n.localize("ionrift-resonance.taxonomy.combatStart.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.combatStart.description") },
                    { id: "COMBAT_END", label: game.i18n.localize("ionrift-resonance.taxonomy.combatEnd.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.combatEnd.description") },
                    { id: "LEVEL_UP", label: game.i18n.localize("ionrift-resonance.taxonomy.levelUp.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.levelUp.description") }
                ]
            }
        ];


        // --- SYSTEM-SPECIFIC ROLL STINGERS ---
        if (game.system.id === 'daggerheart') {
            // Group 1: Duality Dice (Roll Outcomes)
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhDualityDice.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhDualityDice.description"),
                children: [
                    { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                    { id: "DAGGERHEART_SUCCESS", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartSuccess.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartSuccess.description") },
                    { id: "DAGGERHEART_FAIL", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFail.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFail.description") }
                ]
            });

            // Group 2: Player Resources
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhPlayerResources.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhPlayerResources.description"),
                children: [
                    // Hope
                    { id: "DAGGERHEART_HOPE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHope.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHope.description") },
                    { id: "DAGGERHEART_HOPE_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHopeUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHopeUse.description") },

                    // Stress
                    { id: "DAGGERHEART_STRESS", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStress.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStress.description") },
                    { id: "DAGGERHEART_STRESS_CLEAR", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStressClear.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStressClear.description") },

                    // Armor
                    { id: "DAGGERHEART_ARMOR_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorUse.description") },
                    { id: "DAGGERHEART_ARMOR_REPAIR", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorRepair.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorRepair.description") }
                ]
            });

            // Group 3: Fear System (GM Only)
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhFearTracker.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhFearTracker.description"),
                children: [
                    // Fear Spend
                    { id: "DAGGERHEART_FEAR_USE_LOW", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseLow.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseLow.description") },
                    { id: "DAGGERHEART_FEAR_USE_MED", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseMed.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseMed.description") },
                    { id: "DAGGERHEART_FEAR_USE_HIGH", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseHigh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseHigh.description") },

                    // Fear Gain (Tracker Thresholds)
                    { id: "DAGGERHEART_FEAR_LOW", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearLow.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearLow.description") },
                    { id: "DAGGERHEART_FEAR_MED", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearMed.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearMed.description") },
                    { id: "DAGGERHEART_FEAR_HIGH", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearHigh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearHigh.description") }
                ]
            });
        } else if (game.system.id === 'dnd5e') {
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupDnd5eRollStingers.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupDnd5eRollStingers.description"),
                children: [
                    { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                    { id: "ROLL_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.description") }
                ]
            });
        } else if (game.system.id === 'pf2e') {
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eRollStingers.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eRollStingers.description"),
                children: [
                    { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                    { id: "ROLL_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.description") }
                ]
            });
            coreTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eHeroPoints.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eHeroPoints.description"),
                children: [
                    { id: "HERO_POINT_GAIN", label: game.i18n.localize("ionrift-resonance.taxonomy.heroPointGain.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.heroPointGain.description") },
                    { id: "HERO_POINT_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.heroPointUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.heroPointUse.description") }
                ]
            });
        }

        // Process Roots
        const tier1Roots = coreTaxonomy.map(node => processHierarchy(node));
        const tier2Roots = actionTaxonomy.map(node => processHierarchy(node));
        const tier3Roots = monsterTaxonomy.map(node => processHierarchy(node));

        // --- SHARED MONSTER VOICES TAXONOMY ---
        // Surfaces the four CORE_HUMANOID_* keys so GMs can see / bind them.
        // These keys fall back to PC pain/death until a dedicated monster voice
        // pack provides its own bindings — at which point the tab will show the
        // pack source automatically.
        const sharedMonsterTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterMasculine.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterMasculine.description"),
                children: [
                    {
                        id: "CORE_HUMANOID_PAIN_MASCULINE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.description")
                    },
                    {
                        id: "CORE_HUMANOID_DEATH_MASCULINE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterFeminine.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterFeminine.description"),
                children: [
                    {
                        id: "CORE_HUMANOID_PAIN_FEMININE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.description")
                    },
                    {
                        id: "CORE_HUMANOID_DEATH_FEMININE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.description")
                    }
                ]
            }
        ];
        const sharedMonsterRoots = FEATURE_SHARED_MONSTER_VOICES
            ? sharedMonsterTaxonomy.map(node => processHierarchy(node))
            : [];

        // --- MODULE INTEGRATIONS: QUIZ NIGHT ---
        const isQuizNightActive = game.modules.get("ionrift-quiz-night")?.active ?? false;
        const isQuizNightInstalled = game.modules.has("ionrift-quiz-night");

        const quizNightTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizFlow.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizFlow.description"),
                children: [
                    {
                        id: "QUIZ_ROUND_START",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.description")
                    },
                    {
                        id: "QUIZ_PENS_DOWN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.description")
                    },
                    {
                        id: "QUIZ_TIMER_EXPIRED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizMarking.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizMarking.description"),
                children: [
                    {
                        id: "QUIZ_ANSWER_CORRECT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.description")
                    },
                    {
                        id: "QUIZ_ANSWER_INCORRECT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.description")
                    },
                    {
                        id: "QUIZ_END",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.description")
                    }
                ]
            }
        ];
        const quizNightRoots = quizNightTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: RESPITE ---
        const isRespiteActive = game.modules.get("ionrift-respite")?.active ?? false;
        const isRespiteInstalled = game.modules.has("ionrift-respite");

        const respiteTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupRespiteCampRest.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupRespiteCampRest.description"),
                children: [
                    {
                        id: "RESPITE_FIRE_LIT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.description")
                    },
                    {
                        id: "RESPITE_CAMPFIRE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.description")
                    },
                    {
                        id: "RESPITE_SLEEP_STARTED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.description")
                    },
                    {
                        id: "RESPITE_RESOLUTION",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.description")
                    }
                ]
            }
        ];
        const respiteRoots = respiteTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: CURSEWRIGHT ---
        const isCursewrightActive = CursewrightIntegration.isActive;

        const cursewrightTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightProgress.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightProgress.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_REMOVAL_ATTEMPTED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.description")
                    },
                    {
                        id: "CURSEWRIGHT_WHISPER_SENT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_LOCKED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.description")
                    },
                    {
                        id: "CURSEWRIGHT_PHASE_ADVANCED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_ACTIVATED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightDevour.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightDevour.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_DEVOUR_REVEAL_FIRST",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.description")
                    },
                    {
                        id: "CURSEWRIGHT_DEVOUR_REVEAL_FULL",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_GRIP",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_CAUGHT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_PULLED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.description")
                    },
                    {
                        id: "CURSEWRIGHT_DEVOURED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightTribute.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightTribute.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_TRIBUTE_DEMANDED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.description")
                    },
                    {
                        id: "CURSEWRIGHT_TRIBUTE_MISSED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.description")
                    },
                    {
                        id: "CURSEWRIGHT_DETONATION",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_BROKEN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_RESISTED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.description")
                    }
                ]
            }
        ];
        const cursewrightRoots = cursewrightTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: VOICE ---
        const isVoiceActive = game.modules.get("ionrift-voice")?.active ?? false;
        const isVoiceInstalled = game.modules.has("ionrift-voice");

        const voiceTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupVoiceWhisperAmbients.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupVoiceWhisperAmbients.description"),
                children: [
                    {
                        id: "VOICE_WHISPER_LIGHT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.description")
                    },
                    {
                        id: "VOICE_WHISPER_NEUTRAL",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.description")
                    },
                    {
                        id: "VOICE_WHISPER_DARK",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.description")
                    }
                ]
            }
        ];
        const voiceRoots = voiceTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: TRIPWIRE ---
        const isTripwireActive = TripwireIntegration.isActive;

        const tripwireTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireDoors.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireDoors.description"),
                children: [
                    {
                        id: "DOOR_WOOD_OPEN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.description")
                    },
                    {
                        id: "DOOR_WOOD_CLOSE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.description")
                    },
                    {
                        id: "DOOR_IRON_OPEN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.description")
                    },
                    {
                        id: "DOOR_IRON_CLOSE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.description")
                    },
                    {
                        id: "DOOR_STONE_OPEN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.description")
                    },
                    {
                        id: "DOOR_STONE_CLOSE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireLocks.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireLocks.description"),
                children: [
                    {
                        id: "LOCK_LOCKED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.description")
                    },
                    {
                        id: "LOCK_UNLOCKED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.description")
                    },
                    {
                        id: "LOCK_PICK_SUCCESS",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireTraps.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireTraps.description"),
                children: [
                    {
                        id: "TRAP_DISARM_SUCCESS",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.description")
                    },
                    {
                        id: "TRIPWIRE_TRAP_SPRING",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.description")
                    },
                    {
                        id: "TRAP_DARTS",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.description")
                    },
                    {
                        id: "TRAP_PIT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.description")
                    },
                    {
                        id: "TRAP_ROCKFALL",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.description")
                    },
                    {
                        id: "TRAP_SPEARS",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.description")
                    },
                    {
                        id: "TRAP_SNAPPING",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.description")
                    },
                    {
                        id: "TRAP_TELEPORT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.description")
                    },
                    {
                        id: "TRAP_MAGICAL",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.description")
                    }
                ]
            }
        ];
        const tripwireRoots = tripwireTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: LUMINANCE ---
        const isLuminanceActive = LuminanceIntegration.isActive;

        const luminanceTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupLuminanceTorch.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupLuminanceTorch.description"),
                children: [
                    {
                        id: "LUMINANCE_TORCH_LOOP",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.description")
                    },
                    {
                        id: "LUMINANCE_TORCH_LIT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.description")
                    },
                    {
                        id: "LUMINANCE_TORCH_EXTINGUISH",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.description")
                    }
                ]
            }
        ];
        const luminanceRoots = luminanceTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: WATERLINE ---
        const isWaterlineActive = WaterlineIntegration.isActive;

        const waterlineTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupWaterlineMovement.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupWaterlineMovement.description"),
                children: [
                    {
                        id: "WATERLINE_ENTER",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.description")
                    },
                    {
                        id: "WATERLINE_WADE",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.description")
                    },
                    {
                        id: "WATERLINE_EXIT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.description")
                    }
                ]
            }
        ];
        const waterlineRoots = waterlineTaxonomy.map(node => processHierarchy(node));

        return {
            hasSyrinscape: getSyrinscapeProvider().isConfigured(),
            features: {
                sharedMonsterVoices: FEATURE_SHARED_MONSTER_VOICES,
                spellVocalLayer: isFeatureFlagEnabled("SPELL_VOCAL_LAYER")
            },
            integrations: {
                hasActive: isQuizNightActive || isRespiteActive || isCursewrightActive || isVoiceActive || isTripwireActive || isLuminanceActive || isWaterlineActive,
                quizNight: {
                    installed: QuizNightIntegration.isInstalled,
                    active: QuizNightIntegration.isActive,
                    compatible: QuizNightIntegration.isCompatible,
                    version: QuizNightIntegration.version,
                    minVersion: QuizNightIntegration.MIN_VERSION
                },
                respite: {
                    installed: RespiteIntegration.isInstalled,
                    active: RespiteIntegration.isActive,
                    compatible: RespiteIntegration.isCompatible,
                    version: RespiteIntegration.version,
                    minVersion: RespiteIntegration.MIN_VERSION
                },
                cursewright: {
                    installed: CursewrightIntegration.isInstalled,
                    active: CursewrightIntegration.isActive,
                    compatible: CursewrightIntegration.isCompatible,
                    version: CursewrightIntegration.version,
                    minVersion: CursewrightIntegration.MIN_VERSION
                },
                voice: {
                    installed: VoiceIntegration.isInstalled,
                    active: VoiceIntegration.isActive,
                    compatible: VoiceIntegration.isCompatible,
                    version: VoiceIntegration.version,
                    minVersion: VoiceIntegration.MIN_VERSION
                },
                tripwire: {
                    installed: TripwireIntegration.isInstalled,
                    active: TripwireIntegration.isActive,
                    compatible: TripwireIntegration.isCompatible,
                    version: TripwireIntegration.version,
                    minVersion: TripwireIntegration.MIN_VERSION
                },
                luminance: {
                    installed: LuminanceIntegration.isInstalled,
                    active: LuminanceIntegration.isActive,
                    compatible: LuminanceIntegration.isCompatible,
                    version: LuminanceIntegration.version,
                    minVersion: LuminanceIntegration.MIN_VERSION
                },
                waterline: {
                    installed: WaterlineIntegration.isInstalled,
                    active: WaterlineIntegration.isActive,
                    compatible: WaterlineIntegration.isCompatible,
                    version: WaterlineIntegration.version,
                    minVersion: WaterlineIntegration.MIN_VERSION
                }
            },
            tiers: {
                tier1: {
                    label: game.i18n.localize("ionrift-resonance.config.tabEssentials"),
                    active: true,
                    paramounts: tier1Roots
                },
                tier2: {
                    label: game.i18n.localize("ionrift-resonance.config.tabCombatActions"),
                    active: false,
                    paramounts: tier2Roots
                },
                tier3: {
                    label: game.i18n.localize("ionrift-resonance.config.tabMonsters"),
                    active: false,
                    paramounts: tier3Roots
                },
                sharedMonster: {
                    label: game.i18n.localize("ionrift-resonance.config.tabSharedMonsterVoices"),
                    active: false,
                    paramounts: sharedMonsterRoots
                },
                quizNight: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabQuizNight"),
                    active: false,
                    paramounts: quizNightRoots
                },
                respite: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabRespite"),
                    active: false,
                    paramounts: respiteRoots
                },
                cursewright: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabCursewright"),
                    active: false,
                    paramounts: cursewrightRoots
                },
                voice: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabVoice"),
                    active: false,
                    paramounts: voiceRoots
                },
                tripwire: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabTripwire"),
                    active: false,
                    paramounts: tripwireRoots
                },
                luminance: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabLuminance"),
                    active: false,
                    paramounts: luminanceRoots
                },
                waterline: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabWaterline"),
                    active: false,
                    paramounts: waterlineRoots
                },
                auditor: {
                    label: game.i18n.localize("ionrift-resonance.config.tabSoundAuditor"),
                    active: false,
                    items: this._getAuditorData()
                },
                players: {
                    label: game.i18n.localize("ionrift-resonance.config.tabPlayers"),
                    active: false,
                    players: configOverrides.players || []
                },
                orchestrator: this._getOrchestratorData(),
                config: configOverrides,
                // Feature toggle states surfaced to the Orchestration tab template
                spellVocalLayer: game.settings.get("ionrift-resonance", "spellVocalLayer") ?? false
            },
            positional: positionalPanelData()
        };
    }

    /**
     * Auto-Save Logic: Immediately persist a sound binding change.
     * @param {string} key 
     * @param {string|null} value 
     */
    async _saveBinding(key, value) {
        // 1. Get Current Settings
        const currentBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        // 2. Modify State
        if (value) {
            currentBindings[key] = value;
        } else {
            delete currentBindings[key];
        }

        // 3. Write to Settings
        await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(currentBindings));

        // 4. Update UI Row (Reactivity)
        // Re-render the single row using the new value.

        const row = this.element.find(`.entity-row[data-key="${key}"]`);
        if (row.length) {
            const label = row.find(".entity-name").text().trim();
            const desc = row.find(".entity-meta").text().trim();
            const def = SYRINSCAPE_DEFAULTS[key];

            const newState = new SoundCardState(key, value, def, label, desc);
            const html = await renderTemplate("modules/ionrift-resonance/templates/partials/sound-card-row.hbs", newState.getRenderData());

            // Replace and Re-Bind
            row.replaceWith(html);


            // Visual feedback
            const newRow = this.element.find(`.entity-row[data-key="${key}"]`);
            newRow.css("background-color", "rgba(50, 255, 100, 0.1)");
            setTimeout(() => newRow.css("background-color", ""), 500);
        }
    }

    async _updateObject(event, formData) {
        // Auto-save handles bindings; this handles any top-level config overrides if present.
    }

    /**
     * Build data for the Orchestration tab.
     * Reads getSoundOrchestrator().DEFAULT_BUDGETS and the orchestratorConfig world setting.
     */
    _getOrchestratorData() {
        const CATEGORY_LABELS = {
            FEAR_STINGER: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryFearStinger"),
            FEAR_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryFearUse"),
            DH_HOPE_GAIN: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhHopeGain"),
            DH_HOPE_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhHopeUse"),
            DH_STRESS_GAIN: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhStressGain"),
            DH_STRESS_CLEAR: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhStressClear"),
            DH_ARMOR_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhArmorUse"),
            DH_ARMOR_REPAIR: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhArmorRepair"),
            DH_OUTCOME: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhOutcome"),
            MONSTER_VOCAL: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryMonsterVocal"),
            PC_VOCAL: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryPcVocal")
        };

        let budgets = {};
        let timing = {};
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); budgets = c.budgets ?? {}; timing = c.timing ?? {}; }
        } catch (e) { }

        const categories = Object.entries(getSoundOrchestrator().DEFAULT_BUDGETS).map(([id, defaultMs]) => {
            const override = budgets[id]?.budgetMs;
            const effectiveMs = override ?? defaultMs;
            return {
                id,
                label: CATEGORY_LABELS[id] ?? id,
                defaultMs,
                defaultLabel: defaultMs === 0 ? game.i18n.localize("ionrift-resonance.config.orchestrator.unlimited") : `${defaultMs}ms`,
                placeholderLabel: defaultMs === 0 ? "\u221e" : String(defaultMs),
                overrideMs: override !== undefined ? String(override) : "",
                hasOverride: override !== undefined,
                accentBorder: override !== undefined,
                isUnlimited: effectiveMs === 0
            };
        });

        const timingEntries = Object.entries(timing).map(([key, cfg]) => ({
            key,
            offsetMs: cfg.offsetMs ?? 0
        }));

        // Named offsets - configurable stagger presets
        let offsets = {};
        try {
            const raw2 = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw2) { const c2 = JSON.parse(raw2); offsets = c2.offsets ?? {}; }
        } catch (e) { }

        const spellVocalEnabled = isFeatureFlagEnabled("SPELL_VOCAL_LAYER");
        const namedOffsets = Object.entries(getSoundOrchestrator().DEFAULT_OFFSETS)
            .filter(([id]) => spellVocalEnabled || id !== "SPELL_VOCAL_LEAD_IN")
            .map(([id, defaultMs]) => {
            const override = offsets[id];
            return {
                id,
                label: getSoundOrchestrator().OFFSET_LABELS[id] ?? id,
                defaultMs,
                overrideMs: override !== undefined ? String(override) : "",
                hasOverride: override !== undefined,
                accentBorder: override !== undefined
            };
        });

        return { categories, timing: timingEntries, hasTiming: timingEntries.length > 0, namedOffsets };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Use delegation for robust handling of dynamic partial replacements
        html.on("click", ".play-preview", this._onPlayPreview.bind(this));

        // Import/Export/Preset - standard buttons
        html.on("click", ".export-config", this._onExportConfig.bind(this));
        html.on("click", ".import-config", this._onImportConfig.bind(this));
        html.on("click", ".load-preset", this._onLoadPreset.bind(this));

        // Dynamic Row Handling (Auditor/Manual rows)
        html.on("click", ".add-row", this._onAddRow.bind(this));
        html.on("click", ".delete-row", this._onDeleteRow.bind(this));

        // Search (Edit)
        html.on("click", ".search-sound", this._onSearch.bind(this));

        // Stop All
        html.on("click", ".stop-all-sounds", this._onStopAll.bind(this));
        html.on("click", ".reset-sound", this._onReset.bind(this));
        html.on("click", ".toggle-mute", this._onToggleMute.bind(this));
        html.on("input", ".taxonomy-volume-slider", this._onTaxonomyVolumeInput.bind(this));
        html.on("change", ".taxonomy-volume-slider", this._onTaxonomyVolumeChange.bind(this));
        html.on("click", ".taxonomy-volume-reset", this._onTaxonomyVolumeReset.bind(this));

        html.on("click", ".auditor-edit", this._onAuditorEdit.bind(this));
        html.on("click", ".auditor-delete", this._onAuditorDelete.bind(this));

        html.on("keyup", ".auditor-search-input", this._onAuditorSearchKey.bind(this));
        html.on("click", ".auditor-control-btn", this._onAuditorPageControl.bind(this));
        // Refresh auditor only when ionrift-resonance flags change (not every HP tick).
        this._updateHook = (doc, changes) => {
            const flagsChanged = changes?.flags?.["ionrift-resonance"];
            if (flagsChanged) this._debouncedRefresh();
        };

        if (!this._hooksRegistered) {
            Hooks.on("updateActor", this._updateHook);
            Hooks.on("updateItem", this._updateHook);
            this._hooksRegistered = true;
        }

        // Orchestrator tab
        html.on("change", ".orchestrator-budget-input", this._onOrchestratorBudgetChange.bind(this));
        html.on("click", ".orchestrator-reset-category", this._onOrchestratorResetCategory.bind(this));
        html.on("change", ".orchestrator-timing-input", this._onOrchestratorTimingSave.bind(this));
        html.on("click", ".orchestrator-timing-delete", this._onOrchestratorTimingDelete.bind(this));
        html.on("change", ".orchestrator-offset-input", this._onOrchestratorOffsetChange.bind(this));
        html.on("click", ".orchestrator-reset-offset", this._onOrchestratorResetOffset.bind(this));
        html.on("click", ".orchestrator-reset-all", this._onOrchestratorResetAll.bind(this));

        // Feature toggle buttons (generic boolean setting toggle)
        html.on("click", ".orchestrator-toggle-setting", this._onToggleSetting.bind(this));
        html.on("change", ".positional-master", this._onPositionalMaster.bind(this));
        html.on("change", ".positional-category", this._onPositionalCategory.bind(this));
        html.on("change", ".hear-positional", this._onHearPositional.bind(this));

        // Prevent Enter from submitting the FormApplication (which closes the window).
        // Instead: commit the value via change event and blur.
        html.on("keydown", ".orchestrator-budget-input, .orchestrator-timing-input, .orchestrator-offset-input", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                $(e.currentTarget).trigger("change").blur();
            }
        });

        // State Tracking for Details
        html.find("details").on("toggle", (event) => {
            const details = event.currentTarget;
            const label = details.dataset.groupLabel;
            if (!label) return;

            if (details.open) {
                this._expandedGroups.add(label);
            } else {
                this._expandedGroups.delete(label);
            }
        });
    }

    async close(options) {
        // Cleanup Hooks
        if (this._hooksRegistered) {
            Hooks.off("updateActor", this._updateHook);
            Hooks.off("updateItem", this._updateHook);
            this._hooksRegistered = false;
        }
        return super.close(options);
    }

    /**
     * Toggle mute/unmute on a sound event key.
     * Muting saves "__MUTED__" sentinel. Unmuting clears the override (restores inheritance).
     */
    async _onToggleMute(event) {
        event.preventDefault();
        event.stopPropagation();
        const key = event.currentTarget.dataset.key;
        if (!key) return;

        const currentBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        const isMuted = currentBindings[key] === "__MUTED__";

        if (isMuted) {
            // Unmute: clear the override to restore inheritance
            await this._saveBinding(key, null);
        } else {
            // Mute: save the sentinel
            await this._saveBinding(key, "__MUTED__");
        }

        // Full re-render to update the row state (muted badge, button icon)
        this.render(true);
    }
    _onTaxonomyVolumeInput(event) {
        const slider = event.currentTarget;
        const label = slider.closest(".taxonomy-volume-control")?.querySelector(".taxonomy-volume-label");
        if (label) label.textContent = `${slider.value}%`;
    }

    async _onTaxonomyVolumeChange(event) {
        const slider = event.currentTarget;
        const key = slider.dataset.volumeKey;
        const value = parseInt(slider.value, 10) / 100;

        let volumes = {};
        try {
            volumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        if (value >= 0.99) {
            delete volumes[key];
        } else {
            volumes[key] = Math.round(value * 100) / 100;
        }

        await game.settings.set("ionrift-resonance", "taxonomyVolume", JSON.stringify(volumes));

        const resetBtn = slider.closest(".taxonomy-volume-control")?.querySelector(".taxonomy-volume-reset");
        if (resetBtn) resetBtn.style.display = value < 0.99 ? "inline-block" : "none";
    }

    async _onTaxonomyVolumeReset(event) {
        event.preventDefault();
        event.stopPropagation();
        const key = event.currentTarget.dataset.volumeKey;

        let volumes = {};
        try {
            volumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        delete volumes[key];
        await game.settings.set("ionrift-resonance", "taxonomyVolume", JSON.stringify(volumes));

        const container = event.currentTarget.closest(".taxonomy-volume-control");
        const slider = container?.querySelector(".taxonomy-volume-slider");
        const label = container?.querySelector(".taxonomy-volume-label");
        if (slider) slider.value = 100;
        if (label) label.textContent = "100%";
        event.currentTarget.style.display = "none";
    }
    async _saveOrchestratorConfig(mutator) {
        let config = { budgets: {}, timing: {} };
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); config.budgets = c.budgets ?? {}; config.timing = c.timing ?? {}; }
        } catch (e) { }
        config = mutator(config);
        await game.settings.set("ionrift-resonance", "orchestratorConfig", JSON.stringify(config));
        game.ionrift.resonance?.handler?.orchestrator?.loadConfig();
    }

    async _onOrchestratorBudgetChange(event) {
        const input = event.currentTarget;
        const category = input.dataset.category;
        const raw = input.value.trim();
        const value = raw === "" ? undefined : parseInt(raw, 10);

        await this._saveOrchestratorConfig(config => {
            if (value === undefined || isNaN(value)) {
                delete config.budgets[category];
            } else {
                config.budgets[category] = { budgetMs: value };
            }
            return config;
        });
        // No re-render - just update the reset button visibility via DOM
        const row = $(input).closest("tr");
        if (value !== undefined && !isNaN(value)) {
            row.find(".orchestrator-reset-category").show();
        } else {
            row.find(".orchestrator-reset-category").hide();
        }
    }

    async _onOrchestratorResetCategory(event) {
        const btn = event.currentTarget;
        const category = btn.dataset.category;
        await this._saveOrchestratorConfig(config => {
            delete config.budgets[category];
            return config;
        });
        const row = $(btn).closest("tr");
        row.find(".orchestrator-budget-input").val("");
        $(btn).hide();
    }

    async _onOrchestratorTimingSave(event) {
        const input = event.currentTarget;
        const key = input.dataset.key;
        const value = parseInt(input.value, 10) || 0;
        await this._saveOrchestratorConfig(config => {
            config.timing[key] = { offsetMs: value };
            return config;
        });
    }

    async _onOrchestratorTimingDelete(event) {
        const btn = event.currentTarget;
        const key = btn.dataset.key;
        await this._saveOrchestratorConfig(config => {
            delete config.timing[key];
            return config;
        });
        $(btn).closest("tr").remove();
    }

    async _onOrchestratorOffsetChange(event) {
        const input = event.currentTarget;
        const offsetId = input.dataset.offset;
        const val = input.value.trim();
        await this._saveOrchestratorConfig(config => {
            if (!config.offsets) config.offsets = {};
            if (val === "") {
                delete config.offsets[offsetId];
            } else {
                config.offsets[offsetId] = parseInt(val, 10) || 0;
            }
            return config;
        });
        const row = $(input).closest("tr");
        if (val !== "") {
            row.find(".orchestrator-reset-offset").show();
        } else {
            row.find(".orchestrator-reset-offset").hide();
        }
    }

    async _onOrchestratorResetOffset(event) {
        const btn = event.currentTarget;
        const offsetId = btn.dataset.offset;
        await this._saveOrchestratorConfig(config => {
            if (config.offsets) delete config.offsets[offsetId];
            return config;
        });
        const row = $(btn).closest("tr");
        row.find(".orchestrator-offset-input").val("");
        $(btn).hide();
    }

    async _onOrchestratorResetAll(event) {
        await this._saveOrchestratorConfig(config => {
            config.budgets = {};
            config.offsets = {};
            return config;
        });
        this.render(false);
    }

    /**
     * Generic toggle handler for simple boolean world settings exposed in the
     * Orchestration tab. The button must carry a data-setting attribute with the
     * full dot-notation key, e.g. data-setting="ionrift-resonance.spellVocalLayer".
     */
    async _onToggleSetting(event) {
        event.preventDefault();
        const settingKey = event.currentTarget.dataset.setting;
        if (!settingKey) return;
        const [namespace, key] = settingKey.split(".");
        const current = game.settings.get(namespace, key);
        await game.settings.set(namespace, key, !current);
        this.render(false);
    }

    async _onAuditorSearchKey(event) {
        event.preventDefault();
        const input = event.currentTarget;
        const val = input.value;
        this._auditorSearch = val;
        this._auditorPage = 1;
        await this._renderAuditorList();
    }

    async _onAuditorPageControl(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;

        const data = this._getAuditorData();
        const totalPages = data.totalPages;

        if (action === "prev") {
            if (this._auditorPage > 1) this._auditorPage--;
        } else if (action === "next") {
            if (this._auditorPage < totalPages) this._auditorPage++;
        }

        await this._renderAuditorList();
    }

    async _renderAuditorList() {
        const data = this._getAuditorData();
        const html = await renderTemplate("modules/ionrift-resonance/templates/partials/auditor-list.hbs", data);

        const list = this.element.find(".auditor-list");
        list.html(html);
        this.element.find(".auditor-page-info").text(game.i18n.format("ionrift-resonance.config.auditorPageInfo", { page: data.page, totalPages: data.totalPages }));

        // Re-bind listeners if needed (actions delegated to root)
    }

    async _onAuditorEdit(event) {
        event.preventDefault();
        const uuid = event.currentTarget.dataset.uuid;
        const doc = await fromUuid(uuid);
        if (!doc) return;

        try {
            if (doc.documentName === "Actor") {
                const { ActorSoundConfig } = await import("./ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("./ItemSoundConfig.js");
                new ItemSoundConfig(doc).render(true);
            }
        } catch (e) {
            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.couldNotLoadConfigForEditing"));
        }
    }

    async _onAuditorDelete(event) {
        event.preventDefault();
        event.stopPropagation();

        const btn = event.currentTarget;
        const uuid = btn.dataset.uuid;
        const key = btn.dataset.key;

        // Logger.log(`Auditor | Resetting Sound: ${uuid} [${key}]`);

        const doc = await fromUuid(uuid);
        if (doc) {
            await doc.unsetFlag("ionrift-resonance", key);
            await doc.unsetFlag("ionrift-resonance", key + "_name");
            await doc.unsetFlag("ionrift-resonance", key + "_meta");
            ui.notifications.info(game.i18n.format("ionrift-resonance.notification.resetOverrideForActor", { name: doc.name }));
        } else {
            Logger.warn(`Auditor | Could not resolve UUID: ${uuid}`);
        }
    }

    async _onReset(event) {
        event.preventDefault();
        const button = event.currentTarget;
        // Find key from button or closest row
        let key = button.dataset.key;
        if (!key) {
            const row = button.closest(".entity-row");
            key = row?.dataset?.key;
        }

        if (!key) return;

        // Auto-Save: Reset (null)
        await this._saveBinding(key, null);
    }

    async _saveBinding(key, value) {
        // 1. Get Current Bindings
        const currentBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        // 2. Update or Delete
        if (value === null || value === undefined) {
            delete currentBindings[key]; // Reset to Default
        } else {
            currentBindings[key] = value;
        }

        // 3. Save Setting
        await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(currentBindings));

        // 4. Reactive Update
        // For now, full re-render ensures consistency
        this.render(true);
    }

    async _onSearch(event) {
        event.preventDefault();
        const button = event.currentTarget;

        // Key is on the button itself now, or parent row
        let key = button.dataset.key;
        if (!key) {
            const row = button.closest(".entity-row");
            key = row?.dataset?.key;
        }

        // Grab human label from the DOM for the picker title
        const row = button.closest(".entity-row");
        const humanLabel = row?.querySelector(".entity-name")?.textContent?.trim() || key;

        if (!key) {
            Logger.error("Could not find key for sound config button.", button);
            return;
        }

        // Find current value (Source of Truth: Settings > DOM)
        let currentValue = "";

        const customBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        // Cascade: custom -> pack -> syrinscape defaults (if configured)
        if (customBindings[key]) {
            currentValue = customBindings[key];
        } else {
            const packBindings = getSoundPackLoader().loaded ? getSoundPackLoader().getMergedBindings() : {};
            if (packBindings[key]) {
                currentValue = packBindings[key];
            } else {
                // Fallback to DOM to catch defaults/inherited values rendered by Handlebars
                const row = this.element.find(`.entity-row[data-key="${key}"]`);
                if (row.length) {
                    const input = row.find("input");
                    currentValue = input.val();
                }
            }
        }

        // Coerce to string - pack bindings store arrays/objects, not strings.
        // Downstream code calls .trim() so we must guarantee a string here.
        if (currentValue && typeof currentValue !== "string") {
            currentValue = JSON.stringify(currentValue);
        }

        try {
            const { SoundPickerApp } = await import("../browse/SoundPickerApp.js");

            new SoundPickerApp(async (result) => {
                // CASE A: User Cleared Sounds (result === null)
                if (result === null) {
                    await this._saveBinding(key, null);
                    return;
                }

                // CASE B: User Selected Sounds
                let storageValue = result.id; // Default fallback (CSV)

                if (result.items && Array.isArray(result.items) && result.items.length > 0) {
                    // Robust Storage: Array of Objects
                    // Merge with config if available
                    const configMap = result.config || {};

                    const richData = result.items.map(item => {
                        const itemConfig = configMap[item.id] || {};
                        return {
                            id: item.id,
                            name: item.name || `ID: ${item.id}`,
                            type: item.type || SOUND_TYPES.ONESHOT,
                            // Merge specific config props we care about
                            config: {
                                delayMin: itemConfig.delayMin || 0,
                                delayMax: itemConfig.delayMax || 0
                            }
                        };
                    });

                    // Store as Object (Single) or Array (Multi)
                    if (richData.length === 1) {
                        storageValue = JSON.stringify(richData[0]);
                    } else {
                        storageValue = JSON.stringify(richData);
                    }
                } else if (result.name) {
                    // Fallback to single object if items missing but name present (shouldn't happen with new picker)
                    storageValue = JSON.stringify({
                        id: result.id,
                        name: result.name,
                        type: result.type,
                        config: result.config || {}
                    });
                }

                // Auto-Save
                Logger.log(`Auto-Saving ${key}:`, storageValue);
                await this._saveBinding(key, storageValue);
            }, {
                // Provide defaults for the picker context if needed
                bindings: (() => {
                    // 1. If we have a current value, parse it into bindings
                    if (currentValue && currentValue.trim() !== "") {
                        try {
                            const v = currentValue.trim();

                            // Case A: JSON Object (Single)
                            if (v.startsWith("{")) {
                                const obj = JSON.parse(v);
                                return [{
                                    id: obj.id,
                                    name: obj.name || `ID: ${obj.id}`,
                                    type: obj.type || SOUND_TYPES.ONESHOT,
                                    meta: "Custom Override",
                                    delayMin: obj.config?.delayMin || 0,
                                    delayMax: obj.config?.delayMax || 0
                                }];
                            }

                            // Case B: JSON Array (Multi-Select Rich)
                            if (v.startsWith("[")) {
                                const list = JSON.parse(v);
                                return list.map(obj => ({
                                    id: obj.id,
                                    name: obj.name || `ID: ${obj.id}`,
                                    type: obj.type || SOUND_TYPES.ONESHOT,
                                    meta: "Custom Loop",
                                    delayMin: obj.config?.delayMin || 0,
                                    delayMax: obj.config?.delayMax || 0
                                }));
                            }

                            // Case C: CSV String (Legacy Multi-Select)
                            if (v.includes(",")) {
                                return v.split(",").map(id => ({
                                    id: id.trim(),
                                    name: `ID: ${id.trim()}`,
                                    type: SOUND_TYPES.ONESHOT,
                                    meta: "Custom Loop"
                                }));
                            }

                            // Case D: Single ID String
                            return [{
                                id: v,
                                name: `ID: ${v}`,
                                type: SOUND_TYPES.ONESHOT,
                                meta: "Custom Override"
                            }];

                        } catch (e) {
                            Logger.warn("Error parsing current value for picker:", e);
                        }
                    }

                    // 2. Fallback to Default only if no custom value
                    // BUT: If in Manual Mode (None), defaults are disabled.
                    // We only want defaults if we are in a preset mode (Fantasy/Core)
                    const soundPreset = game.settings.get("ionrift-resonance", "soundPreset") ?? "none";
                    if (soundPreset !== "none" && key && SYRINSCAPE_DEFAULTS[key]) {
                        const def = SYRINSCAPE_DEFAULTS[key];
                        if (Array.isArray(def)) {
                            // Map to confirm structure
                            return def.map(d => {
                                if (typeof d === 'string') return { id: d, name: `ID: ${d}`, meta: "Default" };
                                return { ...d, meta: "Default" };
                            });
                        } else {
                            // Single
                            if (typeof def === 'string') return [{ id: def, name: `ID: ${def}`, meta: "Default" }];
                            return [{ ...def, meta: "Default" }];
                        }
                    }

                    return [];
                })(),
                currentSoundId: "", // bindings takes precedence
                soundKey: key,
                title: game.i18n.format("ionrift-resonance.config.pickSoundTitle", { label: humanLabel }),
                soundConfig: (() => {
                    try {
                        const v = currentValue.trim();
                        if (v.startsWith("{")) {
                            const obj = JSON.parse(v);
                            if (obj.config) return { [obj.id]: obj.config };
                        }
                        // Handle array case if needed for config map, but bindings already has it
                    } catch (e) { }
                    return {};
                })()
            }).render(true);

        } catch (e) {
            console.error("Ionrift Sound Config | Failed to load SoundPickerApp:", e);
            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.soundConfigRequiredForSearch"));
        }
    }

    async _onPositionalMaster(event) {
        if (!voiceModuleActive()) {
            event.currentTarget.checked = false;
            return;
        }
        await game.settings.set("ionrift-resonance", "positionalSfx", event.currentTarget.checked === true);
    }

    async _onPositionalCategory(event) {
        const id = event.currentTarget.dataset.category;
        const stored = game.settings.get("ionrift-resonance", "positionalCategories") || {};
        const next = { ...DEFAULT_POSITIONAL_CATEGORIES, ...stored, [id]: event.currentTarget.checked === true };
        await game.settings.set("ionrift-resonance", "positionalCategories", next);
    }

    async _onHearPositional(event) {
        const value = event.currentTarget.value === "normal" ? "normal" : "follow";
        await game.settings.set("ionrift-resonance", "hearPositionalSfx", value);
    }

    async _onAddRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target; // "campaign" or "players"
        const currentConfig = game.settings.get("ionrift-resonance", "configOverrides") || {};

        if (!currentConfig[target]) currentConfig[target] = [];

        if (target === "campaign") {
            currentConfig.campaign.push({ actor: "", item: "", sound: "" });
        } else if (target === "players") {
            currentConfig.players.push({ name: "", death: "", pain: "" });
        }

        // Save & Re-render (easiest way to update UI)
        await game.settings.set("ionrift-resonance", "configOverrides", currentConfig);
        this.render(true);
    }

    async _onDeleteRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target;
        const index = event.currentTarget.dataset.index;

        const currentConfig = game.settings.get("ionrift-resonance", "configOverrides") || {};
        if (currentConfig[target]) {
            currentConfig[target].splice(index, 1);
            await game.settings.set("ionrift-resonance", "configOverrides", currentConfig);
            this.render(true);
        }
    }

    _onExportConfig(event) {
        event.preventDefault();
        const bindings = game.settings.get("ionrift-resonance", "customSoundBindings");
        const overrides = game.settings.get("ionrift-resonance", "configOverrides");

        const exportData = {
            timestamp: Date.now(),
            version: "1.0.0",
            bindings: JSON.parse(bindings || "{}"),
            overrides: overrides || {}
        };

        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "text/json", "ionrift-resonance-config.json");
    }

    async _onLoadPreset(event) {
        event.preventDefault();

        // Dynamic Import to avoid circular dependencies if any
        const { SyrinscapeConfigApp } = await import("./SyrinscapeConfigApp.js");
        new SyrinscapeConfigApp().render(true);
    }

    async _onImportConfig(event) {
        event.preventDefault();

        // Singleton check
        if (this._importDialog && this._importDialog.rendered) {
            this._importDialog.bringToTop();
            return;
        }

        this._importDialog = new Dialog({
            title: game.i18n.localize("ionrift-resonance.config.importDialogTitle"),
            content: `
                <div class="form-group">
                    <label>${game.i18n.localize("ionrift-resonance.config.importDialogLabel")}</label>
                    <textarea name="json" style="width:100%; height: 200px; font-family: monospace;"></textarea>
                </div>
                <p class="notes">${game.i18n.localize("ionrift-resonance.config.importDialogNotes")}</p>
            `,
            buttons: {
                import: {
                    label: game.i18n.localize("ionrift-resonance.config.importBtn"),
                    icon: "<i class='fas fa-file-import'></i>",
                    callback: async (html) => {
                        const jsonStr = html.find("[name='json']").val();

                        // Fix: Check for empty input
                        if (!jsonStr || jsonStr.trim() === "") {
                            ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.importCancelledEmpty"));
                            return;
                        }

                        try {
                            const data = JSON.parse(jsonStr);

                            // 0. Version / Schema Check
                            if (!data.version || !data.version.startsWith("1.")) {
                                ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.importLegacyVersion"));
                            }

                            // Validation checks
                            if (data.bindings) {
                                await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(data.bindings));
                            }
                            if (data.overrides) {
                                await game.settings.set("ionrift-resonance", "configOverrides", data.overrides);
                            }

                            ui.notifications.info(game.i18n.localize("ionrift-resonance.notification.configImportedSuccessfully"));
                            this.render(true);
                            game.ionrift.resonance?.handler?.loadConfig(); // Reload
                        } catch (e) {
                            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.importFailedInvalidJson"));
                            console.error(e);
                        }
                    }
                }
            },
            default: "import",
            close: () => { this._importDialog = null; }
        }, {
            classes: ["ionrift", "ionrift-window", "dialog", "glass-ui"]
        });

        this._importDialog.render(true);
    }

    async _onPlayPreview(event) {
        event.preventDefault(); // Stop default button behavior
        const target = event.currentTarget;
        let soundKeyOrId = target.dataset.sound;
        let soundType = target.dataset.type; // NEW: Capture type from DOM if present

        // NEW: Try to read the current input value from the row to support "Preview before Save"
        const row = target.closest("tr") || target.closest(".entity-row"); // Support both Table and Div layouts
        const input = row?.querySelector("input");
        let inputValue = input ? input.value : null;

        if (input) {
            const val = input.value;
            // Only update if override is present. Otherwise fallback to dataset.sound (Default Key)
            if (val && val.trim() !== "") {
                soundKeyOrId = val;
                // Logger.log(`Previewing from Override: ${soundKeyOrId}`);
            }
        } else if (inputValue && inputValue.trim() !== "") {
            // Fallback to simpler getter
            soundKeyOrId = inputValue;
        }

        // Check if value is JSON (new binding format)
        let idToPlay = soundKeyOrId;
        let playOptions = {};

        try {
            if (typeof soundKeyOrId === 'string' && soundKeyOrId.trim().startsWith("{")) {
                const obj = JSON.parse(soundKeyOrId);
                idToPlay = obj.id;
                if (obj.type) soundType = obj.type; // Extract type from JSON
            } else if (typeof soundKeyOrId === 'string' && soundKeyOrId.trim().startsWith("[")) {
                // Multi-sound array: pick one randomly for preview
                const arr = JSON.parse(soundKeyOrId);
                if (Array.isArray(arr) && arr.length > 0) {
                    const pick = arr[Math.floor(Math.random() * arr.length)];
                    idToPlay = pick.id;
                    if (pick.type) soundType = pick.type;
                }
            }
        } catch (e) { }

        // Type Mapping (Copied from SoundPickerApp for consistency)
        if (soundType) {
            if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
            else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
            else if (soundType === SOUND_TYPES.MUSIC_ELEMENT) playOptions.type = SOUND_TYPES.ELEMENT;
            else playOptions.type = SOUND_TYPES.ELEMENT;
        }

        const semanticKey = typeof soundKeyOrId === "string" ? soundKeyOrId.trim() : "";
        const isDirectAsset = this._isDirectPreviewAsset(idToPlay);

        // Calibration preview: play what the row displays before chasing combat fallbacks.
        // MONSTER_*_ATTACK keys otherwise resolve to CORE_MELEE -> generic sword swing.
        if (!isDirectAsset && game.ionrift.resonance?.handler?.resolver) {
            const direct = game.ionrift.resonance?.handler?.resolver?.resolveKeyDirect(semanticKey);
            if (direct) {
                idToPlay = direct;
            } else {
                const fromRow = this._pickPreviewFromRowTags(row);
                if (fromRow) {
                    idToPlay = fromRow;
                } else if (semanticKey.endsWith("_ATTACK")) {
                    ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.noPreviewAudioUnboundAttack"));
                    return;
                } else {
                    const resolved = game.ionrift.resonance.handler.resolveSound(idToPlay);
                    if (resolved) {
                        if (typeof resolved === 'string') {
                            idToPlay = resolved;
                        } else if (typeof resolved === 'object') {
                            idToPlay = resolved.id;
                            if (resolved.type) {
                                soundType = resolved.type;
                                if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
                                else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
                                else playOptions.type = SOUND_TYPES.ELEMENT;
                            }
                        }
                    }
                }
            }
        } else if (!isDirectAsset && game.ionrift.resonance?.handler) {
            const resolved = game.ionrift.resonance.handler.resolveSound(idToPlay);
            if (resolved) {
                if (typeof resolved === 'string') idToPlay = resolved;
                else if (typeof resolved === 'object') {
                    idToPlay = resolved.id;
                    if (resolved.type) {
                        soundType = resolved.type;
                        if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
                        else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
                        else playOptions.type = SOUND_TYPES.ELEMENT;
                    }
                }
            }
        }

        if (typeof idToPlay === "string" && idToPlay.includes(",")) {
            const parts = idToPlay.split(",").map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                idToPlay = parts[Math.floor(Math.random() * parts.length)];
            }
        }

        Logger.log(`Previewing: ${idToPlay}`, playOptions);

        if (game.ionrift.resonance?.manager) {
            game.ionrift.resonance?.manager?.play(idToPlay, playOptions);
        }
    }

    _isDirectPreviewAsset(value) {
        if (!value || typeof value !== "string") return false;
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
        return trimmed.includes("/")
            || trimmed.includes("\\")
            || /\.(mp3|wav|ogg|flac|m4a)$/i.test(trimmed)
            || /^\d+$/.test(trimmed);
    }

    _pickPreviewFromRowTags(row) {
        if (!row || row.classList.contains("muted-row")) return null;

        const badges = row.querySelectorAll(".entity-badges .ionrift-badge[title]");
        const candidates = [];
        for (const badge of badges) {
            const id = badge.getAttribute("title")?.trim();
            if (!id) continue;
            if (badge.textContent?.includes("No Sound Bound")) continue;
            candidates.push(id);
        }

        if (!candidates.length) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }


    async _onStopAll(event) {
        event.preventDefault();
        if (game.ionrift.resonance?.manager) {
            game.ionrift.resonance?.manager?.stopAll();
            ui.notifications.info(game.i18n.localize("ionrift-resonance.notification.syrinscapeStopSignalSent"));
        }
    }

    /**
     * Handle Dropped Actors or Items to open their specific config.
     * @param {DragEvent} event 
     */
    async _onDrop(event) {
        // Try to parse data
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return false;
        }

        if (!data) return false;

        // Resolve Document
        const doc = await fromUuid(data.uuid);
        if (!doc) return false;

        // Check if Actor or Item
        if (doc.documentName === "Actor" || doc.documentName === "Item") {
            // Forward to Handler's open method (if available)
            if (game.ionrift.resonance?.handler?.openSoundConfig) {
                game.ionrift.resonance.handler.openSoundConfig(doc);
            } else {
                // Fallback (re-implement logic if handler method is missing)
                try {
                    if (doc.documentName === "Actor") {
                        const { ActorSoundConfig } = await import("./ActorSoundConfig.js");
                        new ActorSoundConfig(doc).render(true);
                    } else {
                        const { ItemSoundConfig } = await import("./ItemSoundConfig.js");
                        new ItemSoundConfig(doc).render(true);
                    }
                } catch (e) {
                    ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.couldNotLoadConfig"));
                }
            }
        }
    }
}
