export class SoundAuditor extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sound-auditor",
            title: "ionrift-resonance.soundAuditor.title",
            template: "modules/ionrift-resonance/templates/sound-auditor.hbs",
            width: 700,
            height: 600,
            classes: ["ionrift-window", "glass-ui"],
            resizable: true
        });
    }

    getData() {
        // Scan the world for Items with Flags
        const items = [];

        return this._scanItems();
    }

    _hasAudioFlags(item) {
        const flags = item.flags["ionrift-resonance"];
        if (!flags) return false;

        // Check for specific functional flags
        const keys = ["sound_attack", "sound_hit", "sound_miss", "sound_use", "sound_equip", "sound_unequip"];
        return keys.some(k => flags[k] && flags[k] !== "");
    }

    _scanItems() {
        const items = [];

        // 1. World Items
        game.items.forEach(item => {
            if (this._hasAudioFlags(item)) {
                items.push(this._formatEntry(item, game.i18n.localize("ionrift-resonance.soundAuditor.sourceWorldItem"), null));
            }
        });

        // 2. Linked Actor Items (world actors)
        game.actors.forEach(actor => {
            actor.items.forEach(item => {
                if (this._hasAudioFlags(item)) {
                    items.push(this._formatEntry(item, game.i18n.localize("ionrift-resonance.soundAuditor.sourceOwnedItem"), actor));
                }
            });
        });

        // 3. Unlinked Token Actors (synthetic - not in game.actors, live in the scene)
        if (game.scenes?.active) {
            for (const tokenDoc of game.scenes.active.tokens) {
                const actor = tokenDoc.actor;
                if (!actor) continue;
                // Skip linked tokens - already covered by game.actors scan above
                if (tokenDoc.isLinked) continue;
                actor.items.forEach(item => {
                    if (this._hasAudioFlags(item)) {
                        items.push(this._formatEntry(item, game.i18n.format("ionrift-resonance.soundAuditor.sourceToken", { name: tokenDoc.name }), actor));
                    }
                });
            }
        }

        return { items };
    }

    _formatEntry(item, source, actor) {
        const flags = item.flags["ionrift-resonance"];
        return {
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            actorName: actor ? actor.name : "-",
            actorId: actor ? actor.id : null,
            source: source,
            // Flag Details (Concise)
            attack: flags.sound_attack ? game.i18n.localize("ionrift-resonance.soundAuditor.flagYes") : "",
            hit: flags.sound_hit ? game.i18n.localize("ionrift-resonance.soundAuditor.flagYes") : "",
            miss: flags.sound_miss ? game.i18n.localize("ionrift-resonance.soundAuditor.flagYes") : "",
            use: flags.sound_use ? game.i18n.localize("ionrift-resonance.soundAuditor.flagYes") : "",
            equip: flags.sound_equip ? game.i18n.localize("ionrift-resonance.soundAuditor.flagYes") : "",
            rawFlags: JSON.stringify(flags)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Edit Button (Use standard sheet?)
        html.find(".action-open").click(ev => {
            const uuid = ev.currentTarget.dataset.uuid;
            fromUuid(uuid).then(doc => doc.sheet.render(true));
        });

        // Clear Flags Button
        html.find(".action-clear").click(async (ev) => {
            const uuid = ev.currentTarget.dataset.uuid;
            const doc = await fromUuid(uuid);

            Dialog.confirm({
                title: game.i18n.localize("ionrift-resonance.soundAuditor.dialogClearTitle"),
                content: game.i18n.format("ionrift-resonance.soundAuditor.dialogClearContent", { name: doc.name }),
                yes: async () => {
                    await doc.unsetFlag("ionrift-resonance", "sound_attack");
                    await doc.unsetFlag("ionrift-resonance", "sound_hit");
                    await doc.unsetFlag("ionrift-resonance", "sound_miss");
                    await doc.unsetFlag("ionrift-resonance", "sound_use");
                    await doc.unsetFlag("ionrift-resonance", "sound_equip");
                    await doc.unsetFlag("ionrift-resonance", "sound_unequip");
                    this.render();
                    ui.notifications.info(game.i18n.format("ionrift-resonance.soundAuditor.infoClearedAudio", { name: doc.name }));
                }
            });
        });

        // Refresh
        html.find(".action-refresh").click(() => this.render());
    }
    async _updateObject(event, formData) {
        // No settings to save here, but required for FormApplication
    }
}
