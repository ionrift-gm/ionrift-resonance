const { AbstractPackRegistryApp } = await import("../../../../ionrift-library/scripts/apps/packs/AbstractPackRegistryApp.js");
import { getSoundPackLoader } from "../../composition/accessors.js";

export class ResonancePackRegistryApp extends AbstractPackRegistryApp {

    static DEFAULT_OPTIONS = {
        id: "resonance-pack-registry",
        window: {
            title: "Resonance Sound Packs",
            icon: "fas fa-music",
            resizable: true
        },
        position: { width: 460, height: 480 },
        classes: ["ionrift-window"]
    };

    // --  BASE CLASS OVERRIDES
    _getModuleId() {
        return "ionrift-resonance";
    }

    _getTabDefinitions() {
        return [
            { id: "sounds", label: "Sound Packs", icon: "fas fa-music" }
        ];
    }

    async _preparePackData() {
        const loadedPacks = getSoundPackLoader().getLoadedPacks();
        const packs = loadedPacks.map(p => ({
            id: p.id,
            label: p.name,
            icon: "fas fa-volume-up",
            description: p.description || "Sound pack",
            enabled: p.enabled,
            totalItems: p.bindingCount,
            version: p.version,
            countLabel: "bindings",
            author: p.author
        }));

        packs.sort((a, b) => a.label.localeCompare(b.label));
        return { packs, extra: {} };
    }

    async _renderTabPanel(tabId, context, panel) {
        if (tabId === "sounds") {
            await this._renderSoundsTab(context, panel);
        }
    }

    _isUpdateRelevant(update) {
        return update.packId?.startsWith("resonance-") || update.packType === "sound";
    }

    // --  SOUNDS TAB
    async _renderSoundsTab(context, panel) {
        let html = `<div class="pack-tab-content">`;

        html += this._renderSummaryBar([
            { label: "active bindings", value: context.totalEnabled },
            { label: "packs enabled", value: context.packs.filter(p => p.enabled).length },
            { label: "total available", value: context.totalAll }
        ]);

        html += this._renderUpdateBanner(context.pendingUpdates);

        if (context.packs.length === 0) {
            html += `
            <div class="art-empty-state">
                <i class="fas fa-music"></i>
                <p>No sound packs installed locally.</p>
                <span>This panel manages packs already present on disk. Pack downloads are outside the listed module.</span>
            </div>`;
        } else {
            html += `<div class="pack-section-header"><i class="fas fa-volume-up"></i> Installed Packs</div>`;
            for (const pack of context.packs) {
                const bodyHtml = this._renderSoundCardBody(pack);
                html += this._renderPackCard(pack, bodyHtml);
            }
        }

        html += `</div>`;

        html += this._renderFooterLinks([
            { href: "https://github.com/ionrift-gm/ionrift-library/wiki", icon: "fas fa-book", label: "Documentation" }
        ]);

        if (context.packs.length > 0) {
            html += this._renderActionButtons([
                { cls: "pack-save-btn", icon: "fas fa-save", label: "Save Changes" }
            ]);
        }

        panel.innerHTML = html;

        this._wireToggles(panel);
        panel.querySelector(".pack-save-btn")?.addEventListener("click", () => this._onSave(panel));
    }

    /**
     * Card body showing author and binding count.
     */
    _renderSoundCardBody(pack) {
        const authorBadge = pack.author
            ? `<span class="pack-terrain-badge"><i class="fas fa-user"></i> ${pack.author}</span>`
            : "";
        const bindingBadge = `<span class="pack-terrain-badge"><i class="fas fa-link"></i> ${pack.totalItems} bindings</span>`;
        return `<div class="pack-terrain-list">${authorBadge}${bindingBadge}</div>`;
    }

    // --  SAVE
    async _onSave(el) {
        const updated = {};
        el.querySelectorAll(".pack-toggle-input").forEach(cb => {
            updated[cb.dataset.packId] = cb.checked;
        });

        await game.settings.set("ionrift-resonance", "installedSoundPacks", updated);
        ui.notifications.info("Sound pack settings saved. Reload to apply binding changes.");
        this.close();
    }
}
