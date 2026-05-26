export class ResonanceForgeTestRunner {
    /**
     * Run Forge-safety smoke tests.
     *
     * @param {typeof SoundPackLoader} loader
     *   The already-initialized SoundPackLoader class, passed in by the caller.
     *   Accepting it as a parameter avoids a dynamic `await import()` which fails
     *   on Forge VTT because module files are served from a CDN and relative paths
     *   do not resolve from within an already-loaded module file.
     * @param {typeof SoundConfigApp} soundConfigApp
     *   The SoundConfigApp class, passed in by the caller for the same reason.
     */
    static async runAll(loader, soundConfigApp) {
        const results = [];
        let passed = 0;
        let failed = 0;

        // 1. SoundPackLoader smoke
        // loader is already initialized (SoundPackLoader.init() ran during module ready).
        // We only assert its post-init state -- no re-import or re-init needed.
        try {
            if (!loader) throw new Error("SoundPackLoader not provided by caller");

            const loadedState = loader.loaded;
            const packCount = loader.getLoadedPacks?.()?.length
                ?? loader._packs?.size
                ?? "unknown";
            passed++;
            results.push({
                name: "SoundPackLoader smoke",
                status: "pass",
                message: `loaded=${loadedState}, packs=${packCount}`
            });
        } catch (err) {
            failed++;
            results.push({
                name: "SoundPackLoader smoke",
                status: "fail",
                message: `SoundPackLoader check failed: ${err.message}`
            });
        }

        // 2. Partial registration
        try {
            const expected = [
                "modules/ionrift-resonance/templates/partials/auditor-list",
                "modules/ionrift-resonance/templates/partials/sound-card-row",
                "modules/ionrift-resonance/templates/partials/sound-group"
            ];

            // Accept either key form ("path" or "path.hbs"). Foundry's
            // loadTemplates registration form varies by version.
            const isRegistered = (key) => !!(
                Handlebars.partials[key] || Handlebars.partials[`${key}.hbs`]
            );
            const missing = expected.filter(key => !isRegistered(key));

            if (missing.length === 0) {
                passed++;
                results.push({
                    name: "Partial registration",
                    status: "pass",
                    message: `All ${expected.length} Resonance partials registered`
                });
            } else {
                failed++;
                results.push({
                    name: "Partial registration",
                    status: "fail",
                    message: `Missing partials: ${missing.join(", ")}`
                });
            }
        } catch (err) {
            failed++;
            results.push({
                name: "Partial registration",
                status: "fail",
                message: err.message
            });
        }

        // 3. SoundConfigApp._onSearch smoke — catches dangling variable references
        // Regression guard for v2.7.5: a stale `preset` variable caused a
        // ReferenceError the moment the sound picker opened. This test verifies
        // _onSearch() completes without throwing when given minimal stub data.
        try {
            if (!soundConfigApp) throw new Error("SoundConfigApp not provided by caller");

            const app = new soundConfigApp();

            // Stub the minimal state _onSearch reads before touching any real UI
            app._config = app._config ?? {};
            app._pendingSearch = null;

            // Call with a synthetic event pointing at a key that exists in SYRINSCAPE_DEFAULTS
            // (or any key — we only care that no ReferenceError is thrown)
            const fakeEvent = {
                currentTarget: {
                    closest: () => ({ dataset: { key: "combat-start" } })
                }
            };

            let threw = null;
            try {
                await app._onSearch?.(fakeEvent);
            } catch (err) {
                // A ReferenceError here means a dangling variable — that's the regression.
                // Other errors (e.g. UI not rendered) are acceptable.
                if (err instanceof ReferenceError) threw = err;
            }

            if (threw) {
                failed++;
                results.push({
                    name: "SoundConfigApp._onSearch no-throw",
                    status: "fail",
                    message: `ReferenceError in _onSearch: ${threw.message} — dangling variable reference`
                });
            } else {
                passed++;
                results.push({
                    name: "SoundConfigApp._onSearch no-throw",
                    status: "pass",
                    message: "_onSearch completed without a ReferenceError"
                });
            }
        } catch (err) {
            failed++;
            results.push({
                name: "SoundConfigApp._onSearch no-throw",
                status: "fail",
                message: `Setup error: ${err.message}`
            });
        }

        return { passed, failed, total: passed + failed, results };
    }
}
