import { Logger } from "../Logger.js";

export class SetupGuide extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Attunement Protocol",
            id: "ionrift-resonance-setup",
            template: "modules/ionrift-resonance/templates/setup-guide.html",
            classes: ["ionrift-window", "ionrift"],
            width: 600,
            height: "auto",
            resizable: false,
            closeOnSubmit: true
        });
    }

    static pendingToken = null; // Stores live input for validation before save

    getData() {
        // FIX: Use correct setting key 'syrinToken'
        const ionToken = game.settings.get('ionrift-resonance', 'syrinToken');

        // Mismatch Detection
        const controlModule = game.modules.get("syrinscape-control");
        const controlActive = controlModule?.active;
        const controlToken = controlActive ? game.settings.get("syrinscape-control", "authToken") : null;

        const t1 = (ionToken || "").trim();
        const t2 = (controlToken || "").trim();
        // Mismatch if Ionrift has token, but it differs from Control (even if Control is empty)
        const tokenMismatch = controlActive && t1 && (t1 !== t2);

        return {
            syrinToken: ionToken || "",
            tokenMismatch: tokenMismatch,
            willSync: controlActive && !t2 // If control is active but empty, we will sync to it
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('#test-connection').click(this._testConnection.bind(this));

        // Live Validation Listener
        const tokenInput = html.find('input[name="syrinToken"]');
        tokenInput.on('input', (event) => {
            const val = event.target.value.trim();
            SetupGuide.pendingToken = val;

            // Debounce the refresh to avoid spamming API
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => {
                if (game.ionrift?.integration) game.ionrift.integration.refresh();
            }, 800);
        });

        if (game.ionrift?.integration) {
            setTimeout(() => {
                game.ionrift.integration.injectStatusBar(this, html, 'ionrift-resonance');
                this.setPosition({ height: "auto" }); // Recalculate height to fit new bar
            }, 100); // Slight delay to ensure DOM insertion
        }

        // Sync Button Listener
        html.find('[data-action="sync"]').click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const input = html.find('input[name="syrinToken"]'); // Note: name is syrinToken here
            const token = input.val().trim();

            if (!token) {
                ui.notifications.warn("Please enter a token first.");
                return;
            }

            const icon = btn.find('i');
            const originalIcon = icon.attr('class');
            icon.attr('class', 'fas fa-spinner fa-spin');

            try {
                if (game.modules.get("syrinscape-control")?.active) {
                    await game.settings.set("syrinscape-control", "authToken", token);
                    await game.settings.set("ionrift-resonance", "syrinToken", token);

                    ui.notifications.info("Tokens Synchronized.");
                    html.find('.token-mismatch-warning').slideUp();
                } else {
                    ui.notifications.warn("Syrinscape Control module not active.");
                }
            } catch (err) {
                Logger.error(err);
                ui.notifications.error("Failed to sync tokens.");
            } finally {
                icon.attr('class', originalIcon);
            }
        });
    }

    async _testConnection(event) {
        event.preventDefault();
        const button = $(event.currentTarget);
        const icon = button.find('i');

        // FIX: Read from form data correctly
        const rawToken = this.form.syrinToken.value;
        const token = rawToken ? rawToken.trim() : "";


        Logger.log("[SetupGuide] _testConnection triggered.");

        this.testPerformed = true;

        if (!token) {
            ui.notifications.warn("Please enter a token first.");
            return;
        }
        // Visual Loading State
        icon.removeClass().addClass('fas fa-spinner fa-spin');



        try {
            // Test against Syrinscape API
            const url = `https://syrinscape.com/online/frontend-api/state/?auth_token=${token}&format=json`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });

            if (response.ok) {
                ui.notifications.info("Syrinscape Connection Successful!");
                this.verifiedToken = token;
                // Note: We do NOT update global status here. Global status reflects SAVED state.
            } else {
                ui.notifications.error(`Connection Failed (${response.status}). Please check your token.`);
                this.verifiedToken = null;
            }
        } catch (error) {
            Logger.error(error);
            this.verifiedToken = null;
        } finally {
            icon.removeClass().addClass('fas fa-plug');
        }
    }

    async _updateObject(event, formData) {
        Logger.log("[SetupGuide] Saving Settings...");

        // FIX: Handle 'syrinToken' form data
        if (formData.syrinToken !== undefined) {
            const newToken = formData.syrinToken.trim(); // Trim on save
            const oldToken = game.settings.get('ionrift-resonance', 'syrinToken');
            const wasVerified = game.settings.get('ionrift-resonance', 'authVerified');

            // Strict Verification Logic
            let isVerified = false;
            if (this.testPerformed) {
                if (this.verifiedToken === newToken) isVerified = true;
            } else {
                if (newToken === oldToken && wasVerified) isVerified = true;
            }

            await game.settings.set('ionrift-resonance', 'authVerified', isVerified);
            await game.settings.set('ionrift-resonance', 'syrinToken', newToken);

            // Force Refresh to update UI immediately
            if (game.ionrift?.integration) {
                game.ionrift.integration.refresh();
            }

            ui.notifications.info("Ionrift Sounds | Auth Token Saved!");


        }
    }

    async close(options) {
        SetupGuide.pendingToken = null; // Reset on close
        return super.close(options);
    }
}
