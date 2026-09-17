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

let manifestCache = null;

// Promise واحدة للـ manifest أثناء التحميل
let manifestPromise = null;

// هل عملنا background manifest check في الـ session الحالية؟
let backgroundManifestChecked = false;

// الملفات التي بدأنا تحديثها في الخلفية
const backgroundUpdates = new Set();

// الملفات التي يتم تحميلها حاليًا لأول مرة
const downloadPromises = new Map();

const isNative = () => Capacitor.isNativePlatform();

/* =========================================================
   IndexedDB
========================================================= */

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {
                    keyPath: 'key'
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

async function idbGet(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            STORE_NAME,
            'readonly'
        );

        const store = transaction.objectStore(STORE_NAME);
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

        const store = transaction.objectStore(STORE_NAME);
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

        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/* =========================================================
   Metadata
========================================================= */

async function getMetadata() {
    try {
        const result = await Preferences.get({
            key: METADATA_KEY
        });

        if (!result.value) {
            return {};
        }

        return JSON.parse(result.value);
    } catch {
        return {};
    }
}

async function saveMetadata(metadata) {
    await Preferences.set({
        key: METADATA_KEY,
        value: JSON.stringify(metadata)
    });
}

async function setFileMetadata(key, version) {
    const metadata = await getMetadata();

    metadata[key] = {
        version,
        updatedAt: Date.now()
    };

    await saveMetadata(metadata);
}

async function removeFileMetadata(key) {
    const metadata = await getMetadata();

    delete metadata[key];

    await saveMetadata(metadata);
}

async function getFileMetadata(key) {
    const metadata = await getMetadata();

    return metadata[key] || null;
}

/* =========================================================
   Native Filesystem
========================================================= */

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
        const folder = path.substring(0, lastSlash);

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

/* =========================================================
   Language Manager
========================================================= */

export const languageManager = {

    /* =====================================================
       Manifest
    ===================================================== */

    async init() {
        // لو الـmanifest موجود بالفعل
        // ممنوع نعمل request جديد
        if (manifestCache) {
            return true;
        }

        // لو فيه request شغال بالفعل
        // أي caller جديد يستخدم نفس الـPromise
        if (manifestPromise) {
            return await manifestPromise;
        }

        manifestPromise = (async () => {
            try {
                const response = await fetchWithTimeout(
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

                manifestCache = await response.json();

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

    async getManifest(forceRefresh = false) {

        /*
         * forceRefresh مقفول عمليًا أثناء التشغيل العادي.
         * لا نريد أي صفحة تعمل request جديد.
         */

        if (!forceRefresh && manifestCache) {
            return manifestCache;
        }

        // لو forceRefresh مطلوب ولكن فيه manifest بالفعل،
        // لا نستخدمه في العمليات العادية.
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
        // منع أكثر من refresh في نفس الوقت
        if (manifestPromise) {
            await manifestPromise;
            return manifestCache;
        }

        manifestPromise = (async () => {
            const previous = manifestCache;

            try {
                const response = await fetchWithTimeout(
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

                manifestCache = freshManifest;

                return true;

            } catch (error) {
                console.warn(
                    '[LanguageManager] Manifest refresh failed:',
                    error
                );

                manifestCache = previous;

                return false;

            } finally {
                manifestPromise = null;
            }
        })();

        await manifestPromise;

        return manifestCache;
    },

    /* =====================================================
       Local Copy
    ===================================================== */

    async hasLocalCopy(langFolder, fileName) {
        const key = `${langFolder}/${fileName}`;

        if (isNative()) {
            const path =
                `translations/${langFolder}/${fileName}`;

            const data = await getNativeFile(path);

            return data !== null;
        }

        const cached = await idbGet(key);

        return cached !== null;
    },

    async getLocalCopy(langFolder, fileName) {
        const key = `${langFolder}/${fileName}`;

        if (isNative()) {
            const path =
                `translations/${langFolder}/${fileName}`;

            return await getNativeFile(path);
        }

        const cached = await idbGet(key);

        return cached ? cached.data : null;
    },

    /* =====================================================
       Main File Getter
    ===================================================== */

    async getFile(langFolder, fileName) {

        const key = `${langFolder}/${fileName}`;

        /*
         * ==================================================
         * STEP 1
         * اقرأ النسخة المحلية أولاً
         * ==================================================
         *
         * أهم تغيير في النظام كله.
         *
         * لا Manifest
         * لا R2
         * لا Internet
         *
         * قبل قراءة الملف المحلي.
         */

        const localCopy =
            await this.getLocalCopy(
                langFolder,
                fileName
            );

        /*
         * ==================================================
         * لو الملف موجود محليًا
         * ==================================================
         */

        if (localCopy !== null) {

            /*
             * شغّل background update مرة واحدة فقط
             * لهذا الملف خلال الـsession.
             */

            this.updateFileInBackground(
                langFolder,
                fileName
            );

            /*
             * رجّع الملف فورًا.
             *
             * لا await للـbackground update.
             */

            return localCopy;
        }

        /*
         * ==================================================
         * STEP 2
         * الملف غير موجود محليًا
         * ==================================================
         *
         * هنا فقط نحتاج Internet.
         *
         * وده يحصل غالبًا في أول تشغيل فقط.
         */

        return await this.downloadMissingFile(
            langFolder,
            fileName
        );
    },

    /* =====================================================
       First Download
    ===================================================== */

    async downloadMissingFile(langFolder, fileName) {

        const key = `${langFolder}/${fileName}`;

        /*
         * لو صفحة أخرى بدأت تحميل نفس الملف،
         * استخدم نفس الـPromise.
         */

        if (downloadPromises.has(key)) {
            return await downloadPromises.get(key);
        }

        const promise = (async () => {

            const manifest =
                await this.getManifest();

            if (!manifest) {
                throw new Error(
                    'Manifest unavailable and no local copy found'
                );
            }

            const language =
                manifest.languages?.[langFolder];

            if (!language) {
                throw new Error(
                    `Language "${langFolder}" not found`
                );
            }

            const manifestFile =
                language.files?.[fileName];

            if (!manifestFile) {
                throw new Error(
                    `File "${fileName}" not found in "${langFolder}"`
                );
            }

            const version =
                manifestFile.version ||
                language.version ||
                1;

            return await this.downloadAndSave(
                langFolder,
                fileName,
                manifestFile,
                version
            );

        })();

        downloadPromises.set(key, promise);

        try {
            return await promise;
        } finally {
            downloadPromises.delete(key);
        }
    },

    /* =====================================================
       Background Update
    ===================================================== */

    updateFileInBackground(langFolder, fileName) {

        const key = `${langFolder}/${fileName}`;

        /*
         * هذا أهم جزء لمنع تحميل الملف
         * عند كل صفحة.
         */

        if (backgroundUpdates.has(key)) {
            return;
        }

        backgroundUpdates.add(key);

        /*
         * لا يوجد await هنا.
         *
         * الـPromise تشتغل في الخلفية.
         */

        Promise.resolve()
            .then(async () => {

                /*
                 * Manifest مرة واحدة فقط.
                 */

                if (!backgroundManifestChecked) {
                    backgroundManifestChecked = true;

                    await this.init();
                }

                const manifest =
                    manifestCache;

                if (!manifest) {
                    return;
                }

                const language =
                    manifest.languages?.[langFolder];

                const manifestFile =
                    language?.files?.[fileName];

                if (!manifestFile) {
                    return;
                }

                const version =
                    manifestFile.version ||
                    language.version ||
                    1;

                const metadata =
                    await getFileMetadata(key);

                /*
                 * النسخة المحلية بالفعل أحدث نسخة.
                 */

                if (
                    metadata?.version === version
                ) {
                    return;
                }

                /*
                 * النسخة المحلية قديمة.
                 * نزّل الجديدة في الخلفية.
                 */

                await this.downloadAndSave(
                    langFolder,
                    fileName,
                    manifestFile,
                    version
                );

                console.log(
                    `[LanguageManager] Background update completed: ${key}`
                );

            })
            .catch(error => {

                console.warn(
                    `[LanguageManager] Background update failed for ${key}:`,
                    error
                );

            });
    },

    /* =====================================================
       Download & Save
    ===================================================== */

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

            const data =
                await response.json();

            /*
             * Native
             */

            if (isNative()) {

                const path =
                    `translations/${langFolder}/${fileName}`;

                await saveNativeFile(
                    path,
                    data
                );

            }

            /*
             * Web
             */

            else {

                await idbSet({
                    key,
                    language: langFolder,
                    fileName,
                    data,
                    cachedAt: Date.now()
                });
            }

            /*
             * احفظ version
             */

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

            /*
             * لو عندنا نسخة قديمة،
             * لا نكسر التطبيق.
             */

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

    /* =====================================================
       Is Up To Date
    ===================================================== */

    async isUpToDate(
        langFolder,
        fileName
    ) {

        /*
         * لا تعمل network request هنا.
         *
         * نستخدم الـmanifest الموجود في الذاكرة.
         */

        const manifest =
            manifestCache;

        if (!manifest) {
            return false;
        }

        const language =
            manifest.languages?.[langFolder];

        const manifestFile =
            language?.files?.[fileName];

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
            await getFileMetadata(key);

        return metadata?.version === version;
    },

    /* =====================================================
       Is File Downloaded
    ===================================================== */

    async isFileDownloaded(
        langFolder,
        fileName
    ) {

        const key =
            `${langFolder}/${fileName}`;

        const metadata =
            await getFileMetadata(key);

        if (!metadata) {
            return false;
        }

        /*
         * لا نجبر Network request هنا.
         */

        const manifest =
            manifestCache;

        /*
         * لو مفيش manifest في الذاكرة،
         * يكفي إننا نتحقق من وجود الملف.
         */

        if (!manifest) {

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
            manifest.languages?.[
                langFolder
            ]?.files?.[fileName];

        if (!manifestFile) {
            return false;
        }

        const version =
            manifestFile.version || 1;

        if (
            metadata.version !== version
        ) {
            return false;
        }

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

    /* =====================================================
       Clear Cache
    ===================================================== */

    async clearCache(langFolder) {

        /*
         * نستخدم الـmanifest الموجود.
         * لا نعمل network request.
         */

        const manifest =
            manifestCache;

        const language =
            manifest?.languages?.[langFolder];

        if (!language) {
            return;
        }

        for (
            const fileName of Object.keys(
                language.files || {}
            )
        ) {

            const key =
                `${langFolder}/${fileName}`;

            /*
             * Native
             */

            if (isNative()) {

                const path =
                    `translations/${langFolder}/${fileName}`;

                await deleteNativeFile(path);

            }

            /*
             * Web
             */

            else {

                await idbDelete(key);
            }

            await removeFileMetadata(key);

            /*
             * السماح بتحميل الملف مرة أخرى
             * إذا تم طلبه بعد clearCache.
             */

            backgroundUpdates.delete(key);
        }

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

    /* =====================================================
       Clear All Cache
    ===================================================== */

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
    }
};