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

// =========================================================
// Runtime caches
// =========================================================

// Manifest موجود في RAM طوال الـ session
let manifestCache = null;

// يمنع أكثر من Manifest request في نفس الوقت
let manifestPromise = null;

// Metadata موجودة في RAM بدل Preferences في كل عملية
let metadataCache = null;
let metadataPromise = null;

// IndexedDB connection cached
let dbPromise = null;

// Background manifest check
let backgroundManifestChecked = false;

// الملفات التي تم التعامل معها في background خلال الـ session
const backgroundUpdates = new Set();

// الملفات التي يتم تحميلها حاليًا
const downloadPromises = new Map();

// =========================================================
// Background download queue
// =========================================================

// أقصى عدد downloads في الخلفية في نفس الوقت.
// 2 مناسب جدًا للموبايل ولا يضغط الشبكة أو التخزين.
const MAX_BACKGROUND_DOWNLOADS = 2;

let activeBackgroundDownloads = 0;

const backgroundDownloadQueue = [];

// =========================================================
// Platform
// =========================================================

const isNative = () => Capacitor.isNativePlatform();

// =========================================================
// IndexedDB
// =========================================================

function openDB() {
    // استخدم نفس Promise لكل requests
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {
                    keyPath: 'key'
                });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            // لو الـconnection اتقفل unexpectedly
            db.onclose = () => {
                dbPromise = null;
            };

            db.onerror = () => {
                // لا نمسح الـPromise هنا فورًا،
                // لأن الخطأ قد يكون transaction-specific.
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
        const transaction = db.transaction(
            STORE_NAME,
            'readonly'
        );

        const store = transaction.objectStore(
            STORE_NAME
        );

        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

async function idbSet(value) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            STORE_NAME,
            'readwrite'
        );

        const store = transaction.objectStore(
            STORE_NAME
        );

        const request = store.put(value);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

async function idbDelete(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            STORE_NAME,
            'readwrite'
        );

        const store = transaction.objectStore(
            STORE_NAME
        );

        const request = store.delete(key);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// =========================================================
// Metadata
// =========================================================

async function getMetadata() {
    // أسرع مسار: RAM
    if (metadataCache !== null) {
        return metadataCache;
    }

    // لو عملية Preferences شغالة بالفعل
    if (metadataPromise) {
        return await metadataPromise;
    }

    metadataPromise = (async () => {
        try {
            const result = await Preferences.get({
                key: METADATA_KEY
            });

            if (!result.value) {
                metadataCache = {};
                return metadataCache;
            }

            try {
                metadataCache = JSON.parse(
                    result.value
                );
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

// ---------------------------------------------------------
// Preferences writes
// ---------------------------------------------------------

let metadataWritePromise = Promise.resolve();

function saveMetadata(metadata) {
    metadataCache = metadata;

    // Serialize writes to Preferences
    metadataWritePromise =
        metadataWritePromise
            .catch(() => {})
            .then(async () => {
                await Preferences.set({
                    key: METADATA_KEY,
                    value: JSON.stringify(
                        metadata
                    )
                });
            });

    return metadataWritePromise;
}

async function setFileMetadata(
    key,
    version
) {
    const metadata =
        await getMetadata();

    metadata[key] = {
        version,
        updatedAt: Date.now()
    };

    await saveMetadata(metadata);
}

async function removeFileMetadata(key) {
    const metadata =
        await getMetadata();

    delete metadata[key];

    await saveMetadata(metadata);
}

async function getFileMetadata(key) {
    const metadata =
        await getMetadata();

    return metadata[key] || null;
}

// =========================================================
// Native Filesystem
// =========================================================

async function getNativeFile(path) {
    try {
        const file =
            await Filesystem.readFile({
                path,
                directory: Directory.Data,
                encoding: Encoding.UTF8
            });

        return JSON.parse(file.data);

    } catch {
        return null;
    }
}

async function saveNativeFile(
    path,
    data
) {
    const lastSlash =
        path.lastIndexOf('/');

    if (lastSlash !== -1) {
        const folder =
            path.substring(
                0,
                lastSlash
            );

        await Filesystem.mkdir({
            path: folder,
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

// =========================================================
// Background Queue
// =========================================================

function processBackgroundQueue() {
    while (
        activeBackgroundDownloads <
            MAX_BACKGROUND_DOWNLOADS &&
        backgroundDownloadQueue.length > 0
    ) {
        const task =
            backgroundDownloadQueue.shift();

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
// Language Manager
// =========================================================

export const languageManager = {

    // =====================================================
    // Manifest
    // =====================================================

    async init() {
        // موجود في RAM
        if (manifestCache) {
            return true;
        }

        // request موجود بالفعل
        if (manifestPromise) {
            return await manifestPromise;
        }

        manifestPromise =
            (async () => {
                try {
                    const response =
                        await fetchWithTimeout(
                            MANIFEST_URL,
                            {
                                cache: 'no-store',
                                timeout: 3000
                            }
                        );

                    if (!response.ok) {
                        throw new Error(
                            `Manifest request failed: ${response.status}`
                        );
                    }

                    manifestCache =
                        await response.json();

                    return true;

                } catch (error) {
                    console.warn(
                        '[LanguageManager] Manifest request failed:',
                        error
                    );

                    return false;

                } finally {
                    manifestPromise = null;
                }
            })();

        return await manifestPromise;
    },

    async getManifest(
        forceRefresh = false
    ) {
        // الطبيعي: استخدم RAM
        if (
            !forceRefresh &&
            manifestCache
        ) {
            return manifestCache;
        }

        // Refresh متعمد
        if (forceRefresh) {
            return await this.refreshManifest();
        }

        const success =
            await this.init();

        if (!success) {
            return null;
        }

        return manifestCache;
    },

    async refreshManifest() {
        // امنع أكثر من refresh
        if (manifestPromise) {
            await manifestPromise;

            return manifestCache;
        }

        const previous =
            manifestCache;

        manifestPromise =
            (async () => {
                try {
                    const response =
                        await fetchWithTimeout(
                            MANIFEST_URL,
                            {
                                cache: 'no-store',
                                timeout: 3000
                            }
                        );

                    if (!response.ok) {
                        throw new Error(
                            `Manifest request failed: ${response.status}`
                        );
                    }

                    const freshManifest =
                        await response.json();

                    manifestCache =
                        freshManifest;

                    return true;

                } catch (error) {
                    console.warn(
                        '[LanguageManager] Manifest refresh failed:',
                        error
                    );

                    // احتفظ بالقديم
                    manifestCache =
                        previous;

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

    async hasLocalCopy(
        langFolder,
        fileName
    ) {
        const key =
            `${langFolder}/${fileName}`;

        if (isNative()) {
            const path =
                `translations/${langFolder}/${fileName}`;

            const data =
                await getNativeFile(path);

            return data !== null;
        }

        const cached =
            await idbGet(key);

        return cached !== null;
    },

    async getLocalCopy(
        langFolder,
        fileName
    ) {
        const key =
            `${langFolder}/${fileName}`;

        if (isNative()) {
            const path =
                `translations/${langFolder}/${fileName}`;

            return await getNativeFile(
                path
            );
        }

        const cached =
            await idbGet(key);

        return cached
            ? cached.data
            : null;
    },

    // =====================================================
    // Main File Getter
    // =====================================================

    async getFile(
        langFolder,
        fileName
    ) {
        // -----------------------------------------------
        // STEP 1
        // Local first
        // -----------------------------------------------

        const localCopy =
            await this.getLocalCopy(
                langFolder,
                fileName
            );

        // -----------------------------------------------
        // Local exists
        // -----------------------------------------------

        if (localCopy !== null) {

            // Background only
            this.updateFileInBackground(
                langFolder,
                fileName
            );

            // لا تنتظر الإنترنت
            return localCopy;
        }

        // -----------------------------------------------
        // STEP 2
        // First download
        // -----------------------------------------------

        return await this.downloadMissingFile(
            langFolder,
            fileName
        );
    },

    // =====================================================
    // First Download
    // =====================================================

    async downloadMissingFile(
        langFolder,
        fileName
    ) {
        const key =
            `${langFolder}/${fileName}`;

        // لو نفس الملف بيتحمل بالفعل
        if (
            downloadPromises.has(key)
        ) {
            return await downloadPromises.get(
                key
            );
        }

        const promise =
            (async () => {

                const manifest =
                    await this.getManifest();

                if (!manifest) {
                    throw new Error(
                        'Manifest unavailable and no local copy found'
                    );
                }

                const language =
                    manifest.languages?.[
                        langFolder
                    ];

                if (!language) {
                    throw new Error(
                        `Language "${langFolder}" not found`
                    );
                }

                const manifestFile =
                    language.files?.[
                        fileName
                    ];

                if (!manifestFile) {
                    throw new Error(
                        `File "${fileName}" not found in "${langFolder}"`
                    );
                }

                const version =
                    manifestFile.version ||
                    language.version ||
                    1;

                return await this.downloadAndSaveOnce(
                    langFolder,
                    fileName,
                    manifestFile,
                    version
                );
            })();

        downloadPromises.set(
            key,
            promise
        );

        try {
            return await promise;
        } finally {
            downloadPromises.delete(
                key
            );
        }
    },

    // =====================================================
    // Background Update
    // =====================================================

    updateFileInBackground(
        langFolder,
        fileName
    ) {
        const key =
            `${langFolder}/${fileName}`;

        // هذا الملف اتعمله background update
        // في الـsession الحالية
        if (
            backgroundUpdates.has(key)
        ) {
            return;
        }

        backgroundUpdates.add(key);

        // لا تنتظر
        enqueueBackgroundTask(
            async () => {

                try {

                    // -----------------------------------
                    // Manifest مرة واحدة
                    // -----------------------------------

                    if (
                        !backgroundManifestChecked
                    ) {
                        const success =
                            await this.init();

                        // لا نقفلها إلا لو نجح
                        if (success) {
                            backgroundManifestChecked =
                                true;
                        }
                    }

                    const manifest =
                        manifestCache;

                    if (!manifest) {
                        return;
                    }

                    // -----------------------------------
                    // Language
                    // -----------------------------------

                    const language =
                        manifest.languages?.[
                            langFolder
                        ];

                    if (!language) {
                        return;
                    }

                    // -----------------------------------
                    // File
                    // -----------------------------------

                    const manifestFile =
                        language.files?.[
                            fileName
                        ];

                    if (!manifestFile) {
                        return;
                    }

                    const version =
                        manifestFile.version ||
                        language.version ||
                        1;

                    // -----------------------------------
                    // Metadata
                    // -----------------------------------

                    const metadata =
                        await getFileMetadata(
                            key
                        );

                    // بالفعل أحدث نسخة
                    if (
                        metadata?.version ===
                        version
                    ) {
                        return;
                    }

                    // -----------------------------------
                    // Background download
                    // -----------------------------------

                    await this.downloadAndSaveOnce(
                        langFolder,
                        fileName,
                        manifestFile,
                        version
                    );

                    console.log(
                        `[LanguageManager] Background update completed: ${key}`
                    );

                } catch (error) {

                    console.warn(
                        `[LanguageManager] Background update failed for ${key}:`,
                        error
                    );
                }
            }
        );
    },

    // =====================================================
    // Download & Save - Deduplicated
    // =====================================================

    async downloadAndSaveOnce(
        langFolder,
        fileName,
        manifestFile,
        version
    ) {
        const key =
            `${langFolder}/${fileName}`;

        // مهم جدًا:
        // يمنع background update من تحميل نفس الملف
        // بالتزامن مع first download.
        if (
            downloadPromises.has(key)
        ) {
            return await downloadPromises.get(
                key
            );
        }

        const promise =
            this.downloadAndSave(
                langFolder,
                fileName,
                manifestFile,
                version
            );

        downloadPromises.set(
            key,
            promise
        );

        try {
            return await promise;
        } finally {
            downloadPromises.delete(
                key
            );
        }
    },

    // =====================================================
    // Actual Download & Save
    // =====================================================

    async downloadAndSave(
        langFolder,
        fileName,
        manifestFile,
        version
    ) {
        const key =
            `${langFolder}/${fileName}`;

        const url =
            `${R2_URL}/${manifestFile.path}`;

        try {

            // -------------------------------------------
            // Download
            // -------------------------------------------

            const response =
                await fetchWithTimeout(
                    url,
                    {
                        timeout: 10000
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Failed to download ${url}: ${response.status}`
                );
            }

            // -------------------------------------------
            // Parse JSON
            // -------------------------------------------

            const data =
                await response.json();

            // -------------------------------------------
            // Native
            // -------------------------------------------

            if (isNative()) {

                const path =
                    `translations/${langFolder}/${fileName}`;

                await saveNativeFile(
                    path,
                    data
                );
            }

            // -------------------------------------------
            // Web
            // -------------------------------------------

            else {

                await idbSet({
                    key,
                    language:
                        langFolder,
                    fileName,
                    data,
                    cachedAt:
                        Date.now()
                });
            }

            // -------------------------------------------
            // Metadata
            // -------------------------------------------

            await setFileMetadata(
                key,
                version
            );

            return data;

        } catch (error) {

            console.warn(
                `[LanguageManager] Download failed for ${fileName}:`,
                error
            );

            // -------------------------------------------
            // Fallback
            // -------------------------------------------

            const fallback =
                await this.getLocalCopy(
                    langFolder,
                    fileName
                );

            if (fallback !== null) {
                return fallback;
            }

            throw error;
        }
    },

    // =====================================================
    // Is Up To Date
    // =====================================================

    async isUpToDate(
        langFolder,
        fileName
    ) {
        // لا Network
        const manifest =
            manifestCache;

        if (!manifest) {
            return false;
        }

        const language =
            manifest.languages?.[
                langFolder
            ];

        const manifestFile =
            language?.files?.[
                fileName
            ];

        if (!manifestFile) {
            return true;
        }

        const version =
            manifestFile.version ||
            language.version ||
            1;

        const key =
            `${langFolder}/${fileName}`;

        const metadata =
            await getFileMetadata(
                key
            );

        return (
            metadata?.version ===
            version
        );
    },

    // =====================================================
    // Is File Downloaded
    // =====================================================

    async isFileDownloaded(
        langFolder,
        fileName
    ) {
        const key =
            `${langFolder}/${fileName}`;

        const metadata =
            await getFileMetadata(
                key
            );

        if (!metadata) {
            return false;
        }

        // لا يوجد Manifest في RAM
        if (!manifestCache) {

            if (isNative()) {

                const data =
                    await getNativeFile(
                        `translations/${langFolder}/${fileName}`
                    );

                return data !== null;
            }

            const cached =
                await idbGet(key);

            return cached !== null;
        }

        const manifestFile =
            manifestCache
                .languages?.[
                    langFolder
                ]
                ?.files?.[
                    fileName
                ];

        if (!manifestFile) {
            return false;
        }

        const version =
            manifestFile.version ||
            1;

        // النسخة قديمة
        if (
            metadata.version !==
            version
        ) {
            return false;
        }

        // تأكد أن الملف نفسه موجود
        if (isNative()) {

            const data =
                await getNativeFile(
                    `translations/${langFolder}/${fileName}`
                );

            return data !== null;
        }

        const cached =
            await idbGet(key);

        return cached !== null;
    },

    // =====================================================
    // Clear Cache
    // =====================================================

    async clearCache(
        langFolder
    ) {
        const manifest =
            manifestCache;

        const language =
            manifest?.languages?.[
                langFolder
            ];

        if (!language) {
            return;
        }

        const files =
            Object.keys(
                language.files || {}
            );

        for (
            const fileName of files
        ) {
            const key =
                `${langFolder}/${fileName}`;

            // -------------------------------------------
            // Native
            // -------------------------------------------

            if (isNative()) {

                const path =
                    `translations/${langFolder}/${fileName}`;

                await deleteNativeFile(
                    path
                );
            }

            // -------------------------------------------
            // Web
            // -------------------------------------------

            else {

                await idbDelete(key);
            }

            // -------------------------------------------
            // Metadata
            // -------------------------------------------

            await removeFileMetadata(
                key
            );

            // -------------------------------------------
            // Allow background update again
            // -------------------------------------------

            backgroundUpdates.delete(
                key
            );
        }

        // -----------------------------------------------
        // Remove Native folder
        // -----------------------------------------------

        if (isNative()) {

            try {

                await Filesystem.rmdir({
                    path:
                        `translations/${langFolder}`,
                    directory:
                        Directory.Data,
                    recursive:
                        true
                });

            } catch {}
        }
    },

    // =====================================================
    // Clear All Cache
    // =====================================================

    async clearAllCache() {
        const manifest =
            manifestCache;

        if (!manifest) {
            return;
        }

        for (
            const langFolder of Object.keys(
                manifest.languages || {}
            )
        ) {
            await this.clearCache(
                langFolder
            );
        }

        // اسمح بعمل background updates
        // مرة أخرى بعد clearAll
        backgroundUpdates.clear();
    }
};
