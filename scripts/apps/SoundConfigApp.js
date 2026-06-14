import { SYRINSCAPE_DEFAULTS, SYRINSCAPE_PRESETS } from "../data/syrinscape_defaults.js";
import { SoundCardState } from "../models/SoundCardState.js";
import { Logger } from "../Logger.js";
import { SyrinscapeProvider } from "../providers/SyrinscapeProvider.js";
import { SoundOrchestrator } from "../SoundOrchestrator.js";
import { SoundPackLoader } from "../services/SoundPackLoader.js";

const RESONANCE_MODULE_ID = "ionrift-resonance";

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

            // 1. Custom bindings always win
            if (customBindings[key]) return { value: customBindings[key], source: "custom" };

            // 2. Pack bindings (from SoundPackLoader)
            const packBindings = SoundPackLoader.loaded ? SoundPackLoader.getMergedBindings() : {};
            if (packBindings[key]) return { value: packBindings[key], source: "pack" };

            // 3. Syrinscape defaults (only when Syrinscape is configured)
            if (SyrinscapeProvider.isConfigured()) {
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
                label: "Attacks (Melee)",
                id: "CORE_MELEE",
                description: "Weapon swing sound for all melee attacks. This is the sound of the weapon in motion - not the impact. Hit/miss sounds are set under Core Mechanics.",
                children: [
                    { label: "Bludgeoning (Mace/Hammer)", id: "ATTACK_BLUDGEON", description: "Swing sound for maces, hammers, and clubs. Plays on the attack roll - impact is Core Mechanics -> Strike Landed." },
                    { label: "Slashing (Sword/Axe)", id: "ATTACK_SWORD", description: "Slash sound for swords and axes. Dagger/spear shares this by default (blade is blade)." },
                    { label: "Piercing (Dagger/Spear)", id: "ATTACK_DAGGER", description: "Thrust sound for daggers and spears. Defaults to the blade slash sound." },
                    { label: "Natural (Claw/Bite)", id: "ATTACK_CLAW", description: "Claw rake or bite attack from creatures without manufactured weapons." },
                    { label: "Unarmed (Punch)", id: "CORE_BRAWL", description: "Punch, shove, or grapple. Plays on the attack - impact is Strike Landed." }
                ]
            },
            {
                label: "Attacks (Ranged)",
                id: "CORE_RANGED",
                description: "Projectile launch sound for all ranged attacks. This is the release/flight sound - not the impact. Impact is Core Mechanics -> Strike Landed (Ranged).",
                children: [
                    { label: "Bow", id: "ATTACK_BOW", description: "Bowstring release and arrow flight. Impact is Strike Landed (Ranged)." },
                    { label: "Crossbow", id: "ATTACK_CROSSBOW", description: "Crossbow bolt release." },
                    { label: "Sling", id: "ATTACK_SLING", description: "Sling whip and stone release. Defaults to ranged master if unset." }
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
        if (game.system.id === 'dnd5e' || game.system.id === 'pf2e') {
            actionTaxonomy[actionTaxonomy.length - 1].children = [
                { label: "Fire / Heat", id: "SPELL_FIRE" },
                { label: "Ice / Cold", id: "SPELL_ICE" },
                { label: "Lightning / Storm", id: "SPELL_LIGHTNING" },
                { label: "Acid / Poison", id: "SPELL_ACID" },
                { label: "Healing / Radiant", id: "SPELL_HEAL" },
                { label: "Psychic / Sonic", id: "SPELL_PSYCHIC" },
                { label: "Void / Negative", id: "SPELL_VOID" }
            ];

            if (game.system.id === 'dnd5e') {
                actionTaxonomy.push({
                    label: "Spell Schools",
                    id: "CORE_SCHOOL",
                    description: "Where the magic comes from - match by arcane tradition. Unset schools fall back to Magic (Spells).",
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
        }

        if (game.system.id === 'daggerheart') {
            actionTaxonomy.push({
                label: "Domains",
                id: "CORE_DOMAIN",
                description: "Where the magic comes from - match by domain tradition. Unset domains fall back to Magic (Spells).",
                children: [
                    { label: "Arcana", id: "DOMAIN_ARCANA", description: "Innate, instinctual magic." },
                    { label: "Blade", id: "DOMAIN_BLADE", description: "Mastery of weapons." },
                    { label: "Blood", id: "DOMAIN_BLOOD", description: "Vitality and life force." },
                    { label: "Bone", id: "DOMAIN_BONE", description: "Swiftness and tactical agility." },
                    { label: "Codex", id: "DOMAIN_CODEX", description: "Intensive magical study." },
                    { label: "Dread", id: "DOMAIN_DREAD", description: "Terror and dark power." },
                    { label: "Grace", id: "DOMAIN_GRACE", description: "Charisma and persuasion." },
                    { label: "Midnight", id: "DOMAIN_MIDNIGHT", description: "Shadows and secrecy." },
                    { label: "Sage", id: "DOMAIN_SAGE", description: "Natural world magic." },
                    { label: "Splendor", id: "DOMAIN_SPLENDOR", description: "Life, healing, and death." },
                    { label: "Valor", id: "DOMAIN_VALOR", description: "Protection and defense." },
                    { label: "Wonder", id: "DOMAIN_WONDER", description: "Awe, illusion, and the extraordinary." }
                ]
            });
        }

        const monsterTaxonomy = [
            {
                label: "Humanoids",
                id: "MONSTER_HUMANOID", cardLabel: "Vocal / Pain Sound",
                description: "Standard bipedal folk (Humans, Elves, Dwarves).",
                children: [
                    { label: "Default Attack", id: "MONSTER_HUMANOID_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Goblinoids (Goblin/Hobgoblin)", id: "MONSTER_GOBLIN", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_GOBLIN_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Lycanthropes (Were-creatures)", id: "MONSTER_LYCANTHROPE", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_LYCANTHROPE_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Undead",
                id: "MONSTER_UNDEAD", cardLabel: "Vocal / Pain Sound",
                description: "Zombies, Skeletons, Ghosts.",
                children: [
                    { label: "Default Attack", id: "MONSTER_UNDEAD_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Zombie / Ghoul (Flesh)", id: "MONSTER_ZOMBIE", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_ZOMBIE_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Skeleton / Lich (Bone)", id: "MONSTER_SKELETON", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_SKELETON_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Ghost / Spirit / Wraith", id: "MONSTER_GHOST", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_GHOST_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Beasts & Animals",
                id: "MONSTER_BEAST", cardLabel: "Vocal / Pain Sound",
                description: "Natural creatures.",
                children: [
                    { label: "Default Attack", id: "MONSTER_BEAST_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Ursine (Bear / Owlbear)", id: "MONSTER_BEAR", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_BEAR_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Canine (Wolf / Dog)", id: "MONSTER_WOLF", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_WOLF_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Feline (Cat / Lion)", id: "MONSTER_CAT", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_CAT_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Avian (Bird / Harpy)", id: "MONSTER_BIRD", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_BIRD_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Equine (Horse)", id: "MONSTER_HORSE", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_HORSE_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Reptiles (Lizard/Snake)", id: "MONSTER_REPTILE", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_REPTILE_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Insects / Spiders", id: "SFX_INSECT", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "SFX_INSECT_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Fiends (Demons & Devils)",
                id: "MONSTER_FIEND", cardLabel: "Vocal / Pain Sound",
                description: "Extraplanar evil entities.",
                children: [
                    { label: "Default Attack", id: "MONSTER_FIEND_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Demon (Chaotic)", id: "MONSTER_DEMON", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "MONSTER_DEMON_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Dragons",
                id: "MONSTER_DRAGON", cardLabel: "Vocal / Pain Sound",
                description: "Chromatics, Metallics, Wyverns.",
                children: [
                    { label: "Default Attack", id: "MONSTER_DRAGON_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Wyvern", id: "dragon_wyvern", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "dragon_wyvern_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Giants",
                id: "MONSTER_GIANT", cardLabel: "Vocal / Pain Sound",
                description: "Ogres, Trolls, Giants.",
                children: [
                    { label: "Default Attack", id: "MONSTER_GIANT_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }
                ]
            },
            {
                label: "Constructs",
                id: "MONSTER_CONSTRUCT", cardLabel: "Vocal / Pain Sound",
                description: "Golems, Animated Objects.",
                children: [
                    { label: "Default Attack", id: "MONSTER_CONSTRUCT_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Golems (Generic)", id: "construct_golem", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "construct_golem_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Animated Objects", id: "construct_animated_object", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "construct_animated_object_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Elementals",
                id: "MONSTER_ELEMENTAL", cardLabel: "Vocal / Pain Sound",
                description: "Beings of raw elemental matter.",
                children: [
                    { label: "Default Attack", id: "MONSTER_ELEMENTAL_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Fire Elemental", id: "SFX_FIRE", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "SFX_FIRE_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Water Elemental", id: "SFX_WATER_ENTITY", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "SFX_WATER_ENTITY_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Air Elemental", id: "SFX_WIND", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "SFX_WIND_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Earth Elemental", id: "elemental_earth", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "elemental_earth_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Aberrations",
                id: "MONSTER_ALIEN", cardLabel: "Vocal / Pain Sound",
                description: "Beholders, Mind Flayers, Aliens.",
                children: [
                    { label: "Default Attack", id: "MONSTER_ALIEN_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Beholder", id: "aberration_beholder", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "aberration_beholder_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Mind Flayer", id: "aberration_mind_flayer", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "aberration_mind_flayer_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Chuul / Aquatic", id: "aberration_chuul", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "aberration_chuul_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Plants & Fungi",
                id: "MONSTER_PLANT", cardLabel: "Vocal / Pain Sound",
                description: "Treants, Myconids.",
                children: [
                    { label: "Default Attack", id: "MONSTER_PLANT_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." },
                    {
                        label: "Treants", id: "plant_treant", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "plant_treant_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Myconids / Fungi", id: "plant_myconid", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "plant_myconid_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    },
                    {
                        label: "Shambling Mound", id: "plant_shambling_mound", cardLabel: "Vocal / Pain Sound",
                        children: [{ label: "Default Attack", id: "plant_shambling_mound_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }]
                    }
                ]
            },
            {
                label: "Oozes & Slimes",
                id: "SFX_SLIME", cardLabel: "Vocal / Pain Sound",
                description: "Gelatinous Cubes, Puddings.",
                children: [
                    { label: "Default Attack", id: "SFX_SLIME_ATTACK", description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category." }
                ]
            }
        ];

        // --- Dynamic Pack Taxonomy Injection ---
        // Sound packs contribute new creature subtypes via classifierBindings.
        // Inject these as child nodes under the appropriate parent group so
        // the GM can preview pack sounds in the calibrator. Nodes appear when
        // the pack is enabled and disappear when it is disabled.
        if (SoundPackLoader.loaded) {
            const dynamicBindings = SoundPackLoader.getAllDynamicClassifierBindings();

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
                        label: label, id: soundKey, cardLabel: "Vocal / Pain Sound",
                        packName: packName,
                        packIcon: packIcon,
                        children: [{
                            label: "Default Attack", id: `${soundKey}_ATTACK`,
                            description: "Species-specific attack override. Leave unbound - attack sounds route through the weapon/item taxonomy. Bind here only to make this creature type sound distinct from its weapon category."
                        }]
                    });

                    existingIds.add(soundKey);
                }
            }
        }

        // --- CORE TAXONOMY (Tier 1: Results Only) ---
        const coreTaxonomy = [
            {
                label: "Strike Results",
                description: "What plays when an attack hits or misses its target.",
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
                    }
                ]
            },
            {
                label: "Weapon Extras",
                description: "Additional weapon sounds - swing fallback and critical hit/miss impact decorations.",
                children: [
                    { id: "CORE_WHOOSH", label: "Swing (Fallback)", description: "Generic swing for weapons without a specific attack sound." },
                    { id: "CORE_CRIT", label: "Critical Hit (Impact)", description: "Extra crunch/gore layered on top of a critical weapon hit. Not a roll stinger - see Roll Stingers for that." },
                    { id: "CORE_FUMBLE", label: "Critical Miss (Whiff)", description: "Extra fumble sound on a critical miss. Not a roll stinger - see Roll Stingers for that." }
                ]
            },
            {
                label: "Vocals",
                description: "Pain and death sounds - played when a character takes damage or dies.",
                children: [
                    { id: "CORE_PAIN_MASCULINE", label: "Pain (Masculine)", description: "Played when a masculine-presenting humanoid takes damage." },
                    { id: "CORE_PAIN_FEMININE", label: "Pain (Feminine)", description: "Played when a feminine-presenting humanoid takes damage." },
                    { id: "CORE_DEATH_MASCULINE", label: "Death (Masculine)", description: "Played when a masculine-presenting humanoid actor dies." },
                    { id: "CORE_DEATH_FEMININE", label: "Death (Feminine)", description: "Played when a feminine-presenting humanoid actor dies." },
                    { id: "CORE_MONSTER_PAIN", label: "Monster Pain", description: "Reaction growl/grunt when a non-humanoid creature takes a hit." },
                    { id: "CORE_MONSTER_DEATH", label: "Monster Death", description: "Death sound for non-humanoid creatures. Falls back when no type-specific death is set." }
                ]
            }
        ];


        // --- SYSTEM-SPECIFIC ROLL STINGERS ---
        if (game.system.id === 'daggerheart') {
            // Group 1: Duality Dice (Roll Outcomes)
            coreTaxonomy.push({
                label: "Daggerheart: Duality Dice",
                description: "Roll outcome stingers. Hope/Fear resource sounds are handled separately by actor hooks.",
                children: [
                    { id: "ROLL_CRIT", label: "Critical Success (Doubles)", description: "Rolled doubles on Duality Dice (automatic success)." },
                    { id: "DAGGERHEART_SUCCESS", label: "Roll Success", description: "Action succeeded (any Duality roll that beats DC)." },
                    { id: "DAGGERHEART_FAIL", label: "Roll Fail", description: "Action failed (any Duality roll that misses DC)." }
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
        } else if (game.system.id === 'dnd5e') {
            coreTaxonomy.push({
                label: "D&D 5e: Roll Stingers",
                description: "Celebratory/failure stingers for natural 20s and natural 1s.",
                children: [
                    { id: "ROLL_CRIT", label: "Natural 20", description: "Stinger played when a d20 rolls a natural 20." },
                    { id: "ROLL_FUMBLE", label: "Natural 1", description: "Stinger played when a d20 rolls a natural 1." }
                ]
            });
        } else if (game.system.id === 'pf2e') {
            coreTaxonomy.push({
                label: "PF2e: Roll Stingers",
                description: "Outcome stingers for Critical Success and Critical Failure (Degrees of Success).",
                children: [
                    { id: "ROLL_CRIT", label: "Critical Success", description: "Stinger played on a Critical Success result." },
                    { id: "ROLL_FUMBLE", label: "Critical Failure", description: "Stinger played on a Critical Failure result." }
                ]
            });
            coreTaxonomy.push({
                label: "PF2e: Hero Points",
                description: "Sounds for Hero Point gain and spend.",
                children: [
                    { id: "HERO_POINT_GAIN", label: "Hero Point Gained", description: "Played when a character gains a Hero Point." },
                    { id: "HERO_POINT_USE", label: "Hero Point Spent", description: "Played when a character spends a Hero Point." }
                ]
            });
        }

        // Process Roots
        const tier1Roots = coreTaxonomy.map(node => processHierarchy(node));
        const tier2Roots = actionTaxonomy.map(node => processHierarchy(node));
        const tier3Roots = monsterTaxonomy.map(node => processHierarchy(node));

        return {
            hasSyrinscape: SyrinscapeProvider.isConfigured(),
            tiers: {
                tier1: {
                    label: "Essentials",
                    active: true,
                    paramounts: tier1Roots
                },
                tier2: {
                    label: "Tier 2: Actions",
                    active: false,
                    paramounts: tier2Roots
                },
                tier3: {
                    label: "Tier 3: Monsters",
                    active: false,
                    paramounts: tier3Roots
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
                orchestrator: this._getOrchestratorData(),
                config: configOverrides,
                // Feature toggle states surfaced to the Orchestration tab template
                spellVocalLayer: game.settings.get("ionrift-resonance", "spellVocalLayer") ?? false
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

    /**
     * Build data for the Orchestration tab.
     * Reads SoundOrchestrator.DEFAULT_BUDGETS and the orchestratorConfig world setting.
     */
    _getOrchestratorData() {
        const CATEGORY_LABELS = {
            FEAR_STINGER: "Fear Stingers",
            FEAR_USE: "Fear Spent",
            DH_HOPE_GAIN: "Hope Gained",
            DH_HOPE_USE: "Hope Spent",
            DH_STRESS_GAIN: "Stress Applied",
            DH_STRESS_CLEAR: "Stress Cleared",
            DH_ARMOR_USE: "Armor Used",
            DH_ARMOR_REPAIR: "Armor Repaired",
            DH_OUTCOME: "Outcome Stingers",
            MONSTER_VOCAL: "Monster Vocals",
            PC_VOCAL: "PC Vocals"
        };

        let budgets = {};
        let timing = {};
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); budgets = c.budgets ?? {}; timing = c.timing ?? {}; }
        } catch (e) { }

        const categories = Object.entries(SoundOrchestrator.DEFAULT_BUDGETS).map(([id, defaultMs]) => {
            const override = budgets[id]?.budgetMs;
            const effectiveMs = override ?? defaultMs;
            return {
                id,
                label: CATEGORY_LABELS[id] ?? id,
                defaultMs,
                defaultLabel: defaultMs === 0 ? "Unlimited" : `${defaultMs}ms`,
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

        const namedOffsets = Object.entries(SoundOrchestrator.DEFAULT_OFFSETS).map(([id, defaultMs]) => {
            const override = offsets[id];
            return {
                id,
                label: SoundOrchestrator.OFFSET_LABELS[id] ?? id,
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

        // SFX Pack Nudge: contextual banner when no packs are installed.
        // Mirrors the Respite art-pack nudge -- shows only in the workflow context.
        this._injectCalibrationNudge(html);

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

        // Mute Toggle
        html.on("click", ".toggle-mute", this._onToggleMute.bind(this));

        // Taxonomy Volume Sliders
        html.on("input", ".taxonomy-volume-slider", this._onTaxonomyVolumeInput.bind(this));
        html.on("change", ".taxonomy-volume-slider", this._onTaxonomyVolumeChange.bind(this));
        html.on("click", ".taxonomy-volume-reset", this._onTaxonomyVolumeReset.bind(this));

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
     * Contextual SFX nudge banner -- injected at the top of the Calibration
     * content area when no sound packs are installed. Delegates rendering to
     * the shared library PackNudgeService; dismiss state is shared with the
     * Settings panel surface so one dismiss applies everywhere.
     */
    async _injectCalibrationNudge(html) {
        const packNudge = game.ionrift?.library?.packNudge;
        if (!packNudge) return;

        const $content = html.find(".content");
        if (!$content.length) return;

        await packNudge.inject(RESONANCE_MODULE_ID, $content, {
            position: "prepend",
            scope: $content,
            layout: "stacked"
        });
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

    // -------------------------------------------------------------------------
    // Taxonomy Volume Handlers
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Orchestrator Tab Handlers
    // -------------------------------------------------------------------------

    async _saveOrchestratorConfig(mutator) {
        let config = { budgets: {}, timing: {} };
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); config.budgets = c.budgets ?? {}; config.timing = c.timing ?? {}; }
        } catch (e) { }
        config = mutator(config);
        await game.settings.set("ionrift-resonance", "orchestratorConfig", JSON.stringify(config));
        game.ionrift.handler?.orchestrator?.loadConfig();
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
            const packBindings = SoundPackLoader.loaded ? SoundPackLoader.getMergedBindings() : {};
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
                title: `Pick Sound: ${humanLabel}`,
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

        const semanticKey = typeof soundKeyOrId === "string" ? soundKeyOrId.trim() : "";
        const isDirectAsset = this._isDirectPreviewAsset(idToPlay);

        // Calibration preview: play what the row displays before chasing combat fallbacks.
        // MONSTER_*_ATTACK keys otherwise resolve to CORE_MELEE -> generic sword swing.
        if (!isDirectAsset && game.ionrift.handler?.resolver) {
            const direct = game.ionrift.handler.resolver.resolveKeyDirect(semanticKey);
            if (direct) {
                idToPlay = direct;
            } else {
                const fromRow = this._pickPreviewFromRowTags(row);
                if (fromRow) {
                    idToPlay = fromRow;
                } else if (semanticKey.endsWith("_ATTACK")) {
                    ui.notifications.warn("No preview audio for this attack slot. It is unbound; combat uses weapon sounds instead.");
                    return;
                } else {
                    const resolved = game.ionrift.handler.resolveSound(idToPlay);
                    if (resolved) {
                        if (typeof resolved === 'string') {
                            idToPlay = resolved;
                        } else if (typeof resolved === 'object') {
                            idToPlay = resolved.id;
                            if (resolved.type) {
                                soundType = resolved.type;
                                if (soundType === "global-oneshot") playOptions.type = "global-element";
                                else if (soundType === "mood") playOptions.type = "mood";
                                else playOptions.type = "element";
                            }
                        }
                    }
                }
            }
        } else if (!isDirectAsset && game.ionrift.handler) {
            const resolved = game.ionrift.handler.resolveSound(idToPlay);
            if (resolved) {
                if (typeof resolved === 'string') idToPlay = resolved;
                else if (typeof resolved === 'object') {
                    idToPlay = resolved.id;
                    if (resolved.type) {
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
