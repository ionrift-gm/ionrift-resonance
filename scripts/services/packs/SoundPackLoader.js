import { Logger } from "../../utils/Logger.js";
import { getWorldSetting } from "../../../../ionrift-library/scripts/services/platform/connectOwnedSettings.js";

const PACK_ROOT = "ionrift-data/resonance/packs";
const OVERLAY_ROOT = "ionrift-data/overlays/ionrift-resonance";
const MODULE_ID = "ionrift-resonance";
const MANIFEST_NAME = "manifest.json";
const BINDINGS_NAME = "bindings.json";
const OVERLAY_MANIFEST_NAME = "overlay-manifest.json";

export class SoundPackLoader {
    static get _FP() {
        return game.ionrift?.library?.platform?.FP ?? FilePicker;
    }
    static _packs = new Map();
    static _mergedBindings = {};
    static _dynamicClassifierBindings = new Map();
    static _dynamicAttackBindings = new Map();
    static _loaded = false;
    static async init() {
        this._packs.clear();
        this._mergedBindings = {};
        this._dynamicClassifierBindings.clear();
        this._dynamicAttackBindings.clear();

        const overlayActive = this._getOverlayActiveMap();

        const legacyDirs = await this._safeListDirectories(PACK_ROOT);
        const overlaySublayers = await this._listOverlaySublayers();

        // Overlay ids win on collision; load overlays before legacy.
        overlaySublayers.sort();
        await Promise.allSettled(overlaySublayers.map(sublayer =>
            this._loadOverlayPack(sublayer, overlayActive).catch(err =>
                Logger.warn(`SoundPackLoader | Failed to load overlay sublayer "${sublayer}":`, err.message)
            )
        ));

        legacyDirs.sort();
        await Promise.allSettled(legacyDirs.map(dir =>
            this._loadLegacyPack(dir).catch(err =>
                Logger.warn(`SoundPackLoader | Failed to load pack "${dir}":`, err.message)
            )
        ));

        const enabledPacks = this._computeEnabledPackIds(overlayActive);
        this._rebuildMergedBindings(enabledPacks);

        const isGM = !!game.user?.isGM;
        if (isGM) {
            // Publish even when empty so uninstall clears player cache.
            await this._publishCachedBindings();
        } else if (Object.keys(this._mergedBindings).length === 0) {
            // Player browse often empty (< TRUSTED); use GM cache.
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
    static refreshFromCache() {
        const cached = this._readCachedBindings();
        this._mergedBindings = cached;
        this._loaded = true;
        Logger.log(`SoundPackLoader | Refreshed bindings from cache (${Object.keys(cached).length} keys).`);
    }
    static async _listOverlaySublayers() {
        const found = new Set();
        const overlay = game.ionrift?.library?.overlay;

        if (overlay?.listInstalledSublayers) {
            try {
                for (const sublayer of await overlay.listInstalledSublayers(MODULE_ID)) {
                    if (sublayer) found.add(sublayer);
                }
            } catch (err) {
                Logger.warn("SoundPackLoader | overlay.listInstalledSublayers failed:", err?.message ?? err);
            }
        }

        // Only fall back to a direct browse when the library API found nothing.
        // Both paths return the same sublayers on most installs; running both
        // every boot is redundant IO.
        if (found.size === 0) {
            for (const sublayer of await this._safeListDirectories(OVERLAY_ROOT)) {
                if (sublayer) found.add(sublayer);
            }
        }

        return [...found].sort();
    }
    static async _safeListDirectories(root) {
        try {
            const result = await this._FP.browse("data", root);
            return (result.dirs ?? []).map(d => d.split("/").pop());
        } catch {
            Logger.log(`SoundPackLoader | Root not found or unreadable: ${root}`);
            return [];
        }
    }
    static _getOverlayActiveMap() {
        try {
            return getWorldSetting("overlayWorldState") ?? {};
        } catch {
            return {};
        }
    }
    static getMergedBindings() {
        return this._mergedBindings;
    }
    static getDynamicClassifierBinding(compositeKey) {
        const binding = this._dynamicClassifierBindings.get(compositeKey);
        return binding ? binding.soundKey : null;
    }
    static getAllDynamicClassifierBindings() {
        return this._dynamicClassifierBindings;
    }
    static getAttackBinding(monsterKey) {
        return this._dynamicAttackBindings.get(monsterKey) ?? null;
    }
    static getAllAttackBindings() {
        return this._dynamicAttackBindings;
    }
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
    static getPackInfo(packId) {
        return this._packs.get(packId) ?? null;
    }
    static get loaded() {
        return this._loaded;
    }

    // --  INTERNALS
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
    static async _loadOverlayPack(sublayer, overlayActive) {
        const basePath = `${OVERLAY_ROOT}/${sublayer}`;
        const overlay = game.ionrift?.library?.overlay;

        // Fire the overlay-manifest and pack-manifest fetches concurrently;
        // both are always needed and neither depends on the other.
        const [overlayMetaResult, probeManifest] = await Promise.all([
            this._fetchJson(`${basePath}/${OVERLAY_MANIFEST_NAME}`),
            this._fetchJson(`${basePath}/${MANIFEST_NAME}`),
        ]);

        let overlayMeta = overlayMetaResult;
        if (!overlayMeta?.overlayId && overlay?.getLocalManifest) {
            overlayMeta = await overlay.getLocalManifest(MODULE_ID, sublayer);
        }
        if (!overlayMeta?.overlayId) {
            const platform = game.ionrift?.library?.platform;
            if (platform?.readDataJson) {
                overlayMeta = await platform.readDataJson(`${basePath}/${OVERLAY_MANIFEST_NAME}`);
            }
        }

        if (!probeManifest) {
            Logger.log(`SoundPackLoader | Overlay sublayer "${sublayer}" has no pack manifest.json; skipping.`);
            return;
        }

        const overlayId = overlayMeta?.overlayId ?? this._resolveOverlayId(sublayer, overlayActive);
        if (!overlayId) {
            Logger.log(`SoundPackLoader | Overlay sublayer "${sublayer}" has no overlay-manifest.json; skipping.`);
            return;
        }

        const { manifest, bindings } = await this._readPackFiles(basePath, sublayer);

        this._packs.set(manifest.id, {
            manifest,
            bindings,
            source: "overlay",
            path: basePath,
            overlayId,
            sublayer
        });
    }
    static _resolveOverlayId(sublayer, overlayActive) {
        const candidate = `resonance-${sublayer}-overlay`;
        if (overlayActive[candidate] !== undefined) return candidate;
        for (const overlayId of Object.keys(overlayActive)) {
            if (overlayId.startsWith("resonance-") && overlayId.endsWith(`-${sublayer}-overlay`)) {
                return overlayId;
            }
        }
        return candidate;
    }
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
    static _rebuildMergedBindings(enabledPacks) {
        const merged = {};
        this._dynamicClassifierBindings.clear();
        this._dynamicAttackBindings.clear();

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

            // Extract attack bindings from manifest (basic attack + spell attack matchers)
            const ab = entry.manifest.attackBindings;
            if (ab && typeof ab === "object") {
                for (const [monsterKey, config] of Object.entries(ab)) {
                    if (typeof monsterKey !== "string" || !config || typeof config !== "object") continue;
                    // Validate shape: attack must be string if present,
                    // spellAttacks must be array if present.
                    const normalized = {};
                    if (typeof config.attack === "string") normalized.attack = config.attack;
                    if (Array.isArray(config.spellAttacks) && config.spellAttacks.length > 0) {
                        normalized.spellAttacks = config.spellAttacks.filter(
                            m => m && typeof m === "object" && typeof m.key === "string"
                        );
                    }
                    if (normalized.attack || normalized.spellAttacks) {
                        this._dynamicAttackBindings.set(monsterKey, normalized);
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
    static _resolveEntry(entry, basePath) {
        if (!entry || typeof entry !== "object" || !entry.id) return entry;
        if (typeof entry.id !== "string") return entry;

        const id = entry.id;
        if (id.startsWith("modules/") || id.startsWith("ionrift-data/") || id.startsWith("http")) {
            return entry;
        }

        return { ...entry, id: `${basePath}/${id}` };
    }
    static async _fetchJson(path) {
        try {
            // Forge: resolve CDN URL via platform helper.
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
