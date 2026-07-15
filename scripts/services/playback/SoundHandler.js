import { msgContains } from "../../utils/msgContains.js";
import { SOUND_EVENTS } from "../../data/constants.js";
import { createSystemAdapter } from "../../systems/createSystemAdapter.js";
import { Logger } from "../../utils/Logger.js";
import { ResonanceConfig } from "../config/ResonanceConfig.js";
import { SoundResolver } from "./SoundResolver.js";
import { SoundOrchestrator } from "./SoundOrchestrator.js";
import { SoundPackLoader } from "../packs/SoundPackLoader.js";


export class SoundHandler {
    constructor(deps = {}) {
        this.system = null;
        this.cooldowns = new Map();
        this.manager = deps.manager ?? null;
        this.packLoader = deps.packLoader ?? SoundPackLoader;

        this.configService = deps.config ?? new ResonanceConfig();
        this.resolver = deps.resolver ?? new SoundResolver(this.configService);
        this.orchestrator = deps.orchestrator ?? new SoundOrchestrator();

        game.ionrift = game.ionrift || {};
        game.ionrift.handler = this;
        if (game.ionrift.resonance) {
            game.ionrift.resonance.handler = this;
        }

        Object.defineProperty(this, "config", {
            get: () => this.configService.config
        });

        Object.defineProperty(this, "activePreset", {
            get: () => "none",
            set: () => { }
        });

        Hooks.on("updateSetting", (setting) => {
            if (setting.key === "ionrift-resonance.customSoundBindings" ||
                setting.key === "ionrift-resonance.configOverrides" ||
                setting.key === "ionrift-resonance.installedSoundPacks") {
                this.loadConfig();
            }
            if (setting.key === "ionrift-resonance.orchestratorConfig") {
                this.orchestrator.loadConfig();
            }
            if (setting.key === "ionrift-resonance.cachedMergedBindings" && !game.user.isGM) {
                this.packLoader.refreshFromCache();
            }
        });

        this.init();
    }

    async init() {
        this.system = createSystemAdapter(this);

        this.registerHooks();

        await this.loadConfig();

        if (game.user.isGM) {
            const token = game.settings.get("ionrift-resonance", "syrinToken") || "";
            if (token) {
                this.checkConfiguration();
            }
            this.validateMappings();
            this.runStartupChecks();
        }
    }

    async loadConfig() {
        await this.configService.load();
    }

    reloadStrategy() {
        Logger.log("SoundHandler | reloadStrategy is deprecated.");
    }

    async runStartupChecks() {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            const { SoundSystemValidator } = await import("../../diagnostics/SoundSystemValidator.js");
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
        const enabledPacks = this.packLoader.getLoadedPacks().filter(p => p.enabled);
        if (enabledPacks.length === 0) return;

        const SKIP_VALIDATION = new Set([
            "CORE_MELEE", "CORE_RANGED", "CORE_MAGIC",
            "DAGGERHEART_FEAR_USE", "DAGGERHEART_FEAR",
            "DAGGERHEART_SUCCESS_WITH_HOPE", "DAGGERHEART_SUCCESS_WITH_FEAR",
            "DAGGERHEART_FAIL_WITH_HOPE", "DAGGERHEART_FAIL_WITH_FEAR",
            "DAGGERHEART_ROLL_HOPE", "DAGGERHEART_ROLL_FEAR",
        ]);

        const isDaggerheart = game.system.id === "daggerheart";
        const lookup = this.configService.getEffectiveBindings();

        const checked = new Set();
        const missing = [];
        for (const [key, value] of Object.entries(SOUND_EVENTS)) {
            if (SKIP_VALIDATION.has(key) || SKIP_VALIDATION.has(value)) continue;
            if (checked.has(value)) continue;
            checked.add(value);
            if (value.startsWith("DAGGERHEART_") && !isDaggerheart) continue;
            const resolved = lookup[value];
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
    // Raw file paths from item flags play directly; else try fallbackKey.
    playItemSoundWithFallback(primaryKey, fallbackKey, item = null, delay = 0) {
        const isRawPath = primaryKey && (primaryKey.includes("/") || primaryKey.includes("."));
        if (isRawPath) {
            Logger.log(`playItemSoundWithFallback | ${primaryKey} is a raw file path; playing directly`);
            this.playItemSound(primaryKey, item, delay);
            return;
        }

        const primaryResult = this.resolver.resolveKey(primaryKey);
        if (primaryResult) {
            Logger.log(`playItemSoundWithFallback | Primary ${primaryKey} resolved; using it`);
            this.playItemSound(primaryKey, item, delay);
        } else {
            Logger.log(`playItemSoundWithFallback | Primary ${primaryKey} unbound; trying ${fallbackKey}`);
            this.playItemSound(fallbackKey, item, delay);
        }
    }

    play(key, delay = 0) {
        Logger.log(`SoundHandler.play | Key: ${key}, Delay: ${delay}ms`);

        const soundKey = this.resolver.resolveKey(key);

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

        // 2. Orchestrator gate - budget check (throttle) + timing offset
        if (!this.orchestrator.allow(key)) return;
        const offset = this.orchestrator.getOffset(key);

        // 3. Taxonomy volume multiplier
        const taxonomyVolume = this._getTaxonomyVolume(key);
        const playOptions = { delay: delay + offset };
        if (taxonomyVolume !== 1.0) playOptions.volumeMultiplier = taxonomyVolume;

        // 4. Delegate to SoundManager
        const manager = this.manager ?? game.ionrift.resonance?.manager ?? game.ionrift.sounds?.manager;
        if (manager) {
            manager.play(finalData, playOptions);

            // Notify visualizer + any other consumers
            Hooks.call("ionrift.soundPlayed", key, finalData);
        } else {
            Logger.error("SoundHandler.play | Manager not available!");
        }
    }
    // School/domain inherit CORE_MAGIC volume when unset.
    _getTaxonomyVolume(key) {
        const root = SoundResolver.getTaxonomyRoot(key);
        if (!root) return 1.0;

        let volumes;
        try {
            volumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { return 1.0; }

        if (volumes[root] !== undefined) return volumes[root];

        // Inherit from CORE_MAGIC for child magic roots
        if ((root === "CORE_SCHOOL" || root === "CORE_DOMAIN") && volumes["CORE_MAGIC"] !== undefined) {
            return volumes["CORE_MAGIC"];
        }

        return 1.0;
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

    // --- Ambient Loop API (for cross-module integration) ---
    playAmbient(key, options = {}) {
        const resolved = this.resolver.resolveKey(key);
        if (!resolved) {
            Logger.log(`SoundHandler.playAmbient | No binding for "${key}", silent.`);
            return;
        }

        const volume = options.volume ?? 0.3;
        const fadeInMs = options.fadeInMs ?? 2000;

        Logger.log(`SoundHandler.playAmbient | ${key} as ${resolved}`);

        const manager = this.manager ?? game.ionrift.resonance?.manager ?? game.ionrift.sounds?.manager;
        if (manager) {
            manager.playAmbient(key, resolved, { volume, fadeInMs });
            Hooks.call("ionrift.ambientStarted", key, resolved);
        } else {
            Logger.error("SoundHandler.playAmbient | Manager not available!");
        }
    }

    stopAmbient(key, options = {}) {
        const fadeOutMs = options.fadeOutMs ?? 1500;
        Logger.log(`SoundHandler.stopAmbient | ${key} (fade: ${fadeOutMs}ms)`);

        const manager = this.manager ?? game.ionrift.resonance?.manager ?? game.ionrift.sounds?.manager;
        if (manager) {
            manager.stopAmbient(key, fadeOutMs);
            Hooks.call("ionrift.ambientStopped", key);
        }
    }

    stopAllAmbient() {
        Logger.log("SoundHandler.stopAllAmbient | Stopping all ambient loops.");

        const manager = this.manager ?? game.ionrift.resonance?.manager ?? game.ionrift.sounds?.manager;
        if (manager) {
            manager.stopAllAmbient();
            Hooks.call("ionrift.ambientStopped", "*");
        }
    }

    _onSpotlight(combat, updateData = {}) {
        if (!game.user.isGM) return;

        // v13: turn index is in updateData; combat.combatant is still the outgoing one.
        const newTurn = updateData.turn ?? combat.turn;
        const combatant = combat.turns?.[newTurn];
        if (!combatant?.actor) return;

        const actor = combatant.actor;
        const override = actor.getFlag("ionrift-resonance", "sound_spotlight");

        if (override) {
            Logger.log(`Spotlight | ${actor.name} (override: ${override})`);
            this.play(override);
        } else {
            Logger.log(`Spotlight | ${actor.name} (default)`);
            this.play(SOUND_EVENTS.SPOTLIGHT);
        }
    }

    // --- Encounter & Progression ---
    _onCombatStart(combat) {
        if (!game.user.isGM) return;
        Logger.log("Combat started, playing COMBAT_START");
        this.play(SOUND_EVENTS.COMBAT_START);
    }
    _onCombatEnd(combat) {
        if (!game.user.isGM) return;
        Logger.log("Combat ended, playing COMBAT_END");
        this.play(SOUND_EVENTS.COMBAT_END);
    }
    _cacheXpBeforeUpdate(actor, changed) {
        if (!game.user.isGM) return;
        const incoming = foundry.utils.getProperty(changed, "system.details.xp.value");
        if (incoming === undefined) return;

        this._xpBefore ??= new Map();
        this._xpBefore.set(actor.id, {
            value: Number(foundry.utils.getProperty(actor, "system.details.xp.value")),
            threshold: Number(foundry.utils.getProperty(actor, "system.details.xp.max"))
        });
    }
    _onActorXpUpdate(actor, changed) {
        if (!game.user.isGM) return;

        const newValue = foundry.utils.getProperty(changed, "system.details.xp.value");
        if (newValue === undefined) return;

        const before = this._xpBefore?.get(actor.id);
        this._xpBefore?.delete(actor.id);
        if (!before) return;

        const threshold = before.threshold;
        if (!Number.isFinite(threshold) || threshold <= 0) return;
        if (!Number.isFinite(before.value)) return;

        if (before.value < threshold && Number(newValue) >= threshold) {
            Logger.log(`Level-up threshold crossed for ${actor.name}: ${before.value} to ${newValue} (>= ${threshold})`);
            this.play(SOUND_EVENTS.LEVEL_UP);
        }
    }

    // --- UI / Hooks ---

    registerHooks() {
        if (this.system) {
            this.system.registerHooks();
        }

        // v13: combatTurn/Round fire before DB update; use updateData.turn.
        Hooks.on("combatTurn", (combat, updateData) => this._onSpotlight(combat, updateData));
        Hooks.on("combatRound", (combat, updateData) => this._onSpotlight(combat, updateData));

        Hooks.on("createCombat", (combat) => this._onCombatStart(combat));
        Hooks.on("deleteCombat", (combat) => this._onCombatEnd(combat));

        // Level-up: preUpdate caches XP; update fires once on first threshold cross.
        Hooks.on("preUpdateActor", (actor, changed) => this._cacheXpBeforeUpdate(actor, changed));
        Hooks.on("updateActor", (actor, changed) => this._onActorXpUpdate(actor, changed));

        Hooks.on("chatMessage", (chatLog, message, chatData) => {
            if (message.trim() === "/iondebug") {
                this.runDiagnostics();
                return false;
            }
        });

        // App V1
        Hooks.on("getActorSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));
        Hooks.on("getItemSheetHeaderButtons", (app, buttons) => this._getAppHeaderButtons(app, buttons));

        // App V2 - System-specific and generic hooks
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
                const { ActorSoundConfig } = await import("../../apps/config/ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("../../apps/config/ItemSoundConfig.js");
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
            const { SoundDiagnostics } = await import("../../diagnostics/SoundDiagnostics.js");
            new SoundDiagnostics(this).run();
        } catch (err) {
            Logger.error("Failed to load diagnostics:", err);
        }
    }
}
