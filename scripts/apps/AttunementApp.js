
import { AbstractWelcomeApp } from "/modules/ionrift-library/scripts/apps/AbstractWelcomeApp.js";
import { Logger } from "../Logger.js";
import { SyrinscapeProvider } from "../providers/SyrinscapeProvider.js";
import { SoundPackLoader } from "../services/SoundPackLoader.js";
import { CORE_SFX_PATREON_URL } from "../constants.js";
import { openResonancePackLibrary } from "../openResonancePackLibrary.js";


/**
 * Ionrift Resonance Setup wizard.
 * Syrinscape connection and Core SFX Pack via Patreon Library.
 */
export class AttunementApp extends AbstractWelcomeApp {
    // Must match ATTUNEMENT_VERSION in module.js - bump both together at release
    static VERSION = "1";

    constructor(attunementVersion, options = {}) {
        // Fall back to static VERSION so module-settings instantiation (no args)
        // still gets the correct version and shows the Protocol Complete state.
        super("Resonance Setup", "setupVersion", attunementVersion ?? AttunementApp.VERSION);

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
            title: "Resonance Setup"
        });
    }


    activateListeners(html) {
        super.activateListeners(html); // wires step-action-btn, finish-btn, reset-btn via parent

        // Token input -> update in-memory state on change
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

    /**
     * Checks sound pack status. This is a verification step -- no settings are
     * written. The template shows pack status and provides download/import
     * actions; the continue button simply advances the wizard.
     */
    async _checkSoundPacks() {
        Logger.log("Attunement | Sound packs step completed.");
        return true;
    }

    _getIntroText() { return ""; }

    _getCompleteMessage() {
        return "Resonance is ready. Re-run setup anytime to update your Syrinscape token or manage sound packs.";
    }

    getSteps() {
        return [
            {
                id: "connect_syrinscape",
                title: "Sound Provider",
                icon: "fas fa-plug",
                description: "Connect Syrinscape to extend the SFX Pack with cloud-hosted sounds.",
                actionLabel: "Verify & Connect",
                actionHidden: true, // Both paths handled inside content - outer button suppressed
                content: () => this._getTokenStepContent()
            },
            {
                id: "sound_packs",
                title: "Sound Packs",
                icon: "fas fa-music",
                description: "Verify your sound library is installed and ready.",
                actionLabel: "Continue",
                actionHidden: true, // Continue button is inside the template
                content: () => this._getSoundPacksStepContent()
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
        const mismatch = SyrinscapeProvider.hasMismatch();
        const hasSyrinControl = SyrinscapeProvider.hasControlModule();
        const hasToken = SyrinscapeProvider.isConfigured();
        const expandSyrin = !!(hasToken || mismatch);

        return await renderTemplate("modules/ionrift-resonance/templates/partials/attunement-step-token.hbs", {
            token: currentToken,
            mismatch: mismatch,
            hasSyrinControl: hasSyrinControl,
            hasToken: hasToken,
            expandSyrin: expandSyrin
        });
    }

    async _getSoundPacksStepContent() {
        const packs = SoundPackLoader.getLoadedPacks();
        const enabledPacks = packs.filter(p => p.enabled);
        const totalBindings = enabledPacks.reduce((sum, p) => sum + p.bindingCount, 0);
        const isLocked = !this.completedSteps?.has("connect_syrinscape");

        return await renderTemplate("modules/ionrift-resonance/templates/partials/attunement-step-preset.hbs", {
            packs: packs,
            hasPacks: enabledPacks.length > 0,
            enabledCount: enabledPacks.length,
            singlePack: enabledPacks.length === 1,
            bindingCount: totalBindings,
            isLocked: isLocked
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Symmetric accordion - each toggle expands its panel, collapses the other
        const makeAccordion = (toggleSel, sectionSel, chevronSel, otherSectionSel, otherChevronSel) => {
            html.find(toggleSel).click(() => {
                const isOpen = html.find(sectionSel).is(":visible");
                html.find(sectionSel).toggle(!isOpen);
                html.find(chevronSel)
                    .toggleClass("fa-chevron-right", isOpen)
                    .toggleClass("fa-chevron-down", !isOpen);
                // Collapse the other panel
                html.find(otherSectionSel).hide();
                html.find(otherChevronSel)
                    .removeClass("fa-chevron-down").addClass("fa-chevron-right");
            });
        };
        makeAccordion(".foundry-toggle", ".foundry-section", ".foundry-chevron", ".syrin-section", ".syrin-chevron");
        makeAccordion(".syrin-toggle", ".syrin-section", ".syrin-chevron", ".foundry-section", ".foundry-chevron");

        // Skip button - clears token field then fires the step action so _verifyConnection
        // reads an empty DOM value and proceeds as local-only
        html.find(".skip-provider-btn").click((ev) => {
            ev.preventDefault();
            html.find(".attunement-token-input").val("");
            html.find(".step-action-btn[data-step='connect_syrinscape']").trigger("click");
        });

        // Verify Syrinscape button - token must be present; empty = redirect to Foundry Audio path
        html.find(".verify-syrinscape-btn").click((ev) => {
            ev.preventDefault();
            const token = html.find(".attunement-token-input").val()?.trim();
            if (!token) {
                ui.notifications.warn("Enter a Syrinscape token, or use 'Foundry Audio Only' to proceed without one.");
                return;
            }
            html.find(".step-action-btn[data-step='connect_syrinscape']").trigger("click");
        });

        // Sound Packs step -- continue button fires the (hidden) step action
        html.find(".sound-packs-continue-btn").click((ev) => {
            ev.preventDefault();
            if (!this.completedSteps?.has("connect_syrinscape")) {
                ui.notifications.warn("Complete the Sound Provider step first.");
                return;
            }
            html.find(".step-action-btn[data-step='sound_packs']").trigger("click");
        });

        html.find(".sound-packs-download-btn").click((ev) => {
            ev.preventDefault();
            window.open(CORE_SFX_PATREON_URL, "_blank");
        });

        html.find(".sound-packs-library-btn").click(async (ev) => {
            ev.preventDefault();
            await this._openResonancePackLibrary();
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
        } else if (stepId === "sound_packs") {
            return await this._checkSoundPacks();
        } else if (stepId === "verification") {
            return await this._runDiagnostics();
        }
    }

    async _verifyConnection() {
        // Read directly from the DOM input - if the user cleared the field it will be ""
        // Don't fall back to stored token when the field is present and explicitly empty.
        const inputEl = this.element?.find(".attunement-token-input");
        const fieldValue = inputEl?.length ? inputEl.val().trim() : undefined;
        const token = (fieldValue !== undefined) ? fieldValue
            : (this.pendingToken || game.settings.get("ionrift-resonance", "syrinToken") || "");

        if (!token) {
            // No token entered - local-only mode. Clear any previously stored token.
            await game.settings.set("ionrift-resonance", "syrinToken", "");
            ui.notifications.info("Resonance | Local-Only Mode - no Syrinscape token. Connect later via Module Settings.");
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
        // Only persist setup as complete if the user actually finished the final verification step.
        // Closing early (X button) should NOT mark the wizard as done.
        if (this.currentVersion && this.completedSteps?.has("verification")) {
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



    async _openResonancePackLibrary() {
        await openResonancePackLibrary();
    }

    async _runDiagnostics() {
        if (game.ionrift?.integration) {
            game.ionrift.integration.refresh();
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Visual delay

        // Check whether the Creature Index is configured -- Resonance needs it for Adaptive Sounds.
        // The library no longer auto-pops the wizard; we surface a notice here instead.
        try {
            const INDEXING_PROTOCOL_VERSION = "1";
            const indexVersion = game.settings.get("ionrift-library", "indexSetupVersion");
            const isIndexReady = (indexVersion === INDEXING_PROTOCOL_VERSION);

            if (!isIndexReady) {
                ui.notifications.info(
                    "Resonance | Adaptive Sounds works best with the Creature Index configured. " +
                    "Open Module Settings → Ionrift Library → Creature Index to run setup.",
                    { permanent: false }
                );
                Logger.log("Resonance Attunement | Creature Index not yet configured (indexSetupVersion !== 1). " +
                    "Adaptive Sounds will use name-only heuristics until the index is set up.");
            }
        } catch (e) {
            // Graceful fail -- if library settings aren't available, don't block attunement
            Logger.warn("Resonance Attunement | Could not read library index state:", e);
        }
    }

    _checkTokenMismatch(token) {
        if (!token) return false;
        const controlMod = game.modules.get("syrinscape-control");
        if (!controlMod?.active) return false;

        const controlToken = game.settings.get("syrinscape-control", "authToken") || "";
        return controlToken.trim() !== token.trim();
    }

}
