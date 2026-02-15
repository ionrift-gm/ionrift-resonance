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
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sound-config",
            title: "Resonance Calibration",
            template: "modules/ionrift-sounds/templates/sound-config.hbs",
            width: 900,
            height: 750,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "tier1" }],
            classes: ["ionrift", "sheet", "ionrift-window", "glass-ui", "resonance-app"], // Added resonance-app class
            dragDrop: [{ dropSelector: null }]
        });
    }

    _getAuditorData() {
        const auditorItems = [];

        // Scan Actors
        for (const actor of game.actors) {
            const flags = actor.flags["ionrift-sounds"];
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    // Filter out non-sound flags
                    if (key === "gender" || key === "soundPreset" || key === "sound_config" || key.endsWith("_name") || key.endsWith("_meta")) continue;
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
            const flags = item.flags["ionrift-sounds"];
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
        const customBindings = JSON.parse(game.settings.get("ionrift-sounds", "customSoundBindings") || "{}");
        // configOverrides is retrieved in 'players' section separately or not needed for main structure
        const configOverrides = game.settings.get("ionrift-sounds", "configOverrides") || {};

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

            // 2. Default
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
                        node.label,
                        node.description
                    );
                } else {
                    // No explicit value -> Check Parent
                    if (parentState && parentState.value) {
                        // Inherit from parent
                        myResolved = { value: parentState.value, source: "inherited" };
                        myState = new SoundCardState(node.id, null, SYRINSCAPE_DEFAULTS[node.id], node.label, node.description, parentState.label);
                        myState.value = myResolved.value; // Force value for playback/display
                        myState.isInherited = true;
                    } else {
                        // No parent value either -> Empty
                        myState = new SoundCardState(node.id, null, null, node.label, node.description);
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
                headerCard: node.id ? myState.getRenderData() : null
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
                description: "Master setting for all Spells.",
                children: [
                    { label: "Fire / Heat", id: "SPELL_FIRE" },
                    { label: "Ice / Cold", id: "SPELL_ICE" },
                    { label: "Lightning / Storm", id: "SPELL_LIGHTNING" },
                    { label: "Acid / Poison", id: "SPELL_ACID" },
                    { label: "Healing / Radiant", id: "SPELL_HEAL" },
                    { label: "Psychic / Divination", id: "SPELL_PSYCHIC" },
                    { label: "Necrotic / Void", id: "SPELL_VOID" }
                ]
            }
        ];

        const monsterTaxonomy = [
            {
                label: "Humanoids",
                id: "MONSTER_HUMANOID",
                description: "Standard bipedal folk (Humans, Elves, Dwarves).",
                children: [
                    { label: "Goblinoids (Goblin/Hobgoblin)", id: "MONSTER_GOBLIN" },
                    { label: "Lycanthropes (Were-creatures)", id: "MONSTER_LYCANTHROPE" }
                ]
            },
            {
                label: "Undead",
                id: "MONSTER_UNDEAD",
                description: "Zombies, Skeletons, Ghosts.",
                children: [
                    { label: "Zombie / Ghoul (Flesh)", id: "MONSTER_ZOMBIE" },
                    { label: "Skeleton / Lich (Bone)", id: "MONSTER_SKELETON" },
                    { label: "Ghost / Spirit / Wraith", id: "MONSTER_GHOST" }
                ]
            },
            {
                label: "Beasts & Animals",
                id: "MONSTER_BEAST",
                description: "Natural creatures.",
                children: [
                    { label: "Ursine (Bear / Owlbear)", id: "MONSTER_BEAR" },
                    { label: "Canine (Wolf / Dog)", id: "MONSTER_WOLF" },
                    { label: "Feline (Cat / Lion)", id: "MONSTER_CAT" },
                    { label: "Avian (Bird / Harpy)", id: "MONSTER_BIRD" },
                    { label: "Equine (Horse)", id: "MONSTER_HORSE" },
                    { label: "Reptiles (Lizard/Snake)", id: "MONSTER_REPTILE" },
                    { label: "Insects / Spiders", id: "SFX_INSECT" }
                ]
            },
            {
                label: "Fiends (Demons & Devils)",
                id: "MONSTER_FIEND",
                description: "Extraplanar evil entities.",
                children: [
                    { label: "Demon (Chaotic)", id: "MONSTER_DEMON" },
                    // Devil often shares Demon or Generic Fiend, can add specific if needed
                    // { label: "Devil (Lawful)", id: "MONSTER_DEVIL" } 
                ]
            },
            {
                label: "Dragons",
                id: "MONSTER_DRAGON",
                description: "Chromatics, Metallics, Wyverns.",
                children: [
                    { label: "Wyvern", id: "dragon_wyvern" }
                ]
            },
            {
                label: "Giants",
                id: "MONSTER_GIANT",
                description: "Ogres, Trolls, Giants.",
                children: []
            },
            {
                label: "Constructs",
                id: "MONSTER_CONSTRUCT",
                description: "Golems, Animated Objects.",
                children: [
                    { label: "Golems (Generic)", id: "construct_golem" },
                    { label: "Animated Objects", id: "construct_animated_object" }
                ]
            },
            {
                label: "Elementals",
                id: "MONSTER_ELEMENTAL",
                description: "Beings of raw elemental matter.",
                children: [
                    { label: "Fire Elemental", id: "SFX_FIRE" },
                    { label: "Water Elemental", id: "SFX_WATER_ENTITY" },
                    { label: "Air Elemental", id: "SFX_WIND" },
                    { label: "Earth Elemental", id: "elemental_earth" }
                ]
            },
            {
                label: "Aberrations",
                id: "MONSTER_ALIEN",
                description: "Beholders, Mind Flayers, Aliens.",
                children: [
                    { label: "Beholder", id: "aberration_beholder" },
                    { label: "Mind Flayer", id: "aberration_mind_flayer" },
                    { label: "Chuul / Aquatic", id: "aberration_chuul" }
                ]
            },
            {
                label: "Plants & Fungi",
                id: "MONSTER_PLANT",
                description: "Treants, Myconids.",
                children: [
                    { label: "Treants", id: "plant_treant" },
                    { label: "Myconids / Fungi", id: "plant_myconid" },
                    { label: "Shambling Mound", id: "plant_shambling_mound" }
                ]
            },
            {
                label: "Oozes & Slimes",
                id: "SFX_SLIME",
                description: "Gelatinous Cubes, Puddings.",
                children: []
            }
        ];

        // --- CORE TAXONOMY (Tier 1) ---
        const coreTaxonomy = [
            {
                label: "Combat Actions",
                description: "Core melee and ranged attack sounds.",
                children: [
                    { id: "CORE_MELEE", label: "Core Melee (Sword/Clash)", description: "Standard melee weapon attacks (Sword, Axe, Mace)." },
                    { id: "CORE_RANGED", label: "Core Ranged (Bow/Shot)", description: "Standard ranged attacks (Bow, Crossbow, Thrown)." },
                    { id: "CORE_BRAWL", label: "Core Brawl (Punch/Slam)", description: "Unarmed strikes and natural attacks." },
                    { id: "CORE_MAGIC", label: "Core Magic (Spell)", description: "Generic spell casting sound." }
                ]
            },
            {
                label: "Combat Results",
                description: "Hits, misses, and impacts.",
                children: [
                    { id: "CORE_HIT", label: "Core Hit (Flesh)", description: "Impact sound when an attack hits a target." },
                    { id: "CORE_MISS", label: "Core Miss (Whiff)", description: "Plays when an attack roll fails (Miss)." },
                    { id: "CORE_WHOOSH", label: "Core Whoosh (Generic)", description: "Fallback swing sound for unknown items/weapons." }
                ]
            },
            {
                label: "Vocals",
                description: "Pain and death sounds.",
                children: [
                    { id: "CORE_PAIN_MASCULINE", label: "Core Pain (Masculine)", description: "Generic pain grunt for male humanoid actors." },
                    { id: "CORE_PAIN_FEMININE", label: "Core Pain (Feminine)", description: "Generic pain grunt for female humanoid actors." },
                    { id: "CORE_DEATH_MASCULINE", label: "Core Death (Masculine)", description: "Death cry for male humanoid actors." },
                    { id: "CORE_DEATH_FEMININE", label: "Core Death (Feminine)", description: "Death cry for female humanoid actors." },
                    { id: "MONSTER_ROAR", label: "Core Monster Pain", description: "Generic growl/pain for non-humanoid monsters." },
                    { id: "MONSTER_GENERIC", label: "Core Monster Death", description: "Generic death sound for non-humanoid monsters." }
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
            coreTaxonomy.push({
                label: "Daggerheart Mechanics",
                description: "Hope, Fear, and Stress mechanics.",
                children: [
                    { id: "DAGGERHEART_HOPE", label: "Gain Hope", description: "Played when a player gains Hope." },
                    { id: "DAGGERHEART_HOPE_USE", label: "Use Hope", description: "Played when a player spends Hope." },
                    { id: "DAGGERHEART_FEAR", label: "Gain Fear", description: "Played when the GM gains Fear." },
                    { id: "DAGGERHEART_FEAR_USE", label: "Use Fear", description: "Played when the GM spends Fear." },
                    { id: "DAGGERHEART_STRESS", label: "Take Stress", description: "Played when a character takes Stress." },
                    { id: "DAGGERHEART_ARMOR_USE", label: "Armor Block/Deplete", description: "Played when Armor slots are reduced." },
                    { id: "DAGGERHEART_ARMOR_REPAIR", label: "Armor Repair", description: "Played when Armor slots are restored." },
                    { id: "DAGGERHEART_FEAR_LOW", label: "Fear Tracker (Low)", description: "Atmosphere: Fear Tracker 1-2." },
                    { id: "DAGGERHEART_FEAR_MED", label: "Fear Tracker (Med)", description: "Atmosphere: Fear Tracker 3-4." },
                    { id: "DAGGERHEART_FEAR_HIGH", label: "Fear Tracker (High)", description: "Atmosphere: Fear Tracker 5+." }
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
        const currentBindings = JSON.parse(game.settings.get("ionrift-sounds", "customSoundBindings") || "{}");

        // 2. Modify State
        if (value) {
            currentBindings[key] = value;
        } else {
            delete currentBindings[key];
        }

        // 3. Write to Settings
        await game.settings.set("ionrift-sounds", "customSoundBindings", JSON.stringify(currentBindings));

        // 4. Update UI Row (Reactivity)
        // Re-render the single row using the new value.

        const row = this.element.find(`.entity-row[data-key="${key}"]`);
        if (row.length) {
            const label = row.find(".entity-name").text().trim();
            const desc = row.find(".entity-meta").text().trim();
            const def = SYRINSCAPE_DEFAULTS[key];

            const newState = new SoundCardState(key, value, def, label, desc);
            const html = await renderTemplate("modules/ionrift-sounds/templates/partials/sound-card-row.hbs", newState.getRenderData());

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
        // Define the hook function
        this._updateHook = (doc) => {
            // Only care if ionrift-sounds flags changed
            const flags = doc.flags?.["ionrift-sounds"];
            if (flags) this._debouncedRefresh();
        };

        if (!this._hooksRegistered) {
            Hooks.on("updateActor", this._updateHook);
            Hooks.on("updateItem", this._updateHook);
            this._hooksRegistered = true;
        }
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
        const html = await renderTemplate("modules/ionrift-sounds/templates/partials/auditor-list.hbs", data);

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
                const { ActorSoundConfig } = await import("../../../ionrift-workshop/scripts/apps/ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("../../../ionrift-workshop/scripts/apps/ItemSoundConfig.js");
                new ItemSoundConfig(doc).render(true);
            }
        } catch (e) {
            ui.notifications.error("Ionrift: Could not load Workshop module for editing.");
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
            await doc.unsetFlag("ionrift-sounds", key);
            await doc.unsetFlag("ionrift-sounds", key + "_name");
            await doc.unsetFlag("ionrift-sounds", key + "_meta");
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
        const currentBindings = JSON.parse(game.settings.get("ionrift-sounds", "customSoundBindings") || "{}");

        // 2. Update or Delete
        if (value === null || value === undefined) {
            delete currentBindings[key]; // Reset to Default
        } else {
            currentBindings[key] = value;
        }

        // 3. Save Setting
        await game.settings.set("ionrift-sounds", "customSoundBindings", JSON.stringify(currentBindings));

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

        // Find current value for context
        let currentValue = "";
        const row = this.element.find(`.entity-row[data-key="${key}"]`);
        if (row.length) {
            const input = row.find("input");
            currentValue = input.val();
        }

        try {
            const { SoundPickerApp } = await import("../../../ionrift-workshop/scripts/apps/SoundPickerApp.js");

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
                console.log(`Ionrift Config | Auto-Saving ${key}:`, storageValue);
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
                            console.warn("Ionrift Config | Error parsing current value for picker:", e);
                        }
                    }

                    // 2. Fallback to Default only if no custom value
                    if (key && SYRINSCAPE_DEFAULTS[key]) {
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
            ui.notifications.error("Ionrift Workshop module required for Search.");
        }
    }

    async _onAddRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target; // "campaign" or "players"
        const currentConfig = game.settings.get("ionrift-sounds", "configOverrides") || {};

        if (!currentConfig[target]) currentConfig[target] = [];

        if (target === "campaign") {
            currentConfig.campaign.push({ actor: "", item: "", sound: "" });
        } else if (target === "players") {
            currentConfig.players.push({ name: "", death: "", pain: "" });
        }

        // Save & Re-render (easiest way to update UI)
        await game.settings.set("ionrift-sounds", "configOverrides", currentConfig);
        this.render(true);
    }

    async _onDeleteRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target;
        const index = event.currentTarget.dataset.index;

        const currentConfig = game.settings.get("ionrift-sounds", "configOverrides") || {};
        if (currentConfig[target]) {
            currentConfig[target].splice(index, 1);
            await game.settings.set("ionrift-sounds", "configOverrides", currentConfig);
            this.render(true);
        }
    }

    _onExportConfig(event) {
        event.preventDefault();
        const bindings = game.settings.get("ionrift-sounds", "customSoundBindings");
        const overrides = game.settings.get("ionrift-sounds", "configOverrides");

        const exportData = {
            timestamp: Date.now(),
            version: "1.0.0",
            bindings: JSON.parse(bindings || "{}"),
            overrides: overrides || {}
        };

        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "text/json", "ionrift-sounds-config.json");
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
                                await game.settings.set("ionrift-sounds", "customSoundBindings", JSON.stringify(data.bindings));
                            }
                            if (data.overrides) {
                                await game.settings.set("ionrift-sounds", "configOverrides", data.overrides);
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

        // NEW: Try to read the current input value from the row to support "Preview before Save"
        const row = target.closest("tr"); // If in table
        const input = row?.querySelector("input") || target.closest(".sound-input-group")?.querySelector("input");
        let inputValue = input ? input.value : null;

        if (input) {
            const val = input.value;
            // Only update if override is present. Otherwise fallback to dataset.sound (Default Key)
            if (val && val.trim() !== "") {
                soundKeyOrId = val;
                console.log(`Ionrift | Previewing from Override: ${soundKeyOrId}`);
            }
        } else if (inputValue && inputValue.trim() !== "") {
            // Fallback to simpler getter
            soundKeyOrId = inputValue;
        }

        // Check if value is JSON (new binding format)
        let idToPlay = soundKeyOrId;
        try {
            if (typeof soundKeyOrId === 'string' && soundKeyOrId.trim().startsWith("{")) {
                idToPlay = JSON.parse(soundKeyOrId);
            }
        } catch (e) { }

        console.log(`Ionrift | Previewing:`, idToPlay);

        console.log(`Ionrift | Previewing:`, idToPlay);

        // Unified Playback via SoundManager
        // If ID is a Key (e.g. "ATTACK_SWORD"), we should try to resolve it first via Handler
        // BUT we must ensure we only pass strings to resolveSound.
        // If `idToPlay` is a complex object (Global Element), we use its ID directly.
        if (game.ionrift.handler) {
            let keyToResolve = idToPlay;

            // If object, use its ID for playback, but don't try to resolve it as a semantic key
            if (typeof idToPlay === 'object' && idToPlay.id) {
                // It's already resolved/explicit. Don't call handler.resolveSound with the object.
                // We just rely on the object being passed to manager.play
            } else if (typeof idToPlay === 'string') {
                // It's a string, might be a Semantic Key (ATTACK_SWORD) or a concrete ID (global:123)
                // resolveSound handles strings.
                const resolved = game.ionrift.handler.resolveSound(idToPlay);
                if (resolved) {
                    // If resolved is an object/string, usage overrides key
                    idToPlay = resolved;
                }
            }
        }

        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.play(idToPlay);
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
                        const { ActorSoundConfig } = await import("../../../ionrift-workshop/scripts/apps/ActorSoundConfig.js");
                        new ActorSoundConfig(doc).render(true);
                    } else {
                        const { ItemSoundConfig } = await import("../../../ionrift-workshop/scripts/apps/ItemSoundConfig.js");
                        new ItemSoundConfig(doc).render(true);
                    }
                } catch (e) {
                    ui.notifications.error("Ionrift: Could not load Workshop module.");
                }
            }
        }
    }
}
