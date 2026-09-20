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

const getMainFile = (lang) => {
    return lang === "ar"
        ? "ar.json"
        : `${lang}.json`;
};

const getAuxFiles = (lang) => {
    const folder =
        FOLDER_MAP[lang] || "arabic";

    return [
        {
            folder,
            fileName: `dailyQuestions_${lang}.json`
        },
        {
            folder,
            fileName:
                BIBLE_FILE_MAP[lang] ||
                BIBLE_FILE_MAP.ar
        }
    ];
};

// =========================================================
// Constants
// =========================================================

const FILE_REQUEST_TIMEOUT = 12000;

// =========================================================
// Session memory cache
// =========================================================

const fileCache = new Map();
const filePromises = new Map();

const getFileCacheKey = (
    folder,
    fileName
) => {
    return `${folder}/${fileName}`;
};

const invalidateFileCache = (
    folder,
    fileName
) => {
    const key =
        getFileCacheKey(
            folder,
            fileName
        );

    fileCache.delete(key);
};

const clearPendingFileRequest = (
    folder,
    fileName
) => {
    const key =
        getFileCacheKey(
            folder,
            fileName
        );

    filePromises.delete(key);
};

// =========================================================
// Timeout helper
// =========================================================

const withTimeout = (
    promise,
    timeoutMs,
    onTimeout
) => {
    return new Promise(
        (resolve, reject) => {

            let settled = false;

            const timer =
                setTimeout(() => {

                    if (settled) {
                        return;
                    }

                    settled = true;

                    try {
                        onTimeout?.();
                    } catch {}

                    reject(
                        new Error(
                            `Translation request timed out after ${timeoutMs}ms`
                        )
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
        }
    );
};

// =========================================================
// Cached file loader
// =========================================================

const getCachedFile = async (
    folder,
    fileName,
    options = {}
) => {

    const {
        timeoutMs = FILE_REQUEST_TIMEOUT
    } = options;

    const key =
        getFileCacheKey(
            folder,
            fileName
        );

    // -----------------------------------------------------
    // RAM cache
    // -----------------------------------------------------

    if (fileCache.has(key)) {
        return fileCache.get(key);
    }

    // -----------------------------------------------------
    // Existing request
    // -----------------------------------------------------

    if (filePromises.has(key)) {
        return filePromises.get(key);
    }

    // -----------------------------------------------------
    // New request
    // -----------------------------------------------------

    const rawPromise =
        languageManager
            .getFile(
                folder,
                fileName
            )
            .then((data) => {

                if (
                    data !== null &&
                    data !== undefined
                ) {

                    fileCache.set(
                        key,
                        data
                    );
                }

                return data;
            })
            .finally(() => {

                filePromises.delete(
                    key
                );
            });

    filePromises.set(
        key,
        rawPromise
    );

    // -----------------------------------------------------
    // Timeout protection
    // -----------------------------------------------------

    return withTimeout(
        rawPromise,
        timeoutMs,
        () => {

            /*
             * The original request may still be running.
             *
             * Remove it from the deduplication map so that
             * a later background retry can start a fresh
             * request instead of waiting forever.
             */

            clearPendingFileRequest(
                folder,
                fileName
            );
        }
    );
};

// =========================================================
// Context Provider
// =========================================================

export function LanguageProvider({
    children
}) {

    const pathname =
        usePathname();

    const [language, setLanguage] =
        useState("ar");

    const [parallelLanguage, setParallelLanguage] =
        useState(null);

    const [strings, setStrings] =
        useState(null);

    const { theme } =
        useTheme();

    const [useTashkeel, setUseTashkeel] =
        useState(false);

    const [keepAppAwake, setKeepAppAwake] =
        useState(true);

    const [keepBibleAwake, setKeepBibleAwake] =
        useState(true);

    const [isFirstTime, setIsFirstTime] =
        useState(false);

    const [onboardingStep, setOnboardingStep] =
        useState("language");

    const [isHydrated, setIsHydrated] =
        useState(false);

    // -----------------------------------------------------
    // Initialization refs
    // -----------------------------------------------------

    const initializedRef =
        useRef(false);

    const languageChangeRef =
        useRef(false);

    const updateCheckRunningRef =
        useRef(false);

    const lastUpdateCheckRef =
        useRef(0);

    // =====================================================
    // Bundled Arabic fallback
    // =====================================================

    const loadBundledArabic =
        useCallback(async () => {

            try {

                const fallback =
                    await import(
                        "../data/translations/arabic/ar.json"
                    );

                const data =
                    fallback.default ||
                    fallback;

                return data;

            } catch (error) {

                console.error(
                    "Bundled Arabic translation failed:",
                    error
                );

                throw error;
            }

        }, []);

    // =====================================================
    // Load translations
    // =====================================================

    const loadTranslations =
        useCallback(async (
            lang,
            options = {}
        ) => {

            const {
                allowBundledFallback = true
            } = options;

            const folder =
                FOLDER_MAP[lang] ||
                "arabic";

            const mainFile =
                getMainFile(lang);

            try {

                const data =
                    await getCachedFile(
                        folder,
                        mainFile
                    );

                if (!data) {

                    throw new Error(
                        "Main language data is empty"
                    );
                }

                setStrings(data);

                return data;

            } catch (error) {

                console.error(
                    "Error loading language:",
                    error
                );

                // -----------------------------------------
                // Arabic bundled fallback
                // -----------------------------------------

                if (
                    lang === "ar" &&
                    allowBundledFallback
                ) {

                    const data =
                        await loadBundledArabic();

                    setStrings(data);

                    return data;
                }

                throw error;
            }

        }, [
            loadBundledArabic
        ]);

    // =====================================================
    // Initial Arabic startup
    //
    // IMPORTANT:
    //
    // Arabic has a bundled copy inside the application.
    // We use it immediately instead of making startup
    // dependent on R2/manifest/CORS.
    // =====================================================

    const initializeArabic =
        useCallback(async () => {

            const bundled =
                await loadBundledArabic();

            /*
             * Make the application usable immediately.
             */

            setStrings(bundled);

            /*
             * Return bundled data so initialization can
             * continue without waiting for the network.
             */

            return bundled;

        }, [
            loadBundledArabic
        ]);

    // =====================================================
    // Background auxiliary prefetch
    // =====================================================

    const prefetchAuxFiles =
        useCallback((lang) => {

            if (
                !Capacitor.isNativePlatform()
            ) {
                return;
            }

            const files =
                getAuxFiles(lang);

            for (const {
                folder,
                fileName
            } of files) {

                void getCachedFile(
                    folder,
                    fileName
                ).catch(() => {});
            }

        }, []);

    // =====================================================
    // Shared prefetch
    // =====================================================

    const prefetchSharedFiles =
        useCallback(() => {

            if (
                !Capacitor.isNativePlatform()
            ) {
                return;
            }

            for (const {
                folder,
                fileName
            } of SHARED_FILES) {

                void getCachedFile(
                    folder,
                    fileName
                ).catch(() => {});
            }

        }, []);

    // =====================================================
    // Initial initialization
    // =====================================================

    useEffect(() => {

        if (
            initializedRef.current
        ) {
            return;
        }

        initializedRef.current =
            true;

        let cancelled = false;

        const init = async () => {

            try {

                // -----------------------------------------
                // Read local settings first
                // -----------------------------------------

                const savedLang =
                    localStorage.getItem(
                        "app_lang"
                    );

                const onboardingDone =
                    localStorage.getItem(
                        "onboarding_done"
                    ) === "true";

                const langToLoad =
                    savedLang || "ar";

                if (
                    !savedLang ||
                    !onboardingDone
                ) {

                    setIsFirstTime(
                        true
                    );

                    setLanguage(
                        langToLoad
                    );

                    if (savedLang) {

                        setOnboardingStep(
                            "theme"
                        );
                    }

                } else {

                    setLanguage(
                        langToLoad
                    );
                }

                // -----------------------------------------
                // Translation initialization
                // -----------------------------------------

                if (
                    langToLoad === "ar"
                ) {

                    /*
                     * IMPORTANT:
                     *
                     * Do NOT wait for R2 on first startup.
                     *
                     * Arabic is bundled inside the application,
                     * so the UI can become available immediately.
                     */

                    await initializeArabic();

                } else {

                    /*
                     * Other languages still try their local/R2
                     * source, but are protected by the timeout.
                     */

                    if (!cancelled) {

                        await loadTranslations(
                            langToLoad
                        );
                    }
                }

                if (cancelled) {
                    return;
                }

                // -----------------------------------------
                // Other local settings
                // -----------------------------------------

                const savedParallel =
                    localStorage.getItem(
                        "parallel_lang"
                    );

                if (savedParallel) {

                    setParallelLanguage(
                        savedParallel
                    );
                }

                const savedTashkeel =
                    localStorage.getItem(
                        "useTashkeel"
                    ) === "true";

                setUseTashkeel(
                    savedTashkeel
                );

                const appAwakeRaw =
                    localStorage.getItem(
                        "keepAppAwake"
                    );

                const bibleAwakeRaw =
                    localStorage.getItem(
                        "keepBibleAwake"
                    );

                setKeepAppAwake(
                    appAwakeRaw === null
                        ? true
                        : appAwakeRaw === "true"
                );

                setKeepBibleAwake(
                    bibleAwakeRaw === null
                        ? true
                        : bibleAwakeRaw === "true"
                );

                // -----------------------------------------
                // Show app immediately
                // -----------------------------------------

                setIsHydrated(
                    true
                );

                // -----------------------------------------
                // Background work AFTER UI is ready
                // -----------------------------------------

                void Promise.resolve()
                    .then(() => {

                        prefetchAuxFiles(
                            langToLoad
                        );

                    })
                    .catch(() => {});

                void Promise.resolve()
                    .then(() => {

                        prefetchSharedFiles();

                    })
                    .catch(() => {});

                /*
                 * IMPORTANT:
                 *
                 * Manifest initialization happens only
                 * after the UI has already become usable.
                 */

                void Promise.resolve()
                    .then(() => {

                        return languageManager.init();

                    })
                    .catch((error) => {

                        console.warn(
                            "[LanguageManager] Background initialization failed:",
                            error
                        );

                    });

            } catch (error) {

                console.error(
                    "Language initialization error:",
                    error
                );

                /*
                 * Arabic should already have a bundled fallback.
                 *
                 * If something unexpected happens, make one
                 * final attempt to render Arabic instead of
                 * leaving the application permanently stuck.
                 */

                if (
                    !cancelled &&
                    langToLoadIsArabicFallback(
                        language
                    )
                ) {

                    try {

                        const fallback =
                            await loadBundledArabic();

                        setStrings(
                            fallback
                        );

                    } catch (
                        fallbackError
                    ) {

                        console.error(
                            "Final Arabic fallback failed:",
                            fallbackError
                        );
                    }
                }

                if (!cancelled) {

                    /*
                     * Only expose the application if we have
                     * translation strings.
                     */

                    setIsHydrated(
                        true
                    );
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

        if (
            !isHydrated ||
            !Capacitor.isNativePlatform()
        ) {
            return;
        }

        let cancelled = false;

        const updateAwakeStatus =
            async () => {

                try {

                    if (
                        keepAppAwake
                    ) {

                        await KeepAwake.keepAwake();

                    } else if (
                        keepBibleAwake &&
                        pathname?.includes(
                            "/bible"
                        )
                    ) {

                        await KeepAwake.keepAwake();

                    } else {

                        await KeepAwake.allowSleep();
                    }

                } catch (error) {

                    if (!cancelled) {

                        console.error(
                            "Awake Status Error:",
                            error
                        );
                    }
                }
            };

        void updateAwakeStatus();

        return () => {
            cancelled = true;
        };

    }, [
        keepAppAwake,
        keepBibleAwake,
        pathname,
        isHydrated
    ]);

    // =====================================================
    // Background update checker
    // =====================================================

    const checkForUpdates =
        useCallback(async () => {

            if (
                updateCheckRunningRef.current
            ) {
                return;
            }

            const now =
                Date.now();

            if (
                now -
                    lastUpdateCheckRef.current <
                5 * 60 * 1000
            ) {
                return;
            }

            updateCheckRunningRef.current =
                true;

            try {

                /*
                 * Manifest is refreshed ONLY in background.
                 */

                const manifest =
                    await languageManager
                        .refreshManifest();

                if (!manifest) {
                    return;
                }

                const folder =
                    FOLDER_MAP[
                        language
                    ] || "arabic";

                const mainFile =
                    getMainFile(
                        language
                    );

                // -----------------------------------------
                // Main translation
                // -----------------------------------------

                const upToDate =
                    await languageManager
                        .isUpToDate(
                            folder,
                            mainFile
                        );

                if (!upToDate) {

                    invalidateFileCache(
                        folder,
                        mainFile
                    );

                    void getCachedFile(
                        folder,
                        mainFile
                    ).catch((error) => {

                        console.warn(
                            "[LanguageManager] Main translation update failed:",
                            error
                        );

                    });
                }

                // -----------------------------------------
                // Auxiliary files
                // -----------------------------------------

                if (
                    Capacitor.isNativePlatform()
                ) {

                    const auxFiles =
                        getAuxFiles(
                            language
                        );

                    for (const {
                        folder: auxFolder,
                        fileName
                    } of auxFiles) {

                        const isUpToDate =
                            await languageManager
                                .isUpToDate(
                                    auxFolder,
                                    fileName
                                );

                        if (!isUpToDate) {

                            invalidateFileCache(
                                auxFolder,
                                fileName
                            );

                            void getCachedFile(
                                auxFolder,
                                fileName
                            ).catch(() => {});
                        }
                    }

                    // -------------------------------------
                    // Shared files
                    // -------------------------------------

                    for (const {
                        folder: sharedFolder,
                        fileName
                    } of SHARED_FILES) {

                        const isUpToDate =
                            await languageManager
                                .isUpToDate(
                                    sharedFolder,
                                    fileName
                                );

                        if (!isUpToDate) {

                            invalidateFileCache(
                                sharedFolder,
                                fileName
                            );

                            void getCachedFile(
                                sharedFolder,
                                fileName
                            ).catch(() => {});
                        }
                    }
                }

                lastUpdateCheckRef.current =
                    now;

            } catch (error) {

                console.warn(
                    "Background update check failed:",
                    error
                );

            } finally {

                updateCheckRunningRef.current =
                    false;
            }

        }, [
            language
        ]);

    // =====================================================
    // App active / visibility update check
    // =====================================================

    useEffect(() => {

        if (
            !isHydrated
        ) {
            return;
        }

        if (
            Capacitor.isNativePlatform()
        ) {

            let listenerHandle =
                null;

            const setupListener =
                async () => {

                    const handle =
                        await App.addListener(
                            "appStateChange",
                            ({
                                isActive
                            }) => {

                                if (
                                    isActive
                                ) {

                                    void checkForUpdates();
                                }
                            }
                        );

                    listenerHandle =
                        handle;
                };

            void setupListener();

            return () => {
                listenerHandle?.remove();
            };
        }

        // -----------------------------------------------
        // Web
        // -----------------------------------------------

        const handleVisibility =
            () => {

                if (
                    document.visibilityState ===
                    "visible"
                ) {

                    void checkForUpdates();
                }
            };

        document.addEventListener(
            "visibilitychange",
            handleVisibility
        );

        return () => {

            document.removeEventListener(
                "visibilitychange",
                handleVisibility
            );
        };

    }, [
        isHydrated,
        checkForUpdates
    ]);

    // =====================================================
    // Book names
    // =====================================================

    const bookNames =
        useMemo(() => {

            return (
                allBookNames?.[
                    language
                ] ||
                allBookNames?.ar ||
                []
            );

        }, [
            language
        ]);

    // =====================================================
    // Direction
    // =====================================================

    const dir =
        useMemo(() => {

            return language === "ar"
                ? "rtl"
                : "ltr";

        }, [
            language
        ]);

    // =====================================================
    // Sync language
    // =====================================================

    useEffect(() => {

        if (
            !isHydrated
        ) {
            return;
        }

        document.documentElement.lang =
            language;

        document.documentElement.dir =
            dir;

        const syncLang =
            async () => {

                try {

                    await Preferences.set({
                        key: "language",
                        value: language
                    });

                    if (
                        window
                            .AgiosScannerNative
                            ?.refreshAlarms
                    ) {

                        window
                            .AgiosScannerNative
                            .refreshAlarms();
                    }

                } catch (error) {

                    console.error(
                        "Language Sync Error:",
                        error
                    );
                }
            };

        void syncLang();

    }, [
        language,
        dir,
        isHydrated
    ]);

    // =====================================================
    // Sync theme
    // =====================================================

    useEffect(() => {

        if (
            !isHydrated ||
            !Capacitor.isNativePlatform() ||
            !theme
        ) {
            return;
        }

        const syncTheme =
            async () => {

                try {

                    await Preferences.set({
                        key: "theme",
                        value: theme
                    });

                    if (
                        window
                            .AgiosScannerNative
                            ?.refreshWidgets
                    ) {

                        window
                            .AgiosScannerNative
                            .refreshWidgets();
                    }

                } catch (error) {

                    console.error(
                        "Theme Sync Error:",
                        error
                    );
                }
            };

        void syncTheme();

    }, [
        theme,
        isHydrated
    ]);

    // =====================================================
    // Change language
    // =====================================================

    const changeLanguage =
        useCallback(async (
            newLang
        ) => {

            if (
                !FOLDER_MAP[newLang]
            ) {
                return;
            }

            if (
                newLang === language
            ) {

                localStorage.setItem(
                    "app_lang",
                    newLang
                );

                return;
            }

            if (
                languageChangeRef.current
            ) {
                return;
            }

            languageChangeRef.current =
                true;

            const folder =
                FOLDER_MAP[newLang];

            const mainFile =
                getMainFile(
                    newLang
                );

            try {

                // ---------------------------------------
                // Try local/RAM cache first
                // ---------------------------------------

                let data =
                    await getCachedFile(
                        folder,
                        mainFile
                    );

                if (data) {

                    localStorage.setItem(
                        "app_lang",
                        newLang
                    );

                    setLanguage(
                        newLang
                    );

                    setStrings(
                        data
                    );

                    prefetchAuxFiles(
                        newLang
                    );

                    void languageManager
                        .refreshManifest()
                        .catch(() => {});

                    return;
                }

                // ---------------------------------------
                // Internet check
                // ---------------------------------------

                if (
                    typeof navigator !==
                        "undefined" &&
                    !navigator.onLine
                ) {

                    toast.error(
                        strings?.common
                            ?.internet_required ||
                        "This feature requires an internet connection"
                    );

                    return;
                }

                // ---------------------------------------
                // Remote download
                // ---------------------------------------

                data =
                    await getCachedFile(
                        folder,
                        mainFile
                    );

                if (!data) {

                    throw new Error(
                        "Language file is empty"
                    );
                }

                localStorage.setItem(
                    "app_lang",
                    newLang
                );

                setLanguage(
                    newLang
                );

                setStrings(
                    data
                );

                prefetchAuxFiles(
                    newLang
                );

            } catch (error) {

                console.error(
                    "Change Language Error:",
                    error
                );

                toast.error(
                    strings?.common
                        ?.internet_required ||
                    "This feature requires an internet connection"
                );

            } finally {

                languageChangeRef.current =
                    false;
            }

        }, [
            language,
            strings,
            prefetchAuxFiles
        ]);

    // =====================================================
    // Finish onboarding
    // =====================================================

    const finishFirstTime =
        useCallback(() => {

            setIsFirstTime(
                false
            );

            localStorage.setItem(
                "onboarding_done",
                "true"
            );

        }, []);

    // =====================================================
    // Parallel language
    // =====================================================

    const changeParallelLanguage =
        useCallback((newLang) => {

            if (
                newLang === null
            ) {

                setParallelLanguage(
                    null
                );

                localStorage.removeItem(
                    "parallel_lang"
                );

            } else {

                setParallelLanguage(
                    newLang
                );

                localStorage.setItem(
                    "parallel_lang",
                    newLang
                );
            }

            window.dispatchEvent(
                new Event("storage")
            );

        }, []);

    // =====================================================
    // Tashkeel
    // =====================================================

    const toggleTashkeel =
        useCallback(() => {

            setUseTashkeel(
                (previous) => {

                    const newState =
                        !previous;

                    localStorage.setItem(
                        "useTashkeel",
                        newState.toString()
                    );

                    window.dispatchEvent(
                        new Event("storage")
                    );

                    return newState;
                }
            );

        }, []);

    // =====================================================
    // Keep App Awake
    // =====================================================

    const toggleKeepAppAwake =
        useCallback(() => {

            setKeepAppAwake(
                (previous) => {

                    const newState =
                        !previous;

                    localStorage.setItem(
                        "keepAppAwake",
                        newState.toString()
                    );

                    return newState;
                }
            );

        }, []);

    // =====================================================
    // Keep Bible Awake
    // =====================================================

    const toggleKeepBibleAwake =
        useCallback(() => {

            setKeepBibleAwake(
                (previous) => {

                    const newState =
                        !previous;

                    localStorage.setItem(
                        "keepBibleAwake",
                        newState.toString()
                    );

                    return newState;
                }
            );

        }, []);

    // =====================================================
    // Format numbers
    // =====================================================

    const formatNumber =
        useCallback(
            (num) => {

                if (
                    num === null ||
                    num === undefined
                ) {
                    return "";
                }

                if (
                    language !== "ar"
                ) {
                    return num.toString();
                }

                const arabicNums = [
                    "٠",
                    "١",
                    "٢",
                    "٣",
                    "٤",
                    "٥",
                    "٦",
                    "٧",
                    "٨",
                    "٩"
                ];

                return num
                    .toString()
                    .split("")
                    .map(
                        (digit) =>
                            arabicNums[
                                Number(digit)
                            ] || digit
                    )
                    .join("");

            },
            [
                language
            ]
        );

    // =====================================================
    // Memoized context value
    // =====================================================

    const value =
        useMemo(() => {

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

    if (
        !isHydrated ||
        !strings
    ) {

        return (
            <div
                style={{
                    height: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                        "var(--color-bg-start)",
                    color:
                        "var(--color-text-primary)",
                    fontFamily:
                        "sans-serif"
                }}
            >
                ...
            </div>
        );
    }

    return (
        <LanguageContext.Provider
            value={value}
        >
            {children}
        </LanguageContext.Provider>
    );
}

// =========================================================
// Arabic fallback helper
// =========================================================

function langToLoadIsArabicFallback(
    lang
) {
    return (
        !lang ||
        lang === "ar"
    );
}

// =========================================================
// Hook
// =========================================================

export const useLanguage = () =>
    useContext(
        LanguageContext
    );