/**
 * SoundConfigActions — Picker, Preview, Import/Export, Positional, and Drop
 * methods mixed into SoundConfigApp.prototype.
 */

import { SYRINSCAPE_DEFAULTS } from "../../data/syrinscape/syrinscape_defaults.js";
import { Logger } from "../../utils/Logger.js";
import { SOUND_TYPES } from "../../data/soundTypes.js";
import { getSoundPackLoader } from "../../composition/accessors.js";
import { DEFAULT_POSITIONAL_CATEGORIES, voiceModuleActive } from "../../services/playback/SpatialSettings.js";

export const soundConfigActionsMethods = {

    async _onReset(event) {
        event.preventDefault();
        const button = event.currentTarget;
        let key = button.dataset.key;
        if (!key) {
            const row = button.closest(".entity-row");
            key = row?.dataset?.key;
        }

        if (!key) return;

        await this._saveBinding(key, null);
    },

    async _saveBinding(key, value) {
        const currentBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        if (value === null || value === undefined) {
            delete currentBindings[key];
        } else {
            currentBindings[key] = value;
        }

        await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(currentBindings));

        this.render(true);
    },

    async _onSearch(event) {
        event.preventDefault();
        const button = event.currentTarget;

        let key = button.dataset.key;
        if (!key) {
            const row = button.closest(".entity-row");
            key = row?.dataset?.key;
        }

        const row = button.closest(".entity-row");
        const humanLabel = row?.querySelector(".entity-name")?.textContent?.trim() || key;

        if (!key) {
            Logger.error("Could not find key for sound config button.", button);
            return;
        }

        let currentValue = "";

        const customBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");

        if (customBindings[key]) {
            currentValue = customBindings[key];
        } else {
            const packBindings = getSoundPackLoader().loaded ? getSoundPackLoader().getMergedBindings() : {};
            if (packBindings[key]) {
                currentValue = packBindings[key];
            } else {
                const row = this.element.find(`.entity-row[data-key="${key}"]`);
                if (row.length) {
                    const input = row.find("input");
                    currentValue = input.val();
                }
            }
        }

        if (currentValue && typeof currentValue !== "string") {
            currentValue = JSON.stringify(currentValue);
        }

        try {
            const { SoundPickerApp } = await import("../browse/SoundPickerApp.js");

            new SoundPickerApp(async (result) => {
                if (result === null) {
                    await this._saveBinding(key, null);
                    return;
                }

                let storageValue = result.id;

                if (result.items && Array.isArray(result.items) && result.items.length > 0) {
                    const configMap = result.config || {};

                    const richData = result.items.map(item => {
                        const itemConfig = configMap[item.id] || {};
                        return {
                            id: item.id,
                            name: item.name || `ID: ${item.id}`,
                            type: item.type || SOUND_TYPES.ONESHOT,
                            config: {
                                delayMin: itemConfig.delayMin || 0,
                                delayMax: itemConfig.delayMax || 0
                            }
                        };
                    });

                    if (richData.length === 1) {
                        storageValue = JSON.stringify(richData[0]);
                    } else {
                        storageValue = JSON.stringify(richData);
                    }
                } else if (result.name) {
                    storageValue = JSON.stringify({
                        id: result.id,
                        name: result.name,
                        type: result.type,
                        config: result.config || {}
                    });
                }

                Logger.log(`Auto-Saving ${key}:`, storageValue);
                await this._saveBinding(key, storageValue);
            }, {
                bindings: (() => {
                    if (currentValue && currentValue.trim() !== "") {
                        try {
                            const v = currentValue.trim();

                            if (v.startsWith("{")) {
                                const obj = JSON.parse(v);
                                return [{
                                    id: obj.id,
                                    name: obj.name || `ID: ${obj.id}`,
                                    type: obj.type || SOUND_TYPES.ONESHOT,
                                    meta: "Custom Override",
                                    delayMin: obj.config?.delayMin || 0,
                                    delayMax: obj.config?.delayMax || 0
                                }];
                            }

                            if (v.startsWith("[")) {
                                const list = JSON.parse(v);
                                return list.map(obj => ({
                                    id: obj.id,
                                    name: obj.name || `ID: ${obj.id}`,
                                    type: obj.type || SOUND_TYPES.ONESHOT,
                                    meta: "Custom Loop",
                                    delayMin: obj.config?.delayMin || 0,
                                    delayMax: obj.config?.delayMax || 0
                                }));
                            }

                            if (v.includes(",")) {
                                return v.split(",").map(id => ({
                                    id: id.trim(),
                                    name: `ID: ${id.trim()}`,
                                    type: SOUND_TYPES.ONESHOT,
                                    meta: "Custom Loop"
                                }));
                            }

                            return [{
                                id: v,
                                name: `ID: ${v}`,
                                type: SOUND_TYPES.ONESHOT,
                                meta: "Custom Override"
                            }];

                        } catch (e) {
                            Logger.warn("Error parsing current value for picker:", e);
                        }
                    }

                    const soundPreset = game.settings.get("ionrift-resonance", "soundPreset") ?? "none";
                    if (soundPreset !== "none" && key && SYRINSCAPE_DEFAULTS[key]) {
                        const def = SYRINSCAPE_DEFAULTS[key];
                        if (Array.isArray(def)) {
                            return def.map(d => {
                                if (typeof d === "string") return { id: d, name: `ID: ${d}`, meta: "Default" };
                                return { ...d, meta: "Default" };
                            });
                        } else {
                            if (typeof def === "string") return [{ id: def, name: `ID: ${def}`, meta: "Default" }];
                            return [{ ...def, meta: "Default" }];
                        }
                    }

                    return [];
                })(),
                currentSoundId: "",
                soundKey: key,
                title: game.i18n.format("ionrift-resonance.config.pickSoundTitle", { label: humanLabel }),
                soundConfig: (() => {
                    try {
                        const v = currentValue.trim();
                        if (v.startsWith("{")) {
                            const obj = JSON.parse(v);
                            if (obj.config) return { [obj.id]: obj.config };
                        }
                    } catch (e) { }
                    return {};
                })()
            }).render(true);

        } catch (e) {
            console.error("Ionrift Sound Config | Failed to load SoundPickerApp:", e);
            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.soundConfigRequiredForSearch"));
        }
    },

    async _onPositionalMaster(event) {
        if (!voiceModuleActive()) {
            event.currentTarget.checked = false;
            return;
        }
        await game.settings.set("ionrift-resonance", "positionalSfx", event.currentTarget.checked === true);
    },

    async _onPositionalCategory(event) {
        const id = event.currentTarget.dataset.category;
        const stored = game.settings.get("ionrift-resonance", "positionalCategories") || {};
        const next = { ...DEFAULT_POSITIONAL_CATEGORIES, ...stored, [id]: event.currentTarget.checked === true };
        await game.settings.set("ionrift-resonance", "positionalCategories", next);
    },

    async _onHearPositional(event) {
        const value = event.currentTarget.value === "normal" ? "normal" : "follow";
        await game.settings.set("ionrift-resonance", "hearPositionalSfx", value);
    },

    async _onAddRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target;
        const currentConfig = game.settings.get("ionrift-resonance", "configOverrides") || {};

        if (!currentConfig[target]) currentConfig[target] = [];

        if (target === "campaign") {
            currentConfig.campaign.push({ actor: "", item: "", sound: "" });
        } else if (target === "players") {
            currentConfig.players.push({ name: "", death: "", pain: "" });
        }

        await game.settings.set("ionrift-resonance", "configOverrides", currentConfig);
        this.render(true);
    },

    async _onDeleteRow(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target;
        const index = event.currentTarget.dataset.index;

        const currentConfig = game.settings.get("ionrift-resonance", "configOverrides") || {};
        if (currentConfig[target]) {
            currentConfig[target].splice(index, 1);
            await game.settings.set("ionrift-resonance", "configOverrides", currentConfig);
            this.render(true);
        }
    },

    _onExportConfig(event) {
        event.preventDefault();
        const bindings = game.settings.get("ionrift-resonance", "customSoundBindings");
        const overrides = game.settings.get("ionrift-resonance", "configOverrides");

        const exportData = {
            timestamp: Date.now(),
            version: "1.0.0",
            bindings: JSON.parse(bindings || "{}"),
            overrides: overrides || {}
        };

        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "text/json", "ionrift-resonance-config.json");
    },

    async _onLoadPreset(event) {
        event.preventDefault();

        const { SyrinscapeConfigApp } = await import("./SyrinscapeConfigApp.js");
        new SyrinscapeConfigApp().render(true);
    },

    async _onImportConfig(event) {
        event.preventDefault();

        if (this._importDialog && this._importDialog.rendered) {
            this._importDialog.bringToTop();
            return;
        }

        this._importDialog = new Dialog({
            title: game.i18n.localize("ionrift-resonance.config.importDialogTitle"),
            content: `
                <div class="form-group">
                    <label>${game.i18n.localize("ionrift-resonance.config.importDialogLabel")}</label>
                    <textarea name="json" style="width:100%; height: 200px; font-family: monospace;"></textarea>
                </div>
                <p class="notes">${game.i18n.localize("ionrift-resonance.config.importDialogNotes")}</p>
            `,
            buttons: {
                import: {
                    label: game.i18n.localize("ionrift-resonance.config.importBtn"),
                    icon: "<i class='fas fa-file-import'></i>",
                    callback: async (html) => {
                        const jsonStr = html.find("[name='json']").val();

                        if (!jsonStr || jsonStr.trim() === "") {
                            ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.importCancelledEmpty"));
                            return;
                        }

                        try {
                            const data = JSON.parse(jsonStr);

                            if (!data.version || !data.version.startsWith("1.")) {
                                ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.importLegacyVersion"));
                            }

                            if (data.bindings) {
                                await game.settings.set("ionrift-resonance", "customSoundBindings", JSON.stringify(data.bindings));
                            }
                            if (data.overrides) {
                                await game.settings.set("ionrift-resonance", "configOverrides", data.overrides);
                            }

                            ui.notifications.info(game.i18n.localize("ionrift-resonance.notification.configImportedSuccessfully"));
                            this.render(true);
                            game.ionrift.resonance?.handler?.loadConfig();
                        } catch (e) {
                            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.importFailedInvalidJson"));
                            console.error(e);
                        }
                    }
                }
            },
            default: "import",
            close: () => { this._importDialog = null; }
        }, {
            classes: ["ionrift", "ionrift-window", "dialog", "glass-ui"]
        });

        this._importDialog.render(true);
    },

    async _onPlayPreview(event) {
        event.preventDefault();
        const target = event.currentTarget;
        let soundKeyOrId = target.dataset.sound;
        let soundType = target.dataset.type;

        const row = target.closest("tr") || target.closest(".entity-row");
        const input = row?.querySelector("input");
        const inputValue = input ? input.value : null;

        if (input) {
            const val = input.value;
            if (val && val.trim() !== "") {
                soundKeyOrId = val;
            }
        } else if (inputValue && inputValue.trim() !== "") {
            soundKeyOrId = inputValue;
        }

        let idToPlay = soundKeyOrId;
        const playOptions = {};

        try {
            if (typeof soundKeyOrId === "string" && soundKeyOrId.trim().startsWith("{")) {
                const obj = JSON.parse(soundKeyOrId);
                idToPlay = obj.id;
                if (obj.type) soundType = obj.type;
            } else if (typeof soundKeyOrId === "string" && soundKeyOrId.trim().startsWith("[")) {
                const arr = JSON.parse(soundKeyOrId);
                if (Array.isArray(arr) && arr.length > 0) {
                    const pick = arr[Math.floor(Math.random() * arr.length)];
                    idToPlay = pick.id;
                    if (pick.type) soundType = pick.type;
                }
            }
        } catch (e) { }

        if (soundType) {
            if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
            else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
            else if (soundType === SOUND_TYPES.MUSIC_ELEMENT) playOptions.type = SOUND_TYPES.ELEMENT;
            else playOptions.type = SOUND_TYPES.ELEMENT;
        }

        const semanticKey = typeof soundKeyOrId === "string" ? soundKeyOrId.trim() : "";
        const isDirectAsset = this._isDirectPreviewAsset(idToPlay);

        if (!isDirectAsset && game.ionrift.resonance?.handler?.resolver) {
            const direct = game.ionrift.resonance?.handler?.resolver?.resolveKeyDirect(semanticKey);
            if (direct) {
                idToPlay = direct;
            } else {
                const fromRow = this._pickPreviewFromRowTags(row);
                if (fromRow) {
                    idToPlay = fromRow;
                } else if (semanticKey.endsWith("_ATTACK")) {
                    ui.notifications.warn(game.i18n.localize("ionrift-resonance.notification.noPreviewAudioUnboundAttack"));
                    return;
                } else {
                    const resolved = game.ionrift.resonance.handler.resolveSound(idToPlay);
                    if (resolved) {
                        if (typeof resolved === "string") {
                            idToPlay = resolved;
                        } else if (typeof resolved === "object") {
                            idToPlay = resolved.id;
                            if (resolved.type) {
                                soundType = resolved.type;
                                if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
                                else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
                                else playOptions.type = SOUND_TYPES.ELEMENT;
                            }
                        }
                    }
                }
            }
        } else if (!isDirectAsset && game.ionrift.resonance?.handler) {
            const resolved = game.ionrift.resonance.handler.resolveSound(idToPlay);
            if (resolved) {
                if (typeof resolved === "string") idToPlay = resolved;
                else if (typeof resolved === "object") {
                    idToPlay = resolved.id;
                    if (resolved.type) {
                        soundType = resolved.type;
                        if (soundType === SOUND_TYPES.GLOBAL_ONESHOT) playOptions.type = SOUND_TYPES.GLOBAL_ELEMENT;
                        else if (soundType === SOUND_TYPES.MOOD) playOptions.type = SOUND_TYPES.MOOD;
                        else playOptions.type = SOUND_TYPES.ELEMENT;
                    }
                }
            }
        }

        if (typeof idToPlay === "string" && idToPlay.includes(",")) {
            const parts = idToPlay.split(",").map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                idToPlay = parts[Math.floor(Math.random() * parts.length)];
            }
        }

        Logger.log(`Previewing: ${idToPlay}`, playOptions);

        if (game.ionrift.resonance?.manager) {
            game.ionrift.resonance?.manager?.play(idToPlay, playOptions);
        }
    },

    _isDirectPreviewAsset(value) {
        if (!value || typeof value !== "string") return false;
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
        return trimmed.includes("/")
            || trimmed.includes("\\")
            || /\.(mp3|wav|ogg|flac|m4a)$/i.test(trimmed)
            || /^\d+$/.test(trimmed);
    },

    _pickPreviewFromRowTags(row) {
        if (!row || row.classList.contains("muted-row")) return null;

        const badges = row.querySelectorAll(".entity-badges .ionrift-badge[title]");
        const candidates = [];
        for (const badge of badges) {
            const id = badge.getAttribute("title")?.trim();
            if (!id) continue;
            if (badge.textContent?.includes("No Sound Bound")) continue;
            candidates.push(id);
        }

        if (!candidates.length) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    },

    async _onStopAll(event) {
        event.preventDefault();
        if (game.ionrift.resonance?.manager) {
            game.ionrift.resonance?.manager?.stopAll();
            ui.notifications.info(game.i18n.localize("ionrift-resonance.notification.syrinscapeStopSignalSent"));
        }
    },

    async _onDrop(event) {
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return false;
        }

        if (!data) return false;

        const doc = await fromUuid(data.uuid);
        if (!doc) return false;

        if (doc.documentName === "Actor" || doc.documentName === "Item") {
            if (game.ionrift.resonance?.handler?.openSoundConfig) {
                game.ionrift.resonance.handler.openSoundConfig(doc);
            } else {
                try {
                    if (doc.documentName === "Actor") {
                        const { ActorSoundConfig } = await import("./ActorSoundConfig.js");
                        new ActorSoundConfig(doc).render(true);
                    } else {
                        const { ItemSoundConfig } = await import("./ItemSoundConfig.js");
                        new ItemSoundConfig(doc).render(true);
                    }
                } catch (e) {
                    ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.couldNotLoadConfig"));
                }
            }
        }
    }
};
