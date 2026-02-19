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

        // Provider Setting (deprecated — routing is per-sound)
        this.log("Routing: Per-Sound (Dual-Provider)", "success");
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
        if (this.handler.activePreset === "none") {
            this.log("Resolution Test: Skipped (Manual Mode Active)", "success");
            return;
        }

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

        // Check Syrinscape provider
        if (this.manager.syrinscapeProvider) {
            this.log("Syrinscape Provider: Loaded", "success");
        } else {
            this.log("Syrinscape Provider: Missing", "warn");
        }

        // Check Local provider
        if (this.manager.localProvider) {
            this.log("Local Provider (Foundry Audio): Loaded", "success");
        } else {
            this.log("Local Provider: Missing", "warn");
        }
    }

    async _checkGlobalHandling() {
        if (this.manager?.syrinscapeProvider) {
            this.log("Global Element Protocol: Syrinscape Provider Active", "success");
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
