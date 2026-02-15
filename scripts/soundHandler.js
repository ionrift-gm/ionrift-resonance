import { msgContains } from "./utils.js";
import { SOUND_EVENTS } from "./constants.js";
import { DaggerheartAdapter } from "./systems/DaggerheartAdapter.js";
import { DnD5eAdapter } from "./systems/DnD5eAdapter.js";
import { Logger } from "./Logger.js";
import { ResonanceConfig } from "./ResonanceConfig.js";
import { SoundResolver } from "./SoundResolver.js";

// console.log("Ionrift Resonance | SoundHandler Loaded");

export class SoundHandler {
    constructor() {
        this.system = null;
        this.cooldowns = new Map(); // Track item usage timestamps: Map<itemId, timestamp>

        // Architecture Refactor: New Services
        this.configService = new ResonanceConfig();
        this.resolver = new SoundResolver(this.configService);

        // Expose for Menu
        game.ionrift = game.ionrift || {};
        game.ionrift.handler = this;

        // Configuration Proxy: Delegate Legacy Property Access
        // Some legacy code might check handler.config directly
        Object.defineProperty(this, 'config', {
            get: () => this.configService.config
        });

        Object.defineProperty(this, 'activePreset', {
            get: () => this.configService.activePreset,
            set: (val) => { /* No-op or handle if needed */ }
        });

        // Reactivity: Listen for settings changes via Config Service
        Hooks.on("updateSetting", (setting, changes, options, userId) => {
            if (setting.key === "ionrift-resonance.customSoundBindings" ||
                setting.key === "ionrift-resonance.soundPreset" ||
                setting.key === "ionrift-resonance.configOverrides") {
                this.loadConfig();
            }
        });

        this.init();
    }

    async init() {
        // 1. Initialize System Adapter & Hooks IMMEDIATELY
        if (game.system.id === "daggerheart") {
            this.system = new DaggerheartAdapter(this);
        } else if (game.system.id === "dnd5e") {
            this.system = new DnD5eAdapter(this);
        } else {
            Logger.warn(`System '${game.system.id}' not strictly supported. Defaulting to Daggerheart logic.`);
            this.system = new DaggerheartAdapter(this);
        }

        this.registerHooks();

        // 2. Load Config
        await this.loadConfig();

        if (game.user.isGM) {
            this.checkConfiguration();
            this.validateMappings();
            this.runStartupChecks();
        }
    }

    async loadConfig() {
        await this.configService.load();
    }

    reloadStrategy() {
        // Deprecated: No longer used. Kept empty for legacy safety.
        Logger.log("SoundHandler | reloadStrategy is deprecated.");
    }

    // --- Validation & Startup ---

    async runStartupChecks() {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            const { SoundSystemValidator } = await import("./SoundSystemValidator.js");
            if (!game.ionrift.library?.RuntimeValidator) {
                Logger.warn("RuntimeValidator not found in ionrift-library. Skipping checks.");
                return;
            }
            const validator = new SoundSystemValidator(this);
            await validator.run();
        } catch (err) {
            Logger.error("Failed to run startup checks:", err);
        }
    }

    validateMappings() {
        if (!this.config) return;
        if (this.activePreset === "none") return;

        const missing = [];
        for (const [key, value] of Object.entries(SOUND_EVENTS)) {
            const resolved = this.config[value];
            if (!resolved || (Array.isArray(resolved) && resolved.length === 0)) {
                if (value.startsWith("CORE_") || value.startsWith("PC_") || value.startsWith("DAGGERHEART_")) {
                    missing.push(value);
                }
            }
        }

        if (missing.length > 0) {
            Logger.warn("INTEGRITY CHECK FAILED. Missing configuration for:", missing);
        } else {
            Logger.log("Integrity Check Passed (All Core Sounds Mapped)");
        }
    }

    async checkConfiguration() {
        const token = game.settings.get("ionrift-resonance", "syrinToken");
        if (!token) {
            this.promptForToken();
            return;
        }

        try {
            // Verify connection
            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
            const response = await fetch(url, { method: 'GET' });

            if (response.ok) {
                Logger.log("Syrinscape Connection Verified.");
                await game.settings.set("ionrift-resonance", "authVerified", true);
            } else {
                Logger.warn(`Connection Failed: ${response.status} ${response.statusText}`);
                await game.settings.set("ionrift-resonance", "authVerified", false);
                ui.notifications.error(`Ionrift Resonance: Connection Failed (${response.status}). Check your Auth Token.`, { permanent: true });
            }
        } catch (e) {
            Logger.error("Validation Network Error", e);
            await game.settings.set("ionrift-resonance", "authVerified", false);
            ui.notifications.warn("Ionrift Resonance: Could not reach Syrinscape (Network Error).");
        }
    }

    async promptForToken() {
        let token = game.settings.get("ionrift-resonance", "syrinToken");
        if (!token && game.modules.get("syrinscape-control")?.active) {
            const externalToken = game.settings.get("syrinscape-control", "authToken");
            if (externalToken) {
                Logger.log("Found existing token in Syrinscape Control. Syncing...");
                await game.settings.set("ionrift-resonance", "syrinToken", externalToken);
                ui.notifications.info("Ionrift Resonance: Synced authentication from Syrinscape Control.");
                this.checkConfiguration();
                return;
            }
        }
        if (!token) {
            Logger.log("No Token found. improved Attunement Protocol should be open.");
        }
    }

    // --- Sound Logic Delegation ---

    pickSound(itemOrName, actorName, actor = null, flagType = "sound_attack") {
        const result = this.resolver.pickSound(itemOrName, actorName, actor, flagType);
        Logger.log(`pickSound | Resolved: ${result}`);
        return result;
    }

    playItemSound(key, item = null, delay = 0, cooldownMs = 5000) {
        if (!key) return;

        if (item) {
            const now = Date.now();
            const lastTime = this.cooldowns.get(item.id) || 0;
            if (now - lastTime < cooldownMs) {
                Logger.log(`Cooldown Active for ${item.name}`);
                return;
            }
            this.cooldowns.set(item.id, now);
        }

        // Check for Configured Variable Delay
        let addedDelay = 0;
        if (item) {
            const config = item.getFlag("ionrift-resonance", "sound_config");
            if (config && config[key]) {
                const { delayMin, delayMax } = config[key];
                if (delayMax > 0 && delayMax >= delayMin) {
                    const randomSeconds = Math.random() * (delayMax - delayMin) + delayMin;
                    addedDelay = randomSeconds * 1000;
                }
            }
        }

        this.play(key, delay + addedDelay);
    }

    play(key, delay = 0) {
        // 1. Resolve Key -> ID/Object via Resolver
        const soundKey = this.resolver.resolveKey(key);
        // If resolver returned an object/id, good. If it returned null, maybe it is a raw ID?
        // Let's defer to Manager or handle legacy check here.

        // Legacy Resolver fallback embedded in SoundHandler previously:
        // "return key if it looks like an ID"
        // We'll trust the Key is valid if resolveKey fails but it isn't semantic.

        let finalData = soundKey;
        if (!finalData) {
            // Semantic Check
            const isSemantic = /^[A-Z][A-Z0-9_]+$/.test(key);
            if (!isSemantic) {
                finalData = key; // Assume raw ID
            } else {
                Logger.warn(`play | No Binding for Semantic Key: ${key}`);
                return;
            }
        }

        // 2. Delegate to SoundManager
        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.play(finalData, { delay: delay });
        }
    }

    // Legacy method for "Resolving what ID a Key maps to"
    // Used by some UI elements potentially
    resolveSound(key, context = {}) {
        const res = this.resolver.resolveKey(key);
        return res || key; // Return raw key if no resolution found (Legacy behavior)
    }

    getPCSound(actorOrName, type = "PAIN") {
        // Delegate to Resolver
        // Resolver expects Actor object mostly, but existing signature supports name string.
        let actor = null;
        if (typeof actorOrName === "string") {
            actor = game.actors.getName(actorOrName);
        } else {
            actor = actorOrName;
        }

        if (!actor) {
            // Fallback if no actor found (Legacy behavior)
            return type === "DEATH" ? SOUND_EVENTS.PC_DEATH_MASCULINE : SOUND_EVENTS.PC_PAIN_MASCULINE;
        }

        return this.resolver.getPCSound(actor, type);
    }

    // --- UI / Hooks ---

    registerHooks() {
        if (this.system) {
            this.system.registerHooks();
        }

        Hooks.on("chatMessage", (chatLog, message, chatData) => {
            if (message.trim() === "/iondebug") {
                this.runDiagnostics();
                return false;
            }
        });

        // App V1
        Hooks.on("getActorSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));
        Hooks.on("getItemSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));

        // App V2
        const injectV2 = (app, controls) => this._getAppHeaderControls(controls, app);
        Hooks.on("getHeaderControlsActorSheetV2", injectV2);
        Hooks.on("getActorSheetV2HeaderControls", injectV2);
        Hooks.on("getHeaderControlsItemSheet5e", injectV2);

        // Context Menu
        const contextOption = {
            name: "Configure Sounds",
            icon: '<i class="fas fa-music"></i>',
            condition: game.user.isGM,
            callback: async (li) => {
                const document = await fromUuid(li.data("documentId"));
                if (document) this.openSoundConfig(document);
            }
        };

        Hooks.on("getActorDirectoryEntryContext", (html, options) => {
            if (!game.user.isGM) return;
            options.push(contextOption);
        });

        Hooks.on("getItemDirectoryEntryContext", (html, options) => {
            if (!game.user.isGM) return;
            options.push(contextOption);
        });
    }

    _getAppHeaderButtons(app, buttons) {
        if (!game.user.isGM) return;
        buttons.unshift({
            label: "Sounds",
            class: "ionrift-resonance",
            icon: "fas fa-music",
            onclick: () => this.openSoundConfig(app.document)
        });
    }

    _getAppHeaderControls(controls, app) {
        if (!game.user.isGM) return;
        controls.push({
            label: "Configure Sounds",
            icon: "fas fa-music",
            class: "ionrift-resonance",
            action: "ionrift-resonance",
            onClick: () => this.openSoundConfig(app.document)
        });
    }

    async openSoundConfig(doc) {
        Logger.log(`Opening Config for: ${doc?.name} (${doc?.documentName})`);
        if (!doc) return;

        try {
            if (doc.documentName === "Actor") {
                const { ActorSoundConfig } = await import("./apps/ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("./apps/ItemSoundConfig.js");
                new ItemSoundConfig(doc).render(true);
            } else {
                Logger.warn("Unsupported Document Type:", doc.documentName);
            }
        } catch (err) {
            Logger.error("Failed to load Config App:", err);
            ui.notifications.error("Ionrift: Failed to load configuration window.");
        }

        // Note: Inline Hooks for Item updates removed/deprecated to avoid memory leak if called multiple times.
        // They should be in registerHooks() if global.
    }

    async configureVoice(actor) {
        // ... (Legacy helper, keeping for now) ...
        const current = actor.getFlag("ionrift-resonance", "identity") || "None";
        new Dialog({
            title: `Sound Config: ${actor.name}`,
            content: `
                <form>
                    <div class="form-group">
                        <label>Vocal Identity:</label>
                        <select name="identity" style="width: 100%">
                            <option value="masculine" ${current === "masculine" ? "selected" : ""}>Deep / Low (Masculine)</option>
                            <option value="feminine" ${current === "feminine" ? "selected" : ""}>Bright / High (Feminine)</option>
                        </select>
                    </div>
                </form>
            `,
            buttons: {
                save: {
                    label: "Save",
                    icon: "<i class='fas fa-save'></i>",
                    callback: async (html) => {
                        const identity = html.find("[name='identity']").val();
                        await actor.setFlag("ionrift-resonance", "identity", identity);
                        ui.notifications.info(`Ionrift Resonance: Set ${actor.name} Identity to ${identity}`);
                    }
                }
            },
            default: "save",
            classes: ["ionrift-window", "glass-ui"]
        }).render(true);
    }

    async runDiagnostics() {
        try {
            const { SoundDiagnostics } = await import("./diagnostics/SoundDiagnostics.js");
            new SoundDiagnostics(this).run();
        } catch (err) {
            Logger.error("Failed to load diagnostics:", err);
        }
    }
}

// Initialize Hooks
// Setup Hooks

// console.log("Ionrift Resonance | SoundHandler Loaded");

import { SoundConfigApp } from "./apps/SoundConfigApp.js";
import { SetupApp } from "./apps/SetupApp.js";

export class SoundHandler {
    constructor() {
        this.config = null;
        this.strategy = null; // Initialized in init/reloadStrategy
        this.weather = null;
        this.system = null;
        this.cooldowns = new Map(); // Track item usage timestamps: Map<itemId, timestamp>

        // Expose for Menu
        game.ionrift = game.ionrift || {};
        game.ionrift.handler = this;

        // Reactivity: Listen for setting changes to reload config dynamically
        Hooks.on("updateSetting", (setting, changes, options, userId) => {
            if (setting.key === "ionrift-resonance.customSoundBindings" ||
                setting.key === "ionrift-resonance.soundPreset" ||
                setting.key === "ionrift-resonance.configOverrides") {
                this.loadConfig();
            }
        });

        this.init();
    }

    async init() {
        // 1. Initialize System Adapter & Hooks IMMEDIATELY (Synchronous)
        // This ensures UI hooks are active before the config finishes loading
        if (game.system.id === "daggerheart") {
            this.system = new DaggerheartAdapter(this);
        } else if (game.system.id === "dnd5e") {
            this.system = new DnD5eAdapter(this);
        } else {
            Logger.warn(`System '${game.system.id}' not strictly supported. Defaulting to Daggerheart logic (may fail).`);
            this.system = new DaggerheartAdapter(this);
        }

        this.registerHooks();

        // 2. Initialize Weather Logic (Synchronous)
        this.weather = new WeatherStrategy(this);
        this.weather.activate();

        // 3. Load Mappings & Config (Async)
        // Settings now registered in module.js
        await this.loadConfig();
        this.reloadStrategy(); // Initialize Audio Strategy

        if (game.user.isGM) {
            this.checkConfiguration();
            this.validateMappings(); // Run Integrity Check
            this.runStartupChecks();
        }
    }

    /**
     * Startup Diagnostics: Validates environment health and dependencies.
     */
    async runStartupChecks() {
        // Wait for other modules to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            // Dynamic import to avoid load-time dependency issues if lib isn't ready
            const { SoundSystemValidator } = await import("./SoundSystemValidator.js");

            // Ensure RuntimeValidator is available (it's on game.ionrift.library)
            if (!game.ionrift.library?.RuntimeValidator) {
                Logger.warn("RuntimeValidator not found in ionrift-library. Skipping checks.");
                return;
            }

            const validator = new SoundSystemValidator(this);
            await validator.run();

        } catch (err) {
            Logger.error("Failed to run startup checks:", err);
        }
    }

    /**
     * Integrity Check: Verifies that core sound events are mapped.
     */
    /**
     * Integrity Check: Verifies that core sound events are mapped.
     */
    validateMappings() {
        if (!this.config) return;
        if (this.activePreset === "none") return; // Manual Mode - No Integrity Check

        const missing = [];

        // Check all defined SOUND_EVENTS
        for (const [key, value] of Object.entries(SOUND_EVENTS)) {
            // Validate key presence in config/defaults
            // syrinscape_defaults.js uses strict keys like "CORE_MELEE".
            const resolved = this.config[value];

            if (!resolved || (Array.isArray(resolved) && resolved.length === 0)) {
                // Check if key is a mandatory core definition (CORE_*, PC_*, DAGGERHEART_*)
                if (value.startsWith("CORE_") || value.startsWith("PC_") || value.startsWith("DAGGERHEART_")) {
                    missing.push(value);
                }
            }
        }

        if (missing.length > 0) {
            Logger.warn("INTEGRITY CHECK FAILED. Missing configuration for:", missing);
            // Downgraded to Console Warning to avoid nagging the user for minor missing keys
            // if (game.user.isGM) {
            //    ui.notifications.warn(`Ionrift Sounds: Missing configuration for ${missing.length} core sounds. Check console.`);
            // }
        } else {
            Logger.log("Integrity Check Passed (All Core Sounds Mapped)");
        }
    }

    reloadStrategy() {
        const provider = game.settings.get("ionrift-resonance", "provider") || "syrinscape";
        Logger.log(`Loading Strategy: ${provider}`);

        if (provider === "syrinscape") {
            this.strategy = new SyrinscapeStrategy(this);
        } else {
            this.strategy = new LocalStrategy(this);
        }
    }

    async loadConfig() {
        // Initialize default safe config to prevent crash if fetch fails
        this.config = { mappings: { adversaries: {}, weapons: {}, spells: {} }, players: {} };

        try {
            // 1. Determine Preset File
            let preset = game.settings.get("ionrift-resonance", "soundPreset") || "fantasy";
            // Defensive Clean (remove quotes if corrupted)
            if (typeof preset === 'string') preset = preset.replace(/^["']|["']$/g, '').trim();

            this.activePreset = preset;

            const fileUrl = `/modules/ionrift-resonance/scripts/presets/${preset}.json`;

            Logger.log(`Loading Preset: ${preset} from ${fileUrl}`);

            // 2. Load Defaults
            Logger.log("DEBUG: Fetching preset...");

            // Wrap fetch in a timeout
            const fetchPromise = fetch(fileUrl);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out")), 2000)
            );

            const response = await Promise.race([fetchPromise, timeoutPromise]);
            Logger.log(`DEBUG: Fetch status: ${response.status}`);

            if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);

            Logger.log("DEBUG: Parsing JSON...");
            const defaultConfig = await response.json();
            Logger.log("DEBUG: JSON Parsed.");

            // 2. Load User Overrides
            const overrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

            // 3. Merge Strategies
            // Start with deep copy of defaults
            Logger.log("DEBUG: Cloning config...");
            this.config = foundry.utils.deepClone(defaultConfig);

            // Merge Players (Array -> Object Map)
            if (overrides.players && Array.isArray(overrides.players)) {
                if (!this.config.players) this.config.players = {};
                for (const p of overrides.players) {
                    if (p.name) this.config.players[p.name] = { pain: p.pain, death: p.death };
                }
            }

            // Merge Campaign Specifics (Array -> Adversaries/Generic Map)
            // Structure: { actor: "Strahd", item: "Bite", sound: "123" }
            if (overrides.campaign && Array.isArray(overrides.campaign)) {
                if (!this.config.mappings) this.config.mappings = { adversaries: {}, weapons: {}, spells: {} };

                for (const c of overrides.campaign) {
                    if (c.actor && c.item && c.sound) {
                        // Actor Specific: adversaries[ActorName][ItemName] = Sound
                        if (!this.config.mappings.adversaries[c.actor]) this.config.mappings.adversaries[c.actor] = {};
                        this.config.mappings.adversaries[c.actor][c.item] = c.sound;
                    } else if (c.type === "weapon" && c.item && c.sound) {
                        this.config.mappings.weapons[c.item] = c.sound;
                    } else if (c.type === "spell" && c.item && c.sound) {
                        this.config.mappings.spells[c.item] = c.sound;
                    } else if (!c.actor && c.item && c.sound) {
                        // Item Specific (Global override)
                        // Assign to weapons mapping as generic fallback priority
                        this.config.mappings.weapons[c.item] = c.sound;
                    }
                }
            }

            Logger.log("Configuration Loaded & Merged", this.config);
        } catch (e) {
            Logger.error("Failed to load config", e);
        }
    }

    registerHooks() {
        if (this.system) {
            this.system.registerHooks();
        }

        // Chat Command for Diagnostics
        Hooks.on("chatMessage", (chatLog, message, chatData) => {
            if (message.trim() === "/iondebug") {
                this.runDiagnostics();
                return false;
            }
        });

        // Standard Header Buttons (Actors & Items) - Legacy / V1
        Hooks.on("getActorSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));
        Hooks.on("getItemSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));

        // ApplicationV2 Header Controls (DnD5e v4+ / Foundry v12+)
        const injectV2 = (app, controls) => this._getAppHeaderControls(controls, app);
        Hooks.on("getHeaderControlsActorSheetV2", injectV2); // DnD5e specialized
        Hooks.on("getActorSheetV2HeaderControls", injectV2); // Core generic V2 naming convention fallback
        Hooks.on("getHeaderControlsItemSheet5e", injectV2);  // DnD5e Items

        // Sidebar Context Menus (Actors & Items)
        const contextOption = {
            name: "Configure Sounds",
            icon: '<i class="fas fa-music"></i>',
            condition: game.user.isGM,
            callback: async (li) => {
                const document = await fromUuid(li.data("documentId"));
                if (document) this.openSoundConfig(document);
            }
        };

        Hooks.on("getActorDirectoryEntryContext", (html, options) => {
            if (!game.user.isGM) return;
            options.push(contextOption);
        });

        Hooks.on("getItemDirectoryEntryContext", (html, options) => {
            if (!game.user.isGM) return;
            options.push(contextOption);
        });

        // Robust Event Listener (Fixes AppV2 swallowing events)
        // REMOVED: Replaced with direct onClick handler in _getAppHeaderControls (DAE Pattern)
    }

    // Standard Header Buttons (Actors & Items) - Legacy / V1
    _getAppHeaderButtons(app, buttons) {
        if (!game.user.isGM) return;

        buttons.unshift({
            label: "Sounds",
            class: "ionrift-resonance",
            icon: "fas fa-music",
            onclick: () => this.openSoundConfig(app.document)
        });
    }

    // ApplicationV2 Header Controls (DnD5e v4+ / Foundry v12+)
    _getAppHeaderControls(controls, app) {
        if (!game.user.isGM) return;

        controls.push({
            label: "Configure Sounds",
            icon: "fas fa-music",
            class: "ionrift-resonance",
            action: "ionrift-resonance",
            onClick: () => this.openSoundConfig(app.document)
        });
    }

    /**
     * Opens the configuration window for a specific document.
     * @param {Document} doc Actor or Item
     */
    async openSoundConfig(doc) {
        Logger.log(`Opening Config for: ${doc?.name} (${doc?.documentName})`);

        if (!doc) return;

        try {
            if (doc.documentName === "Actor") {
                const { ActorSoundConfig } = await import("./apps/ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("./apps/ItemSoundConfig.js");
                new ItemSoundConfig(doc).render(true);
            } else {
                Logger.warn("Unsupported Document Type:", doc.documentName);
            }
        } catch (err) {
            Logger.error("Failed to load Config App:", err);
            ui.notifications.error("Ionrift: Failed to load configuration window. Dependency might be missing.");
        }

        // NEW: Item Equip/Unequip Hooks
        Hooks.on("preUpdateItem", (item, changes) => {
            // Note: preUpdateItem is good for checking changes, but the update hasn't applied yet.
            // We want to play sound *as* it happens.
            // Check for 'equipped' status change
            // 5e uses 'system.equipped', Daggerheart might differ.
            // We'll try to support both or generic property checks.
        });

        Hooks.on("updateItem", (item, changes) => {
            // GM Logic Only to prevent duplicates and ensure Token access
            if (!game.user.isGM) return;

            // Check Equip State Change
            const newEquipped = foundry.utils.getProperty(changes, "system.equipped");
            if (newEquipped !== undefined) {
                const isEquipped = newEquipped === true;
                const soundType = isEquipped ? "sound_equip" : "sound_unequip";

                // Check for Flag
                const soundKey = item.getFlag("ionrift-resonance", soundType);
                if (soundKey) {
                    this.playItemSound(soundKey, item);
                }
            }
        });
    }

    async configureVoice(actor) {
        const current = actor.getFlag("ionrift-resonance", "identity") || "None";

        new Dialog({
            title: `Sound Config: ${actor.name}`,
            content: `
                <form>
                    <div class="form-group">
                        <label>Vocal Identity:</label>
                        <select name="identity" style="width: 100%">
                            <option value="masculine" ${current === "masculine" ? "selected" : ""}>Deep / Low (Masculine)</option>
                            <option value="feminine" ${current === "feminine" ? "selected" : ""}>Bright / High (Feminine)</option>
                        </select>
                    </div>
                </form>
            `,
            buttons: {
                save: {
                    label: "Save",
                    icon: "<i class='fas fa-save'></i>",
                    callback: async (html) => {
                        const identity = html.find("[name='identity']").val();
                        await actor.setFlag("ionrift-resonance", "identity", identity);
                        ui.notifications.info(`Ionrift Resonance: Set ${actor.name} Identity to ${identity}`);
                    }
                }
            },
            default: "save",
            classes: ["ionrift-window", "glass-ui"]
        }).render(true);
    }

    async checkConfiguration() {
        // 1. Check for Token existence
        const token = game.settings.get("ionrift-resonance", "syrinToken");

        if (!token) {
            this.promptForToken();
            return;
        }

        // 2. Validate Token with API (Readiness Check)
        try {
            // We verify by fetching metadata for a known generic element (Sword Clash: 1035)
            // This avoids fetching large lists (Moods) or invalid endpoints (Worlds)
            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
            const response = await fetch(url, { method: 'GET' }); // Default mode 'cors'

            if (response.ok) {
                Logger.log("Syrinscape Connection Verified.");
                await game.settings.set("ionrift-resonance", "authVerified", true);
                // ui.notifications.info("Ionrift Sounds: Connected to Syrinscape.");
            } else {
                Logger.warn(`Connection Failed: ${response.status} ${response.statusText}`);
                await game.settings.set("ionrift-resonance", "authVerified", false);
                ui.notifications.error(`Ionrift Resonance: Connection Failed (${response.status}). Check your Auth Token.`, { permanent: true });

                // If 403/401, maybe prompt again?
                if (response.status === 401 || response.status === 403 || response.status === 400) {
                    // Optional: this.promptForToken();
                }
            }
        } catch (e) {
            Logger.error("Validation Network Error", e);
            await game.settings.set("ionrift-resonance", "authVerified", false);
            ui.notifications.warn("Ionrift Resonance: Could not reach Syrinscape (Network Error).");
        }
    }

    async promptForToken() {
        // 1. Check Ionrift Token
        let token = game.settings.get("ionrift-resonance", "syrinToken");

        // 2. Check Other Modules (Syrinscape Control)
        if (!token && game.modules.get("syrinscape-control")?.active) {
            const externalToken = game.settings.get("syrinscape-control", "authToken");
            if (externalToken) {
                Logger.log("Found existing token in Syrinscape Control. Syncing...");
                await game.settings.set("ionrift-resonance", "syrinToken", externalToken);
                ui.notifications.info("Ionrift Resonance: Synced authentication from Syrinscape Control.");
                this.checkConfiguration();
                return; // Skip setup wizard
            }
        }

        // 3. Launch Setup App if still missing
        // [FIX] Disabled redundant legacy popup. Attunement Protocol (module.js) handles this.
        if (!token) {
            // new SetupApp({}, { isWelcome: true }).render(true);
            Logger.log("No Token found. improved Attunement Protocol should be open.");
        }
    }

    /**
     * Resolves the best sound for an Item context.
     * @param {string|Item} itemOrName The Item object or its name.
     * @param {string} actorName Name of the actor (if available).
     * @param {Actor} actor The actor object (if available).
     * @param {string} flagType Specific flag to look for ("sound_attack", "sound_use", etc.). Defaults to null (auto-detect based on context or fallbacks).
     * @returns {string} The sound key or ID.
     */
    /**
     * Resolves the best sound for an Item context.
     * @param {string|Item} itemOrName The Item object or its name.
     * @param {string} actorName Name of the actor (if available).
     * @param {Actor} actor The actor object (if available).
     * @param {string} flagType Specific flag to look for ("sound_attack", "sound_use", etc.). Defaults to null (auto-detect based on context or fallbacks).
     * @returns {string} The sound key or ID.
     */
    pickSound(itemOrName, actorName, actor = null, flagType = "sound_attack") {
        const result = this._pickSoundLogic(itemOrName, actorName, actor, flagType);
        Logger.log(`pickSound | Resolved: ${result} (Item: ${typeof itemOrName === 'string' ? itemOrName : itemOrName?.name})`);
        return result;
    }

    _pickSoundLogic(itemOrName, actorName, actor = null, flagType = "sound_attack") {

        if (!this.config) return SOUND_EVENTS.WHOOSH; // Not loaded yet

        const mappings = this.config.mappings;
        let itemName = "";
        let item = null;

        // 0. Resolve Item/Name
        if (typeof itemOrName === "object" && itemOrName?.name) {
            item = itemOrName;
            itemName = item.name;
        } else {
            itemName = itemOrName || "";
        }

        // 1. Check Item Flags (Highest Priority) - Supports Randomization
        if (item) {
            const flagVal = item.getFlag("ionrift-resonance", flagType);
            if (flagVal) {
                // Randomization: Check for commas
                if (typeof flagVal === 'string' && flagVal.includes(',')) {
                    const options = flagVal.split(',').map(s => s.trim());
                    const choice = options[Math.floor(Math.random() * options.length)];
                    return choice; // Return the specific ID/Key immediately
                }
                return flagVal;
            }
        }

        // 2. Check Adversary Specifics
        if (actorName && mappings.adversaries[actorName]) {
            const advMaps = mappings.adversaries[actorName];
            if (advMaps[itemName]) return advMaps[itemName];
        }

        // 3. Check Global Weapon/Spell Mappings
        if (mappings.weapons[itemName]) return mappings.weapons[itemName];
        if (mappings.spells[itemName]) return mappings.spells[itemName];

        const lower = itemName.toLowerCase();

        // 4. Classifier Context Logic (Shared Lib)
        if (actor && game.ionrift?.library?.classifyCreature) {
            const classifierResult = game.ionrift.library.classifyCreature(actor);
            const monsterKey = classifierResult?.sound; // e.g. "MONSTER_WOLF"

            if (monsterKey && monsterKey !== "MONSTER_GENERIC") {
                let action = "";
                if (lower.includes("bite")) action = "BITE";
                else if (lower.includes("claw") || lower.includes("scratch")) action = "CLAW";
                else if (lower.includes("slam") || lower.includes("smash")) action = "SLAM";

                if (action) {
                    return `${monsterKey}_${action}`; // e.g. MONSTER_WOLF_BITE
                }
            }
        }

        // 5. Fallback Matching
        // Match Spells
        if (lower.includes("fire") || lower.includes("flame") || lower.includes("burn")) return SOUND_EVENTS.SPELL_FIRE;
        if (lower.includes("ice") || lower.includes("frost") || lower.includes("cold")) return SOUND_EVENTS.SPELL_ICE;
        if (lower.includes("zap") || lower.includes("light") || lower.includes("shock")) return SOUND_EVENTS.SPELL_LIGHTNING;
        if (lower.includes("chaos") || lower.includes("void") || lower.includes("blast")) return SOUND_EVENTS.SPELL_VOID;
        if (lower.includes("heal") || lower.includes("cure") || lower.includes("life")) return SOUND_EVENTS.SPELL_HEAL;
        if (lower.includes("mind") || lower.includes("psychic") || lower.includes("mock")) return SOUND_EVENTS.SPELL_PSYCHIC;
        if (lower.includes("acid") || lower.includes("poison")) return SOUND_EVENTS.SPELL_ACID;
        if (lower.includes("thunder") || lower.includes("shatter")) return SOUND_EVENTS.SPELL_THUNDER;

        // Match Generic
        if (lower.includes("claw") || lower.includes("scratch")) return mappings.generic.claw || SOUND_EVENTS.ATTACK_CLAW;
        if (lower.includes("bite")) return mappings.generic.bite || SOUND_EVENTS.ATTACK_BITE;
        if (lower.includes("slam")) return mappings.generic.slam || SOUND_EVENTS.ATTACK_SLAM;

        // Match Weapons
        if (lower.includes("bow") || lower.includes("arrow")) return mappings.generic.bow || SOUND_EVENTS.ATTACK_BOW;
        if (lower.includes("crossbow") || lower.includes("bolt")) return SOUND_EVENTS.ATTACK_CROSSBOW;
        if (lower.includes("axe") || lower.includes("hammer") || lower.includes("maul")) return SOUND_EVENTS.ATTACK_BLUDGEON;
        if (lower.includes("dagger") || lower.includes("knife")) return SOUND_EVENTS.ATTACK_DAGGER;
        if (lower.includes("sword") || lower.includes("blade")) return mappings.generic.sword || SOUND_EVENTS.ATTACK_SWORD;

        // Default
        return mappings.default || SOUND_EVENTS.WHOOSH;
    }

    /**
     * Plays a sound for an item, respecting Cooldowns.
     * @param {string} key The sound key to play.
     * @param {Item} item The item context (optional, used for cooldowns).
     * @param {number} delay Optional delay in ms before playing.
     * @param {number} cooldownMs Optional override for cooldown (default 5000ms for 'sound_use' types if checking).
     */
    playItemSound(key, item = null, delay = 0, cooldownMs = 5000) {
        if (!key) return;

        if (item) {
            const now = Date.now();
            const lastTime = this.cooldowns.get(item.id) || 0;

            if (now - lastTime < cooldownMs) {
                Logger.log(`Cooldown Active for ${item.name} (${Math.ceil((cooldownMs - (now - lastTime)) / 1000)}s remaining)`);
                return;
            }
            this.cooldowns.set(item.id, now);
        }

        // Play via Strategy (with Delay)
        // Check for Configured Variable Delay
        let addedDelay = 0;
        if (item) {
            const config = item.getFlag("ionrift-resonance", "sound_config");
            if (config && config[key]) {
                const { delayMin, delayMax } = config[key];
                if (delayMax > 0 && delayMax >= delayMin) {
                    // Random delay in seconds -> convert to ms
                    const randomSeconds = Math.random() * (delayMax - delayMin) + delayMin;
                    addedDelay = randomSeconds * 1000;
                    // Logger.log(`Applying variable delay of ${randomSeconds.toFixed(2)}s to ${key}`);
                }
            }
        }

        this.play(key, delay + addedDelay);
    }

    // Updated Play wrapper that delegates to SoundManager
    play(key, delay = 0) {
        // 1. Resolve Key -> ID/Object
        const soundData = this.resolveSound(key);

        if (!soundData) return; // Prevent crashes if resolved to null (e.g. semantic key with no binding)

        // 2. Delegate to SoundManager
        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.play(soundData, { delay: delay });
        }
    }

    /**
     * Resolves a sound Key to its underlying ID/Payload.
     * @param {string} key 
     * @returns {string|object|array} The resolved payload.
     */
    resolveSound(key, context = {}) {
        if (!key) return null;

        // DEBUG: Trace Resolution
        Logger.log(`resolveSound | Resolving Key: ${key}`, context);

        // 1. Check for specific context override (from Auditor/Flags)
        // This is usually handled before calling resolveSound in pickSound, but good to check.
        // For now, we'll rely on the `key` itself being the result of prior resolution.

        // 2. Get Effective Bindings (Merge Layers)
        const bindings = this._getEffectiveBindings();

        // DEBUG: Trace keys
        // Logger.log(`resolveSound | Bindings Keys:`, Object.keys(bindings));

        let val = bindings[key];

        // 3. Fallback Logic
        if (!val) {
            const fallback = this._getFallbackKey(key);
            if (fallback) {
                Logger.log(`resolveSound | Fallback Key: ${fallback}`);
                if (bindings[fallback]) {
                    val = bindings[fallback];
                    Logger.log(`resolveSound | Fallback Match FOUND: ${fallback} -> ${val.id || val}`);
                } else {
                    Logger.warn(`resolveSound | Fallback Binding MISSING for ${fallback}`);
                }
            }
        }

        // 4. Return Found Value
        // If we found a value in the effective bindings (User > Config > Defaults), return it.
        if (val) {
            Logger.log(`resolveSound | Match [Effective]: ${key} -> ${val.id || val}`);
            return val;
        }

        // 4. Return Key if it looks like an ID (numeric or 'element:')
        // Otherwise return null for semantic keys (CORE_MELEE) to avoid 400 errors.
        const isSemantic = /^[A-Z][A-Z0-9_]+$/.test(key);
        if (isSemantic) {
            Logger.warn(`resolveSound | No Binding for Semantic Key: ${key}. Returning NULL.`);
            return null;
        }

        Logger.log(`resolveSound | Returning Raw ID: ${key}`);
        return key;
    }

    /**
     * Merges Defaults -> Preset (Config) -> User Bindings
     */
    _getEffectiveBindings() {
        const userBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        Logger.log(`[IONRIFT_DEBUG] _getEffectiveBindings | Preset: '${this.activePreset}'`);

        // If preset is 'none', strictly observe it by skipping defaults
        if (this.activePreset === "none") {
            return { ...this.config, ...userBindings };
        }

        // Ensure this.config is treated as a source of truth for keys
        // Note: this.config contains 'mappings', 'players' etc which are ignored by simple key lookups
        return { ...SYRINSCAPE_DEFAULTS, ...this.config, ...userBindings };
    }

    _getFallbackKey(specificKey) {
        // Melee
        if (["ATTACK_SWORD", "ATTACK_DAGGER", "ATTACK_AXE", "ATTACK_MACE", "ATTACK_BLUDGEON", "ATTACK_CLAW", "ATTACK_BITE", "ATTACK_SLAM"].includes(specificKey)) return "CORE_MELEE";

        // Ranged
        if (["ATTACK_BOW", "ATTACK_CROSSBOW", "ATTACK_SLING", "ATTACK_JAVELIN", "ATTACK_THROWN"].includes(specificKey)) return "CORE_RANGED";

        // Magic
        if (specificKey.startsWith("SPELL_")) return "CORE_MAGIC";

        // Hits & Results
        if (specificKey.endsWith("_HIT") || specificKey === "BLOODY_HIT") return "CORE_HIT";
        if (["MISS", "ATTACK_MISS"].includes(specificKey)) return "CORE_MISS";
        if (specificKey === "WHOOSH") return "CORE_WHOOSH";
        if (specificKey === "CRIT_DECORATION") return "CORE_CRIT";
        if (specificKey === "FUMBLE_DECORATION") return "CORE_FUMBLE";

        // Vocals - PC
        if (specificKey === "PC_PAIN_MALE") return "CORE_PAIN_MASCULINE";
        if (specificKey === "PC_PAIN_FEMALE") return "CORE_PAIN_FEMININE";
        if (specificKey === "PC_DEATH_MALE") return "CORE_DEATH_MASCULINE";
        if (specificKey === "PC_DEATH_FEMALE") return "CORE_DEATH_FEMININE";

        // Vocals - Monster
        if (specificKey.startsWith("MONSTER_") && !specificKey.includes("DEATH")) return "CORE_MONSTER_PAIN";
        if (specificKey.startsWith("MONSTER_") && specificKey.includes("DEATH")) return "CORE_MONSTER_DEATH";

        return null;
    }

    getPCSound(actorOrName, type = "PAIN") { // Type: PAIN or DEATH
        // Resolve Actor Name and Object
        let actorName = "";
        let identity = null;

        if (typeof actorOrName === "string") {
            actorName = actorOrName;
            // Try to find actor by name if possible, though passing object is better
            const actor = game.actors.getName(actorName);
            if (actor) {
                identity = actor.getFlag("ionrift-resonance", "identity");
            }
        } else {
            // It's an Actor object
            actorName = actorOrName.name;
            identity = actorOrName.getFlag("ionrift-resonance", "identity");
        }

        // Fallback to Config
        if (!identity && this.config && this.config.players) {
            identity = this.config.players[actorName];
        }

        if (!identity) {
            // Only warn if we haven't warned recently? (skipping debounce for now)
            Logger.warn(`No Identity configured for PC '${actorName}'. Set via 'Sounds' button on Actor Sheet.`);
            return type === "DEATH" ? SOUND_EVENTS.PC_DEATH : SOUND_EVENTS.PC_PAIN_MASCULINE;
        }

        const id = identity.toLowerCase();

        // Check for Feminine
        const isFem = id === "feminine";

        if (type === "DEATH") {
            return isFem ? SOUND_EVENTS.PC_DEATH_FEMININE : SOUND_EVENTS.PC_DEATH_MASCULINE;
        } else {
            return isFem ? SOUND_EVENTS.PC_PAIN_FEMININE : SOUND_EVENTS.PC_PAIN_MASCULINE;
        }
    }

    async runDiagnostics() {
        try {
            const { SoundDiagnostics } = await import("./diagnostics/SoundDiagnostics.js");
            new SoundDiagnostics(this).run();
        } catch (err) {
            Logger.error("Failed to load diagnostics:", err);
            ui.notifications.error("Failed to load diagnostics module.");
        }
    }

    openSetupDialog() {
        const token = game.settings.get("ionrift-resonance", "syrinToken");
        new Dialog({
            title: "Ionrift Resonance: Setup",
            content: `
                <div class="ionrift-setup">
                    <p><strong>Welcome to Ionrift Resonance!</strong></p>
                    <p>To enable sound effects, please enter your <strong>Syrinscape Online Auth Token</strong>.</p>
                    <p class="notes">You can find this at <a href="https://syrinscape.com/online/cp/" target="_blank">syrinscape.com/online/cp/</a> (look for "Remote Control Links").</p>
                    <hr>
                    <div class="form-group">
                        <label>Auth Token:</label>
                        <input type="password" name="token" value="${token}" style="width: 100%"/>
                    </div>
                </div>
            `,
            buttons: {
                save: {
                    label: "Save Token",
                    icon: "<i class='fas fa-check'></i>",
                    callback: async (html) => {
                        const val = html.find("input[name='token']").val().trim();
                        if (val) {
                            await game.settings.set("ionrift-resonance", "syrinToken", val);
                            ui.notifications.info("Ionrift Sounds: Token Saved!");
                            this.runDiagnostics();
                        }
                    }
                },
                cancel: {
                    label: "Cancel",
                    icon: "<i class='fas fa-times'></i>"
                }
            },
            default: "save",
            classes: ["ionrift-window", "glass-ui"]
        }).render(true);
    }
}

// Configuration Menu Proxy
class SyrinSetupMenu extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "ionrift-setup",
            title: "Ionrift Setup",
            popOut: false // Prevent window rendering
        });
    }

    render() {
        // Redirect to the Dialog
        if (game.ionrift?.handler) {
            game.ionrift.handler.openSetupDialog();
        } else {
            ui.notifications.error("Ionrift Handler not found.");
        }
        // return super.render(); // Don't render the form
        return this;
    }

    _updateObject(event, formData) { } // No-op
}
