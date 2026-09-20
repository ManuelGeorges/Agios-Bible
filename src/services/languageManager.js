import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { fetchWithTimeout } from '../lib/utils';

const R2_URL = 'https://translations.agiosbible.com';
const MANIFEST_URL = `${R2_URL}/manifest.json`;

const DB_NAME = 'agios-translations';
const DB_VERSION = 1;
const STORE_NAME = 'files';

const METADATA_KEY = 'translation_metadata';

// Worst case for a first download = MANIFEST_TIMEOUT + FILE_DOWNLOAD_TIMEOUT (13s).
// The provider's outer timeout must be larger than this.
const MANIFEST_TIMEOUT = 3000;
const FILE_DOWNLOAD_TIMEOUT = 10000;

// =========================================================
// Runtime caches
// =========================================================

// Manifest lives in RAM for the whole session
let manifestCache = null;

// Prevents more than one manifest request at a time
let manifestPromise = null;

// Metadata lives in RAM instead of hitting Preferences on every operation
let metadataCache = null;
let metadataPromise = null;

// IndexedDB connection (cached)
let dbPromise = null;

// Files that already had a background update scheduled this session
const backgroundUpdates = new Set();

// Downloads currently in flight (deduplicated by key)
const downloadPromises = new Map();

// =========================================================
// Update events
//
// The provider subscribes to these so that:
//  - a finished background download updates the UI + RAM cache
//  - clearing the cache also clears the provider's RAM cache
// =========================================================

const listeners = new Set();

function emit(event) {
    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.warn('[LanguageManager] Listener error:', error);
        }
    }
}

function splitKey(key) {
    const index = key.indexOf('/');

    return {
        folder: key.substring(0, index),
        fileName: key.substring(index + 1)
    };
}

// =========================================================
// Background download queue
// =========================================================

// Max simultaneous background downloads (friendly to mobile networks)
const MAX_BACKGROUND_DOWNLOADS = 2;

let activeBackgroundDownloads = 0;

const backgroundDownloadQueue = [];

function processBackgroundQueue() {
    while (
        activeBackgroundDownloads < MAX_BACKGROUND_DOWNLOADS &&
        backgroundDownloadQueue.length > 0
    ) {
        const task = backgroundDownloadQueue.shift();

        activeBackgroundDownloads++;

        Promise.resolve()
            .then(task)
            .catch(() => {})
            .finally(() => {
                activeBackgroundDownloads--;
                processBackgroundQueue();
            });
    }
}

function enqueueBackgroundTask(task) {
    backgroundDownloadQueue.push(task);
    processBackgroundQueue();
}

// =========================================================
// Platform
// =========================================================

const isNative = () => Capacitor.isNativePlatform();

// =========================================================
// IndexedDB
// =========================================================

function openDB() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            // Connection closed unexpectedly -> reopen next time
            db.onclose = () => {
                dbPromise = null;
            };

            resolve(db);
        };

        request.onerror = () => {
            dbPromise = null;
            reject(request.error);
        };
    });

    return dbPromise;
}

async function idbGet(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readonly')
            .objectStore(STORE_NAME)
            .get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function idbSet(value) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .put(value);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function idbDelete(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function idbGetAllKeys() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readonly')
            .objectStore(STORE_NAME)
            .getAllKeys();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// =========================================================
// Metadata
// =========================================================

async function getMetadata() {
    // Fastest path: RAM
    if (metadataCache !== null) {
        return metadataCache;
    }

    // A Preferences read is already running
    if (metadataPromise) {
        return await metadataPromise;
    }

    metadataPromise = (async () => {
        try {
            const result = await Preferences.get({ key: METADATA_KEY });

            if (!result.value) {
                metadataCache = {};
                return metadataCache;
            }

            try {
                metadataCache = JSON.parse(result.value);
            } catch {
                metadataCache = {};
            }

            return metadataCache;
        } catch {
            metadataCache = {};
            return metadataCache;
        } finally {
            metadataPromise = null;
        }
    })();

    return await metadataPromise;
}

// Writes to Preferences are serialized. This promise never rejects:
// failing to persist metadata must not fail a download that succeeded
// (the file will simply be re-checked next time).
let metadataWritePromise = Promise.resolve();

function saveMetadata(metadata) {
    metadataCache = metadata;

    metadataWritePromise = metadataWritePromise.then(async () => {
        try {
            await Preferences.set({
                key: METADATA_KEY,
                value: JSON.stringify(metadata)
            });
        } catch (error) {
            console.warn('[LanguageManager] Failed to save metadata:', error);
        }
    });

    return metadataWritePromise;
}

async function setFileMetadata(key, version) {
    const metadata = await getMetadata();

    metadata[key] = {
        version,
        updatedAt: Date.now()
    };

    await saveMetadata(metadata);
}

async function removeMetadataKeys(keys) {
    if (keys.length === 0) {
        return;
    }

    const metadata = await getMetadata();

    for (const key of keys) {
        delete metadata[key];
    }

    await saveMetadata(metadata);
}

async function getFileMetadata(key) {
    const metadata = await getMetadata();

    return metadata[key] || null;
}

// =========================================================
// Native Filesystem
// =========================================================

async function getNativeFile(path) {
    try {
        const file = await Filesystem.readFile({
            path,
            directory: Directory.Data,
            encoding: Encoding.UTF8
        });

        return JSON.parse(file.data);
    } catch {
        return null;
    }
}

async function saveNativeFile(path, data) {
    const lastSlash = path.lastIndexOf('/');

    if (lastSlash !== -1) {
        await Filesystem.mkdir({
            path: path.substring(0, lastSlash),
            directory: Directory.Data,
            recursive: true
        }).catch(() => {});
    }

    await Filesystem.writeFile({
        path,
        directory: Directory.Data,
        data: JSON.stringify(data),
        encoding: Encoding.UTF8
    });
}

async function deleteNativeFile(path) {
    try {
        await Filesystem.deleteFile({
            path,
            directory: Directory.Data
        });
    } catch {}
}

async function removeNativeFolder(path) {
    try {
        await Filesystem.rmdir({
            path,
            directory: Directory.Data,
            recursive: true
        });
    } catch {}
}

// =========================================================
// Cache helpers (do NOT depend on the manifest being loaded)
// =========================================================

async function deleteFileByKey(key) {
    if (isNative()) {
        await deleteNativeFile(`translations/${key}`);
    } else {
        await idbDelete(key).catch(() => {});
    }
}

/**
 * Collects every known cache key ("folder/file.json") starting with `prefix`
 * from metadata, the manifest (if loaded) and IndexedDB (web).
 * Works offline because it doesn't need the manifest.
 */
async function collectKnownKeys(prefix = '') {
    const keys = new Set();

    const metadata = await getMetadata();

    for (const key of Object.keys(metadata)) {
        if (key.startsWith(prefix)) {
            keys.add(key);
        }
    }

    const languages = manifestCache?.languages || {};

    for (const [folder, language] of Object.entries(languages)) {
        for (const fileName of Object.keys(language.files || {})) {
            const key = `${folder}/${fileName}`;

            if (key.startsWith(prefix)) {
                keys.add(key);
            }
        }
    }

    if (!isNative()) {
        try {
            for (const key of await idbGetAllKeys()) {
                if (typeof key === 'string' && key.startsWith(prefix)) {
                    keys.add(key);
                }
            }
        } catch {}
    }

    return [...keys];
}

const getVersion = (manifestFile, language) => {
    return manifestFile?.version || language?.version || 1;
};

// =========================================================
// Language Manager
// =========================================================

export const languageManager = {

    // =====================================================
    // Events
    // =====================================================

    /**
     * Subscribe to { type: 'updated' | 'cleared', folder, fileName, data? }
     * Returns an unsubscribe function.
     */
    subscribe(listener) {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },

    // =====================================================
    // Manifest
    // =====================================================

    async init() {
        if (manifestCache) {
            return true;
        }

        if (manifestPromise) {
            return await manifestPromise;
        }

        manifestPromise = (async () => {
            try {
                const response = await fetchWithTimeout(MANIFEST_URL, {
                    cache: 'no-store',
                    timeout: MANIFEST_TIMEOUT
                });

                if (!response.ok) {
                    throw new Error(`Manifest request failed: ${response.status}`);
                }

                manifestCache = await response.json();

                return true;
            } catch (error) {
                console.warn('[LanguageManager] Manifest request failed:', error);

                return false;
            } finally {
                manifestPromise = null;
            }
        })();

        return await manifestPromise;
    },

    async getManifest(forceRefresh = false) {
        if (!forceRefresh && manifestCache) {
            return manifestCache;
        }

        if (forceRefresh) {
            return await this.refreshManifest();
        }

        const success = await this.init();

        if (!success) {
            return null;
        }

        return manifestCache;
    },

    async refreshManifest() {
        if (manifestPromise) {
            await manifestPromise;

            return manifestCache;
        }

        const previous = manifestCache;

        manifestPromise = (async () => {
            try {
                const response = await fetchWithTimeout(MANIFEST_URL, {
                    cache: 'no-store',
                    timeout: MANIFEST_TIMEOUT
                });

                if (!response.ok) {
                    throw new Error(`Manifest request failed: ${response.status}`);
                }

                manifestCache = await response.json();

                return true;
            } catch (error) {
                console.warn('[LanguageManager] Manifest refresh failed:', error);

                // Keep the old one
                manifestCache = previous;

                return false;
            } finally {
                manifestPromise = null;
            }
        })();

        await manifestPromise;

        return manifestCache;
    },

    // =====================================================
    // Local Copy
    // =====================================================

    async getLocalCopy(langFolder, fileName) {
        if (isNative()) {
            return await getNativeFile(`translations/${langFolder}/${fileName}`);
        }

        try {
            const cached = await idbGet(`${langFolder}/${fileName}`);

            return cached ? cached.data : null;
        } catch (error) {
            // IndexedDB can be unavailable (private mode, quota, etc.)
            console.warn('[LanguageManager] IndexedDB read failed:', error);

            return null;
        }
    },

    async hasLocalCopy(langFolder, fileName) {
        const data = await this.getLocalCopy(langFolder, fileName);

        return data !== null;
    },

    // =====================================================
    // Main File Getter
    // =====================================================

    async getFile(langFolder, fileName) {
        // STEP 1: local first
        const localCopy = await this.getLocalCopy(langFolder, fileName);

        if (localCopy !== null) {
            // Background only. Never wait for the network here.
            this.updateFileInBackground(langFolder, fileName);

            return localCopy;
        }

        // STEP 2: first download
        return await this.downloadMissingFile(langFolder, fileName);
    },

    // =====================================================
    // First Download
    //
    // FIX: this method must NOT register itself in
    // `downloadPromises`. Only downloadAndSaveOnce dedupes.
    // Before, both used the same key, so the inner call
    // awaited the outer promise, which was awaiting it
    // (a deadlock).
    // =====================================================

    async downloadMissingFile(langFolder, fileName) {
        const manifest = await this.getManifest();

        if (!manifest) {
            throw new Error('Manifest unavailable and no local copy found');
        }

        const language = manifest.languages?.[langFolder];

        if (!language) {
            throw new Error(`Language "${langFolder}" not found`);
        }

        const manifestFile = language.files?.[fileName];

        if (!manifestFile) {
            throw new Error(`File "${fileName}" not found in "${langFolder}"`);
        }

        return await this.downloadAndSaveOnce(
            langFolder,
            fileName,
            manifestFile,
            getVersion(manifestFile, language)
        );
    },

    // =====================================================
    // Background Update
    // =====================================================

    updateFileInBackground(langFolder, fileName) {
        const key = `${langFolder}/${fileName}`;

        // Already scheduled this session
        if (backgroundUpdates.has(key)) {
            return;
        }

        backgroundUpdates.add(key);

        enqueueBackgroundTask(async () => {
            try {
                const success = await this.init();
                const manifest = manifestCache;

                if (!success || !manifest) {
                    // Offline / manifest failed: allow a later retry
                    backgroundUpdates.delete(key);
                    return;
                }

                const language = manifest.languages?.[langFolder];
                const manifestFile = language?.files?.[fileName];

                if (!manifestFile) {
                    return;
                }

                const version = getVersion(manifestFile, language);

                const metadata = await getFileMetadata(key);

                // Already the latest version
                if (metadata?.version === version) {
                    return;
                }

                await this.downloadAndSaveOnce(
                    langFolder,
                    fileName,
                    manifestFile,
                    version
                );

                console.log(`[LanguageManager] Background update completed: ${key}`);
            } catch (error) {
                // Allow a later retry
                backgroundUpdates.delete(key);

                console.warn(
                    `[LanguageManager] Background update failed for ${key}:`,
                    error
                );
            }
        });
    },

    // =====================================================
    // Force Update
    //
    // Downloads the manifest version of a file right now,
    // bypassing the "local copy first" path. Emits an
    // 'updated' event so the UI/RAM cache pick it up.
    // =====================================================

    async forceUpdate(langFolder, fileName) {
        const manifest = await this.getManifest();

        const language = manifest?.languages?.[langFolder];
        const manifestFile = language?.files?.[fileName];

        if (!manifestFile) {
            return null;
        }

        return await this.downloadAndSaveOnce(
            langFolder,
            fileName,
            manifestFile,
            getVersion(manifestFile, language)
        );
    },

    // =====================================================
    // Download & Save - Deduplicated (the ONLY dedupe point)
    // =====================================================

    async downloadAndSaveOnce(langFolder, fileName, manifestFile, version) {
        const key = `${langFolder}/${fileName}`;

        // has() + set() run synchronously, so this is race-free
        if (downloadPromises.has(key)) {
            return await downloadPromises.get(key);
        }

        const promise = this.downloadAndSave(
            langFolder,
            fileName,
            manifestFile,
            version
        );

        downloadPromises.set(key, promise);

        try {
            return await promise;
        } finally {
            downloadPromises.delete(key);
        }
    },

    // =====================================================
    // Actual Download & Save
    // =====================================================

    async downloadAndSave(langFolder, fileName, manifestFile, version) {
        const key = `${langFolder}/${fileName}`;
        const url = `${R2_URL}/${manifestFile.path}`;

        let data;

        // ---------------------------------------------------
        // Download + parse
        // ---------------------------------------------------

        try {
            const response = await fetchWithTimeout(url, {
                timeout: FILE_DOWNLOAD_TIMEOUT
            });

            if (!response.ok) {
                throw new Error(`Failed to download ${url}: ${response.status}`);
            }

            data = await response.json();
        } catch (error) {
            console.warn(
                `[LanguageManager] Download failed for ${fileName}:`,
                error
            );

            // Fallback to whatever we already have locally
            const fallback = await this.getLocalCopy(langFolder, fileName);

            if (fallback !== null) {
                return fallback;
            }

            throw error;
        }

        // ---------------------------------------------------
        // Persist. A storage failure must not lose data that
        // was downloaded successfully: we still return it,
        // and since metadata isn't written it will be retried.
        // ---------------------------------------------------

        try {
            if (isNative()) {
                await saveNativeFile(`translations/${langFolder}/${fileName}`, data);
            } else {
                await idbSet({
                    key,
                    language: langFolder,
                    fileName,
                    data,
                    cachedAt: Date.now()
                });
            }

            await setFileMetadata(key, version);
        } catch (error) {
            console.warn(
                `[LanguageManager] Failed to persist ${key}:`,
                error
            );
        }

        emit({
            type: 'updated',
            folder: langFolder,
            fileName,
            data
        });

        return data;
    },

    // =====================================================
    // Is Up To Date
    // =====================================================

    async isUpToDate(langFolder, fileName) {
        const manifest = manifestCache;

        if (!manifest) {
            return false;
        }

        const language = manifest.languages?.[langFolder];
        const manifestFile = language?.files?.[fileName];

        // Not in the manifest: nothing to update
        if (!manifestFile) {
            return true;
        }

        const metadata = await getFileMetadata(`${langFolder}/${fileName}`);

        return metadata?.version === getVersion(manifestFile, language);
    },

    // =====================================================
    // Is File Downloaded
    // =====================================================

    async isFileDownloaded(langFolder, fileName) {
        const key = `${langFolder}/${fileName}`;

        const metadata = await getFileMetadata(key);

        if (!metadata) {
            return false;
        }

        // FIX: use the same version fallback as everywhere else
        // (file version -> language version -> 1)
        if (manifestCache) {
            const language = manifestCache.languages?.[langFolder];
            const manifestFile = language?.files?.[fileName];

            if (!manifestFile) {
                return false;
            }

            if (metadata.version !== getVersion(manifestFile, language)) {
                return false;
            }
        }

        // Make sure the file itself really exists
        return await this.hasLocalCopy(langFolder, fileName);
    },

    // =====================================================
    // Clear Cache
    //
    // FIX: no longer depends on the manifest being loaded,
    // so it works offline too.
    // =====================================================

    async clearCache(langFolder) {
        const keys = await collectKnownKeys(`${langFolder}/`);

        for (const key of keys) {
            await deleteFileByKey(key);

            // Allow background updates again
            backgroundUpdates.delete(key);
        }

        await removeMetadataKeys(keys);

        if (isNative()) {
            await removeNativeFolder(`translations/${langFolder}`);
        }

        for (const key of keys) {
            emit({ type: 'cleared', ...splitKey(key) });
        }
    },

    // =====================================================
    // Clear All Cache
    // =====================================================

    async clearAllCache() {
        const keys = await collectKnownKeys();

        for (const key of keys) {
            await deleteFileByKey(key);
        }

        if (isNative()) {
            await removeNativeFolder('translations');
        }

        await saveMetadata({});

        backgroundUpdates.clear();

        for (const key of keys) {
            emit({ type: 'cleared', ...splitKey(key) });
        }
    }
};