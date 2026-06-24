import { Logger } from "../Logger.js";
import { SyrinscapeProvider } from "../providers/SyrinscapeProvider.js";

/**
 * Optional Syrinscape auth token configuration.
 * Core SFX Pack install and readiness are handled by Patreon Library and the
 * shared pack nudge; this dialog only covers cloud-hosted Syrinscape playback.
 */
export class SyrinscapeConfigApp extends FormApplication {
    constructor(options = {}) {
        super(options);
        this.pendingToken = "";
        this.reloadRequired = false;
        /** @type {"foundry"|"syrinscape"|"none"|null} null = use default from token state */
        this.expandedPanel = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-resonance-syrinscape",
            title: "Audio Mode",
            template: "modules/ionrift-resonance/templates/syrinscape-config.hbs",
            width: 520,
            height: "auto",
            classes: ["ionrift", "ionrift-window", "glass-ui", "ionrift-resonance-syrinscape-app"],
            closeOnSubmit: true,
            scrollY: [".syrinscape-config-body"]
        });
    }

    _defaultExpandedPanel(hasToken, mismatch) {
        return (hasToken || mismatch) ? "syrinscape" : "foundry";
    }

    _resolveExpandedPanels(hasToken, mismatch) {
        if (this.expandedPanel === "none") {
            return { expandFoundry: false, expandSyrin: false };
        }
        const active = this.expandedPanel ?? this._defaultExpandedPanel(hasToken, mismatch);
        return {
            expandFoundry: active === "foundry",
            expandSyrin: active === "syrinscape"
        };
    }

    async getData() {
        const token = this.pendingToken || game.settings.get("ionrift-resonance", "syrinToken") || "";
        const mismatch = SyrinscapeProvider.hasMismatch();
        const hasSyrinControl = SyrinscapeProvider.hasControlModule();
        const hasToken = SyrinscapeProvider.isConfigured();
        const isFoundryActive = !hasToken;
        const isSyrinscapeActive = hasToken;
        const { expandFoundry, expandSyrin } = this._resolveExpandedPanels(hasToken, mismatch);

        const tokenPanel = await renderTemplate(
            "modules/ionrift-resonance/templates/partials/attunement-step-token.hbs",
            {
                token,
                mismatch,
                hasSyrinControl,
                hasToken,
                isFoundryActive,
                isSyrinscapeActive,
                expandFoundry,
                expandSyrin
            }
        );

        return {
            token,
            mismatch,
            hasSyrinControl,
            hasToken,
            isFoundryActive,
            isSyrinscapeActive,
            expandFoundry,
            expandSyrin,
            hasActiveToken: !!token.trim(),
            tokenPanel
        };
    }

    async _render(force, options = {}) {
        const scrollTop = this.element?.find(".syrinscape-config-body")?.scrollTop() ?? 0;
        await super._render(force, options);
        this._syncLayout();
        const body = this.element?.find(".syrinscape-config-body");
        if (body?.length) body.scrollTop(scrollTop);
    }

    /**
     * Recompute scroll region and window height after accordion or content changes.
     */
    _syncLayout() {
        if (!this.rendered || !this.element?.length) return;

        requestAnimationFrame(() => {
            if (!this.rendered || !this.element?.length) return;

            const body = this.element.find(".syrinscape-config-body")[0];
            const footer = this.element.find(".syrinscape-config-footer")[0];
            const windowContent = this.element.find(".window-content")[0];
            if (!body || !footer) return;

            const chromeHeight = (this.element[0]?.querySelector(".window-header")?.offsetHeight ?? 0)
                + footer.offsetHeight
                + 8;
            const maxBody = Math.max(220, Math.floor(window.innerHeight * 0.8) - chromeHeight);
            body.style.maxHeight = `${maxBody}px`;

            if (windowContent) {
                windowContent.style.maxHeight = `${maxBody + footer.offsetHeight}px`;
            }

            this.setPosition({
                width: this.position.width,
                height: "auto",
                left: this.position.left,
                top: this.position.top
            });
        });
    }

    async _togglePanel(panel) {
        const hasToken = SyrinscapeProvider.isConfigured();
        const mismatch = SyrinscapeProvider.hasMismatch();
        const current = this.expandedPanel === "none"
            ? "none"
            : (this.expandedPanel ?? this._defaultExpandedPanel(hasToken, mismatch));
        this.expandedPanel = current === panel ? "none" : panel;
        await this.render(false);
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".syrinscape-provider-toggle[data-panel]").click(async (ev) => {
            ev.preventDefault();
            const panel = ev.currentTarget.dataset.panel;
            if (panel === "foundry" || panel === "syrinscape") {
                await this._togglePanel(panel);
            }
        });

        html.find(".attunement-token-input").on("input", (ev) => {
            this.pendingToken = ev.target.value.trim();
        });

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

        const onLocalOnly = async () => {
            await this._saveToken("");
            ui.notifications.info("Resonance | Local-only mode. Syrinscape token cleared.");
            this.pendingToken = "";
            this.expandedPanel = "foundry";
            await this.render(false);
            if (game.ionrift?.handler) game.ionrift.handler.checkConfiguration();
            if (game.ionrift?.integration) game.ionrift.integration._runImmediateCheck?.();
        };

        html.find(".skip-provider-btn").click(async (ev) => {
            ev.preventDefault();
            await onLocalOnly();
        });

        html.find(".verify-syrinscape-btn").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const icon = btn.find("i");
            const originalIcon = icon.attr("class");
            icon.attr("class", "fas fa-spinner fa-spin");
            btn.prop("disabled", true);

            try {
                const inputEl = html.find(".attunement-token-input");
                const token = inputEl.val()?.trim() ?? "";
                if (!token) {
                    ui.notifications.warn("Enter a Syrinscape token, or use Foundry Audio Only to clear the stored token.");
                    return;
                }
                await this._verifyAndSave(token);
                this.pendingToken = token;
                this.expandedPanel = "syrinscape";
                await this.render(false);
            } catch (err) {
                Logger.error("SyrinscapeConfig | verify failed", err);
                ui.notifications.error(`Resonance | ${err.message}`);
            } finally {
                btn.prop("disabled", false);
                icon.attr("class", originalIcon);
            }
        });

        html.find('[data-action="sync"]').click(async (ev) => {
            ev.preventDefault();
            const token = html.find(".attunement-token-input").val()?.trim()
                || game.settings.get("ionrift-resonance", "syrinToken") || "";
            if (!token) {
                ui.notifications.warn("Enter a token before syncing to Syrinscape Control.");
                return;
            }
            if (!game.modules.get("syrinscape-control")?.active) {
                ui.notifications.warn("Syrinscape Control module is not active.");
                return;
            }
            await game.settings.set("syrinscape-control", "authToken", token);
            await game.settings.set("ionrift-resonance", "syrinToken", token);
            this.reloadRequired = true;
            ui.notifications.info("Tokens synchronized with Syrinscape Control.");
            await this.render(false);
            if (game.ionrift?.handler) game.ionrift.handler.checkConfiguration();
            if (game.ionrift?.integration) game.ionrift.integration._runImmediateCheck?.();
        });
    }

    async _verifyAndSave(token) {
        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${token}`;
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) {
            throw new Error(`Connection failed (${response.status}). Check the token.`);
        }

        await this._saveToken(token);
        await game.settings.set("ionrift-resonance", "authVerified", true);

        if (game.modules.get("syrinscape-control")?.active) {
            await game.settings.set("syrinscape-control", "authToken", token);
            this.reloadRequired = true;
            ui.notifications.info("Token verified and synced to Syrinscape Control.");
        } else {
            ui.notifications.info("Syrinscape token verified and saved.");
        }

        if (game.ionrift?.handler) game.ionrift.handler.checkConfiguration();
        if (game.ionrift?.integration) game.ionrift.integration._runImmediateCheck?.();
    }

    async _saveToken(token) {
        await game.settings.set("ionrift-resonance", "syrinToken", token);
        if (!token) await game.settings.set("ionrift-resonance", "authVerified", false);
    }

    async _updateObject(_event, formData) {
        const token = (formData.authToken ?? formData.token ?? "").trim();
        await this._saveToken(token);
        if (token) {
            ui.notifications.info("Syrinscape configuration saved.");
        }
        if (game.ionrift?.handler) game.ionrift.handler.checkConfiguration();
    }

    async close(options = {}) {
        if (this.reloadRequired) {
            const confirm = await Dialog.confirm({
                title: "Reload Required",
                content: "<p><strong>Syrinscape Control</strong> requires a reload to pick up the new auth token.</p><p>Reload the world now?</p>",
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
}
