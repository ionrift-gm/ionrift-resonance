import { Logger } from "../Logger.js";

// LFS pointer stubs are exactly 130 bytes (or close to it).
// Any real MP3 will be well over 1KB. If a file comes back smaller,
// the release zip shipped pointer text instead of audio.
const LFS_STUB_THRESHOLD = 1024; // 1KB
const PACK_PROBE_FILE = "modules/ionrift-resonance/sounds/pack/combat/CORE_HIT_01.mp3";

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

        await this._checkEnvironment();
        await this._checkSfxPackIntegrity();
        await this._checkTokenSync();
        await this._checkResolution();
        await this._checkMuteState();
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

    /**
     * Fetch a known SFX pack file and check its size.
     * A file under 1KB is almost certainly a Git LFS pointer stub (~130 bytes),
     * not a real audio file. This catches the v2.2.x release regression.
     */
    async _checkSfxPackIntegrity() {
        try {
            const resp = await fetch(PACK_PROBE_FILE, { method: "GET", cache: "no-store" });

            if (!resp.ok) {
                // 404 = pack not installed (SFX preset not selected) — not an error, just advisory
                if (resp.status === 404) {
                    this.log("SFX Pack: Not installed (select 'Ionrift SFX Pack' in Attunement Protocol if desired)", "warn");
                } else {
                    this.log(`SFX Pack: Probe file returned HTTP ${resp.status}`, "error");
                }
                return;
            }

            // Read the body to get actual byte count
            const buffer = await resp.arrayBuffer();
            const bytes = buffer.byteLength;

            if (bytes < LFS_STUB_THRESHOLD) {
                this.log(
                    `SFX Pack: CORRUPT — probe file is only ${bytes} bytes (expected >1KB). ` +
                    `This is a Git LFS pointer stub, not an audio file. ` +
                    `Re-download the module or report this to Ionrift support.`,
                    "error"
                );
            } else {
                this.log(`SFX Pack: OK (probe file ${Math.round(bytes / 1024)}KB — real audio confirmed)`, "success");
            }
        } catch (e) {
            this.log(`SFX Pack: Probe fetch failed — ${e.message}`, "warn");
        }
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
            this.log(`Resolution Test: Failed (Returned key '${key}') — Check Defaults/Config`, "error");
        } else {
            this.log(`Resolution Test: Passed ('${key}' → '${typeof res === 'object' ? JSON.stringify(res) : res}')`, "success");
        }
    }

    /**
     * Report any sound events currently muted via the __MUTED__ sentinel.
     * Helps diagnose "why is there no sound" reports — user may have muted
     * an event and forgotten.
     */
    async _checkMuteState() {
        let bindings = {};
        try {
            const raw = game.settings.get("ionrift-resonance", "customSoundBindings");
            if (raw) bindings = JSON.parse(raw);
        } catch (e) {
            return; // Malformed settings — not our problem here
        }

        const mutedKeys = Object.entries(bindings)
            .filter(([, v]) => v === "__MUTED__")
            .map(([k]) => k);

        if (mutedKeys.length === 0) {
            this.log("Muted Events: None", "success");
        } else {
            this.log(
                `Muted Events (${mutedKeys.length}): ${mutedKeys.join(", ")} — ` +
                `These events are silenced. Use Calibration UI to restore them.`,
                "warn"
            );
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
