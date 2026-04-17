import { Logger } from "../Logger.js";

const PACK_ROOT = "ionrift-data/resonance/packs";
const MANIFEST_NAME = "manifest.json";
const BINDINGS_NAME = "bindings.json";

/**
 * Scans ionrift-data/resonance/packs/, validates each pack manifest + bindings,
 * resolves pack-relative audio paths, and exposes the merged result.
 *
 * Priority: preset keys > pack bindings > defaults.
 * Pack bindings are additive: multiple packs contribute without overwriting
 * each other (last-alphabetical wins on collision within the pack layer).
 */
export class SoundPackLoader {

    /** Foundry v13 namespaced FilePicker; falls back to global for v12. */
    static #FP = foundry.applications?.apps?.FilePicker ?? FilePicker;

    /**
     * FilePicker source for pack file resolution.
     * Always "data" — on The Forge, "forgevtt" (Asset Library) returns empty
     * file arrays for world-data paths, preventing manifest.json resolution.
     * The "data" source correctly returns full CDN URLs on both self-hosted
     * and Forge-hosted Foundry instances.
     */
    static get _fileSource() {
        return "data";
    }

    /** @type {Map<string, {manifest: Object, bindings: Object}>} */
    static _packs = new Map();

    /** Merged binding map across all enabled packs. */
    static _mergedBindings = {};

    /** True once init() has completed (success or not). */
    static _loaded = false;

    /**
     * Scans the pack directory, loads manifests and bindings, resolves paths.
     * Safe to call at boot; swallows errors per-pack so one broken pack
     * does not block the rest.
     */
    static async init() {
        this._packs.clear();
        this._mergedBindings = {};

        const enabledPacks = this._getEnabledPackIds();

        let packDirs;
        try {
            packDirs = await this._listPackDirectories();
        } catch (err) {
            Logger.log(`SoundPackLoader | Pack root not found or unreadable (${PACK_ROOT}). No packs loaded.`);
            this._loaded = true;
            return;
        }

        if (packDirs.length === 0) {
            Logger.log("SoundPackLoader | No pack directories found.");
            this._loaded = true;
            return;
        }

        // Sort alphabetical so collision order is deterministic
        packDirs.sort();

        for (const dir of packDirs) {
            try {
                await this._loadPack(dir, enabledPacks);
            } catch (err) {
                Logger.warn(`SoundPackLoader | Failed to load pack "${dir}":`, err.message);
            }
        }

        this._rebuildMergedBindings(enabledPacks);
        this._loaded = true;

        const total = this._packs.size;
        const enabled = [...this._packs.values()].filter(p => enabledPacks.has(p.manifest.id)).length;
        Logger.log(`SoundPackLoader | ${total} pack(s) scanned, ${enabled} enabled, ${Object.keys(this._mergedBindings).length} merged binding keys.`);
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
     * Returns metadata for every loaded pack (enabled or not).
     * @returns {Array<{id: string, name: string, version: string, description: string, author: string, enabled: boolean, bindingCount: number}>}
     */
    static getLoadedPacks() {
        const enabledPacks = this._getEnabledPackIds();
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
                bindingCount: Object.keys(entry.bindings).length
            });
        }
        return result;
    }

    /** @returns {boolean} */
    static get loaded() {
        return this._loaded;
    }

    // ───────────────────────────────────────────────────────────────
    //  INTERNALS
    // ───────────────────────────────────────────────────────────────

    /**
     * Reads the installedSoundPacks setting to determine which pack IDs
     * the GM has toggled on.
     * @returns {Set<string>}
     */
    static _getEnabledPackIds() {
        try {
            const setting = game.settings.get("ionrift-resonance", "installedSoundPacks") ?? {};
            const ids = new Set();
            for (const [id, enabled] of Object.entries(setting)) {
                if (enabled) ids.add(id);
            }
            return ids;
        } catch {
            return new Set();
        }
    }

    /**
     * Lists subdirectories under the pack root using FilePicker.
     * Each subdirectory is expected to contain manifest.json + bindings.json.
     * @returns {Promise<string[]>} directory names (not full paths)
     */
    static async _listPackDirectories() {
        const result = await SoundPackLoader.#FP.browse(this._fileSource, PACK_ROOT);
        return (result.dirs ?? []).map(d => d.split("/").pop());
    }

    /**
     * Loads a single pack: validates manifest, loads bindings, resolves paths.
     * @param {string} dirName
     * @param {Set<string>} enabledPacks
     */
    static async _loadPack(dirName, enabledPacks) {
        const basePath = `${PACK_ROOT}/${dirName}`;

        const manifest = await this._fetchJson(`${basePath}/${MANIFEST_NAME}`);
        if (!manifest) throw new Error(`Missing or invalid ${MANIFEST_NAME}`);
        if (!manifest.id || typeof manifest.id !== "string") {
            throw new Error(`Manifest missing required "id" field`);
        }

        let rawBindings = {};
        try {
            rawBindings = await this._fetchJson(`${basePath}/${BINDINGS_NAME}`) ?? {};
        } catch {
            Logger.warn(`SoundPackLoader | Pack "${dirName}" has no ${BINDINGS_NAME}, treating as empty.`);
        }

        // If bindings use the versioned envelope, unwrap
        if (rawBindings.bindings && typeof rawBindings.bindings === "object") {
            rawBindings = rawBindings.bindings;
        }

        // Resolve pack-relative paths to full Foundry-accessible paths
        const resolvedBindings = this._resolvePaths(rawBindings, basePath);

        this._packs.set(manifest.id, { manifest, bindings: resolvedBindings });
    }

    /**
     * Rebuilds _mergedBindings from all enabled packs (alphabetical order).
     * For array bindings: concatenates across packs.
     * For single-value bindings: last pack wins.
     * @param {Set<string>} enabledPacks
     */
    static _rebuildMergedBindings(enabledPacks) {
        const merged = {};

        for (const [, entry] of this._packs) {
            if (!enabledPacks.has(entry.manifest.id)) continue;

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
            const url = await this._resolveAssetUrl(path);
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }

    /**
     * Resolves a data-relative path to a fetchable URL.
     * On self-hosted Foundry the relative path works as-is.
     * On The Forge, browses the parent directory to find the real asset URL.
     * @param {string} path
     * @returns {Promise<string>}
     */
    static async _resolveAssetUrl(path) {
        if (typeof ForgeVTT === "undefined" || !ForgeVTT.usingTheForge) return path;

        const dir = path.substring(0, path.lastIndexOf("/"));
        const fileName = path.substring(path.lastIndexOf("/") + 1);
        const browseResult = await SoundPackLoader.#FP.browse(this._fileSource, dir);
        const fullUrl = (browseResult.files ?? []).find(f => f.endsWith(`/${fileName}`));
        return fullUrl ?? path;
    }
}
