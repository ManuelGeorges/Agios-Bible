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

const getCachedFile = async (
    folder,
    fileName
) => {
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

    const promise =
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
        promise
    );

    return promise;
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

    const { theme, setTheme } =
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
    // Prevent duplicate initialization
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
    // Load translations
    // =====================================================

    const loadTranslations =
        useCallback(async (lang) => {

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

                if (lang === "ar") {

                    try {

                        const fallback =
                            await import(
                                "../data/translations/arabic/ar.json"
                            );

                        const data =
                            fallback.default ||
                            fallback;

                        setStrings(data);

                        return data;

                    } catch (
                        fallbackError
                    ) {

                        console.error(
                            "Critical fallback error:",
                            fallbackError
                        );

                        throw fallbackError;
                    }
                }

                throw error;
            }
        }, []);

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

            /*
             * لا await.
             *
             * languageManager نفسه مسؤول عن:
             * - local cache
             * - deduplication
             * - background updates
             */

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

        if (initializedRef.current) {
            return;
        }

        initializedRef.current = true;

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

                if (!savedLang || !onboardingDone) {
                    setIsFirstTime(true);
                    setLanguage(langToLoad);

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
                // Load local translation FIRST
                // -----------------------------------------

                if (!cancelled) {
                    await loadTranslations(
                        langToLoad
                    );
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

                setIsHydrated(true);

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
                 * Manifest intentionally NOT awaited here.
                 *
                 * languageManager will handle it in background.
                 */

                void languageManager
                    .init()
                    .catch(() => {});

            } catch (error) {

                console.error(
                    "Language initialization error:",
                    error
                );

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
        loadTranslations,
        prefetchAuxFiles,
        prefetchSharedFiles
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

                    if (keepAppAwake) {

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

            /*
             * Prevent duplicate checks
             */

            if (
                updateCheckRunningRef.current
            ) {
                return;
            }

            /*
             * Don't check repeatedly within
             * a short period.
             *
             * 5 minutes is enough.
             */

            const now = Date.now();

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
                 * Refresh manifest ONLY here.
                 *
                 * Never block initial startup.
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

                    /*
                     * Don't replace UI synchronously
                     * while user is doing something.
                     *
                     * Load updated version in background.
                     */

                    void getCachedFile(
                        folder,
                        mainFile
                    ).catch(() => {});
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

        if (!isHydrated) {
            return;
        }

        if (
            Capacitor.isNativePlatform()
        ) {

            let listenerHandle = null;

            const setupListener =
                async () => {

                    const handle =
                        await App.addListener(
                            "appStateChange",
                            ({
                                isActive
                            }) => {

                                if (isActive) {
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

        if (!isHydrated) {
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
        useCallback(async (newLang) => {

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

            /*
             * Prevent two language changes
             * at the same time.
             */

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
                getMainFile(newLang);

            try {

                /*
                 * ---------------------------------------
                 * IMPORTANT:
                 *
                 * Don't refresh manifest first.
                 *
                 * Try local file immediately.
                 * ---------------------------------------
                 */

                let data =
                    await getCachedFile(
                        folder,
                        mainFile
                    );

                /*
                 * If local file is available,
                 * UI can switch immediately.
                 */

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

                    /*
                     * Background prefetch
                     */

                    prefetchAuxFiles(
                        newLang
                    );

                    /*
                     * Manifest refresh happens
                     * independently in background.
                     */

                    void languageManager
                        .refreshManifest()
                        .catch(() => {});

                    return;
                }

                /*
                 * ---------------------------------------
                 * File does not exist locally.
                 *
                 * Now internet is required.
                 * ---------------------------------------
                 */

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

                /*
                 * getFile() will:
                 *
                 * Manifest
                 * ↓
                 * R2
                 * ↓
                 * Save locally
                 */

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
// Hook
// =========================================================

export const useLanguage = () =>
    useContext(
        LanguageContext
    );
