
import { AbstractWelcomeApp } from "/modules/ionrift-library/scripts/apps/AbstractWelcomeApp.js";
import { Logger } from "../Logger.js";

/**
 * Ionrift Resonance Attunement Protocol
 * Handles Syrinscape Connection and Sound Preset Configuration.
 */
export class AttunementApp extends AbstractWelcomeApp {
    constructor(options = {}) {
        // Parent constructor: title, settingsKey, currentVersion
        const version = game.modules.get("ionrift-sounds").version;
        super("Attunement Protocol", "setupVersion", version);

        // State for Token Input
        this.pendingToken = "";
        this.testResult = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sounds-attunement",
            template: "modules/ionrift-sounds/templates/attunement-app.hbs", // Custom Template
            width: 720,
            height: "auto",
            classes: ["ionrift", "ionrift-window", "welcome-window"],
            moduleId: "ionrift-sounds",
            title: "Attunement Protocol"
        });
    }

    // Handle cancellation efficiently
    async _onStepAction(event) {
        event.preventDefault();
        const stepId = event.currentTarget.dataset.step;
        Logger.log(`Attunement | _onStepAction triggered for: ${stepId}`);
        const btn = $(event.currentTarget);
        let icon = btn.find("i");
        let originalIcon = icon.length ? icon.attr("class") : "";

        try {
            btn.prop("disabled", true);
            if (icon.length) icon.attr("class", "fas fa-spinner fa-spin");

            // Execute
            Logger.log(`Attunement | Executing step logic for ${stepId}...`);
            const result = await this.executeStep(stepId);
            Logger.log(`Attunement | Step result for ${stepId}:`, result);

            // Stop if step was cancelled
            if (result === false) {
                Logger.log(`Attunement | Step ${stepId} returned false (cancelled). Halting progression.`);
                btn.prop("disabled", false);
                if (icon.length) icon.attr("class", originalIcon);
                return;
            }

            this.completedSteps.add(stepId);
            this.currentStepIndex++;
            this.render();
            ui.notifications.info(`${this.moduleTitle} | Step Complete: ${stepId}`);

        } catch (err) {
            Logger.error(`${this.moduleTitle} | Step Failed: ${stepId}`, err);
            ui.notifications.error(`${this.moduleTitle} | Error: ${err.message}`);

            btn.prop("disabled", false);
            if (icon.length) icon.attr("class", originalIcon);
        }
    }

    // ... (rest of class) ...

    async _applyPreset() {
        const form = this.element.find("form");
        let presetType = form.find("input[name='preset']:checked").val();

        // Default to 'full' if no selection made
        if (!presetType) {
            Logger.warn("Attunement | No preset selected, defaulting to 'full'.");
            presetType = "full";
        }

        // Import Defaults
        const { SYRINSCAPE_PRESETS } = await import("../data/syrinscape_defaults.js");
        const sysId = game.system.id === 'daggerheart' ? 'daggerheart' : 'dnd5e';
        const presetKey = `${sysId}_${presetType}`;
        const presetData = SYRINSCAPE_PRESETS[presetKey] || SYRINSCAPE_PRESETS[presetType];

        if (!presetData) throw new Error(`Preset data not found for ${presetType} (${presetKey})`);

        // Check for existing custom bindings OR config overrides
        const existingBindings = JSON.parse(game.settings.get("ionrift-sounds", "customSoundBindings") || "{}");
        const existingOverrides = game.settings.get("ionrift-sounds", "configOverrides") || {};

        const hasCustom = Object.keys(existingBindings).length > 0;
        const hasOverrides = Object.keys(existingOverrides).length > 0;

        // Warn user if existing customizations will be overwritten
        if (hasCustom || hasOverrides) {
            // BRANDED DIALOG
            const confirm = await new Promise((resolve) => {
                new Dialog({
                    title: "Overwrite Configuration?",
                    content: `
                        <div style="padding: 10px; text-align: center;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: #f87171; margin-bottom: 15px;"></i>
                            <p style="font-size: 1.1em; margin-bottom: 10px;">You have active sound customizations.</p>
                            <p style="color: #ccc;">Applying the <strong>${presetType}</strong> preset will <strong style="color: #f87171;">reset</strong> all custom bindings and overrides to default.</p>
                        </div>
                    `,
                    buttons: {
                        yes: {
                            label: `<i class="fas fa-check"></i> Overwrite & Reset`,
                            callback: () => resolve(true)
                        },
                        no: {
                            label: `<i class="fas fa-times"></i> Cancel`,
                            callback: () => resolve(false)
                        }
                    },
                    default: "no",
                    close: () => resolve(false)
                }, {
                    classes: ["ionrift", "ionrift-window", "glass-ui"],
                    width: 400
                }).render(true);
            });

            if (!confirm) return false; // Cancel operation
        }

        // Reset configuration to factory defaults

        // 1. Clear Overrides (Campaign Settings)
        await game.settings.set("ionrift-sounds", "configOverrides", {});

        // 2. Clear Custom Bindings (Resets to Preset Defaults via SoundHandler layering)
        await game.settings.set("ionrift-sounds", "customSoundBindings", "{}");

        // 3. Set Sound Preset
        // Since 'fantasy.json' (default) contains the core sounds, clearing custom bindings effectively 
        // resets the module to the selected preset state.


        // 4. Save Completeness Preference
        await game.settings.set("ionrift-sounds", "soundCompleteness", presetType);

        // 5. Refresh "Resonance Calibration" UI if open
        const calibrationWin = Object.values(ui.windows).find(w => w.id === "ionrift-sound-config");
        if (calibrationWin) {
            Logger.log("Resonance | Refreshing Calibration Window...");
            calibrationWin.render(true);
        }

        ui.notifications.info(`Resonance | Factory Reset Complete. Customizations cleared.`);
        return true; // Explicit Success
    }
    _getIntroText() {
        return "Configure Ionrift Resonance to automate audio for your world. This protocol will connect to Syrinscape and apply a sound preset for your system.";
    }

    _getCompleteMessage() {
        return "Resonance is attuned and ready. You can re-run this protocol anytime to switch presets or update your token.";
    }

    getSteps() {
        return [
            {
                id: "connect_syrinscape",
                title: "Connect Syrinscape",
                icon: "fas fa-plug",
                description: "Establish a connection to the Syrinscape Online API.",
                actionLabel: "Verify Connection",
                content: () => this._getTokenStepContent()
            },
            {
                id: "apply_preset",
                title: "Apply Sound Preset",
                icon: "fas fa-sliders-h",
                description: "Select a library preset to populate default bindings. (Overwrites existing keys)",
                actionLabel: "Apply Preset",
                content: () => this._getPresetStepContent()
            },
            {
                id: "verification",
                title: "Final Verification",
                icon: "fas fa-check-double",
                description: "Verify integration status and sync with Control module.",
                actionLabel: "Complete Setup",
                isFinal: true
            }
        ];
    }

    async _getTokenStepContent() {
        const currentToken = this.pendingToken || game.settings.get("ionrift-sounds", "syrinToken") || "";
        const mismatch = this._checkTokenMismatch(currentToken);

        // Check for Control Module
        const controlMod = game.modules.get("syrinscape-control");
        const hasSyrinControl = controlMod?.active;

        return await renderTemplate("modules/ionrift-sounds/templates/partials/attunement-step-token.hbs", {
            token: currentToken,
            mismatch: mismatch,
            hasSyrinControl: hasSyrinControl
        });
    }

    async _getPresetStepContent() {
        // Detect System
        const sysId = game.system.id === 'daggerheart' ? 'daggerheart' : 'dnd5e';
        const sysLabel = game.system.title;

        // UI Logic: Load saved completeness preference (This stores 'full' or 'core')
        let currentCompleteness = game.settings.get("ionrift-sounds", "soundCompleteness") || "full";

        return await renderTemplate("modules/ionrift-sounds/templates/partials/attunement-step-preset.hbs", {
            sysLabel: sysLabel,
            currentPreset: currentCompleteness // Pass completeness choice to UI
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Live Token Input
        html.find(".attunement-token-input").on("input", (ev) => {
            this.pendingToken = ev.target.value.trim();
        });

        // Password Toggle
        html.find(".toggle-visibility").click((ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const input = btn.siblings("input");
            const icon = btn.find("i");

            if (input.attr("type") === "password") {
                input.attr("type", "text");
                icon.removeClass("fa-eye").addClass("fa-eye-slash");
            } else {
                input.attr("type", "password");
                icon.removeClass("fa-eye-slash").addClass("fa-eye");
            }
        });
    }

    async executeStep(stepId) {
        if (stepId === "connect_syrinscape") {
            return await this._verifyConnection();
        } else if (stepId === "apply_preset") {
            return await this._applyPreset();
        } else if (stepId === "verification") {
            return await this._runDiagnostics();
        }
    }

    async _verifyConnection() {
        const token = this.pendingToken || game.settings.get("ionrift-sounds", "syrinToken");
        if (!token) throw new Error("Please enter an Auth Token.");

        // Verification Logic - Use a known element (Sword Clash 1035) instead of 'state' which can 400 if idle.
        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) {
            throw new Error(`Connection Failed (${response.status})`);
        }

        // Success - Save Token
        await game.settings.set("ionrift-sounds", "syrinToken", token);

        // Sync Logic (if mismatch)
        if (game.modules.get("syrinscape-control")?.active) {
            await game.settings.set("syrinscape-control", "authToken", token);
        }
    }



    async _runDiagnostics() {
        // Simple check for now
        if (game.ionrift?.integration) {
            game.ionrift.integration.refresh();
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Visual delay
    }

    _checkTokenMismatch(token) {
        if (!token) return false;
        const controlMod = game.modules.get("syrinscape-control");
        if (!controlMod?.active) return false;

        const controlToken = game.settings.get("syrinscape-control", "authToken") || "";
        return controlToken.trim() !== token.trim();
    }
}
