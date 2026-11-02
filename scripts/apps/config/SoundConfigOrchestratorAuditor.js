/**
 * SoundConfigOrchestratorAuditor — Auditor, Orchestrator, and Taxonomy Volume
 * methods mixed into SoundConfigApp.prototype.
 */

import { Logger } from "../../utils/Logger.js";
import { getSoundOrchestrator } from "../../composition/accessors.js";
import { isFeatureFlagEnabled } from "../../data/featureFlags.js";

export const soundConfigOrchestratorAuditorMethods = {

    _getAuditorData() {
        const auditorItems = [];

        for (const actor of game.actors) {
            const flags = actor.flags["ionrift-resonance"];
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    if (key === "identity" || key === "soundPreset" || key === "sound_config" || key.endsWith("_name") || key.endsWith("_meta")) continue;
                    if (!val) continue;

                    const nameVal = flags[key + "_name"] || val;

                    let slotLabel = key.replace("sound_", "").replace(/_/g, " ");
                    slotLabel = slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1);

                    auditorItems.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        type: "Actor",
                        img: actor.img,
                        slot: slotLabel,
                        sound: nameVal,
                        key: key,
                        rawId: val
                    });
                }
            }
        }

        for (const item of game.items) {
            const flags = item.flags["ionrift-resonance"];
            if (flags) {
                for (const [key, val] of Object.entries(flags)) {
                    if (key === "sound_config" || key.endsWith("_name") || key.endsWith("_meta")) continue;
                    if (!val) continue;

                    const nameVal = flags[key + "_name"] || val;

                    let slotLabel = key.replace("sound_", "").replace(/_/g, " ");
                    slotLabel = slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1);

                    let soundLabel = nameVal;
                    let soundType = "";

                    if (soundLabel.includes("[OneshotElement]")) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeOneshot");
                        soundLabel = soundLabel.replace("[OneshotElement]", "").trim();
                    } else if (soundLabel.includes("GLOBAL:")) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeGlobal");
                    } else if (soundLabel.match(/^\d+$/)) {
                        soundType = game.i18n.localize("ionrift-resonance.config.auditor.typeId");
                    }

                    auditorItems.push({
                        uuid: item.uuid,
                        name: item.name,
                        type: "Item",
                        img: item.img,
                        slot: slotLabel,
                        sound: soundLabel,
                        soundType: soundType,
                        key: key,
                        rawId: val
                    });
                }
            }
        }

        const search = this._auditorSearch.toLowerCase().trim();
        let filtered = auditorItems;

        if (search) {
            filtered = auditorItems.filter(i =>
                i.name.toLowerCase().includes(search) ||
                (i.sound && i.sound.toLowerCase().includes(search)) ||
                (i.slot && i.slot.toLowerCase().includes(search))
            );
        }

        filtered.sort((a, b) => a.name.localeCompare(b.name));

        const totalCount = filtered.length;
        const totalPages = Math.ceil(totalCount / this._auditorLimit) || 1;

        if (this._auditorPage > totalPages) this._auditorPage = totalPages;
        if (this._auditorPage < 1) this._auditorPage = 1;

        const start = (this._auditorPage - 1) * this._auditorLimit;
        const paginated = filtered.slice(start, start + this._auditorLimit);

        return {
            items: paginated,
            total: totalCount,
            page: this._auditorPage,
            limit: this._auditorLimit,
            totalPages: totalPages,
            search: this._auditorSearch
        };
    },

    /**
     * Build data for the Orchestration tab.
     * Reads getSoundOrchestrator().DEFAULT_BUDGETS and the orchestratorConfig world setting.
     */
    _getOrchestratorData() {
        const CATEGORY_LABELS = {
            FEAR_STINGER: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryFearStinger"),
            FEAR_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryFearUse"),
            DH_HOPE_GAIN: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhHopeGain"),
            DH_HOPE_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhHopeUse"),
            DH_STRESS_GAIN: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhStressGain"),
            DH_STRESS_CLEAR: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhStressClear"),
            DH_ARMOR_USE: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhArmorUse"),
            DH_ARMOR_REPAIR: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhArmorRepair"),
            DH_OUTCOME: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryDhOutcome"),
            MONSTER_VOCAL: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryMonsterVocal"),
            PC_VOCAL: game.i18n.localize("ionrift-resonance.config.orchestrator.categoryPcVocal")
        };

        let budgets = {};
        let timing = {};
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); budgets = c.budgets ?? {}; timing = c.timing ?? {}; }
        } catch (e) { }

        const categories = Object.entries(getSoundOrchestrator().DEFAULT_BUDGETS).map(([id, defaultMs]) => {
            const override = budgets[id]?.budgetMs;
            const effectiveMs = override ?? defaultMs;
            return {
                id,
                label: CATEGORY_LABELS[id] ?? id,
                defaultMs,
                defaultLabel: defaultMs === 0 ? game.i18n.localize("ionrift-resonance.config.orchestrator.unlimited") : `${defaultMs}ms`,
                placeholderLabel: defaultMs === 0 ? "\u221e" : String(defaultMs),
                overrideMs: override !== undefined ? String(override) : "",
                hasOverride: override !== undefined,
                accentBorder: override !== undefined,
                isUnlimited: effectiveMs === 0
            };
        });

        const timingEntries = Object.entries(timing).map(([key, cfg]) => ({
            key,
            offsetMs: cfg.offsetMs ?? 0
        }));

        let offsets = {};
        try {
            const raw2 = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw2) { const c2 = JSON.parse(raw2); offsets = c2.offsets ?? {}; }
        } catch (e) { }

        const spellVocalEnabled = isFeatureFlagEnabled("SPELL_VOCAL_LAYER");
        const namedOffsets = Object.entries(getSoundOrchestrator().DEFAULT_OFFSETS)
            .filter(([id]) => spellVocalEnabled || id !== "SPELL_VOCAL_LEAD_IN")
            .map(([id, defaultMs]) => {
                const override = offsets[id];
                return {
                    id,
                    label: getSoundOrchestrator().OFFSET_LABELS[id] ?? id,
                    defaultMs,
                    overrideMs: override !== undefined ? String(override) : "",
                    hasOverride: override !== undefined,
                    accentBorder: override !== undefined
                };
            });

        return { categories, timing: timingEntries, hasTiming: timingEntries.length > 0, namedOffsets };
    },

    /**
     * Toggle mute/unmute on a sound event key.
     * Muting saves "__MUTED__" sentinel. Unmuting clears the override (restores inheritance).
     */
    async _onToggleMute(event) {
        event.preventDefault();
        event.stopPropagation();
        const key = event.currentTarget.dataset.key;
        if (!key) return;

        const currentBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        const isMuted = currentBindings[key] === "__MUTED__";

        if (isMuted) {
            await this._saveBinding(key, null);
        } else {
            await this._saveBinding(key, "__MUTED__");
        }

        this.render(true);
    },

    _onTaxonomyVolumeInput(event) {
        const slider = event.currentTarget;
        const label = slider.closest(".taxonomy-volume-control")?.querySelector(".taxonomy-volume-label");
        if (label) label.textContent = `${slider.value}%`;
    },

    async _onTaxonomyVolumeChange(event) {
        const slider = event.currentTarget;
        const key = slider.dataset.volumeKey;
        const value = parseInt(slider.value, 10) / 100;

        let volumes = {};
        try {
            volumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        if (value >= 0.99) {
            delete volumes[key];
        } else {
            volumes[key] = Math.round(value * 100) / 100;
        }

        await game.settings.set("ionrift-resonance", "taxonomyVolume", JSON.stringify(volumes));

        const resetBtn = slider.closest(".taxonomy-volume-control")?.querySelector(".taxonomy-volume-reset");
        if (resetBtn) resetBtn.style.display = value < 0.99 ? "inline-block" : "none";
    },

    async _onTaxonomyVolumeReset(event) {
        event.preventDefault();
        event.stopPropagation();
        const key = event.currentTarget.dataset.volumeKey;

        let volumes = {};
        try {
            volumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        delete volumes[key];
        await game.settings.set("ionrift-resonance", "taxonomyVolume", JSON.stringify(volumes));

        const container = event.currentTarget.closest(".taxonomy-volume-control");
        const slider = container?.querySelector(".taxonomy-volume-slider");
        const label = container?.querySelector(".taxonomy-volume-label");
        if (slider) slider.value = 100;
        if (label) label.textContent = "100%";
        event.currentTarget.style.display = "none";
    },

    async _saveOrchestratorConfig(mutator) {
        let config = { budgets: {}, timing: {} };
        try {
            const raw = game.settings.get("ionrift-resonance", "orchestratorConfig");
            if (raw) { const c = JSON.parse(raw); config.budgets = c.budgets ?? {}; config.timing = c.timing ?? {}; }
        } catch (e) { }
        config = mutator(config);
        await game.settings.set("ionrift-resonance", "orchestratorConfig", JSON.stringify(config));
        game.ionrift.resonance?.handler?.orchestrator?.loadConfig();
    },

    async _onOrchestratorBudgetChange(event) {
        const input = event.currentTarget;
        const category = input.dataset.category;
        const raw = input.value.trim();
        const value = raw === "" ? undefined : parseInt(raw, 10);

        await this._saveOrchestratorConfig(config => {
            if (value === undefined || isNaN(value)) {
                delete config.budgets[category];
            } else {
                config.budgets[category] = { budgetMs: value };
            }
            return config;
        });

        const row = $(input).closest("tr");
        if (value !== undefined && !isNaN(value)) {
            row.find(".orchestrator-reset-category").show();
        } else {
            row.find(".orchestrator-reset-category").hide();
        }
    },

    async _onOrchestratorResetCategory(event) {
        const btn = event.currentTarget;
        const category = btn.dataset.category;
        await this._saveOrchestratorConfig(config => {
            delete config.budgets[category];
            return config;
        });
        const row = $(btn).closest("tr");
        row.find(".orchestrator-budget-input").val("");
        $(btn).hide();
    },

    async _onOrchestratorTimingSave(event) {
        const input = event.currentTarget;
        const key = input.dataset.key;
        const value = parseInt(input.value, 10) || 0;
        await this._saveOrchestratorConfig(config => {
            config.timing[key] = { offsetMs: value };
            return config;
        });
    },

    async _onOrchestratorTimingDelete(event) {
        const btn = event.currentTarget;
        const key = btn.dataset.key;
        await this._saveOrchestratorConfig(config => {
            delete config.timing[key];
            return config;
        });
        $(btn).closest("tr").remove();
    },

    async _onOrchestratorOffsetChange(event) {
        const input = event.currentTarget;
        const offsetId = input.dataset.offset;
        const val = input.value.trim();
        await this._saveOrchestratorConfig(config => {
            if (!config.offsets) config.offsets = {};
            if (val === "") {
                delete config.offsets[offsetId];
            } else {
                config.offsets[offsetId] = parseInt(val, 10) || 0;
            }
            return config;
        });
        const row = $(input).closest("tr");
        if (val !== "") {
            row.find(".orchestrator-reset-offset").show();
        } else {
            row.find(".orchestrator-reset-offset").hide();
        }
    },

    async _onOrchestratorResetOffset(event) {
        const btn = event.currentTarget;
        const offsetId = btn.dataset.offset;
        await this._saveOrchestratorConfig(config => {
            if (config.offsets) delete config.offsets[offsetId];
            return config;
        });
        const row = $(btn).closest("tr");
        row.find(".orchestrator-offset-input").val("");
        $(btn).hide();
    },

    async _onOrchestratorResetAll(event) {
        await this._saveOrchestratorConfig(config => {
            config.budgets = {};
            config.offsets = {};
            return config;
        });
        this.render(false);
    },

    async _onToggleSetting(event) {
        event.preventDefault();
        const settingKey = event.currentTarget.dataset.setting;
        if (!settingKey) return;
        const [namespace, key] = settingKey.split(".");
        const current = game.settings.get(namespace, key);
        await game.settings.set(namespace, key, !current);
        this.render(false);
    },

    async _onAuditorSearchKey(event) {
        event.preventDefault();
        const input = event.currentTarget;
        const val = input.value;
        this._auditorSearch = val;
        this._auditorPage = 1;
        await this._renderAuditorList();
    },

    async _onAuditorPageControl(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;

        const data = this._getAuditorData();
        const totalPages = data.totalPages;

        if (action === "prev") {
            if (this._auditorPage > 1) this._auditorPage--;
        } else if (action === "next") {
            if (this._auditorPage < totalPages) this._auditorPage++;
        }

        await this._renderAuditorList();
    },

    async _renderAuditorList() {
        const data = this._getAuditorData();
        const html = await renderTemplate("modules/ionrift-resonance/templates/partials/auditor-list.hbs", data);

        const list = this.element.find(".auditor-list");
        list.html(html);
        this.element.find(".auditor-page-info").text(game.i18n.format("ionrift-resonance.config.auditorPageInfo", { page: data.page, totalPages: data.totalPages }));
    },

    async _onAuditorEdit(event) {
        event.preventDefault();
        const uuid = event.currentTarget.dataset.uuid;
        const doc = await fromUuid(uuid);
        if (!doc) return;

        try {
            if (doc.documentName === "Actor") {
                const { ActorSoundConfig } = await import("./ActorSoundConfig.js");
                new ActorSoundConfig(doc).render(true);
            } else if (doc.documentName === "Item") {
                const { ItemSoundConfig } = await import("./ItemSoundConfig.js");
                new ItemSoundConfig(doc).render(true);
            }
        } catch (e) {
            ui.notifications.error(game.i18n.localize("ionrift-resonance.notification.couldNotLoadConfigForEditing"));
        }
    },

    async _onAuditorDelete(event) {
        event.preventDefault();
        event.stopPropagation();

        const btn = event.currentTarget;
        const uuid = btn.dataset.uuid;
        const key = btn.dataset.key;

        const doc = await fromUuid(uuid);
        if (doc) {
            await doc.unsetFlag("ionrift-resonance", key);
            await doc.unsetFlag("ionrift-resonance", key + "_name");
            await doc.unsetFlag("ionrift-resonance", key + "_meta");
            ui.notifications.info(game.i18n.format("ionrift-resonance.notification.resetOverrideForActor", { name: doc.name }));
        } else {
            Logger.warn(`Auditor | Could not resolve UUID: ${uuid}`);
        }
    }
};
