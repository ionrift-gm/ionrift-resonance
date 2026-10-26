import { isFeatureFlagEnabled } from "../../data/featureFlags.js";

export class ItemSoundConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-item-sound-config",
            title: "ionrift-resonance.itemConfig.title",
            template: "modules/ionrift-resonance/templates/item-sound-config.hbs",
            width: 500,
            height: "auto",
            classes: ["ionrift-window", "glass-ui"],
            closeOnSubmit: false,
            submitOnChange: false,
            resizable: true
        });
    }

    constructor(item) {
        super();
        this.item = item;
    }

    getData() {
        const slots = [
            { key: "sound_attack", label: game.i18n.localize("ionrift-resonance.itemConfig.slotAttackLabel"), icon: "fas fa-khanda", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotAttackHint") },
            { key: "sound_hit", label: game.i18n.localize("ionrift-resonance.itemConfig.slotHitLabel"), icon: "fas fa-burst", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotHitHint") },
            { key: "sound_miss", label: game.i18n.localize("ionrift-resonance.itemConfig.slotMissLabel"), icon: "fas fa-wind", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotMissHint") },
            { key: "sound_use", label: game.i18n.localize("ionrift-resonance.itemConfig.slotUseLabel"), icon: "fas fa-hand-sparkles", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotUseHint") },
            { key: "sound_equip", label: game.i18n.localize("ionrift-resonance.itemConfig.slotEquipLabel"), icon: "fas fa-tshirt", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotEquipHint") },
            { key: "sound_unequip", label: game.i18n.localize("ionrift-resonance.itemConfig.slotUnequipLabel"), icon: "fas fa-box-open", hint: game.i18n.localize("ionrift-resonance.itemConfig.slotUnequipHint") }
        ];

        // Spell Vocal Layer — shown for spell items (or items with the flag already set) when feature flag enabled
        const isSpell = this.item.type === "spell"
            || !!this.item.getFlag("ionrift-resonance", "spellVocal")
            || !!this.item.getFlag("ionrift-resonance", "spellVocalOverride");

        const showSpellVocal = isFeatureFlagEnabled("SPELL_VOCAL_LAYER");
        const spellVocal = !!this.item.getFlag("ionrift-resonance", "spellVocal");
        const spellVocalOverride = this.item.getFlag("ionrift-resonance", "spellVocalOverride") || null;
        const spellVocalOverrideName = this.item.getFlag("ionrift-resonance", "spellVocalOverride_name") || null;

        return {
            itemName: this.item.name,
            itemImg: this.item.img,
            isSpell,
            showSpellVocal,
            spellVocal,
            spellVocalOverride,
            spellVocalOverrideName,
            slots: slots.map(slot => {
                const val = this.item.getFlag("ionrift-resonance", slot.key);
                const name = this.item.getFlag("ionrift-resonance", slot.key + "_name");
                const meta = this.item.getFlag("ionrift-resonance", slot.key + "_meta");
                const isMuted = val === "__MUTED__";
                return {
                    ...slot,
                    value: val,
                    displayValue: name || val,
                    meta: meta,
                    hasValue: !!val && !isMuted,
                    isMuted
                };
            })
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".action-search").click(this._onSearch.bind(this));
        html.find(".action-play").click(this._onPlay.bind(this));
        html.find(".action-clear").click(this._onClear.bind(this));
        html.find(".action-mute").click(this._onToggleMute.bind(this));
        // Spell Vocal Layer controls
        html.find(".spell-vocal-toggle").click(this._onToggleSpellVocal.bind(this));
        html.find(".spell-vocal-override-search").click(this._onSearchSpellVocalOverride.bind(this));
        html.find(".spell-vocal-override-clear").click(this._onClearSpellVocalOverride.bind(this));
        html.find(".spell-vocal-override-play").click(this._onPlaySpellVocalOverride.bind(this));
    }

    async _onSearch(event) {
        event.preventDefault();
        const key = event.currentTarget.dataset.key;

        // Launch Picker via Injector logic (reusing existing flow)
        // Check if SheetInjector is exported? It is.
        // But better to just instantiate SoundPickerApp directly since we are in the same module structure
        const { SoundPickerApp } = await import("../browse/SoundPickerApp.js");

        const currentSoundId = this.item.getFlag("ionrift-resonance", key);
        const currentSoundName = this.item.getFlag("ionrift-resonance", key + "_name");
        const currentSoundMeta = this.item.getFlag("ionrift-resonance", key + "_meta");
        const existingConfig = this.item.getFlag("ionrift-resonance", "sound_config") || {};

        // Find the slot label for human-readable picker title
        const slotDefs = this.getData().slots;
        const slotMatch = slotDefs.find(s => s.key === key);
        const slotLabel = slotMatch ? slotMatch.label : key;

        new SoundPickerApp(async (result) => {
            if (result === null) {
                // Removal
                await this.item.unsetFlag("ionrift-resonance", key);
                await this.item.unsetFlag("ionrift-resonance", key + "_name");
                await this.item.unsetFlag("ionrift-resonance", key + "_meta");
            } else {
                // Set/Update
                await this.item.setFlag("ionrift-resonance", key, result.id);
                await this.item.setFlag("ionrift-resonance", key + "_name", result.name);
                await this.item.setFlag("ionrift-resonance", key + "_meta", result.meta);

                // Update Config (Merge)
                if (result.config) {
                    const newConfig = { ...existingConfig, ...result.config };
                    await this.item.setFlag("ionrift-resonance", "sound_config", newConfig);
                }
            }
            this.render();
        }, {
            currentSoundId: currentSoundId,
            currentSoundName: currentSoundName,
            currentSoundMeta: currentSoundMeta,
            soundConfig: existingConfig,
            title: game.i18n.format("ionrift-resonance.itemConfig.pickerTitle", { slot: slotLabel, name: this.item.name })
        }).render(true);
    }

    async _onPlay(event) {
        event.preventDefault();
        const key = event.currentTarget.dataset.key;
        const val = this.item.getFlag("ionrift-resonance", key);

        if (val && val !== "__MUTED__") {
            const manager = game.ionrift?.sounds?.manager;
            if (manager) {
                manager.play(val);
            }
        }
    }

    async _onToggleMute(event) {
        event.preventDefault();
        const key = event.currentTarget.dataset.key;
        const current = this.item.getFlag("ionrift-resonance", key);

        if (current === "__MUTED__") {
            // Unmute: clear the flag entirely (restores fallback chain)
            await this.item.unsetFlag("ionrift-resonance", key);
        } else {
            // Mute: set the sentinel (blocks fallback chain)
            await this.item.setFlag("ionrift-resonance", key, "__MUTED__");
        }
        this.render();
    }

    async _onClear(event) {
        event.preventDefault();
        const key = event.currentTarget.dataset.key;
        await this.item.unsetFlag("ionrift-resonance", key);
        this.render();
    }

    // -------------------------------------------------------------------------
    // Spell Vocal Layer Handlers
    // -------------------------------------------------------------------------

    async _onToggleSpellVocal(event) {
        event.preventDefault();
        const current = !!this.item.getFlag("ionrift-resonance", "spellVocal");
        await this.item.setFlag("ionrift-resonance", "spellVocal", !current);
        this.render();
    }

    async _onSearchSpellVocalOverride(event) {
        event.preventDefault();
        const { SoundPickerApp } = await import("../browse/SoundPickerApp.js");
        const currentId = this.item.getFlag("ionrift-resonance", "spellVocalOverride");
        const currentName = this.item.getFlag("ionrift-resonance", "spellVocalOverride_name");
        new SoundPickerApp(async (result) => {
            if (result === null) {
                await this.item.unsetFlag("ionrift-resonance", "spellVocalOverride");
                await this.item.unsetFlag("ionrift-resonance", "spellVocalOverride_name");
            } else {
                await this.item.setFlag("ionrift-resonance", "spellVocalOverride", result.id);
                await this.item.setFlag("ionrift-resonance", "spellVocalOverride_name", result.name);
            }
            this.render();
        }, {
            currentSoundId: currentId,
            currentSoundName: currentName,
            title: game.i18n.format("ionrift-resonance.itemConfig.pickerVocalOverrideTitle", { name: this.item.name })
        }).render(true);
    }

    async _onClearSpellVocalOverride(event) {
        event.preventDefault();
        await this.item.unsetFlag("ionrift-resonance", "spellVocalOverride");
        await this.item.unsetFlag("ionrift-resonance", "spellVocalOverride_name");
        this.render();
    }

    async _onPlaySpellVocalOverride(event) {
        event.preventDefault();
        const val = this.item.getFlag("ionrift-resonance", "spellVocalOverride");
        if (val) {
            const manager = game.ionrift?.sounds?.manager;
            if (manager) manager.play(val);
        }
    }
}
