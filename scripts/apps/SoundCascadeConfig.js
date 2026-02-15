export class SoundCascadeConfig extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sound-cascade",
            title: "Reactive Sound Engine: Logic Cascade",
            template: "modules/ionrift-sounds/templates/sound-cascade.hbs",
            width: 900,
            height: 600,
            classes: ["ionrift", "cascade-window"],
            resizable: true
        });
    }

    getData() {
        return {
            // Mock data for the view
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Interactive Elements (for later)
        html.find(".node").click(ev => {
            html.find(".node").removeClass("selected");
            $(ev.currentTarget).addClass("selected");
        });
    }
}
