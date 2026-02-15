export class SoundAuditor extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "ionrift-sound-auditor",
            title: "Ionrift Sound Auditor",
            template: "modules/ionrift-sounds/templates/sound-auditor.hbs",
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
        const flags = item.flags["ionrift-sounds"];
        if (!flags) return false;

        // Check for specific functional flags
        const keys = ["sound_attack", "sound_use", "sound_equip", "sound_unequip"];
        return keys.some(k => flags[k] && flags[k] !== "");
    }

    _scanItems() {
        const items = [];

        // 1. World Items
        game.items.forEach(item => {
            if (this._hasAudioFlags(item)) {
                items.push(this._formatEntry(item, "World Item", null));
            }
        });

        // 2. Actor Items
        game.actors.forEach(actor => {
            actor.items.forEach(item => {
                if (this._hasAudioFlags(item)) {
                    items.push(this._formatEntry(item, "Owned Item", actor));
                }
            });
        });

        return {
            items: items
        };
    }

    _formatEntry(item, source, actor) {
        const flags = item.flags["ionrift-sounds"];
        return {
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            actorName: actor ? actor.name : "—",
            actorId: actor ? actor.id : null,
            source: source,
            // Flag Details (Concise)
            attack: flags.sound_attack ? "Yes" : "",
            use: flags.sound_use ? "Yes" : "",
            equip: flags.sound_equip ? "Yes" : "",
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
                title: "Clear Audio Flags?",
                content: `<p>Remove all Ionrift Sound flags from <strong>${doc.name}</strong>?</p>`,
                yes: async () => {
                    await doc.unsetFlag("ionrift-sounds", "sound_attack");
                    await doc.unsetFlag("ionrift-sounds", "sound_use");
                    await doc.unsetFlag("ionrift-sounds", "sound_equip");
                    await doc.unsetFlag("ionrift-sounds", "sound_unequip");
                    this.render();
                    ui.notifications.info(`Cleared audio from ${doc.name}`);
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
