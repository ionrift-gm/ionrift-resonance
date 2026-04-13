import { Logger } from "../Logger.js";

export class SetupApp extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-setup",
            title: "Resonance Calibration",
            template: "modules/ionrift-resonance/templates/setup-app.hbs",
            width: 750,
            height: "auto",
            classes: ["ionrift", "ionrift-window", "glass-ui"],
            closeOnSubmit: true
        });
    }

    getData() {
        const controlModule = game.modules.get("syrinscape-control");
        const controlActive = controlModule?.active;

        const ionToken = game.settings.get("ionrift-resonance", "syrinToken") || "";
        const controlToken = controlActive ? game.settings.get("syrinscape-control", "authToken") : null;

        const t1 = (ionToken || "").trim();
        const t2 = (controlToken || "").trim();
        // Mismatch if Ionrift has token, but it differs from Control (even if Control is empty)
        const tokenMismatch = controlActive && t1 && (t1 !== t2);

        return {
            token: ionToken,
            isWelcome: this.options.isWelcome ?? false,
            willSync: controlActive && !controlToken,
            tokenMismatch: tokenMismatch
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Header Indicator (Top Right)
        const setupContainer = html.find('.window-header'); // Or wherever appropriate
        // Use Library Manager if available
        if (game.ionrift?.integration) {
            game.ionrift.integration.injectStatusBar(this, html, 'ionrift-resonance');
        }


        // Sync Button
        html.find('[data-action="sync"]').click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const input = html.find('input[name="token"]');
            const token = input.val().trim();

            if (!token) {
                ui.notifications.warn("Please enter a token first.");
                return;
            }

            // Visual Feedback
            const icon = btn.find('i');
            const originalIcon = icon.attr('class');
            icon.attr('class', 'fas fa-spinner fa-spin');

            try {
                if (game.modules.get("syrinscape-control")?.active) {
                    await game.settings.set("syrinscape-control", "authToken", token);
                    await game.settings.set("ionrift-resonance", "syrinToken", token); // Ensure Ionrift is also set/saved

                    ui.notifications.info("Tokens Synchronized.");

                    // Hide warning using jQuery animation
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

        // Verify Button
        html.find('[data-action="verify"]').click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const input = html.find('input[name="token"]');
            const status = html.find('.status-pill');
            const token = input.val().trim();

            if (!token) {
                ui.notifications.warn("Please enter a token first.");
                return;
            }

            // Visual Feedback
            btn.find('i').attr('class', 'fas fa-spinner fa-spin');

            // Note: Status managed by centralized service now, but we update visual feedback for verify button
            if (game.ionrift?.integration) {
                // Force a check via the manager
                // game.ionrift.integration._runImmediateCheck() is internal, but the checkStatus fn we register will handle it
            }

            try {
                // Determine API endpoint (same as SoundHandler check)
                const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
                const response = await fetch(url, { method: 'GET' });

                if (response.ok) {
                    btn.find('i').attr('class', 'fas fa-check');

                    // Auto-save on verify
                    await game.settings.set("ionrift-resonance", "syrinToken", token);
                    await game.settings.set("ionrift-resonance", "authVerified", true); // Validation Success

                    // Sync to Syrinscape Control if installed
                    if (game.modules.get("syrinscape-control")?.active) {
                        await game.settings.set("syrinscape-control", "authToken", token);
                        ui.notifications.info("Token verified and synced to Syrinscape Control.");

                        // Hide warning if it was visible
                        html.find('.token-mismatch-warning').slideUp();
                    } else {
                        ui.notifications.info("Token verified and saved.");
                    }

                    // Trigger SoundHandler to update its internal state
                    if (game.ionrift?.handler) {
                        game.ionrift.handler.checkConfiguration();
                    }

                    // Force refresh status
                    if (game.ionrift?.integration) game.ionrift.integration._runImmediateCheck();


                } else {
                    // Fail
                    btn.find('i').attr('class', 'fas fa-times');
                    ui.notifications.error(`Connection Failed (${response.status}). Check Token.`);
                }
            } catch (e) {
                Logger.error(e);
                ui.notifications.error('Network Error.');
                btn.find('i').attr('class', 'fas fa-exclamation-triangle');
            }
        });
    }

    async _updateObject(event, formData) {
        const token = formData.token.trim();
        if (token) {
            await game.settings.set("ionrift-resonance", "syrinToken", token);
            ui.notifications.info("Ionrift Sounds: Configuration Saved.");

            // Re-run checks
            if (game.ionrift?.handler) {
                game.ionrift.handler.checkConfiguration();
            }
        }
    }
}
