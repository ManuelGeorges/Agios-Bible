"use client";

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useMemo,
    useCallback
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

const LanguageContext = createContext();

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

const getAuxFiles = (lang) => {
    const folder = FOLDER_MAP[lang] || "arabic";

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

/*
|--------------------------------------------------------------------------
| Session cache + request deduplication
|--------------------------------------------------------------------------
|
| الهدف:
| 1. منع تحميل نفس الملف أكثر من مرة في نفس الوقت.
| 2. منع إعادة طلب نفس الملف أثناء نفس جلسة التطبيق.
|
| ملاحظة:
| الـ persistent cache الأساسي يظل مسؤولية languageManager.
|
*/

const fileCache = new globalThis.Map();
const filePromises = new globalThis.Map();

const getFileCacheKey = (folder, fileName) => {
    return `${folder}/${fileName}`;
};

const invalidateFileCache = (folder, fileName) => {
    const key = getFileCacheKey(
        folder,
        fileName
    );

    fileCache.delete(key);
};

const clearLanguageCache = (lang) => {
    const folder =
        FOLDER_MAP[lang] || "arabic";

    const mainFile =
        lang === "ar"
            ? "ar.json"
            : `${lang}.json`;

    invalidateFileCache(
        folder,
        mainFile
    );

    const auxFiles =
        getAuxFiles(lang);

    auxFiles.forEach(
        ({ folder: auxFolder, fileName }) => {
            invalidateFileCache(
                auxFolder,
                fileName
            );
        }
    );

    SHARED_FILES.forEach(
        ({ folder: sharedFolder, fileName }) => {
            invalidateFileCache(
                sharedFolder,
                fileName
            );
        }
    );
};

const getCachedFile = async (
    folder,
    fileName
) => {
    const key = getFileCacheKey(
        folder,
        fileName
    );

    /*
     * موجود بالفعل في memory
     */
    if (fileCache.has(key)) {
        return fileCache.get(key);
    }

    /*
     * نفس الملف بيتحمل حاليًا
     * استخدم نفس الـ Promise بدل download جديد
     */
    if (filePromises.has(key)) {
        return filePromises.get(key);
    }

    const promise = languageManager
        .getFile(folder, fileName)
        .then((data) => {
            if (
                data !== undefined &&
                data !== null
            ) {
                fileCache.set(
                    key,
                    data
                );
            }

            return data;
        })
        .finally(() => {
            filePromises.delete(key);
        });

    filePromises.set(
        key,
        promise
    );

    return promise;
};

export function LanguageProvider({
    children
}) {
    const pathname = usePathname();

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

    /*
    |--------------------------------------------------------------------------
    | Load translations
    |--------------------------------------------------------------------------
    */

    const loadTranslations =
        useCallback(async (lang) => {
            try {
                const folder =
                    FOLDER_MAP[lang] ||
                    "arabic";

                const mainFile =
                    lang === "ar"
                        ? "ar.json"
                        : `${lang}.json`;

                const mainData =
                    await getCachedFile(
                        folder,
                        mainFile
                    );

                if (!mainData) {
                    throw new Error(
                        "Main language data is empty"
                    );
                }

                setStrings(mainData);
            } catch (error) {
                console.error(
                    "Error loading language:",
                    error
                );

                /*
                 * Arabic local fallback
                 */
                if (lang === "ar") {
                    try {
                        const fallback =
                            await import(
                                "../data/translations/arabic/ar.json"
                            );

                        setStrings(
                            fallback.default ||
                            fallback
                        );
                    } catch (
                        fallbackError
                    ) {
                        console.error(
                            "Critical fallback error:",
                            fallbackError
                        );
                    }
                } else {
                    throw error;
                }
            }
        }, []);

    /*
    |--------------------------------------------------------------------------
    | Prefetch auxiliary files
    |--------------------------------------------------------------------------
    */

    const prefetchAuxFiles =
        useCallback(async (lang) => {
            if (
                !Capacitor.isNativePlatform()
            ) {
                return;
            }

            const files =
                getAuxFiles(lang);

            await Promise.allSettled(
                files.map(
                    ({
                        folder,
                        fileName
                    }) =>
                        getCachedFile(
                            folder,
                            fileName
                        )
                )
            );
        }, []);

    /*
    |--------------------------------------------------------------------------
    | Prefetch shared files
    |--------------------------------------------------------------------------
    */

    const prefetchSharedFiles =
        useCallback(async () => {
            if (
                !Capacitor.isNativePlatform()
            ) {
                return;
            }

            await Promise.allSettled(
                SHARED_FILES.map(
                    ({
                        folder,
                        fileName
                    }) =>
                        getCachedFile(
                            folder,
                            fileName
                        )
                )
            );
        }, []);

    /*
    |--------------------------------------------------------------------------
    | Initial initialization
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        const init = async () => {
            try {
                await languageManager.init();

                const savedLang =
                    localStorage.getItem(
                        "app_lang"
                    );

                const onboardingDone =
                    localStorage.getItem(
                        "onboarding_done"
                    ) === "true";

                if (
                    !savedLang ||
                    !onboardingDone
                ) {
                    setIsFirstTime(true);

                    const langToLoad =
                        savedLang || "ar";

                    setLanguage(
                        langToLoad
                    );

                    await loadTranslations(
                        langToLoad
                    );

                    /*
                     * لا ننتظر الـ prefetch
                     * حتى لا يؤخر فتح التطبيق
                     */
                    void prefetchAuxFiles(
                        langToLoad
                    );

                    if (savedLang) {
                        setOnboardingStep(
                            "theme"
                        );
                    }
                } else {
                    setLanguage(
                        savedLang
                    );

                    await loadTranslations(
                        savedLang
                    );

                    /*
                     * Background prefetch
                     */
                    void prefetchAuxFiles(
                        savedLang
                    );
                }

                /*
                 * Background prefetch
                 */
                void prefetchSharedFiles();

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

                const appAwake =
                    appAwakeRaw === null
                        ? true
                        : appAwakeRaw === "true";

                const bibleAwake =
                    bibleAwakeRaw === null
                        ? true
                        : bibleAwakeRaw === "true";

                setKeepAppAwake(
                    appAwake
                );

                setKeepBibleAwake(
                    bibleAwake
                );

                setIsHydrated(true);
            } catch (error) {
                console.error(
                    "Language initialization error:",
                    error
                );

                setIsHydrated(true);
            }
        };

        init();
    }, [
        loadTranslations,
        prefetchAuxFiles,
        prefetchSharedFiles
    ]);

    /*
    |--------------------------------------------------------------------------
    | Keep Awake
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        if (
            !isHydrated ||
            !Capacitor.isNativePlatform()
        ) {
            return;
        }

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
                    console.error(
                        "Awake Status Error:",
                        error
                    );
                }
            };

        updateAwakeStatus();
    }, [
        keepAppAwake,
        keepBibleAwake,
        pathname,
        isHydrated
    ]);

    /*
    |--------------------------------------------------------------------------
    | Background update checker
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        if (!isHydrated) {
            return;
        }

        const checkForUpdates =
            async () => {
                try {
                    /*
                     * Get newest manifest
                     */
                    await languageManager.refreshManifest();

                    const folder =
                        FOLDER_MAP[
                            language
                        ] || "arabic";

                    const mainFile =
                        language === "ar"
                            ? "ar.json"
                            : `${language}.json`;

                    /*
                     * Check main translation
                     */
                    const upToDate =
                        await languageManager.isUpToDate(
                            folder,
                            mainFile
                        );

                    if (!upToDate) {
                        /*
                         * مهم:
                         * امسح نسخة الـ memory القديمة
                         * قبل تحميل النسخة الجديدة.
                         */
                        invalidateFileCache(
                            folder,
                            mainFile
                        );

                        await loadTranslations(
                            language
                        );
                    }

                    /*
                     * Native auxiliary files
                     */
                    if (
                        Capacitor.isNativePlatform()
                    ) {
                        const auxFiles =
                            getAuxFiles(
                                language
                            );

                        for (
                            const {
                                folder: auxFolder,
                                fileName
                            } of auxFiles
                        ) {
                            const auxUpToDate =
                                await languageManager.isUpToDate(
                                    auxFolder,
                                    fileName
                                );

                            if (
                                !auxUpToDate
                            ) {
                                /*
                                 * امسح الـ memory cache
                                 */
                                invalidateFileCache(
                                    auxFolder,
                                    fileName
                                );

                                /*
                                 * حمّل النسخة الجديدة
                                 * في الخلفية
                                 */
                                await getCachedFile(
                                    auxFolder,
                                    fileName
                                ).catch(
                                    () => {}
                                );
                            }
                        }

                        /*
                         * Shared files
                         */
                        for (
                            const {
                                folder: sharedFolder,
                                fileName
                            } of SHARED_FILES
                        ) {
                            const sharedUpToDate =
                                await languageManager.isUpToDate(
                                    sharedFolder,
                                    fileName
                                );

                            if (
                                !sharedUpToDate
                            ) {
                                invalidateFileCache(
                                    sharedFolder,
                                    fileName
                                );

                                await getCachedFile(
                                    sharedFolder,
                                    fileName
                                ).catch(
                                    () => {}
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.error(
                        "Update Check Error:",
                        error
                    );
                }
            };

        /*
        |--------------------------------------------------------------------------
        | Native: check when app becomes active
        |--------------------------------------------------------------------------
        */

        if (
            Capacitor.isNativePlatform()
        ) {
            let listenerHandle;

            App.addListener(
                "appStateChange",
                ({ isActive }) => {
                    if (isActive) {
                        void checkForUpdates();
                    }
                }
            ).then((handle) => {
                listenerHandle =
                    handle;
            });

            return () => {
                listenerHandle?.remove();
            };
        }

        /*
        |--------------------------------------------------------------------------
        | Web: check when tab becomes visible
        |--------------------------------------------------------------------------
        */

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
        language,
        loadTranslations
    ]);

    /*
    |--------------------------------------------------------------------------
    | Book names
    |--------------------------------------------------------------------------
    */

    const bookNames =
        useMemo(() => {
            if (!allBookNames) {
                return [];
            }

            return (
                allBookNames[language] ||
                allBookNames.ar ||
                []
            );
        }, [language]);

    /*
    |--------------------------------------------------------------------------
    | Direction
    |--------------------------------------------------------------------------
    */

    const dir =
        useMemo(
            () =>
                language === "ar"
                    ? "rtl"
                    : "ltr",
            [language]
        );

    /*
    |--------------------------------------------------------------------------
    | Sync language
    |--------------------------------------------------------------------------
    */

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
                    await Preferences.set(
                        {
                            key: "language",
                            value: language
                        }
                    );

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

        syncLang();
    }, [
        language,
        dir,
        isHydrated
    ]);

    /*
    |--------------------------------------------------------------------------
    | Sync theme
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        if (
            isHydrated &&
            Capacitor.isNativePlatform() &&
            theme
        ) {
            const syncTheme =
                async () => {
                    try {
                        await Preferences.set(
                            {
                                key: "theme",
                                value: theme
                            }
                        );

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

            syncTheme();
        }
    }, [
        theme,
        isHydrated
    ]);

    /*
    |--------------------------------------------------------------------------
    | Change language
    |--------------------------------------------------------------------------
    */

    const changeLanguage =
        async (newLang) => {
            if (
                newLang === language
            ) {
                localStorage.setItem(
                    "app_lang",
                    newLang
                );

                return;
            }

            const folder =
                FOLDER_MAP[newLang] ||
                "arabic";

            const mainFile =
                newLang === "ar"
                    ? "ar.json"
                    : `${newLang}.json`;

            /*
             * Offline check
             */
            if (
                typeof navigator !==
                    "undefined" &&
                !navigator.onLine
            ) {
                const alreadyAvailable =
                    await languageManager.hasLocalCopy(
                        folder,
                        mainFile
                    );

                if (
                    !alreadyAvailable
                ) {
                    toast.error(
                        strings?.common
                            ?.internet_required ||
                        "This feature requires an internet connection"
                    );

                    return;
                }
            }

            localStorage.setItem(
                "app_lang",
                newLang
            );

            setIsHydrated(false);

            try {
                /*
                 * Get latest manifest
                 */
                await languageManager.refreshManifest();

                /*
                 * مهم:
                 * لو كان الملف موجود في session cache
                 * لازم نتأكد من الـ manifest قبل الاعتماد عليه.
                 */
                const upToDate =
                    await languageManager.isUpToDate(
                        folder,
                        mainFile
                    );

                if (!upToDate) {
                    invalidateFileCache(
                        folder,
                        mainFile
                    );
                }

                await loadTranslations(
                    newLang
                );

                /*
                 * Background prefetch
                 */
                void prefetchAuxFiles(
                    newLang
                );

                setLanguage(
                    newLang
                );

                if (
                    parallelLanguage ===
                    newLang
                ) {
                    setParallelLanguage(
                        null
                    );

                    localStorage.removeItem(
                        "parallel_lang"
                    );
                }
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
                setIsHydrated(true);
            }
        };

    /*
    |--------------------------------------------------------------------------
    | Finish onboarding
    |--------------------------------------------------------------------------
    */

    const finishFirstTime =
        () => {
            setIsFirstTime(
                false
            );

            localStorage.setItem(
                "onboarding_done",
                "true"
            );
        };

    /*
    |--------------------------------------------------------------------------
    | Parallel language
    |--------------------------------------------------------------------------
    */

    const changeParallelLanguage =
        (newLang) => {
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
        };

    /*
    |--------------------------------------------------------------------------
    | Tashkeel
    |--------------------------------------------------------------------------
    */

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
                        new Event(
                            "storage"
                        )
                    );

                    return newState;
                }
            );
        }, []);

    /*
    |--------------------------------------------------------------------------
    | Keep app awake
    |--------------------------------------------------------------------------
    */

    const toggleKeepAppAwake =
        useCallback(
            async () => {
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
            },
            []
        );

    /*
    |--------------------------------------------------------------------------
    | Keep Bible awake
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Format numbers
    |--------------------------------------------------------------------------
    */

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
                                +digit
                            ] || digit
                    )
                    .join("");
            },
            [language]
        );

    /*
    |--------------------------------------------------------------------------
    | Context value
    |--------------------------------------------------------------------------
    */

    const value = {
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

    /*
    |--------------------------------------------------------------------------
    | Loading screen
    |--------------------------------------------------------------------------
    */

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

export const useLanguage =
    () =>
        useContext(
            LanguageContext
        );