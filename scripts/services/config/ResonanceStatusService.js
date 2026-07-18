import { Logger } from "../../utils/Logger.js";
import { SoundPackLoader } from "../packs/SoundPackLoader.js";
import { hasActiveSfxContent } from "../packs/sfxPackNudge.js";
import { CANONICAL_CORE_SFX_PACK_ID } from "../../data/coreSfxPacks.js";

export async function checkResonanceStatus() {
    const STATUS = game.ionrift.integration.STATUS;
    const ionToken = game.settings.get("ionrift-resonance", "syrinToken");

    const enabledPacks = SoundPackLoader.getLoadedPacks().filter(
        (pack) => pack.enabled && pack.bindingCount > 0
    );
    if (hasActiveSfxContent()) {
        const names = enabledPacks.map((p) => p.name).join(", ");
        return {
            status: STATUS.CONNECTED,
            label: "Ready",
            message: `Sound packs active (${names}). Local audio does not require Syrinscape.`
        };
    }

    if (game.ionrift?.library?.isOverlayDistributionActive?.()) {
        try {
            const overlayState = await game.ionrift.library.getOverlayState(
                CANONICAL_CORE_SFX_PACK_ID,
                "ionrift-resonance",
                "free"
            );
            if (overlayState?.installed && overlayState?.active) {
                return {
                    status: STATUS.WARNING,
                    label: "Pack bindings missing",
                    message: "A sound pack overlay is active but Calibration has no pack bindings. Reload the world after the pack files are present on disk."
                };
            }
        } catch (e) {
            Logger.warn("Resonance status | Overlay check failed:", e);
        }
    }

    const controlModule = game.modules.get("syrinscape-control");
    const controlActive = controlModule?.active || !!globalThis.syrinscapeControl;
    const controlToken = controlActive ? game.settings.get("syrinscape-control", "authToken") : null;

    const t1 = (ionToken || "").trim();
    const t2 = (controlToken || "").trim();
    const mismatch = controlActive && t1 && (t1 !== t2);

    if (mismatch) {
        Logger.warn("Ionrift Sounds | Token Mismatch Detected. Falling back to Direct API.");
        try {
            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
            const response = await fetch(url, { method: "GET" });
            if (response.ok) {
                return {
                    status: STATUS.WARNING,
                    label: "Fallback Mode",
                    message: "Token Mismatch: The tokens in Resonance and Syrinscape Control are out of sync.\nFalling back to Resonance configuration to ensure stability."
                };
            }
            return {
                status: STATUS.OFFLINE,
                label: "Auth Failed",
                message: `Syrinscape Rejected Resonance Token (${response.status})`
            };
        } catch (e) {
            return { status: STATUS.OFFLINE, label: "Unreachable", message: "Network Error (Direct)" };
        }
    }

    if (controlActive) {
        const player = game.syrinscape?.player || globalThis.syrinscapeControl?.player;
        const state = player?.state || "Idle";

        if (state === "Active") {
            return { status: STATUS.CONNECTED, label: "Connected", message: "Syrinscape Online Ready (Control)" };
        }
        if (state === "Connecting") {
            return { status: STATUS.WARNING, label: "Connecting", message: "Establishing Link..." };
        }
        if (state === "Error") {
            return { status: STATUS.OFFLINE, label: "Error", message: "Syrinscape Control Error" };
        }
        try {
            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
            const response = await fetch(url, { method: "GET" });
            if (response.ok) {
                return {
                    status: STATUS.CONNECTED,
                    label: "Connected",
                    message: `Syrinscape Online Ready (Direct check: ${state})`
                };
            }
            return {
                status: STATUS.OFFLINE,
                label: "Offline",
                message: `Syrinscape Control: ${state} (Auth Failed)`
            };
        } catch (e) {
            return { status: STATUS.OFFLINE, label: "Offline", message: `Syrinscape Control: ${state}` };
        }
    }

    if (!ionToken) {
        return {
            status: STATUS.WARNING,
            label: "Setup needed",
            message: "No local sound pack bindings found. Set Audio Mode to add a Syrinscape token, or install a sound pack outside this listed module."
        };
    }

    try {
        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
            return { status: STATUS.CONNECTED, label: "Connected", message: "Syrinscape Online Ready (Direct)" };
        }
        return {
            status: STATUS.OFFLINE,
            label: "Auth Failed",
            message: `Syrinscape Rejected Token (${response.status})`
        };
    } catch (e) {
        return { status: STATUS.OFFLINE, label: "Unreachable", message: "Network Error" };
    }
}

export function registerResonanceStatusIndicator() {
    if (!game.ionrift?.integration) return;
    game.ionrift.integration.registerApp("ionrift-resonance", {
        checkStatus: checkResonanceStatus
    });
}
