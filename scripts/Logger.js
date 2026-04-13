/**
 * Local Logger Wrapper
 * Proxies to game.ionrift.lib.log if available, otherwise falls back to console.
 * Automatically injects the module name "Resonance".
 */
export class Logger {
    static MODULE_NAME = "Resonance";

    static get debugEnabled() {
        if (!game.settings?.settings?.has("ionrift-resonance.debug")) return false;
        return game.settings.get("ionrift-resonance", "debug");
    }

    static log(...args) {
        if (!this.debugEnabled) return;

        if (game.ionrift?.library?.log) {
            game.ionrift.library.log(this.MODULE_NAME, ...args);
        } else {
            // Fallback: Use standard console with prefix
            console.log(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static info(...args) {
        if (game.ionrift?.library?.Logger?.info) {
            game.ionrift.library.Logger.info(this.MODULE_NAME, ...args);
        } else {
            console.info(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static warn(...args) {
        if (game.ionrift?.library?.Logger?.warn) {
            game.ionrift.library.Logger.warn(this.MODULE_NAME, ...args);
        } else {
            console.warn(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static error(...args) {
        if (game.ionrift?.library?.Logger?.error) {
            game.ionrift.library.Logger.error(this.MODULE_NAME, ...args);
        } else {
            console.error(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }
}
