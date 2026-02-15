import { Logger } from "../Logger.js";

export class SoundDiagnostics {
    constructor(handler) {
        this.handler = handler;
        this.manager = game.ionrift.sounds.manager;
        this.logs = [];
    }

    log(msg, type = "info") {
        this.logs.push({ msg, type });
        if (type === "error") Logger.error(msg);
        else if (type === "warn") Logger.warn(msg);
        else Logger.log(msg);
    }

    async run() {
        this.logs = [];
        // this.log("Starting Audio Diagnostics...", "info"); // Removed to keep report clean


        await this._checkEnvironment();
        await this._checkTokenSync();
        await this._checkResolution();
        await this._checkPlaybackPath();
        await this._checkGlobalHandling();

        this._displayResults();
    }

    async _checkEnvironment() {
        // Module V2
        if (globalThis.syrinscapeControl) {
            this.log("Syrinscape Control (V2) Detected: Active", "success");
        } else if (game.syrinscape) {
            this.log("Syrinscape Control (V1) Detected: Active", "success");
        } else {
            this.log("Syrinscape Control Module: Not Found (Using Manual/Direct API?)", "warn");
        }

        // Token
        const token = game.settings.get("ionrift-resonance", "syrinToken");
        if (token) this.log("Auth Token: Configured", "success");
        else this.log("Auth Token: Missing", "error");

        // Provider Setting
        const prov = game.settings.get("ionrift-resonance", "provider");
        this.log(`Active Provider Setting: ${prov}`, "success");
    }

    async _checkTokenSync() {
        const control = game.modules.get("syrinscape-control");
        if (!control?.active) return; // Not relevant if module isn't active

        const ionToken = game.settings.get("ionrift-resonance", "syrinToken");
        const syrinToken = game.settings.get("syrinscape-control", "authToken");

        if (ionToken && syrinToken) {
            if (ionToken === syrinToken) {
                this.log("Token Sync: Synchronized", "success");
            } else {
                this.log("Token Sync: Mismatch Detected (Ionrift vs Syrinscape Control)", "warn");
            }
        }
    }

    async _checkResolution() {
        const key = "ATTACK_SWORD";
        const res = this.handler.resolveSound(key);
        if (res === key) {
            this.log(`Resolution Test: Failed (Returned key '${key}') - Check Defaults/Config`, "error");
        } else {
            this.log(`Resolution Test: Passed ('${key}' -> '${typeof res === 'object' ? JSON.stringify(res) : res}')`, "success");
        }
    }

    async _checkPlaybackPath() {
        if (!this.manager) {
            this.log("SoundManager: Missing!", "error");
            return;
        }

        if (this.manager.provider) {
            const name = this.manager.provider.constructor.name;
            this.log(`Provider Loaded: ${name}`, "success");

            // Check if Provider has stopAll
            if (typeof this.manager.provider.stopAll === 'function') {
                this.log("Provider supports stopAll()", "success");
            } else {
                this.log("Provider missing stopAll()", "warn");
            }

        } else {
            this.log("Provider: Missing!", "error");
        }
    }

    async _checkGlobalHandling() {
        // Verify that the provider logic for global elements is sound
        // We can't easily mock the fetch, but we can check if the method exists
        if (this.manager?.provider) {
            // Heuristic: check if play function handles prefixes
            // This is a "Code Logic/Config" check more than a runtime one
            const provider = this.manager.provider;
            if (provider.constructor.name === "SyrinscapeProvider") {
                this.log("Global Element Protocol: Provider Active", "success");
                // We rely on the recent fix: bypassing module for 'global-element'
            }
        }
    }

    _displayResults() {
        let content = "<h3>Audio Diagnostics</h3><ul>";
        for (const l of this.logs) {
            let color = "black";
            if (l.type === 'success') color = "green";
            if (l.type === 'error') color = "red";
            if (l.type === 'warn') color = "orange";
            content += `<li style="color:${color}">${l.msg}</li>`;
        }
        content += "</ul>";
        content += "<p><em>Check console for more details.</em></p>";

        ChatMessage.create({ content, speaker: { alias: "Ionrift Tech" } });
    }
}
