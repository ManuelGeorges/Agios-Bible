"use client";

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef
} from "react";

import { usePathname } from "next/navigation";
import { Preferences } from "@capacitor/preferences";
import { useTheme } from "next-themes";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { toast } from "react-hot-toast";

import allBookNames from "../data/bookNames.json";
import { languageManager } from "../../services/languageManager";

const LanguageContext = createContext(null);

const FOLDER_MAP = {
    ar: "arabic",
    en: "English",
    de: "german",
    fr: "French"
};

const BIBLE_FILE_MAP = {
    ar: "ar_svd_no_tashkeel.json",
    en: "en_web.json",
    fr: "fr_segond.json",
    de: "de_luther.json"
};

const SHARED_FILES = [
    {
        folder: "shared",
        fileName: "dailyVerses.json"
    }
];

const getMainFile = (lang) => `${lang}.json`;

const getAuxFiles = (lang) => {
    const folder = FOLDER_MAP[lang] || "arabic";

    return [
        {
            folder,
            fileName: `dailyQuestions_${lang}.json`
        },
        {
            folder,
            fileName: BIBLE_FILE_MAP[lang] || BIBLE_FILE_MAP.ar
        }
    ];
};

// =========================================================
// Constants
// =========================================================

// Must be LONGER than the worst case in languageManager
// (3s manifest + 10s file download = 13s), otherwise this
// timeout fires while a valid download is still running.
const FILE_REQUEST_TIMEOUT = 15000;

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;

const INTERNET_REQUIRED_FALLBACK =
    "This feature requires an internet connection";

const LOAD_FAILED_FALLBACK =
    "Could not load the language. Please try again.";

// =========================================================
// Session memory cache
// =========================================================

const fileCache = new Map();
const filePromises = new Map();

const getFileCacheKey = (folder, fileName) => `${folder}/${fileName}`;

// =========================================================
// Timeout helper
// =========================================================

const withTimeout = (promise, timeoutMs, onTimeout) => {
    return new Promise((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;

            try {
                onTimeout?.();
            } catch {}

            reject(
                new Error(`Translation request timed out after ${timeoutMs}ms`)
            );
        }, timeoutMs);

        promise.then(
            (value) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};

// =========================================================
// Cached file loader
// =========================================================

const getCachedFile = async (folder, fileName, options = {}) => {
    const { timeoutMs = FILE_REQUEST_TIMEOUT } = options;

    const key = getFileCacheKey(folder, fileName);

    // RAM cache
    if (fileCache.has(key)) {
        return fileCache.get(key);
    }

    // Existing request. Callers joining an in-flight request
    // get their own timeout too, so nobody waits forever.
    if (filePromises.has(key)) {
        return withTimeout(filePromises.get(key), timeoutMs);
    }

    // New request
    const rawPromise = languageManager
        .getFile(folder, fileName)
        .then((data) => {
            if (data !== null && data !== undefined) {
                fileCache.set(key, data);
            }

            return data;
        })
        .finally(() => {
            // FIX: only delete OUR entry. After a timeout a newer retry
            // may have registered its own promise under the same key.
            if (filePromises.get(key) === rawPromise) {
                filePromises.delete(key);
            }
        });

    filePromises.set(key, rawPromise);

    return withTimeout(rawPromise, timeoutMs, () => {
        // The original request may still be running. Remove it from the
        // dedupe map so a later retry can start fresh (the manager itself
        // still dedupes the actual download, so nothing is downloaded twice).
        if (filePromises.get(key) === rawPromise) {
            filePromises.delete(key);
        }
    });
};

// =========================================================
// Context Provider
// =========================================================

export function LanguageProvider({ children }) {
    const pathname = usePathname();

    const [language, setLanguage] = useState("ar");
    const [parallelLanguage, setParallelLanguage] = useState(null);
    const [strings, setStrings] = useState(null);

    const { theme } = useTheme();

    const [useTashkeel, setUseTashkeel] = useState(false);
    const [keepAppAwake, setKeepAppAwake] = useState(true);
    const [keepBibleAwake, setKeepBibleAwake] = useState(true);

    const [isFirstTime, setIsFirstTime] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState("language");
    const [isHydrated, setIsHydrated] = useState(false);

    const languageChangeRef = useRef(false);
    const updateCheckRunningRef = useRef(false);
    const lastUpdateCheckRef = useRef(0);

    // Lets long-lived callbacks (the manager subscription) read the
    // current language without being re-created on every change.
    const languageRef = useRef(language);

    useEffect(() => {
        languageRef.current = language;
    }, [language]);

    // =====================================================
    // Bundled Arabic fallback
    // =====================================================

    const loadBundledArabic = useCallback(async () => {
        try {
            const fallback = await import(
                "../data/translations/arabic/ar.json"
            );

            return fallback.default || fallback;
        } catch (error) {
            console.error("Bundled Arabic translation failed:", error);

            throw error;
        }
    }, []);

    // =====================================================
    // Load translations
    // =====================================================

    const loadTranslations = useCallback(
        async (lang, options = {}) => {
            const { allowBundledFallback = true } = options;

            const folder = FOLDER_MAP[lang] || "arabic";
            const mainFile = getMainFile(lang);

            try {
                const data = await getCachedFile(folder, mainFile);

                if (!data) {
                    throw new Error("Main language data is empty");
                }

                setStrings(data);

                return data;
            } catch (error) {
                console.error("Error loading language:", error);

                if (lang === "ar" && allowBundledFallback) {
                    const data = await loadBundledArabic();

                    setStrings(data);

                    return data;
                }

                throw error;
            }
        },
        [loadBundledArabic]
    );

    // =====================================================
    // Initial Arabic startup
    //
    // FIX: previously Arabic ALWAYS used the bundled copy and never
    // saw remote updates. Now we use the downloaded local copy when one
    // exists (fast, no network) and fall back to the bundled one.
    // =====================================================

    const initializeArabic = useCallback(async () => {
        const folder = FOLDER_MAP.ar;
        const mainFile = getMainFile("ar");

        try {
            const local = await languageManager.getLocalCopy(folder, mainFile);

            if (local) {
                fileCache.set(getFileCacheKey(folder, mainFile), local);

                setStrings(local);

                return local;
            }
        } catch (error) {
            console.warn("Local Arabic copy unavailable, using bundle:", error);
        }

        const bundled = await loadBundledArabic();

        setStrings(bundled);

        return bundled;
    }, [loadBundledArabic]);

    // =====================================================
    // Background auxiliary prefetch
    // =====================================================

    const prefetchAuxFiles = useCallback((lang) => {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        for (const { folder, fileName } of getAuxFiles(lang)) {
            void getCachedFile(folder, fileName).catch(() => {});
        }
    }, []);

    const prefetchSharedFiles = useCallback(() => {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        for (const { folder, fileName } of SHARED_FILES) {
            void getCachedFile(folder, fileName).catch(() => {});
        }
    }, []);

    // =====================================================
    // Subscribe to language manager events
    //
    // FIX: finished background downloads were never applied.
    // Now a downloaded file refreshes the RAM cache and, if it is the
    // current language's main file, the UI strings too.
    // =====================================================

    useEffect(() => {
        const unsubscribe = languageManager.subscribe((event) => {
            const key = getFileCacheKey(event.folder, event.fileName);

            if (event.type === "cleared") {
                fileCache.delete(key);
                return;
            }

            if (event.type === "updated" && event.data) {
                fileCache.set(key, event.data);

                const currentLang = languageRef.current;

                if (
                    event.folder === (FOLDER_MAP[currentLang] || "arabic") &&
                    event.fileName === getMainFile(currentLang)
                ) {
                    setStrings(event.data);
                }
            }
        });

        return unsubscribe;
    }, []);

    // =====================================================
    // Initial initialization
    //
    // FIX: removed `initializedRef`. Combined with `cancelled`, React
    // Strict Mode (mount -> cleanup -> mount) left the app on the loading
    // screen forever in development. The init logic is idempotent, so
    // running it twice is harmless.
    // =====================================================

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            let langToLoad = "ar";

            try {
                // -----------------------------------------
                // Read ALL local settings first (synchronous), so they are
                // applied even if translation loading fails afterwards.
                // -----------------------------------------

                const rawLang = localStorage.getItem("app_lang");

                const savedLang = rawLang && FOLDER_MAP[rawLang] ? rawLang : null;

                const onboardingDone =
                    localStorage.getItem("onboarding_done") === "true";

                langToLoad = savedLang || "ar";

                if (!savedLang || !onboardingDone) {
                    setIsFirstTime(true);

                    if (savedLang) {
                        setOnboardingStep("theme");
                    }
                }

                setLanguage(langToLoad);

                const savedParallel = localStorage.getItem("parallel_lang");

                if (savedParallel) {
                    setParallelLanguage(savedParallel);
                }

                setUseTashkeel(localStorage.getItem("useTashkeel") === "true");

                const appAwakeRaw = localStorage.getItem("keepAppAwake");
                const bibleAwakeRaw = localStorage.getItem("keepBibleAwake");

                setKeepAppAwake(appAwakeRaw === null ? true : appAwakeRaw === "true");
                setKeepBibleAwake(
                    bibleAwakeRaw === null ? true : bibleAwakeRaw === "true"
                );

                // -----------------------------------------
                // Translations
                // -----------------------------------------

                if (langToLoad === "ar") {
                    // Never make first startup depend on R2/manifest/CORS.
                    await initializeArabic();
                } else {
                    // Other languages use their local/R2 source, protected
                    // by the timeout.
                    await loadTranslations(langToLoad);
                }

                if (cancelled) {
                    return;
                }

                // -----------------------------------------
                // Show app immediately
                // -----------------------------------------

                setIsHydrated(true);

                // -----------------------------------------
                // Background work AFTER the UI is ready
                // -----------------------------------------

                void Promise.resolve()
                    .then(() => {
                        prefetchAuxFiles(langToLoad);
                        prefetchSharedFiles();

                        // Non-Arabic main files already schedule their own
                        // background update through languageManager.getFile.
                        // Arabic starts from local/bundled data, so schedule it.
                        if (langToLoad === "ar") {
                            languageManager.updateFileInBackground(
                                FOLDER_MAP.ar,
                                getMainFile("ar")
                            );
                        }

                        return languageManager.init();
                    })
                    .catch((error) => {
                        console.warn(
                            "[LanguageManager] Background initialization failed:",
                            error
                        );
                    });
            } catch (error) {
                console.error("Language initialization error:", error);

                // -----------------------------------------
                // FIX: the old catch checked a stale `language`
                // (always "ar" on first render), so a German user whose
                // load failed ended up with language="de", dir="ltr" and
                // Arabic strings. Now the language switches to "ar" along
                // with the fallback strings.
                //
                // `app_lang` is NOT overwritten, so the saved language is
                // retried on the next launch.
                // -----------------------------------------

                try {
                    const fallback = await loadBundledArabic();

                    if (!cancelled) {
                        setLanguage("ar");
                        setStrings(fallback);
                    }
                } catch (fallbackError) {
                    console.error("Final Arabic fallback failed:", fallbackError);
                }

                if (!cancelled) {
                    setIsHydrated(true);
                }
            }
        };

        void init();

        return () => {
            cancelled = true;
        };
    }, [
        initializeArabic,
        loadTranslations,
        prefetchAuxFiles,
        prefetchSharedFiles,
        loadBundledArabic
    ]);

    // =====================================================
    // Keep Awake
    // =====================================================

    useEffect(() => {
        if (!isHydrated || !Capacitor.isNativePlatform()) {
            return;
        }

        let cancelled = false;

        const updateAwakeStatus = async () => {
            try {
                if (keepAppAwake) {
                    await KeepAwake.keepAwake();
                } else if (keepBibleAwake && pathname?.includes("/bible")) {
                    await KeepAwake.keepAwake();
                } else {
                    await KeepAwake.allowSleep();
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Awake Status Error:", error);
                }
            }
        };

        void updateAwakeStatus();

        return () => {
            cancelled = true;
        };
    }, [keepAppAwake, keepBibleAwake, pathname, isHydrated]);

    // =====================================================
    // Background update checker
    //
    // FIX: it used to invalidate the RAM cache and call getCachedFile,
    // which just returned the stale local copy again (and the manager's
    // per-session guard blocked the real download). Now it calls
    // `forceUpdate`, and the manager's 'updated' event applies the result
    // (RAM cache + UI strings).
    // =====================================================

    const checkForUpdates = useCallback(async () => {
        if (updateCheckRunningRef.current) {
            return;
        }

        const now = Date.now();

        if (now - lastUpdateCheckRef.current < UPDATE_CHECK_INTERVAL) {
            return;
        }

        updateCheckRunningRef.current = true;

        const updateIfStale = async (folder, fileName) => {
            try {
                if (await languageManager.isUpToDate(folder, fileName)) {
                    return;
                }

                await languageManager.forceUpdate(folder, fileName);
            } catch (error) {
                console.warn(
                    `[LanguageManager] Update failed for ${folder}/${fileName}:`,
                    error
                );
            }
        };

        try {
            // Manifest is refreshed ONLY in the background
            const manifest = await languageManager.refreshManifest();

            if (!manifest) {
                return;
            }

            // Main translation
            await updateIfStale(
                FOLDER_MAP[language] || "arabic",
                getMainFile(language)
            );

            // Auxiliary + shared files (native only), one at a time
            if (Capacitor.isNativePlatform()) {
                const extraFiles = [...getAuxFiles(language), ...SHARED_FILES];

                for (const { folder, fileName } of extraFiles) {
                    await updateIfStale(folder, fileName);
                }
            }

            lastUpdateCheckRef.current = now;
        } catch (error) {
            console.warn("Background update check failed:", error);
        } finally {
            updateCheckRunningRef.current = false;
        }
    }, [language]);

    // =====================================================
    // App active / visibility update check
    // =====================================================

    useEffect(() => {
        if (!isHydrated) {
            return;
        }

        if (Capacitor.isNativePlatform()) {
            // FIX: if cleanup ran before `addListener` resolved, the handle
            // was still null and the listener leaked.
            let cancelled = false;
            let listenerHandle = null;

            App.addListener("appStateChange", ({ isActive }) => {
                if (isActive) {
                    void checkForUpdates();
                }
            })
                .then((handle) => {
                    if (cancelled) {
                        void handle.remove();
                    } else {
                        listenerHandle = handle;
                    }
                })
                .catch((error) => {
                    console.warn("appStateChange listener failed:", error);
                });

            return () => {
                cancelled = true;
                void listenerHandle?.remove();
            };
        }

        // Web
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                void checkForUpdates();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [isHydrated, checkForUpdates]);

    // =====================================================
    // Book names
    // =====================================================

    const bookNames = useMemo(() => {
        return allBookNames?.[language] || allBookNames?.ar || [];
    }, [language]);

    // =====================================================
    // Direction
    // =====================================================

    const dir = useMemo(() => {
        return language === "ar" ? "rtl" : "ltr";
    }, [language]);

    // =====================================================
    // Sync language
    // =====================================================

    useEffect(() => {
        if (!isHydrated) {
            return;
        }

        document.documentElement.lang = language;
        document.documentElement.dir = dir;

        const syncLang = async () => {
            try {
                await Preferences.set({
                    key: "language",
                    value: language
                });

                if (window.AgiosScannerNative?.refreshAlarms) {
                    window.AgiosScannerNative.refreshAlarms();
                }
            } catch (error) {
                console.error("Language Sync Error:", error);
            }
        };

        void syncLang();
    }, [language, dir, isHydrated]);

    // =====================================================
    // Sync theme
    // =====================================================

    useEffect(() => {
        if (!isHydrated || !Capacitor.isNativePlatform() || !theme) {
            return;
        }

        const syncTheme = async () => {
            try {
                await Preferences.set({
                    key: "theme",
                    value: theme
                });

                if (window.AgiosScannerNative?.refreshWidgets) {
                    window.AgiosScannerNative.refreshWidgets();
                }
            } catch (error) {
                console.error("Theme Sync Error:", error);
            }
        };

        void syncTheme();
    }, [theme, isHydrated]);

    // =====================================================
    // Change language
    //
    // FIXES:
    //  - the offline check was unreachable (getCachedFile already
    //    tried the download); now we check for a local copy FIRST
    //  - switching back to Arabic offline works via the bundled copy
    //  - only real connectivity problems show "internet required"
    // =====================================================

    const changeLanguage = useCallback(
        async (newLang) => {
            if (!FOLDER_MAP[newLang]) {
                return;
            }

            if (newLang === language) {
                localStorage.setItem("app_lang", newLang);
                return;
            }

            if (languageChangeRef.current) {
                return;
            }

            languageChangeRef.current = true;

            const folder = FOLDER_MAP[newLang];
            const mainFile = getMainFile(newLang);
            const key = getFileCacheKey(folder, mainFile);

            const apply = (data) => {
                localStorage.setItem("app_lang", newLang);

                setLanguage(newLang);
                setStrings(data);

                prefetchAuxFiles(newLang);
            };

            try {
                // ---------------------------------------
                // Do we already have it locally?
                // ---------------------------------------

                let hasLocal = fileCache.has(key);

                if (!hasLocal) {
                    try {
                        hasLocal = await languageManager.hasLocalCopy(folder, mainFile);
                    } catch {
                        hasLocal = false;
                    }
                }

                // ---------------------------------------
                // Arabic without a downloaded copy: use the bundled one
                // (works offline) and fetch updates in the background.
                // ---------------------------------------

                if (!hasLocal && newLang === "ar") {
                    apply(await loadBundledArabic());

                    languageManager.updateFileInBackground(folder, mainFile);

                    return;
                }

                // ---------------------------------------
                // Not local -> a download is required
                // ---------------------------------------

                if (
                    !hasLocal &&
                    typeof navigator !== "undefined" &&
                    !navigator.onLine
                ) {
                    toast.error(
                        strings?.common?.internet_required ||
                            INTERNET_REQUIRED_FALLBACK
                    );

                    return;
                }

                // Local copy (fast) or remote download (with timeout)
                const data = await getCachedFile(folder, mainFile);

                if (!data) {
                    throw new Error("Language file is empty");
                }

                apply(data);

                if (hasLocal) {
                    void languageManager.refreshManifest().catch(() => {});
                }
            } catch (error) {
                console.error("Change Language Error:", error);

                const offline =
                    typeof navigator !== "undefined" && !navigator.onLine;

                toast.error(
                    offline
                        ? strings?.common?.internet_required ||
                              INTERNET_REQUIRED_FALLBACK
                        : strings?.common?.language_load_failed ||
                              LOAD_FAILED_FALLBACK
                );
            } finally {
                languageChangeRef.current = false;
            }
        },
        [language, strings, prefetchAuxFiles, loadBundledArabic]
    );

    // =====================================================
    // Finish onboarding
    // =====================================================

    const finishFirstTime = useCallback(() => {
        setIsFirstTime(false);

        localStorage.setItem("onboarding_done", "true");
    }, []);

    // =====================================================
    // Parallel language
    // =====================================================

    const changeParallelLanguage = useCallback((newLang) => {
        if (newLang === null) {
            setParallelLanguage(null);

            localStorage.removeItem("parallel_lang");
        } else {
            setParallelLanguage(newLang);

            localStorage.setItem("parallel_lang", newLang);
        }

        window.dispatchEvent(new Event("storage"));
    }, []);

    // =====================================================
    // Toggles
    //
    // FIX: side effects (localStorage, dispatchEvent) used to run inside
    // `setState` updater functions, which must be pure (Strict Mode runs
    // them twice). Now the new value is computed first, side effects run
    // outside the updater, and the updater is trivial.
    // =====================================================

    const toggleTashkeel = useCallback(() => {
        const newState = !useTashkeel;

        localStorage.setItem("useTashkeel", String(newState));

        setUseTashkeel(newState);

        // localStorage is already updated, so listeners read the new value
        window.dispatchEvent(new Event("storage"));
    }, [useTashkeel]);

    const toggleKeepAppAwake = useCallback(() => {
        const newState = !keepAppAwake;

        localStorage.setItem("keepAppAwake", String(newState));

        setKeepAppAwake(newState);
    }, [keepAppAwake]);

    const toggleKeepBibleAwake = useCallback(() => {
        const newState = !keepBibleAwake;

        localStorage.setItem("keepBibleAwake", String(newState));

        setKeepBibleAwake(newState);
    }, [keepBibleAwake]);

    // =====================================================
    // Format numbers
    // =====================================================

    const formatNumber = useCallback(
        (num) => {
            if (num === null || num === undefined) {
                return "";
            }

            if (language !== "ar") {
                return num.toString();
            }

            const arabicNums = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

            return num
                .toString()
                .split("")
                .map((digit) => arabicNums[Number(digit)] || digit)
                .join("");
        },
        [language]
    );

    // =====================================================
    // Memoized context value
    // =====================================================

    const value = useMemo(() => {
        return {
            language,
            parallelLanguage,
            useTashkeel,
            keepAppAwake,
            keepBibleAwake,
            strings,
            bookNames,
            allBookNames,
            dir,

            changeLanguage,
            changeParallelLanguage,

            toggleTashkeel,
            toggleKeepAppAwake,
            toggleKeepBibleAwake,

            isFirstTime,
            setIsFirstTime,

            onboardingStep,
            setOnboardingStep,

            finishFirstTime,

            isHydrated,

            formatNumber
        };
    }, [
        language,
        parallelLanguage,
        useTashkeel,
        keepAppAwake,
        keepBibleAwake,
        strings,
        bookNames,
        dir,

        changeLanguage,
        changeParallelLanguage,

        toggleTashkeel,
        toggleKeepAppAwake,
        toggleKeepBibleAwake,

        isFirstTime,
        onboardingStep,

        finishFirstTime,
        isHydrated,
        formatNumber
    ]);

    // =====================================================
    // Loading screen
    // =====================================================

    if (!isHydrated || !strings) {
        return (
            <div
                style={{
                    height: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "var(--color-bg-start)",
                    color: "var(--color-text-primary)",
                    fontFamily: "sans-serif"
                }}
            >
                ...
            </div>
        );
    }

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

// =========================================================
// Hook
// =========================================================

export const useLanguage = () => useContext(LanguageContext);