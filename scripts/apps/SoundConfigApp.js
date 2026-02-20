import { SYRINSCAPE_DEFAULTS, SYRINSCAPE_PRESETS } from "../data/syrinscape_defaults.js";
import { SoundCardState } from "../models/SoundCardState.js";
import { Logger } from "../Logger.js";

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
            title: "Resonance Calibration",
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
                        soundType = "One-Shot";
                        soundLabel = soundLabel.replace("[OneshotElement]", "").trim();
                    } else if (soundLabel.includes("GLOBAL:")) {
                        soundType = "Global";
                    } else if (soundLabel.match(/^\d+$/)) {
                        soundType = "ID";
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
           Note: "Inherited" means "Inherited from Parent Node in Hierarchy".
           We pass the parent's resolved state down during processing.
        */
        const resolveValue = (key, loopCheck = []) => {
            if (!key) return null;
            if (loopCheck.includes(key)) return null;

            // 1. Custom
            if (customBindings[key]) return { value: customBindings[key], source: "custom" };

            // 2. Check for None Preset
            const preset = game.settings.get("ionrift-resonance", "soundPreset");
            if (preset === "none") return { value: null, source: null };

            // 3. Default
            const def = SYRINSCAPE_DEFAULTS[key];
            if (def) return { value: def, source: "default" };

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
                    myState = new SoundCardState(node.id,
                        (check.source === "custom" ? check.value : null),
                        SYRINSCAPE_DEFAULTS[node.id],
                        node.cardLabel || node.label,
                        node.description
                    );
                } else {
                    // No explicit value -> Check Parent
                    if (parentState && parentState.value) {
                        // Inherit from parent
                        myResolved = { value: parentState.value, source: "inherited" };
                        myState = new SoundCardState(node.id, null, SYRINSCAPE_DEFAULTS[node.id], node.cardLabel || node.label, node.description, parentState.label);
                        myState.value = myResolved.value; // Force value for playback/display
                        myState.isInherited = true;
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
                children: [],
                fields: [], // Leaf nodes
                headerCard: node.id ? myState.getRenderData() : null,
                isOpen: this._expandedGroups.has(node.label) || false
            };

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

        // --- TAXONOMY DEFINITIONS ---

        const actionTaxonomy = [
            {
                label: "Attacks (Melee)",
                id: "CORE_MELEE", // Fallback for all melee?
                description: "Master setting for Melee Attacks.",
                children: [
                    { label: "Bludgeoning (Mace/Hammer)", id: "ATTACK_BLUDGEON" },
                    { label: "Slashing (Sword/Axe)", id: "ATTACK_SWORD" }, // Maps to Generic Sword
                    { label: "Piercing (Dagger/Spear)", id: "ATTACK_DAGGER" },
                    { label: "Natural (Claw/Bite)", id: "ATTACK_CLAW" },
                    { label: "Unarmed (Punch)", id: "CORE_BRAWL" }
                ]
            },
            {
                label: "Attacks (Ranged)",
                id: "CORE_RANGED",
                description: "Master setting for Ranged Attacks.",
                children: [
                    { label: "Bow", id: "ATTACK_BOW" },
                    { label: "Crossbow", id: "ATTACK_CROSSBOW" },
                    { label: "Sling", id: "ATTACK_SLING" }
                    // Firearm? Thrown?
                ]
            },
            {
                label: "Magic (Spells)",
                id: "CORE_MAGIC",
                description: "Master catch-all for all spell sounds. Schools, domains, and effect types fall back here if unset.",
                children: []
            }
        ];

        // System-specific spell traditions
        if (game.system.id === 'dnd5e') {
            // Effect-type children (DnD5e has explicit damage types)
            actionTaxonomy[actionTaxonomy.length - 1].children = [
                { label: "Fire / Heat", id: "SPELL_FIRE" },
                { label: "Ice / Cold", id: "SPELL_ICE" },
                { label: "Lightning / Storm", id: "SPELL_LIGHTNING" },
                { label: "Acid / Poison", id: "SPELL_ACID" },
                { label: "Healing / Radiant", id: "SPELL_HEAL" },
                { label: "Psychic / Divination", id: "SPELL_PSYCHIC" },
                { label: "Necrotic / Void", id: "SPELL_VOID" }
            ];

            actionTaxonomy.push({
                label: "Spell Schools",
                id: "CORE_SCHOOL",
                description: "Where the magic comes from — match by arcane tradition. Unset schools fall back to Magic (Spells).",
                children: [
                    { label: "Abjuration", id: "SCHOOL_ABJURATION", description: "Protective wards and barriers." },
                    { label: "Conjuration", id: "SCHOOL_CONJURATION", description: "Summoning creatures and objects." },
                    { label: "Divination", id: "SCHOOL_DIVINATION", description: "Perceiving hidden truths." },
                    { label: "Enchantment", id: "SCHOOL_ENCHANTMENT", description: "Influencing minds." },
                    { label: "Evocation", id: "SCHOOL_EVOCATION", description: "Raw elemental energy." },
                    { label: "Illusion", id: "SCHOOL_ILLUSION", description: "Deceptive phantasms." },
                    { label: "Necromancy", id: "SCHOOL_NECROMANCY", description: "Death and undeath magic." },
                    { label: "Transmutation", id: "SCHOOL_TRANSMUTATION", description: "Altering physical properties." }
                ]
            });
        }

        if (game.system.id === 'daggerheart') {
            actionTaxonomy.push({
                label: "Domains",
                id: "CORE_DOMAIN",
                description: "Where the magic comes from — match by domain tradition. Unset domains fall back to Magic (Spells).",
                children: [
                    { label: "Arcana", id: "DOMAIN_ARCANA", description: "Innate, instinctual magic." },
                    { label: "Blade", id: "DOMAIN_BLADE", description: "Mastery of weapons." },
                    { label: "Bone", id: "DOMAIN_BONE", description: "Swiftness and tactical agility." },
                    { label: "Codex", id: "DOMAIN_CODEX", description: "Intensive magical study." },
                    { label: "Grace", id: "DOMAIN_GRACE", description: "Charisma and persuasion." },
                    { label: "Midnight", id: "DOMAIN_MIDNIGHT", description: "Shadows and secrecy." },
                    { label: "Sage", id: "DOMAIN_SAGE", description: "Natural world magic." },
                    { label: "Splendor", id: "DOMAIN_SPLENDOR", description: "Life, healing, and death." },
                    { label: "Valor", id: "DOMAIN_VALOR", description: "Protection and defense." }
                ]
            });
        }

        const monsterTaxonomy = [
            {
                label: "Humanoids",
                id: "MONSTER_HUMANOID", cardLabel: "Default Vocal",
                description: "Standard bipedal folk (Humans, Elves, Dwarves).",
                children: [
                    { label: "Default Attack", id: "MONSTER_HUMANOID_ATTACK" },
                    {
                        label: "Goblinoids (Goblin/Hobgoblin)", id: "MONSTER_GOBLIN", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_GOBLIN_ATTACK" }]
                    },
                    {
                        label: "Lycanthropes (Were-creatures)", id: "MONSTER_LYCANTHROPE", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_LYCANTHROPE_ATTACK" }]
                    }
                ]
            },
            {
                label: "Undead",
                id: "MONSTER_UNDEAD", cardLabel: "Default Vocal",
                description: "Zombies, Skeletons, Ghosts.",
                children: [
                    { label: "Default Attack", id: "MONSTER_UNDEAD_ATTACK" },
                    {
                        label: "Zombie / Ghoul (Flesh)", id: "MONSTER_ZOMBIE", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_ZOMBIE_ATTACK" }]
                    },
                    {
                        label: "Skeleton / Lich (Bone)", id: "MONSTER_SKELETON", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_SKELETON_ATTACK" }]
                    },
                    {
                        label: "Ghost / Spirit / Wraith", id: "MONSTER_GHOST", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_GHOST_ATTACK" }]
                    }
                ]
            },
            {
                label: "Beasts & Animals",
                id: "MONSTER_BEAST", cardLabel: "Default Vocal",
                description: "Natural creatures.",
                children: [
                    { label: "Default Attack", id: "MONSTER_BEAST_ATTACK" },
                    {
                        label: "Ursine (Bear / Owlbear)", id: "MONSTER_BEAR", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_BEAR_ATTACK" }]
                    },
                    {
                        label: "Canine (Wolf / Dog)", id: "MONSTER_WOLF", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_WOLF_ATTACK" }]
                    },
                    {
                        label: "Feline (Cat / Lion)", id: "MONSTER_CAT", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_CAT_ATTACK" }]
                    },
                    {
                        label: "Avian (Bird / Harpy)", id: "MONSTER_BIRD", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_BIRD_ATTACK" }]
                    },
                    {
                        label: "Equine (Horse)", id: "MONSTER_HORSE", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_HORSE_ATTACK" }]
                    },
                    {
                        label: "Reptiles (Lizard/Snake)", id: "MONSTER_REPTILE", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_REPTILE_ATTACK" }]
                    },
                    {
                        label: "Insects / Spiders", id: "SFX_INSECT", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "SFX_INSECT_ATTACK" }]
                    }
                ]
            },
            {
                label: "Fiends (Demons & Devils)",
                id: "MONSTER_FIEND", cardLabel: "Default Vocal",
                description: "Extraplanar evil entities.",
                children: [
                    { label: "Default Attack", id: "MONSTER_FIEND_ATTACK" },
                    {
                        label: "Demon (Chaotic)", id: "MONSTER_DEMON", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "MONSTER_DEMON_ATTACK" }]
                    }
                ]
            },
            {
                label: "Dragons",
                id: "MONSTER_DRAGON", cardLabel: "Default Vocal",
                description: "Chromatics, Metallics, Wyverns.",
                children: [
                    { label: "Default Attack", id: "MONSTER_DRAGON_ATTACK" },
                    {
                        label: "Wyvern", id: "dragon_wyvern", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "dragon_wyvern_ATTACK" }]
                    }
                ]
            },
            {
                label: "Giants",
                id: "MONSTER_GIANT", cardLabel: "Default Vocal",
                description: "Ogres, Trolls, Giants.",
                children: [
                    { label: "Default Attack", id: "MONSTER_GIANT_ATTACK" }
                ]
            },
            {
                label: "Constructs",
                id: "MONSTER_CONSTRUCT", cardLabel: "Default Vocal",
                description: "Golems, Animated Objects.",
                children: [
                    { label: "Default Attack", id: "MONSTER_CONSTRUCT_ATTACK" },
                    {
                        label: "Golems (Generic)", id: "construct_golem", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "construct_golem_ATTACK" }]
                    },
                    {
                        label: "Animated Objects", id: "construct_animated_object", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "construct_animated_object_ATTACK" }]
                    }
                ]
            },
            {
                label: "Elementals",
                id: "MONSTER_ELEMENTAL", cardLabel: "Default Vocal",
                description: "Beings of raw elemental matter.",
                children: [
                    { label: "Default Attack", id: "MONSTER_ELEMENTAL_ATTACK" },
                    {
                        label: "Fire Elemental", id: "SFX_FIRE", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "SFX_FIRE_ATTACK" }]
                    },
                    {
                        label: "Water Elemental", id: "SFX_WATER_ENTITY", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "SFX_WATER_ENTITY_ATTACK" }]
                    },
                    {
                        label: "Air Elemental", id: "SFX_WIND", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "SFX_WIND_ATTACK" }]
                    },
                    {
                        label: "Earth Elemental", id: "elemental_earth", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "elemental_earth_ATTACK" }]
                    }
                ]
            },
            {
                label: "Aberrations",
                id: "MONSTER_ALIEN", cardLabel: "Default Vocal",
                description: "Beholders, Mind Flayers, Aliens.",
                children: [
                    { label: "Default Attack", id: "MONSTER_ALIEN_ATTACK" },
                    {
                        label: "Beholder", id: "aberration_beholder", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "aberration_beholder_ATTACK" }]
                    },
                    {
                        label: "Mind Flayer", id: "aberration_mind_flayer", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "aberration_mind_flayer_ATTACK" }]
                    },
                    {
                        label: "Chuul / Aquatic", id: "aberration_chuul", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "aberration_chuul_ATTACK" }]
                    }
                ]
            },
            {
                label: "Plants & Fungi",
                id: "MONSTER_PLANT", cardLabel: "Default Vocal",
                description: "Treants, Myconids.",
                children: [
                    { label: "Default Attack", id: "MONSTER_PLANT_ATTACK" },
                    {
                        label: "Treants", id: "plant_treant", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "plant_treant_ATTACK" }]
                    },
                    {
                        label: "Myconids / Fungi", id: "plant_myconid", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "plant_myconid_ATTACK" }]
                    },
                    {
                        label: "Shambling Mound", id: "plant_shambling_mound", cardLabel: "Default Vocal",
                        children: [{ label: "Default Attack", id: "plant_shambling_mound_ATTACK" }]
                    }
                ]
            },
            {
                label: "Oozes & Slimes",
                id: "SFX_SLIME", cardLabel: "Default Vocal",
                description: "Gelatinous Cubes, Puddings.",
                children: [
                    { label: "Default Attack", id: "SFX_SLIME_ATTACK" }
                ]
            }
        ];

        // --- CORE TAXONOMY (Tier 1: Results Only) ---
        const coreTaxonomy = [
            {
                label: "Combat Outcomes",
                description: "Hits, misses, and impacts.",
                children: [
                    {
                        id: "CORE_HIT", label: "Strike Landed", description: "Default impact sound when an attack hits.",
                        children: [
                            { id: "CORE_HIT_RANGED", label: "Strike Landed (Ranged)", description: "Arrow/bolt impact. Falls back to default hit if unset." },
                            { id: "CORE_HIT_MAGIC", label: "Strike Landed (Spell)", description: "Magical burst on spell hit. Falls back to default hit if unset." }
                        ]
                    },
                    {
                        id: "CORE_MISS", label: "Strike Missed", description: "Default whoosh/whiff when an attack misses.",
                        children: [
                            { id: "CORE_MISS_RANGED", label: "Strike Missed (Ranged)", description: "Arrow whiff/ricochet. Falls back to default miss if unset." },
                            { id: "CORE_MISS_MAGIC", label: "Strike Missed (Spell)", description: "Fizzle/dissipate on spell miss. Falls back to default miss if unset." }
                        ]
                    },
                    { id: "CORE_WHOOSH", label: "Swing (Fallback)", description: "Generic swing for weapons without a specific attack sound." }
                ]
            },
            {
                label: "Vocals",
                description: "Pain and death sounds.",
                children: [
                    { id: "CORE_PAIN_MASCULINE", label: "Pain Cry (Masculine)", description: "Grunt when a masculine humanoid takes damage." },
                    { id: "CORE_PAIN_FEMININE", label: "Pain Cry (Feminine)", description: "Grunt when a feminine humanoid takes damage." },
                    { id: "CORE_DEATH_MASCULINE", label: "Death Cry (Masculine)", description: "Death sound for masculine humanoid actors." },
                    { id: "CORE_DEATH_FEMININE", label: "Death Cry (Feminine)", description: "Death sound for feminine humanoid actors." },
                    { id: "CORE_MONSTER_PAIN", label: "Monster Pain", description: "Growl/pain reaction for non-humanoid creatures." },
                    { id: "CORE_MONSTER_DEATH", label: "Monster Death", description: "Death sound for non-humanoid creatures." }
                ]
            }
        ];

        // Add System Specifics
        if (game.system.id === 'dnd5e') {
            coreTaxonomy.push({
                label: "D&D 5e Mechanics",
                description: "System specific rolls (Nat 20 / Nat 1).",
                children: [
                    { id: "CORE_CRIT", label: "Critical Hit (Nat 20)", description: "Celebratory sound for a Critical Hit." },
                    { id: "CORE_FUMBLE", label: "Critical Miss (Nat 1)", description: "Fail sound for a Critical Miss." }
                ]
            });
        }

        if (game.system.id === 'daggerheart') {
            // Group 1: Duality Dice (Roll Outcomes)
            coreTaxonomy.push({
                label: "Daggerheart: Duality Dice",
                description: "Sounds for 2d12 roll outcomes.",
                children: [
                    // Granular Roll Outcomes
                    { id: "DAGGERHEART_CRIT", label: "Critical Success (Doubles)", description: "Rolled doubles on Duality Dice (automatic success)." },
                    { id: "DAGGERHEART_SUCCESS_WITH_HOPE", label: "Success with Hope", description: "Action succeeded, Hope die won." },
                    { id: "DAGGERHEART_SUCCESS_WITH_FEAR", label: "Success with Fear", description: "Action succeeded, but with a complication (Fear die won)." },
                    { id: "DAGGERHEART_FAIL_WITH_HOPE", label: "Fail with Hope", description: "Action failed, but Hope die won (silver lining)." },
                    { id: "DAGGERHEART_FAIL_WITH_FEAR", label: "Fail with Fear (Fumble)", description: "Action failed catastrophically (Fear die won)." },

                    // Legacy (fallback if DC not available)
                    { id: "DAGGERHEART_ROLL_HOPE", label: "Roll with Hope (Legacy)", description: "Hope die > Fear die (use if DC unknown)." },
                    { id: "DAGGERHEART_ROLL_FEAR", label: "Roll with Fear (Legacy)", description: "Fear die > Hope die (use if DC unknown)." }
                ]
            });

            // Group 2: Player Resources
            coreTaxonomy.push({
                label: "Daggerheart: Player Resources",
                description: "Hope, Stress, and Armor mechanics.",
                children: [
                    // Hope
                    { id: "DAGGERHEART_HOPE", label: "Hope Resource (Gain)", description: "Triggered when a player gains a Hope token." },
                    { id: "DAGGERHEART_HOPE_USE", label: "Hope Resource (Use)", description: "Triggered when a player spends a Hope token." },

                    // Stress
                    { id: "DAGGERHEART_STRESS", label: "Take Stress", description: "Played when a character marks Stress." },
                    { id: "DAGGERHEART_STRESS_CLEAR", label: "Clear Stress", description: "Played when a character recovers Stress." },

                    // Armor
                    { id: "DAGGERHEART_ARMOR_USE", label: "Armor Block/Deplete", description: "Played when Armor slots are reduced." },
                    { id: "DAGGERHEART_ARMOR_REPAIR", label: "Armor Repair", description: "Played when Armor slots are restored." }
                ]
            });

            // Group 3: Fear System (GM Only)
            coreTaxonomy.push({
                label: "Daggerheart: Fear Tracker (GM)",
                description: "GM Fear mechanics (Spending & Gaining).",
                children: [
                    // Fear Spend
                    { id: "DAGGERHEART_FEAR_USE_LOW", label: "GM Fear Spend (1)", description: "Triggered when GM spends 1 Fear." },
                    { id: "DAGGERHEART_FEAR_USE_MED", label: "GM Fear Spend (2-4)", description: "Triggered when GM spends 2-4 Fear." },
                    { id: "DAGGERHEART_FEAR_USE_HIGH", label: "GM Fear Spend (5+)", description: "Triggered when GM spends 5+ Fear." },

                    // Fear Gain (Tracker Thresholds)
                    { id: "DAGGERHEART_FEAR_LOW", label: "GM Fear Increases (to 1-4)", description: "Triggered when GM Fear pool reaches 1-4." },
                    { id: "DAGGERHEART_FEAR_MED", label: "GM Fear Increases (to 5-8)", description: "Triggered when GM Fear pool reaches 5-8." },
                    { id: "DAGGERHEART_FEAR_HIGH", label: "GM Fear Increases (to 9+)", description: "Triggered when GM Fear pool reaches 9 or more." }
                ]
            });
        }

        // Process Roots
        const tier1Roots = coreTaxonomy.map(node => processHierarchy(node));
        const tier2Roots = actionTaxonomy.map(node => processHierarchy(node));
        const tier3Roots = monsterTaxonomy.map(node => processHierarchy(node));

        return {
            tiers: {
                tier1: {
                    label: "Tier 1: Core",
                    active: true,
                    paramounts: tier1Roots
                },
                tier2: {
                    label: "Tier 2: Actions",
                    active: false,
                    paramounts: tier2Roots // New Structure
                },
                tier3: {
                    label: "Tier 3: Monsters",
                    active: false,
                    paramounts: tier3Roots // New Structure
                },
                auditor: {
                    label: "Auditor",
                    active: false,
                    items: this._getAuditorData()
                },
                players: {
                    label: "Players",
                    active: false,
                    players: configOverrides.players || []
                },
                config: configOverrides
            }
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

        // Reset
        html.on("click", ".reset-sound", this._onReset.bind(this));

        // Auditor
        html.on("click", ".auditor-edit", this._onAuditorEdit.bind(this));
        html.on("click", ".auditor-delete", this._onAuditorDelete.bind(this));

        // Auditor Controls
        html.on("keyup", ".auditor-search-input", this._onAuditorSearchKey.bind(this));
        html.on("click", ".auditor-control-btn", this._onAuditorPageControl.bind(this));

        // ----------------------------------------------------------------
        // NEW: Live Updates for Auditor
        // ----------------------------------------------------------------
        // Only refresh if ionrift-resonance flags actually CHANGED in this update.
        // The updateActor/updateItem hooks pass (doc, changes, options, userId).
        // Previously this checked doc.flags (always truthy for configured actors),
        // causing the Calibration window to re-render on every HP change during combat.
        this._updateHook = (doc, changes) => {
            const flagsChanged = changes?.flags?.["ionrift-resonance"];
            if (flagsChanged) this._debouncedRefresh();
        };

        if (!this._hooksRegistered) {
            Hooks.on("updateActor", this._updateHook);
            Hooks.on("updateItem", this._updateHook);
            this._hooksRegistered = true;
        }

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
        this.element.find(".auditor-page-info").text(`Page ${data.page} of ${data.totalPages}`);

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
            ui.notifications.error("Ionrift: Could not load Sound Config for editing.");
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
            ui.notifications.info(`Reset sound override for ${doc.name}`);
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

        if (!key) {
            Logger.error("Could not find key for sound config button.", button);
            return;
        }

        // Find current value (Source of Truth: Settings > DOM)
        let currentValue = "";

        const preset = game.settings.get("ionrift-resonance", "soundPreset");
        const customBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        if (preset === "none") {
            // Manual Mode: Strictly use settings. If deleted, it's empty.
            // This prevents stale DOM inputs from ghosting deleted values.
            currentValue = customBindings[key] || "";
        } else {
            // Default/Inheritance Mode: 
            // 1. Check Custom first (fastest)
            if (customBindings[key]) {
                currentValue = customBindings[key];
            } else {
                // 2. Fallback to DOM to catch Defaults/Inherited values rendered by Handlebars
                const row = this.element.find(`.entity-row[data-key="${key}"]`);
                if (row.length) {
                    const input = row.find("input");
                    currentValue = input.val();
                }
            }
        }

        try {
            const { SoundPickerApp } = await import("./SoundPickerApp.js");

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
                            type: item.type || "oneshot",
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
                                    type: obj.type || "oneshot",
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
                                    type: obj.type || "oneshot",
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
                                    type: "oneshot",
                                    meta: "Custom Loop"
                                }));
                            }

                            // Case D: Single ID String
                            return [{
                                id: v,
                                name: `ID: ${v}`,
                                type: "oneshot",
                                meta: "Custom Override"
                            }];

                        } catch (e) {
                            Logger.warn("Error parsing current value for picker:", e);
                        }
                    }

                    // 2. Fallback to Default only if no custom value
                    // BUT: If in Manual Mode (None), defaults are disabled.
                    // We only want defaults if we are in a preset mode (Fantasy/Core)
                    if (preset !== "none" && key && SYRINSCAPE_DEFAULTS[key]) {
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
                title: `Pick Sound for ${key}`,
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
            ui.notifications.error("Ionrift Sound Config required for Search.");
        }
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
        const { AttunementApp } = await import("./AttunementApp.js");

        // Open the Attunement App
        // We can optionally pass data to jump to a specific step, 
        // but for now just opening it is sufficient functionality (users can skip step 1).
        const app = new AttunementApp();
        app.render(true);

        // Ideally we'd jump to step 2, but AbstractWelcomeApp starts at 0.
        // We can close this config window effectively "handing off" control
        // this.close(); 
    }

    async _onImportConfig(event) {
        event.preventDefault();

        // Singleton check
        if (this._importDialog && this._importDialog.rendered) {
            this._importDialog.bringToTop();
            return;
        }

        this._importDialog = new Dialog({
            title: "Import Configuration",
            content: `
                <div class="form-group">
                    <label>Paste JSON or Upload File content here:</label>
                    <textarea name="json" style="width:100%; height: 200px; font-family: monospace;"></textarea>
                </div>
                <p class="notes">This will <strong>overwrite</strong> your current "User Sound Bindings" and "Campaign Overrides".</p>
            `,
            buttons: {
                import: {
                    label: "Import",
                    icon: "<i class='fas fa-file-import'></i>",
                    callback: async (html) => {
                        const jsonStr = html.find("[name='json']").val();

                        // Fix: Check for empty input
                        if (!jsonStr || jsonStr.trim() === "") {
                            ui.notifications.warn("Ionrift Sounds | Import cancelled: Input was empty.");
                            return;
                        }

                        try {
                            const data = JSON.parse(jsonStr);

                            // 0. Version / Schema Check
                            if (!data.version || !data.version.startsWith("1.")) {
                                ui.notifications.warn("Ionrift Sounds | Importing legacy or incompatible config version. Some settings may not apply.");
                            }

                            // Validation checks
                            if (data.bindings) {
                                await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(data.bindings));
                            }
                            if (data.overrides) {
                                await game.settings.set("ionrift-resonance", "configOverrides", data.overrides);
                            }

                            ui.notifications.info("Ionrift Sounds | Configuration Imported Successfully.");
                            this.render(true);
                            game.ionrift.handler.loadConfig(); // Reload
                        } catch (e) {
                            ui.notifications.error("Ionrift Sounds | Import Failed: Invalid JSON.");
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
            if (soundType === "global-oneshot") playOptions.type = "global-element";
            else if (soundType === "mood") playOptions.type = "mood";
            else if (soundType === "music-element") playOptions.type = "element";
            else playOptions.type = "element"; // Default fallback
        }

        // Unified Playback via SoundManager
        if (game.ionrift.handler) {
            // If it's a Semantic Key (e.g. "ATTACK_SWORD"), resolve it first
            // But if it's a numeric ID or complex object, treat as direct.
            const resolved = game.ionrift.handler.resolveSound(idToPlay);

            if (resolved) {
                if (typeof resolved === 'string') {
                    // It resolved to a string ID
                    idToPlay = resolved;
                } else if (typeof resolved === 'object') {
                    // It resolved to a full object (e.g. { id: 123, type: 'global-oneshot' })
                    idToPlay = resolved.id;
                    if (resolved.type) {
                        // Re-map type if resolved object has it
                        soundType = resolved.type;
                        if (soundType === "global-oneshot") playOptions.type = "global-element";
                        else if (soundType === "mood") playOptions.type = "mood";
                        else playOptions.type = "element";
                    }
                }
            }
        }

        Logger.log(`Previewing: ${idToPlay}`, playOptions);

        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.play(idToPlay, playOptions);
        }
    }


    async _onStopAll(event) {
        event.preventDefault();
        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.stopAll();
            ui.notifications.info("Syrinscape: Stop signal sent.");
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
            if (game.ionrift.handler?.openSoundConfig) {
                game.ionrift.handler.openSoundConfig(doc);
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
                    ui.notifications.error("Ionrift: Could not load Sound Config.");
                }
            }
        }
    }
}
