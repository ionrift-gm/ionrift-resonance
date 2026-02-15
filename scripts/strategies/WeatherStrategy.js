import { Logger } from "../Logger.js";

export class WeatherStrategy {
    constructor(handler) {
        this.handler = handler;
        this.activeWeather = null;
    }

    activate() {
        Logger.log("Activating Weather Strategy");
        Hooks.on("updateScene", this._onUpdateScene.bind(this));

        // Listen to standardized bridge hook
        Hooks.on("ionrift.weatherChanged", this._onBridgeWeather.bind(this));

        if (canvas.scene) this._checkScene(canvas.scene);
    }

    _onUpdateScene(scene, updates) {
        if (!scene.active) return;
        if (updates.weather !== undefined) {
            this._checkScene(scene);
        }
    }

    _onBridgeWeather(data) {
        // Logger.log("Bridge Weather Signal RECEIVED:", data);
        // data: { type: string, options: object, source: string }
        const type = data.type;
        this._updateWeather(type);
    }

    _checkScene(scene) {
        this._updateWeather(scene.weather);
    }

    _updateWeather(weather) {
        if (!weather) return;
        // if (weather === this.activeWeather) return; // Allow re-triggering for intensity changes?

        this.activeWeather = weather;
        // Logger.log(`Weather Active: ${weather}`);

        let soundKey = null;

        // Normalize input
        const w = String(weather).toLowerCase();

        // Standard Foundry & FXMaster mappings
        // Standard Foundry & FXMaster mappings
        if (w.includes("rain_heavy")) soundKey = "WEATHER_RAIN_HEAVY";
        else if (w.includes("rain_light")) soundKey = "WEATHER_RAIN_LIGHT";
        else if (w.includes("rain")) soundKey = "WEATHER_RAIN";

        else if (w.includes("storm") || w.includes("thunder")) soundKey = "WEATHER_STORM"; // Storm overrides rain
        else if (w.includes("snow") || w.includes("blizzard")) soundKey = "WEATHER_SNOW";
        else if (w.includes("fog") || w.includes("clouds") || w.includes("wind")) soundKey = "WEATHER_WIND";
        else if (w.includes("embers") || w.includes("fire")) soundKey = "WEATHER_FIRE"; // FXMaster Embers
        else if (w.includes("void") || w.includes("flux")) soundKey = "WEATHER_VOID";

        // If no match, maybe we stop? Or keep playing?
        // Current logic only plays if match found.

        if (soundKey) {
            this.handler.playItemSound(soundKey);
        }
    }
}

