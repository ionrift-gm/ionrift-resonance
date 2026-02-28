
import { AbstractWelcomeApp } from "/modules/ionrift-library/scripts/apps/AbstractWelcomeApp.js";
import { Logger } from "../Logger.js";

/**
 * Ionrift Resonance Attunement Protocol
 * Handles Syrinscape Connection and Sound Preset Configuration.
 */
export class AttunementApp extends AbstractWelcomeApp {
    // Must match ATTUNEMENT_VERSION in module.js — bump both together at release
    static VERSION = "1";

    constructor(attunementVersion, options = {}) {
        // Fall back to static VERSION so module-settings instantiation (no args)
        // still gets the correct version and shows the Protocol Complete state.
        super("Resonance: Attunement Protocol", "setupVersion", attunementVersion ?? AttunementApp.VERSION);

        // State for Token Input
        this.pendingToken = "";
        this.testResult = null;
        this.reloadRequired = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-resonance-attunement",
            template: "modules/ionrift-resonance/templates/attunement-app.hbs", // Custom Template
            width: 720,
            height: "auto",
            classes: ["ionrift", "ionrift-window", "welcome-window"],
            moduleId: "ionrift-resonance",
            title: "Attunement Protocol"
        });
    }


    activateListeners(html) {
        super.activateListeners(html); // wires step-action-btn, finish-btn, reset-btn via parent

        // Token input → update in-memory state on change
        html.find(".attunement-token-input").on("input", (e) => {
            this.pendingToken = e.currentTarget.value;
        });

        // Password field visibility toggle
        html.find(".toggle-visibility").click((e) => {
            const input = html.find(".attunement-token-input");
            const icon = $(e.currentTarget).find("i");
            const isPassword = input.attr("type") === "password";
            input.attr("type", isPassword ? "text" : "password");
            icon.toggleClass("fa-eye fa-eye-slash");
        });
    }

    // Override to force a full re-render so the step flow is shown after reset
    async _onReset(event) {
        event.preventDefault();
        await game.settings.set("ionrift-resonance", "setupVersion", "0.0.0");
        this.currentStepIndex = 0;
        this.completedSteps.clear();
        this.render(true); // force=true ensures the completed-banner is cleared
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

        // Default to 'keep' if no selection made (Safety — preserve existing config)
        if (!presetType) {
            Logger.warn("Attunement | No preset selected, defaulting to 'keep'.");
            presetType = "keep";
        }

        // Keep Current: Pass through without touching any settings
        if (presetType === "keep") {
            Logger.log("Attunement | Keeping current configuration. No changes applied.");
            ui.notifications.info("Resonance | Existing configuration preserved.");
            return true;
        }

        // Local SFX Pack — same overwrite guard as standard manual setup
        if (presetType === "pack") {
            const existingBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
            const existingOverrides = game.settings.get("ionrift-resonance", "configOverrides") || {};
            const hasCustom = Object.keys(existingBindings).length > 0;
            const hasOverrides = Object.keys(existingOverrides).length > 0;

            if (hasCustom || hasOverrides) {
                const confirmed = await new Promise((resolve) => {
                    new Dialog({
                        title: "Overwrite Configuration?",
                        content: `
                            <div style="padding: 10px; text-align: center;">
                                <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: #f87171; margin-bottom: 15px;"></i>
                                <p style="font-size: 1.1em; margin-bottom: 10px;">You have active sound customizations.</p>
                                <p style="color: #ccc;">Applying the <strong>Ionrift SFX Pack</strong> preset will <strong style="color: #f87171;">reset</strong> all custom bindings and overrides.</p>
                            </div>
                        `,
                        buttons: {
                            yes: { label: `<i class="fas fa-check"></i> Overwrite &amp; Reset`, callback: () => resolve(true) },
                            no: { label: `<i class="fas fa-times"></i> Cancel`, callback: () => resolve(false) }
                        },
                        default: "no",
                        close: () => resolve(false)
                    }, { classes: ["ionrift", "ionrift-window", "glass-ui"], width: 400 }).render(true);
                });
                if (!confirmed) return false;
            }

            await game.settings.set("ionrift-resonance", "configOverrides", {});
            await game.settings.set("ionrift-resonance", "customSoundBindings", "{}");
            await game.settings.set("ionrift-resonance", "soundPreset", "pack", { ionriftConfirmed: true });
            await game.settings.set("ionrift-resonance", "soundCompleteness", "pack");
            const calibrationWin = Object.values(ui.windows).find(w => w.id === "ionrift-sound-config");
            if (calibrationWin) calibrationWin.render(true, { focus: false });
            ui.notifications.info("Resonance | SFX Pack loaded. Your world is ready.");
            return true;
        }

        // Import Defaults
        const { SYRINSCAPE_PRESETS } = await import("../data/syrinscape_defaults.js");
        const sysId = game.system.id === 'daggerheart' ? 'daggerheart' : 'dnd5e';
        const presetKey = `${sysId}_${presetType}`;
        const presetData = SYRINSCAPE_PRESETS[presetKey] || SYRINSCAPE_PRESETS[presetType];

        if (!presetData) throw new Error(`Preset data not found for ${presetType} (${presetKey})`);

        // Check for existing custom bindings OR config overrides
        const existingBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        const existingOverrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

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
                            label: `<i class="fas fa-check"></i> Overwrite &amp; Reset`,
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
        await game.settings.set("ionrift-resonance", "configOverrides", {});

        // 2. Clear Custom Bindings (Resets to Preset Defaults via SoundHandler layering)
        await game.settings.set("ionrift-resonance", "customSoundBindings", "{}");

        // 3. Set Sound Preset
        // Map 'empty' to 'none', others to 'fantasy' (default)
        const targetPreset = (presetType === "empty") ? "none" : "fantasy";
        await game.settings.set("ionrift-resonance", "soundPreset", targetPreset, { ionriftConfirmed: true });


        // 4. Save Completeness Preference
        await game.settings.set("ionrift-resonance", "soundCompleteness", presetType);

        // 5. Refresh "Resonance Calibration" UI if open
        const calibrationWin = Object.values(ui.windows).find(w => w.id === "ionrift-sound-config");
        if (calibrationWin) {
            Logger.log("Resonance | Refreshing Calibration Window...");
            calibrationWin.render(true, { focus: false });
        }

        // Ensure Attunement stays on top (with slight delay to beat render cycle)
        if (this.rendered) {
            setTimeout(() => this.bringToTop(), 100);
        }

        ui.notifications.info(`Resonance | Factory Reset Complete. Customizations cleared.`);
        return true; // Explicit Success
    }
    _getIntroText() { return ""; }

    _getCompleteMessage() {
        return "Resonance is attuned and ready. You can re-run this protocol anytime to switch presets or update your token.";
    }

    getSteps() {
        return [
            {
                id: "connect_syrinscape",
                title: "Sound Provider",
                icon: "fas fa-plug",
                description: "Connect Syrinscape to extend the SFX Pack with cloud-hosted sounds.",
                actionLabel: "Verify & Connect",
                actionHidden: true, // Both paths handled inside content — outer button suppressed
                content: () => this._getTokenStepContent()
            },
            {
                id: "apply_preset",
                title: "Apply Sound Preset",
                icon: "fas fa-sliders-h",
                description: "Set up your initial sound bindings. You can adjust these anytime via the Calibration UI.",
                actionLabel: "Apply Preset",
                actionHidden: true,
                content: () => this._getPresetStepContent()
            },
            {
                id: "verification",
                title: "Final Verification",
                icon: "fas fa-check-double",
                description: "Finalize configuration and activate Resonance.",
                actionLabel: "Complete Setup",
                isFinal: true
            }
        ];
    }

    async _getTokenStepContent() {
        const currentToken = this.pendingToken || game.settings.get("ionrift-resonance", "syrinToken") || "";
        const mismatch = this._checkTokenMismatch(currentToken);
        const controlMod = game.modules.get("syrinscape-control");
        const hasSyrinControl = controlMod?.active;

        // Only auto-expand if user has an existing token — Control module alone isn't enough
        const expandSyrin = !!(currentToken || mismatch);

        return await renderTemplate("modules/ionrift-resonance/templates/partials/attunement-step-token.hbs", {
            token: currentToken,
            mismatch: mismatch,
            hasSyrinControl: hasSyrinControl,
            expandSyrin: expandSyrin
        });
    }

    async _getPresetStepContent() {
        const sysLabel = game.system.title;

        // Detect empty / first-run state:
        // Default to SFX Pack only if nothing is configured (no bindings, preset is 'none')
        const existingBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        const currentPreset = game.settings.get("ionrift-resonance", "soundPreset") || "none";
        const isEmpty = Object.keys(existingBindings).length === 0 && currentPreset === "none";

        // Keep Current is the safe default for returning users; Pack is default for first-timers
        const defaultPreset = isEmpty ? "pack" : "keep";

        return await renderTemplate("modules/ionrift-resonance/templates/partials/attunement-step-preset.hbs", {
            sysLabel: sysLabel,
            defaultPreset: defaultPreset,
            isFirstSetup: isEmpty
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Syrinscape section expand/collapse toggle
        html.find(".syrin-toggle").click(() => {
            const section = html.find(".syrin-section");
            const chevron = html.find(".syrin-chevron");
            const isOpen = section.is(":visible");
            section.toggle(!isOpen);
            chevron.toggleClass("fa-right fa-down", false)
                .toggleClass(isOpen ? "fa-chevron-down" : "fa-chevron-right", false)
                .addClass(isOpen ? "fa-chevron-right" : "fa-chevron-down");
        });

        // Skip button — clears token field then fires the step action so _verifyConnection
        // reads an empty DOM value and proceeds as local-only
        html.find(".skip-provider-btn").click((ev) => {
            ev.preventDefault();
            html.find(".attunement-token-input").val("");
            html.find(".step-action-btn[data-step='connect_syrinscape']").trigger("click");
        });

        // Verify Syrinscape button — fires the (hidden) step action btn with whatever token is in the field
        html.find(".verify-syrinscape-btn").click((ev) => {
            ev.preventDefault();
            html.find(".step-action-btn[data-step='connect_syrinscape']").trigger("click");
        });

        // Apply Preset button — fires the (hidden) step action btn
        html.find(".apply-preset-btn").click((ev) => {
            ev.preventDefault();
            html.find(".step-action-btn[data-step='apply_preset']").trigger("click");
        });

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
        // Read directly from the DOM input — if the user cleared the field it will be ""
        // Don't fall back to stored token when the field is present and explicitly empty.
        const inputEl = this.element?.find(".attunement-token-input");
        const fieldValue = inputEl?.length ? inputEl.val().trim() : undefined;
        const token = (fieldValue !== undefined) ? fieldValue
            : (this.pendingToken || game.settings.get("ionrift-resonance", "syrinToken") || "");

        if (!token) {
            // No token entered — local-only mode. Clear any previously stored token.
            await game.settings.set("ionrift-resonance", "syrinToken", "");
            ui.notifications.info("Resonance | Local-Only Mode — no Syrinscape token. Connect later via Module Settings.");
            return true;
        }

        // Verification Logic - Use a known element (Sword Clash 1035) instead of 'state' which can 400 if idle.
        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) {
            throw new Error(`Connection Failed (${response.status})`);
        }

        // Success - Save Token
        await game.settings.set("ionrift-resonance", "syrinToken", token);

        // Sync Logic (if mismatch)
        if (game.modules.get("syrinscape-control")?.active) {
            await game.settings.set("syrinscape-control", "authToken", token);
            this.reloadRequired = true; // Flag for reload on close
        }
    }

    async close(options = {}) {
        // Always save the attunement version so the wizard doesn't re-show.
        // This uses this.currentVersion set by AbstractWelcomeApp constructor.
        if (this.currentVersion) {
            await game.settings.set("ionrift-resonance", "setupVersion", this.currentVersion);
        }

        // If we synced with Syrinscape Control, we MUST reload to ensure it picks up the new token.
        if (this.reloadRequired) {
            const confirm = await Dialog.confirm({
                title: "Reload Required",
                content: `<p><strong>Syrinscape Control</strong> requires a reload to synchronize your new Auth Token.</p><p>Reload the world now?</p>`,
                defaultYes: true
            });

            if (confirm) {
                await super.close(options);
                window.location.reload();
                return;
            }
        }
        return super.close(options);
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
