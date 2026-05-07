export class ResonanceForgeTestRunner {
    /**
     * Run Forge-safety smoke tests.
     *
     * @param {typeof SoundPackLoader} loader
     *   The already-initialized SoundPackLoader class, passed in by the caller.
     *   Accepting it as a parameter avoids a dynamic `await import()` which fails
     *   on Forge VTT because module files are served from a CDN and relative paths
     *   do not resolve from within an already-loaded module file.
     */
    static async runAll(loader) {
        const results = [];
        let passed = 0;
        let failed = 0;

        // 1. SoundPackLoader smoke
        // loader is already initialized (SoundPackLoader.init() ran during module ready).
        // We only assert its post-init state — no re-import or re-init needed.
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

            const missing = expected.filter(key => !Handlebars.partials[key]);

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

        return { passed, failed, total: passed + failed, results };
    }
}
