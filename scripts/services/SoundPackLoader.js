import { Logger } from "../Logger.js";

const PACK_ROOT = "ionrift-data/resonance/packs";
const OVERLAY_ROOT = "ionrift-data/overlays/ionrift-resonance";
const MANIFEST_NAME = "manifest.json";
const BINDINGS_NAME = "bindings.json";
const OVERLAY_MANIFEST_NAME = "overlay-manifest.json";

/**
 * Scans Resonance pack roots, validates each pack manifest + bindings,
 * resolves pack-relative audio paths, and exposes the merged result.
 *
 * Two roots are scanned:
 *   1. ionrift-data/resonance/packs/{packDir}/   (legacy + zip-imported packs)
 *   2. ionrift-data/overlays/ionrift-resonance/{sublayer}/   (Patreon Library overlays)
 *
 * Overlay bundle layout contract (see LIB_API_REFERENCE.md): manifest.json
 * and bindings.json must sit at the sublayer root, alongside overlay-manifest.json.
 *
 * Pack id collision: overlay wins. The legacy copy stays on disk and reactivates
 * if the overlay is uninstalled, but is shadowed while both are present.
 *
 * Priority: preset keys > pack bindings > defaults.
 * Pack bindings are additive: multiple packs contribute without overwriting
 * each other (last-alphabetical wins on collision within the pack layer).
 */
export class SoundPackLoader {

    /**
     * Returns the platform-correct FilePicker class from the kernel.
     * Falls back to global FilePicker if the library hasn't initialized.
     * @returns {FilePicker}
     */
    static get _FP() {
        return game.ionrift?.library?.platform?.FP ?? FilePicker;
    }

    /**
     * @type {Map<string, {manifest: Object, bindings: Object, source: "legacy"|"overlay", path: string, overlayId?: string, sublayer?: string}>}
     */
    static _packs = new Map();

    /** Merged binding map across all enabled packs. */
    static _mergedBindings = {};

    /**
     * Dynamic classifier bindings contributed by sound packs.
     * Maps subtype composite keys (e.g. "undead_vampire") to sound event
     * keys (e.g. "MONSTER_VAMPIRE"). Populated from pack manifest
     * `classifierBindings` fields during init.
     * @type {Map<string, string>}
     */
    static _dynamicClassifierBindings = new Map();

    /** True once init() has completed (success or not). */
    static _loaded = false;

    /**
     * Scans both pack roots, loads manifests and bindings, resolves paths.
     * Safe to call at boot; swallows errors per-pack so one broken pack
     * does not block the rest.
     *
     * Player-side fallback: in Foundry v13+, FILES_BROWSE defaults to
     * Trusted+ so regular players (role 1) get an empty result from
     * FilePicker.browse and would otherwise end up with zero bindings.
     * The GM publishes the merged result to the `cachedMergedBindings`
     * world setting after every successful init, and non-GM clients that
     * end up with an empty merged map fall back to that cache.
     */
    static async init() {
        this._packs.clear();
        this._mergedBindings = {};
        this._dynamicClassifierBindings.clear();

        const overlayActive = this._getOverlayActiveMap();

        const legacyDirs = await this._safeListDirectories(PACK_ROOT);
        const overlaySublayers = await this._safeListDirectories(OVERLAY_ROOT);

        // Load overlay packs first so they claim ids; legacy packs that collide
        // are skipped with a console note (overlay-wins rule).
        overlaySublayers.sort();
        for (const sublayer of overlaySublayers) {
            try {
                await this._loadOverlayPack(sublayer, overlayActive);
            } catch (err) {
                Logger.warn(`SoundPackLoader | Failed to load overlay sublayer "${sublayer}":`, err.message);
            }
        }

        legacyDirs.sort();
        for (const dir of legacyDirs) {
            try {
                await this._loadLegacyPack(dir);
            } catch (err) {
                Logger.warn(`SoundPackLoader | Failed to load pack "${dir}":`, err.message);
            }
        }

        const enabledPacks = this._computeEnabledPackIds(overlayActive);
        this._rebuildMergedBindings(enabledPacks);

        const isGM = !!game.user?.isGM;
        if (isGM) {
            // GM owns the cache. Publish even when empty so a player who
            // joins after a pack is uninstalled gets the cleared state.
            await this._publishCachedBindings();
        } else if (Object.keys(this._mergedBindings).length === 0) {
            // Non-GM browse returned nothing (typical for role < TRUSTED).
            // Adopt whatever the GM last published so playback works locally.
            const cached = this._readCachedBindings();
            const cachedKeys = Object.keys(cached).length;
            if (cachedKeys > 0) {
                this._mergedBindings = cached;
                Logger.log(`SoundPackLoader | Adopted ${cachedKeys} cached binding keys from GM (player fallback).`);
            }
        }

        this._loaded = true;

        const total = this._packs.size;
        const enabled = [...this._packs.values()].filter(p => enabledPacks.has(p.manifest.id)).length;
        Logger.log(`SoundPackLoader | ${total} pack(s) scanned, ${enabled} enabled, ${Object.keys(this._mergedBindings).length} merged binding keys.`);
    }

    /**
     * Read the GM-published cache. Returns {} on parse failure or when
     * the setting is unregistered (defensive: SoundPackLoader can run
     * before settings registration in tests).
     * @returns {Object}
     */
    static _readCachedBindings() {
        try {
            const raw = game.settings?.get?.("ionrift-resonance", "cachedMergedBindings") ?? "{}";
            if (!raw || raw === "{}") return {};
            return JSON.parse(raw);
        } catch (err) {
            Logger.warn("SoundPackLoader | Failed to parse cachedMergedBindings:", err?.message ?? err);
            return {};
        }
    }

    /**
     * Persist the merged bindings to the world-scoped cache so non-GM
     * clients can read it. Idempotent: skips the write when the
     * serialized payload matches the existing setting value.
     */
    static async _publishCachedBindings() {
        try {
            const serialized = JSON.stringify(this._mergedBindings ?? {});
            const current = game.settings?.get?.("ionrift-resonance", "cachedMergedBindings") ?? "{}";
            if (current === serialized) return;
            await game.settings.set("ionrift-resonance", "cachedMergedBindings", serialized);
            Logger.log(`SoundPackLoader | Published ${Object.keys(this._mergedBindings).length} merged binding keys for player clients.`);
        } catch (err) {
            Logger.warn("SoundPackLoader | Failed to publish cachedMergedBindings:", err?.message ?? err);
        }
    }

    /**
     * Reload merged bindings from the GM-published cache without
     * re-scanning the pack root. Called from SoundHandler when the
     * cachedMergedBindings setting changes (GM toggled a pack).
     */
    static refreshFromCache() {
        const cached = this._readCachedBindings();
        this._mergedBindings = cached;
        this._loaded = true;
        Logger.log(`SoundPackLoader | Refreshed bindings from cache (${Object.keys(cached).length} keys).`);
    }

    /**
     * Lists subdirectories at a root path, returning [] when the root is missing
     * or unreadable rather than throwing.
     * @param {string} root
     * @returns {Promise<string[]>}
     */
    static async _safeListDirectories(root) {
        try {
            const result = await this._FP.browse("data", root);
            return (result.dirs ?? []).map(d => d.split("/").pop());
        } catch {
            Logger.log(`SoundPackLoader | Root not found or unreadable: ${root}`);
            return [];
        }
    }

    /**
     * Reads ionrift-library's overlayWorldState once per init.
     * @returns {Record<string, { active?: boolean }>}
     */
    static _getOverlayActiveMap() {
        try {
            return game.settings.get("ionrift-library", "overlayWorldState") ?? {};
        } catch {
            return {};
        }
    }

    /**
     * Returns the merged binding map from all enabled packs.
     * Keys are standard Resonance event keys (CORE_HIT, SPELL_FIRE, etc.).
     * Values follow the same shape as preset bindings (array of sound objects or single object).
     * @returns {Object}
     */
    static getMergedBindings() {
        return this._mergedBindings;
    }

    /**
     * Get the dynamic classifier binding for a subtype composite key.
     * Returns null if no pack has declared a mapping for this subtype.
     * Used by MonsterVocalMap to resolve pack-contributed creature types.
     * @param {string} compositeKey - e.g. "undead_vampire"
     * @returns {string|null} - e.g. "MONSTER_VAMPIRE"
     */
    static getDynamicClassifierBinding(compositeKey) {
        const binding = this._dynamicClassifierBindings.get(compositeKey);
        return binding ? binding.soundKey : null;
    }

    /**
     * Returns all dynamic classifier bindings from enabled packs.
     * Used by SoundConfigApp to inject pack-contributed creature types
     * into the monster taxonomy UI.
     * @returns {Map<string, {soundKey: string, packName: string}>} compositeKey → binding info
     */
    static getAllDynamicClassifierBindings() {
        return this._dynamicClassifierBindings;
    }

    /**
     * Returns metadata for every loaded pack (enabled or not).
     * @returns {Array<{id: string, name: string, version: string, description: string, author: string, enabled: boolean, bindingCount: number, source: "legacy"|"overlay"}>}
     */
    static getLoadedPacks() {
        const overlayActive = this._getOverlayActiveMap();
        const enabledPacks = this._computeEnabledPackIds(overlayActive);
        const result = [];
        for (const [, entry] of this._packs) {
            const m = entry.manifest;
            result.push({
                id: m.id,
                name: m.name ?? m.id,
                version: m.version ?? "0.0.0",
                description: m.description ?? "",
                author: m.author ?? "",
                enabled: enabledPacks.has(m.id),
                bindingCount: Object.keys(entry.bindings).length,
                source: entry.source
            });
        }
        return result;
    }

    /**
     * Look up a loaded pack by id.
     * @param {string} packId
     * @returns {{manifest: Object, bindings: Object, source: "legacy"|"overlay", path: string, overlayId?: string, sublayer?: string}|null}
     */
    static getPackInfo(packId) {
        return this._packs.get(packId) ?? null;
    }

    /** @returns {boolean} */
    static get loaded() {
        return this._loaded;
    }

    // --  INTERNALS

    /**
     * Compute the effective enabled pack ids.
     *
     * Legacy packs follow the `installedSoundPacks` setting.
     * Overlay-derived packs follow `overlayWorldState[overlayId].active`, so the
     * Patreon Library toggle drives enable/disable without write-through.
     *
     * @param {Record<string, { active?: boolean }>} overlayActive
     * @returns {Set<string>}
     */
    static _computeEnabledPackIds(overlayActive) {
        const enabled = new Set();
        let legacyToggles = {};
        try {
            legacyToggles = game.settings.get("ionrift-resonance", "installedSoundPacks") ?? {};
        } catch { /* setting unregistered during early boot; treat as empty */ }

        for (const [, entry] of this._packs) {
            const id = entry.manifest.id;
            if (entry.source === "overlay") {
                const state = overlayActive[entry.overlayId];
                if (state?.active !== false) enabled.add(id);
            } else if (legacyToggles[id]) {
                enabled.add(id);
            }
        }
        return enabled;
    }

    /**
     * Loads a legacy pack from ionrift-data/resonance/packs/{dirName}/.
     * @param {string} dirName
     */
    static async _loadLegacyPack(dirName) {
        const basePath = `${PACK_ROOT}/${dirName}`;
        const { manifest, bindings } = await this._readPackFiles(basePath, dirName);

        if (this._packs.has(manifest.id)) {
            const incumbent = this._packs.get(manifest.id);
            Logger.log(`SoundPackLoader | Legacy pack "${dirName}" shadowed by ${incumbent.source} pack with same id "${manifest.id}".`);
            return;
        }
        this._packs.set(manifest.id, { manifest, bindings, source: "legacy", path: basePath });
    }

    /**
     * Loads an overlay-installed pack from ionrift-data/overlays/ionrift-resonance/{sublayer}/.
     * Reads overlay-manifest.json to recover the overlayId for enable-state lookup.
     * @param {string} sublayer
     * @param {Record<string, { active?: boolean }>} overlayActive
     */
    static async _loadOverlayPack(sublayer, overlayActive) {
        const basePath = `${OVERLAY_ROOT}/${sublayer}`;

        const overlayMeta = await this._fetchJson(`${basePath}/${OVERLAY_MANIFEST_NAME}`);
        if (!overlayMeta?.overlayId) {
            Logger.log(`SoundPackLoader | Overlay sublayer "${sublayer}" has no overlay-manifest.json; skipping.`);
            return;
        }

        const probeManifest = await this._fetchJson(`${basePath}/${MANIFEST_NAME}`);
        if (!probeManifest) {
            Logger.log(`SoundPackLoader | Overlay sublayer "${sublayer}" has no pack manifest.json; skipping.`);
            return;
        }

        const { manifest, bindings } = await this._readPackFiles(basePath, sublayer);

        this._packs.set(manifest.id, {
            manifest,
            bindings,
            source: "overlay",
            path: basePath,
            overlayId: overlayMeta.overlayId,
            sublayer
        });
    }

    /**
     * Reads manifest.json + bindings.json from a pack base path.
     * @param {string} basePath
     * @param {string} label  Used in error messages
     * @returns {Promise<{manifest: Object, bindings: Object}>}
     */
    static async _readPackFiles(basePath, label) {
        const manifest = await this._fetchJson(`${basePath}/${MANIFEST_NAME}`);
        if (!manifest) throw new Error(`Missing or invalid ${MANIFEST_NAME}`);
        if (!manifest.id || typeof manifest.id !== "string") {
            throw new Error(`Manifest at "${label}" missing required "id" field`);
        }

        let rawBindings = {};
        try {
            rawBindings = await this._fetchJson(`${basePath}/${BINDINGS_NAME}`) ?? {};
        } catch {
            Logger.warn(`SoundPackLoader | Pack "${label}" has no ${BINDINGS_NAME}, treating as empty.`);
        }

        // If bindings use the versioned envelope, unwrap.
        if (rawBindings.bindings && typeof rawBindings.bindings === "object") {
            rawBindings = rawBindings.bindings;
        }

        const bindings = this._resolvePaths(rawBindings, basePath);
        return { manifest, bindings };
    }

    /**
     * Rebuilds _mergedBindings from all enabled packs (alphabetical order).
     * For array bindings: concatenates across packs.
     * For single-value bindings: last pack wins.
     * @param {Set<string>} enabledPacks
     */
    static _rebuildMergedBindings(enabledPacks) {
        const merged = {};
        this._dynamicClassifierBindings.clear();

        for (const [, entry] of this._packs) {
            if (!enabledPacks.has(entry.manifest.id)) continue;

            // Extract classifier bindings from manifest (plug-in architecture)
            const cb = entry.manifest.classifierBindings;
            if (cb && typeof cb === "object") {
                let packName = entry.manifest.title || entry.manifest.name || entry.manifest.id;
                // Make the badge title more terse by stripping common suffixes
                packName = packName.replace(/\s+(Creature SFX|SFX|Sound Pack|Pack)$/i, '');
                
                const packIcon = entry.manifest.icon || "fa-layer-group";

                for (const [subtypeKey, soundKey] of Object.entries(cb)) {
                    if (typeof subtypeKey === "string" && typeof soundKey === "string") {
                        this._dynamicClassifierBindings.set(subtypeKey, {
                            soundKey: soundKey,
                            packName: packName,
                            packIcon: packIcon
                        });
                    }
                }
            }

            for (const [key, value] of Object.entries(entry.bindings)) {
                if (!value) continue;

                if (Array.isArray(value)) {
                    if (!merged[key]) merged[key] = [];
                    if (Array.isArray(merged[key])) {
                        merged[key] = merged[key].concat(value);
                    } else {
                        merged[key] = [merged[key], ...value];
                    }
                } else if (typeof value === "object" && value.id) {
                    if (Array.isArray(merged[key])) {
                        merged[key].push(value);
                    } else {
                        merged[key] = value;
                    }
                } else {
                    merged[key] = value;
                }
            }
        }

        this._mergedBindings = merged;
    }

    /**
     * Walks a bindings object and resolves any relative audio paths
     * to full paths rooted at the pack directory.
     *
     * Paths that already start with "modules/", "ionrift-data/", or "http"
     * are treated as absolute and left untouched.
     *
     * @param {Object} bindings
     * @param {string} basePath
     * @returns {Object}
     */
    static _resolvePaths(bindings, basePath) {
        const resolved = {};

        for (const [key, value] of Object.entries(bindings)) {
            if (Array.isArray(value)) {
                resolved[key] = value.map(entry => this._resolveEntry(entry, basePath));
            } else if (typeof value === "object" && value !== null && value.id) {
                resolved[key] = this._resolveEntry(value, basePath);
            } else {
                resolved[key] = value;
            }
        }

        return resolved;
    }

    /**
     * Resolves a single sound entry's id path.
     * @param {Object} entry - {id, name, type}
     * @param {string} basePath
     * @returns {Object}
     */
    static _resolveEntry(entry, basePath) {
        if (!entry || typeof entry !== "object" || !entry.id) return entry;
        if (typeof entry.id !== "string") return entry;

        const id = entry.id;
        if (id.startsWith("modules/") || id.startsWith("ionrift-data/") || id.startsWith("http")) {
            return entry;
        }

        return { ...entry, id: `${basePath}/${id}` };
    }

    /**
     * Fetches and parses a JSON file, returning null on failure.
     * On The Forge, relative data paths don't resolve against the web root,
     * so we browse the parent directory to discover the real asset URL first.
     * @param {string} path
     * @returns {Promise<Object|null>}
     */
    static async _fetchJson(path) {
        try {
            // PlatformHelper.resolveAssetUrl handles the Forge CDN lookup.
            const platform = game.ionrift?.library?.platform;
            const url = platform ? await platform.resolveAssetUrl(path) : path;
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }
}
