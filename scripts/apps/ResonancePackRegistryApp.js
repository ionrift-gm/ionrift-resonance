/**
 * ResonancePackRegistryApp
 *
 * GM-only pack management panel for Ionrift Resonance sound packs.
 * Single tab: lists discovered packs from ionrift-data/resonance/packs/
 * with enable/disable toggles. Import button lets GMs install sound packs
 * from a downloaded ZIP file (the same flow as Respite art packs).
 *
 * Extends AbstractPackRegistryApp from ionrift-library.
 */

const { AbstractPackRegistryApp } = await import("../../../ionrift-library/scripts/apps/AbstractPackRegistryApp.js");
import { SoundPackLoader } from "../services/SoundPackLoader.js";

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

    // ═══════════════════════════════════════════════════════════════
    //  BASE CLASS OVERRIDES
    // ═══════════════════════════════════════════════════════════════

    _getModuleId() {
        return "ionrift-resonance";
    }

    _getTabDefinitions() {
        return [
            { id: "sounds", label: "Sound Packs", icon: "fas fa-music" }
        ];
    }

    async _preparePackData() {
        const loadedPacks = SoundPackLoader.getLoadedPacks();
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

    // ═══════════════════════════════════════════════════════════════
    //  SOUNDS TAB
    // ═══════════════════════════════════════════════════════════════

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
                <p>No sound packs installed.</p>
                <span>Click <strong>Import Sound Pack</strong> below to install a downloaded pack.</span>
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
            { href: "https://www.patreon.com/collection/2079931?view=expanded", icon: "fas fa-download", label: "Get packs" },
            { href: "https://github.com/ionrift-gm/ionrift-library/wiki", icon: "fas fa-book", label: "Documentation" }
        ]);

        html += this._renderActionButtons([
            { cls: "pack-import-btn", icon: "fas fa-file-import", label: "Import Sound Pack" },
            { cls: "pack-save-btn", icon: "fas fa-save", label: "Save Changes" }
        ]);

        panel.innerHTML = html;

        this._wireToggles(panel);

        panel.querySelector(".pack-import-btn")?.addEventListener("click", () => this._importSoundPack());
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

    // ═══════════════════════════════════════════════════════════════
    //  IMPORT FLOW
    // ═══════════════════════════════════════════════════════════════

    /**
     * Opens a file picker for a .zip sound pack, pre-reads the manifest
     * to determine the packId, then delegates to ZipImporterService to
     * extract into ionrift-data/resonance/packs/{packId}/.
     *
     * After import: auto-enables the pack, re-inits SoundPackLoader,
     * and re-renders the UI.
     */
    async _importSoundPack() {
        // Gate: need the library's zip importer
        const lib = game.ionrift?.library;
        if (!lib?.importZipFromFile) {
            ui.notifications.error("Ionrift Library v1.7.0+ is required for sound pack imports.");
            return;
        }

        // Pick a file
        const file = await this._pickZipFile();
        if (!file) return;

        // Pre-read to extract packId from manifest
        const packId = await this._readPackIdFromZip(file);
        if (!packId) {
            ui.notifications.error("Sound pack ZIP must contain a manifest.json with an \"id\" field.");
            return;
        }

        // Ensure the packs root directory exists before importing.
        // ZipImporterService creates ionrift-data/resonance and the pack subdirectory,
        // but the intermediate "packs" directory must exist first.
        const FP = foundry.applications?.apps?.FilePicker ?? FilePicker;
        const packsRoot = "ionrift-data/resonance/packs";
        try { await FP.browse("data", packsRoot); } catch {
            try {
                await FP.createDirectory("data", "ionrift-data/resonance/packs");
            } catch (e) {
                // May already exist or platform-blocked — ZipImporter will retry
                console.warn("ResonancePackRegistry | Could not pre-create packs dir:", e.message);
            }
        }

        // Delegate to ZipImporterService — routes to ionrift-data/resonance/packs/{packId}/
        const result = await lib.importZipFromFile(file, {
            moduleId: "resonance",
            assetType: `packs/${packId}`,
            allowedExtensions: [".json", ".mp3", ".wav", ".ogg", ".webm", ".flac"],
            maxSizeMB: 200
        });

        if (!result || result.imported === 0) return;

        // Auto-enable the newly imported pack
        try {
            const settings = game.settings.get("ionrift-resonance", "installedSoundPacks") ?? {};
            settings[packId] = true;
            await game.settings.set("ionrift-resonance", "installedSoundPacks", settings);
        } catch (e) {
            console.warn("ResonancePackRegistry | Failed to auto-enable pack:", e);
        }

        // Re-init SoundPackLoader to pick up the new pack
        await SoundPackLoader.init();

        ui.notifications.info(`Sound pack "${packId}" imported. ${result.imported} files installed.`);
        this.render({ force: true });
    }

    /**
     * Opens a browser file picker restricted to .zip files.
     * @returns {Promise<File|null>}
     */
    _pickZipFile() {
        return new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".zip";
            input.addEventListener("change", (e) => resolve(e.target.files?.[0] ?? null));
            input.addEventListener("cancel", () => resolve(null));
            input.click();
        });
    }

    /**
     * Reads the manifest.json from a zip file to extract the pack ID.
     * Uses the library's vendored JSZip.
     * @param {File} file
     * @returns {Promise<string|null>}
     */
    async _readPackIdFromZip(file) {
        try {
            // Load JSZip — it's vendored in ionrift-library
            if (!window.JSZip) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = "modules/ionrift-library/scripts/vendor/jszip.min.js";
                    script.onload = resolve;
                    script.onerror = () => reject(new Error("Failed to load JSZip"));
                    document.head.appendChild(script);
                });
            }

            const buffer = await file.arrayBuffer();
            const zip = await window.JSZip.loadAsync(buffer);

            // Look for manifest.json at the root
            const manifestEntry = zip.file("manifest.json");
            if (!manifestEntry) {
                console.warn("ResonancePackRegistry | No manifest.json found in zip root.");
                return null;
            }

            const text = await manifestEntry.async("text");
            const manifest = JSON.parse(text);

            if (!manifest.id || typeof manifest.id !== "string") {
                console.warn("ResonancePackRegistry | manifest.json missing 'id' field.");
                return null;
            }

            return manifest.id;
        } catch (e) {
            console.error("ResonancePackRegistry | Failed to read pack manifest from zip:", e);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SAVE
    // ═══════════════════════════════════════════════════════════════

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
