import { Logger } from "../../utils/Logger.js";
import { SoundPackLoader } from "../packs/SoundPackLoader.js";
import { hasActiveSfxContent } from "../packs/sfxPackNudge.js";

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
            label: game.i18n.localize("ionrift-resonance.status.ready"),
            message: game.i18n.format("ionrift-resonance.status.soundPacksActive", { names })
        };
    }

    const hasEmptyEnabledPack = SoundPackLoader.getLoadedPacks().some(
        (pack) => pack.enabled && pack.bindingCount === 0
    );
    if (hasEmptyEnabledPack) {
        return {
            status: STATUS.WARNING,
            label: game.i18n.localize("ionrift-resonance.status.packBindingsMissing"),
            message: game.i18n.localize("ionrift-resonance.status.packBindingsMissingDetail")
        };
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
                    label: game.i18n.localize("ionrift-resonance.status.fallbackMode"),
                    message: game.i18n.localize("ionrift-resonance.status.tokenMismatchDetail")
                };
            }
            return {
                status: STATUS.OFFLINE,
                label: game.i18n.localize("ionrift-resonance.status.authFailed"),
                message: game.i18n.format("ionrift-resonance.status.syrinscapeRejectedResonanceToken", { status: response.status })
            };
        } catch (e) {
            return {
                status: STATUS.OFFLINE,
                label: game.i18n.localize("ionrift-resonance.status.unreachable"),
                message: game.i18n.localize("ionrift-resonance.status.networkErrorDirect")
            };
        }
    }

    if (controlActive) {
        const player = game.syrinscape?.player || globalThis.syrinscapeControl?.player;
        const state = player?.state || "Idle";

        if (state === "Active") {
            return {
                status: STATUS.CONNECTED,
                label: game.i18n.localize("ionrift-resonance.status.connected"),
                message: game.i18n.localize("ionrift-resonance.status.syrinscapeOnlineReadyControl")
            };
        }
        if (state === "Connecting") {
            return {
                status: STATUS.WARNING,
                label: game.i18n.localize("ionrift-resonance.status.connecting"),
                message: game.i18n.localize("ionrift-resonance.status.establishingLink")
            };
        }
        if (state === "Error") {
            return {
                status: STATUS.OFFLINE,
                label: game.i18n.localize("ionrift-resonance.status.error"),
                message: game.i18n.localize("ionrift-resonance.status.syrinscapeControlError")
            };
        }
        try {
            const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
            const response = await fetch(url, { method: "GET" });
            if (response.ok) {
                return {
                    status: STATUS.CONNECTED,
                    label: game.i18n.localize("ionrift-resonance.status.connected"),
                    message: game.i18n.format("ionrift-resonance.status.syrinscapeOnlineReadyDirectCheck", { state })
                };
            }
            return {
                status: STATUS.OFFLINE,
                label: game.i18n.localize("ionrift-resonance.status.offline"),
                message: game.i18n.format("ionrift-resonance.status.syrinscapeControlAuthFailed", { state })
            };
        } catch (e) {
            return {
                status: STATUS.OFFLINE,
                label: game.i18n.localize("ionrift-resonance.status.offline"),
                message: game.i18n.format("ionrift-resonance.status.syrinscapeControlState", { state })
            };
        }
    }

    if (!ionToken) {
        return {
            status: STATUS.WARNING,
            label: game.i18n.localize("ionrift-resonance.status.setupNeeded"),
            message: game.i18n.localize("ionrift-resonance.status.setupNeededDetail")
        };
    }

    try {
        const url = `https://syrinscape.com/online/frontend-api/elements/1035/?format=json&auth_token=${ionToken}`;
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
            return {
                status: STATUS.CONNECTED,
                label: game.i18n.localize("ionrift-resonance.status.connected"),
                message: game.i18n.localize("ionrift-resonance.status.syrinscapeOnlineReadyDirect")
            };
        }
        return {
            status: STATUS.OFFLINE,
            label: game.i18n.localize("ionrift-resonance.status.authFailed"),
            message: game.i18n.format("ionrift-resonance.status.syrinscapeRejectedToken", { status: response.status })
        };
    } catch (e) {
        return {
            status: STATUS.OFFLINE,
            label: game.i18n.localize("ionrift-resonance.status.unreachable"),
            message: game.i18n.localize("ionrift-resonance.status.networkError")
        };
    }
}

export function registerResonanceStatusIndicator() {
    if (!game.ionrift?.integration) return;
    game.ionrift.integration.registerApp("ionrift-resonance", {
        checkStatus: checkResonanceStatus
    });
}
