/**
 * Local Logger Wrapper
 * Proxies to game.ionrift.lib.log if available, otherwise falls back to console.
 * Automatically injects the module name "Resonance".
 */
export class Logger {
    static MODULE_NAME = "Resonance";

    static log(...args) {
        if (game.ionrift?.lib?.log) {
            game.ionrift.lib.log(this.MODULE_NAME, ...args);
        } else {
            // Fallback: Use standard console with prefix
            console.log(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static info(...args) {
        if (game.ionrift?.lib?.Logger?.info) {
            game.ionrift.lib.Logger.info(this.MODULE_NAME, ...args);
        } else {
            console.info(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static warn(...args) {
        if (game.ionrift?.lib?.Logger?.warn) {
            game.ionrift.lib.Logger.warn(this.MODULE_NAME, ...args);
        } else {
            console.warn(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }

    static error(...args) {
        if (game.ionrift?.lib?.Logger?.error) {
            game.ionrift.lib.Logger.error(this.MODULE_NAME, ...args);
        } else {
            console.error(`Ionrift ${this.MODULE_NAME} |`, ...args);
        }
    }
}
