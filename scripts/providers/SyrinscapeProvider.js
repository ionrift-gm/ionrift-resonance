import { SoundProvider } from "./SoundProvider.js";
import { Logger } from "../Logger.js";

export class SyrinscapeProvider extends SoundProvider {
    constructor() {
        super();
        this.syrinToken = game.settings.get('ionrift-sounds', 'syrinToken');
    }

    /**
     * Playing a sound via Syrinscape (Module or Direct API)
     * @param {string|object} soundId - Valid ID string (e.g. "element:123") or Object
     * @param {object} options - { volume, delay, type }
     */
    async playSound(soundId, options = {}) {
        if (!soundId) return;

        // 1. Unpack Object if passed directly
        let rId = soundId;
        if (typeof soundId === 'object') {
            if (soundId.id) rId = soundId.id;
        }

        // 2. Handle Arrays/Strings with Commas (Randomization) - Redundant if Manager handles it, but safe to keep
        if (typeof rId === 'string' && rId.includes(',')) {
            const parts = rId.split(',').map(s => s.trim()).filter(s => s);
            rId = parts[Math.floor(Math.random() * parts.length)];
        }

        // 3. Determine Type
        // We defer to prefix if present, otherwise default to 'element' (safer for play calls than mood)
        let type = options.type || "element";
        let cleanId = String(rId);

        if (cleanId.startsWith("mood:")) {
            type = "mood";
            cleanId = cleanId.substring(5);
        } else if (cleanId.startsWith("element:")) {
            type = "element"; // Syrinscape standard is "element" (oneshot)
            cleanId = cleanId.substring(8);
        } else if (cleanId.startsWith("global:")) {
            type = "global-element";
            cleanId = cleanId.substring(7);
        }

        // 4. Execution
        await this._executePlay(type, cleanId, options.volume);
    }

    /**
     * Internal execution to determine best method (Module vs API)
     */
    async _executePlay(type, id, volume) {
        // CHECK TOKEN SYNC: If mismatched, we MUST fallback to Direct API
        // CHECK TOKEN SYNC: If mismatched, we MUST fallback to Direct API
        const ionToken = game.settings.get('ionrift-sounds', 'syrinToken');
        const controlToken = game.settings.get("syrinscape-control", "authToken");
        const t1 = (ionToken || "").trim();
        const t2 = (controlToken || "").trim();
        // Mismatch if Ionrift has token, but it differs from Control (even if Control is empty)
        const isMismatched = (t1 && t1 !== t2);

        if (isMismatched) {
            Logger.warn("Token Mismatch: Bypassing Control Module for Playback.");
        }

        // A. Try Module Integration (V2 - syrinscape-control)
        // NOTE: We bypass Module for "global-element" because the module likely defaults to "elements/" endpoint
        // and doesn't support the distinction, causing 404s for Global One-Shots.
        if (!isMismatched && globalThis.syrinscapeControl?.utils && type !== "global-element") {
            try {
                if (type === "mood") {
                    await globalThis.syrinscapeControl.utils.playMood(id);
                } else {
                    await globalThis.syrinscapeControl.utils.playElement(id);
                }
                return;
            } catch (err) {
                Logger.error("Syrinscape Module V2 Error:", err);
            }
        }

        // B. Try Module Integration (V1 - Legacy)
        if (!isMismatched && game.syrinscape && type !== "global-element") {
            const method = type === "mood" ? "playMood" : "playElement";
            if (typeof game.syrinscape[method] === 'function') {
                game.syrinscape[method](id);
                return;
            }
        }

        // C. Fallback to Direct API
        const token = game.settings.get('ionrift-sounds', 'syrinToken');
        if (!token) {
            // Only warn if they strictly need it (no module)
            if (!globalThis.syrinscapeControl && !game.syrinscape) {
                ui.notifications.warn("Ionrift: Syrinscape Token missing for Direct API.");
            }
            return;
        }

        let endpoint = "elements";
        if (type === "mood") endpoint = "moods";
        else if (type === "global-element") endpoint = "elements"; // Playback always uses elements/ endpoint

        const url = `https://syrinscape.com/online/frontend-api/${endpoint}/${id}/play/?auth_token=${token}`;

        try {
            // Using 'no-cors' for fire-and-forget
            await fetch(url, { method: 'GET', mode: 'no-cors' });
        } catch (e) {
            Logger.error("Direct API Play Failed", e);
        }
    }

    async stopAll() {
        let stopSent = false;

        // CHECK TOKEN SYNC: If mismatched, we MUST fallback to Direct API to avoid using the wrong session
        // CHECK TOKEN SYNC: If mismatched, we MUST fallback to Direct API to avoid using the wrong session
        const ionToken = game.settings.get('ionrift-sounds', 'syrinToken');
        const controlToken = game.settings.get("syrinscape-control", "authToken");
        const t1 = (ionToken || "").trim();
        const t2 = (controlToken || "").trim();
        const isMismatched = (t1 && t1 !== t2);

        if (isMismatched) {
            Logger.warn("Token Mismatch: Bypassing Control Module for StopAll.");
        }

        // 1. Try Module (V2 - syrinscape-control)
        if (!isMismatched && globalThis.syrinscapeControl?.utils?.stopAll) {
            try {
                Logger.log("Stop All | Attempting via Syrinscape Control (V2)...");
                await globalThis.syrinscapeControl.utils.stopAll();
                stopSent = true;
            } catch (e) {
                Logger.warn("Stop All | Module V2 Failed:", e);
            }
        }

        // 2. Try Module (V1 - Legacy) - Only if V2 didn't work
        if (!stopSent && game.syrinscape?.stopAll) {
            try {
                Logger.log("Stop All | Attempting via Game System (Legacy)...");
                await game.syrinscape.stopAll();
                stopSent = true;
            } catch (e) {
                Logger.warn("Stop All | Module Legacy Failed:", e);
            }
        }

        // 3. Fallback Direct API (If modules failed or were missing)
        // Note: We force this if modules failed, or if we just want to be sure.
        if (!stopSent) {
            const token = game.settings.get("ionrift-sounds", "syrinToken");
            if (token) {
                try {
                    Logger.log("Stop All | Attempting via Direct API...");
                    // Using no-cors
                    await fetch(`https://syrinscape.com/online/frontend-api/stop-all/?auth_token=${token}`, { method: 'GET', mode: 'no-cors' });
                    Logger.log("Stop All | Direct API Request Sent.");
                } catch (e) {
                    Logger.warn("Stop All failed via Direct API", e);
                    ui.notifications.warn("Ionrift: Failed to stop sounds via API.");
                }
            } else {
                Logger.warn("Stop All | No Token for API Fallback.");
            }
        }
    }

    async search(query, options = {}) {
        if (!query) return [];
        const filterType = options.type || "all"; // 'all' or 'oneshot'

        if (!this.syrinToken) {
            ui.notifications.warn("Syrinscape Token missing. Check Ionrift Sounds settings.");
            return [];
        }

        const cleanToken = this.syrinToken.trim();
        const url = `https://syrinscape.com/search/?q=${encodeURIComponent(query)}&format=json&auth_token=${cleanToken}`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Timeout

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Syrinscape API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const results = data.results || [];

            if (results.length > 0) {
                // Logger.log("API Result Inspection:", results[0]);
            }

            return results.slice(0, 50).filter(r => {
                // FILTER: Only show playable items
                if (r.available_to_play === false) return false;

                // FILTER: Helper to get type
                const t = r.l_name || r.kind || r.model_name;

                // FILTER: Exclude raw "SoundSample" (cause 404s on playback)
                if (t === "SoundSample") return false;

                // FILTER: Exclude Containers (Chapters, SoundSets) - User request
                if (t === "Chapter") return false;
                if (t === "SoundSet") return false;

                // FILTER: One-Shot / Reactive Only (if requested)
                if (filterType === 'oneshot') {
                    // STRICT FILTER: User requested ONLY "OneshotElement" (Global One-Shots)
                    // This excludes generic "Element" or "SFXElement" which might be loops.
                    if (t !== "OneshotElement") return false;
                }

                return true;
            }).map(r => {
                // DEBUG: Log first result to understand structure
                // if (Math.random() < 0.1) console.log("Ionrift Search Result Sample:", r);

                const sourceType = r.l_name || r.kind || r.model_name;
                const sourceName = r.title_for_sample || r.name || r.title || "Unknown";

                Logger.log(`Search Filter | Included: [${sourceType}] ${sourceName}`);

                let id = String(r.pk || r.id);
                let name = r.title_for_sample || r.name || r.title || "Unknown Sound";
                let type = r.l_name || r.kind || r.model_name || "Element";
                let icon = "fas fa-music";

                let meta = "";
                if (r.chapter_title) meta = r.chapter_title;
                if (r.adventure_title) meta = meta ? `${r.adventure_title} - ${meta}` : r.adventure_title;
                if (!meta && r.soundset_title) meta = r.soundset_title;

                let normalizedType = "global-element";

                if (type === "Mood") {
                    icon = "fas fa-cloud-sun";
                    if (!id.startsWith("mood:")) id = "mood:" + id;
                    normalizedType = "mood";
                } else if (type === "SFXElement" || type === "Element") {
                    icon = "fas fa-bolt";
                    if (!id.startsWith("element:")) id = "element:" + id;
                    normalizedType = "element";
                } else if (type === "OneshotElement") {
                    icon = "fas fa-meteor";
                    // FIX: Map OneshotElement to 'global' to ensure it bypasses the module (which 404s)
                    // and passes the 'One-Shots Only' filter in SoundPickerApp.
                    if (!id.startsWith("global:")) id = "global:" + id;
                    normalizedType = "global-oneshot";
                } else if (type === "MusicElement") {
                    icon = "fas fa-music";
                    if (!id.startsWith("element:")) id = "element:" + id;
                    normalizedType = "element";
                } else {
                    icon = "fas fa-question-circle";
                    if (!id.startsWith("global:")) id = "global:" + id;
                    normalizedType = "global-element";
                }

                return {
                    id: id,
                    name: `[${type}] ${name}`,
                    type: normalizedType,
                    meta: meta,
                    icon: r.icon || icon
                };
            }).filter(r => r.id && r.id !== "undefined");

        } catch (error) {
            Logger.error("Syrinscape Search Error:", error);
            if (error.name === 'AbortError') {
                throw new Error("Search Timed Out (Syrinscape API slow to respond)");
            }
            throw error;
        }
    }

    /**
     * Fetches all global one-shots from Syrinscape and caches them.
     * @param {Function} onProgress - Callback (count) => {}
     */
    async cacheLibrary({ onProgress } = {}) {
        if (!this.syrinToken) return [];

        const token = this.syrinToken.trim();
        // Use the specific Global Elements endpoint found by probe (returns ~32 items)
        const url = `https://syrinscape.com/online/frontend-api/global-elements/?auth_token=${token}`;

        Logger.log("Starting Library Cache (via Global Elements API)...");

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API Error ${response.status}`);

            const data = await response.json();
            let rawItems = [];

            // Handle Array (likely) vs Paged Object (possible)
            if (Array.isArray(data)) {
                rawItems = data;
            } else if (data.results && Array.isArray(data.results)) {
                rawItems = data.results;
            }

            const oneshots = rawItems.map(r => {
                return {
                    id: `global:${r.pk || r.id}`,
                    name: `[Global] ${r.name || r.title || "Unknown"}`,
                    type: "global-oneshot",
                    meta: r.soundset_name || "Global One-Shot",
                    icon: "fas fa-meteor"
                };
            });

            Logger.log(`Cached ${oneshots.length} Global Elements.`);

            // Save to Settings
            game.settings.set('ionrift-sounds', 'oneshotCache', {
                timestamp: Date.now(),
                results: oneshots
            });

            return oneshots;

        } catch (e) {
            Logger.error("Cache Verification Failed:", e);
            ui.notifications.error("Syrinscape Library Sync Failed.");
            return [];
        }
    }
}
