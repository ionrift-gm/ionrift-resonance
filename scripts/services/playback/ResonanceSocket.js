import { Logger } from "../../utils/Logger.js";

const MODULE_ID = "ionrift-resonance";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;

export class ResonanceSocket {
    static #boundHandler = null;

    /**
     * Initialize socket listening for targeted and scoped audio messages.
     * @param {import("./SoundHandler.js").SoundHandler} handler
     */
    static init(handler) {
        if (!game.socket) {
            Logger.warn("ResonanceSocket | game.socket unavailable.");
            return;
        }

        if (this.#boundHandler) {
            game.socket.off(SOCKET_CHANNEL, this.#boundHandler);
        }

        this.#boundHandler = (data) => this.#onMessage(data, handler);
        game.socket.on(SOCKET_CHANNEL, this.#boundHandler);
        Logger.log("ResonanceSocket initialized.");
    }

    /**
     * Dispatch targeted audio to specific user IDs.
     * @param {string[]} recipients - Array of user IDs
     * @param {string} key - Sound key or path to play
     * @param {object} [options={}] - Additional playback options
     */
    static emitTargeted(recipients, key, options = {}) {
        if (!game.socket) return;
        const recipientList = Array.isArray(recipients) ? recipients : [recipients];
        if (!recipientList.length) return;

        game.socket.emit(SOCKET_CHANNEL, {
            type: "audio:targeted",
            recipients: recipientList,
            key,
            options,
            senderId: game.user?.id
        });
    }

    static #onMessage(data, handler) {
        if (!data || typeof data !== "object") return;

        if (data.type === "audio:targeted") {
            const myId = game.user?.id;
            if (Array.isArray(data.recipients) && data.recipients.includes(myId)) {
                Logger.log(`ResonanceSocket | Received targeted audio for ${myId}: ${data.key}`);
                handler.playLocal(data.key, data.options);
            }
        }
    }
}
