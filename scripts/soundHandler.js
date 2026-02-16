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
        if (!key) {
            Logger.log("playItemSound | No key provided, skipping");
            return;
        }

        if (item) {
            const now = Date.now();
            const lastTime = this.cooldowns.get(item.id) || 0;
            if (now - lastTime < cooldownMs) {
                Logger.log(`playItemSound | Cooldown Active for ${item.name} (${now - lastTime}ms < ${cooldownMs}ms)`);
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
                    Logger.log(`playItemSound | Added delay: ${addedDelay}ms (${delayMin}-${delayMax}s)`);
                }
            }
        }

        Logger.log(`playItemSound | Playing ${key} with delay ${delay + addedDelay}ms`);
        this.play(key, delay + addedDelay);
    }

    /**
     * Try primaryKey first. If it doesn't resolve to a bound sound,
     * fall back to fallbackKey. Used for spells: effect key → school key.
     */
    playItemSoundWithFallback(primaryKey, fallbackKey, item = null, delay = 0) {
        // Check if primary key resolves to a bound sound
        const primaryResult = this.resolver.resolveKey(primaryKey);
        if (primaryResult) {
            Logger.log(`playItemSoundWithFallback | Primary ${primaryKey} resolved → using it`);
            this.playItemSound(primaryKey, item, delay);
        } else {
            Logger.log(`playItemSoundWithFallback | Primary ${primaryKey} unbound → trying ${fallbackKey}`);
            this.playItemSound(fallbackKey, item, delay);
        }
    }

    play(key, delay = 0) {
        Logger.log(`SoundHandler.play | Key: ${key}, Delay: ${delay}ms`);

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
                Logger.log(`SoundHandler.play | No binding found, treating as raw ID: ${key}`);
                finalData = key; // Assume raw ID
            } else {
                Logger.warn(`SoundHandler.play | No Binding for Semantic Key: ${key}`);
                return;
            }
        } else {
            Logger.log(`SoundHandler.play | Resolved to: ${finalData}`);
        }

        // 2. Delegate to SoundManager
        if (game.ionrift.sounds?.manager) {
            game.ionrift.sounds.manager.play(finalData, { delay: delay });
        } else {
            Logger.error("SoundHandler.play | Manager not available!");
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

        // App V2 — System-specific and generic hooks
        const injectV2 = (app, controls) => this._getAppHeaderControls(controls, app);
        Hooks.on("getHeaderControlsActorSheetV2", injectV2);
        Hooks.on("getActorSheetV2HeaderControls", injectV2);
        Hooks.on("getHeaderControlsItemSheet5e", injectV2);
        Hooks.on("getHeaderControlsItemSheetV2", injectV2);
        Hooks.on("getHeaderControlsDHBaseItemSheet", injectV2);

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
        if (buttons.some(b => b.class === "ionrift-resonance")) return;
        buttons.unshift({
            label: "Sounds",
            class: "ionrift-resonance",
            icon: "fas fa-music",
            onclick: () => this.openSoundConfig(app.document)
        });
    }

    _getAppHeaderControls(controls, app) {
        if (!game.user.isGM) return;
        if (controls.some(c => c.action === "ionrift-resonance")) return;
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
