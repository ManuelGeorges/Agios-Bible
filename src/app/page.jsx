'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import styles from './page.module.css';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import studyPlansData from './studyPlans/studyPlansData.json';
import Link from 'next/link';
import { getAuth } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc, increment, arrayUnion, deleteField } from "firebase/firestore";
import { db, getFirebaseRemoteConfig } from '../lib/firebase';
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { Capacitor } from '@capacitor/core';
import { toast } from 'react-hot-toast';
import {
    BookOpenText, Map, Search, User, Trophy,
    Settings, Heart, BookMarked, Sparkles,
    ChevronLeft, Award, Flame, LogIn, ArrowRight,
    CheckCircle, Circle, ArrowUpRight, Bell,
    Image as ImageIcon, Info, Star, Gift, Megaphone,
    MessageCircle, Zap, Globe, Shield, Calendar,
    Bot, Brain, Cpu, Wand2, Lightbulb, Rocket,
    RefreshCw, History, Share2, ThumbsUp, Users,
    Lock, Unlock, Camera, Mail, Link as LinkIcon,
    ExternalLink, ShieldCheck, QrCode, BookOpen,
    Scroll, Languages, PartyPopper, Mic, Headphones,
    Video, Music, Church, Sun, Moon, Cloud, Target, MapPin, BrainCircuit,
    ChevronRight, Check, X, Trash2, LayoutGrid, Clock
} from 'lucide-react';
import ShareVerseCard from '../components/ShareVerseCard';
import Badge from '../components/Badge/Badge';
import { useBadge } from './context/BadgeContext';
import BibleBookSelector from '../components/BibleBookSelector';
import { getCairoDate, getCairoDateInfo, getCairoYesterday, getCairoIsoString } from '../lib/dateUtils';
import { useLanguage } from './context/LanguageContext';

import { StorageService, KEYS } from '../lib/storage';
import { syncLocalDataToFirebase } from '../lib/SyncService';
import { openExternalLink, fetchWithTimeout } from '../lib/utils';
import { languageManager } from '../services/languageManager';

import badgesAr from './data/translations/arabic/badges_ar.json';
import badgesEn from './data/translations/English/badges_en.json';
import badgesFr from './data/translations/French/badges_fr.json';
import badgesDe from './data/translations/german/badges_de.json';

const auth = typeof window !== 'undefined' ? getAuth() : null;
const firestore = db;
const staticPlans = studyPlansData.plans;

const badgeFiles = {
    ar: badgesAr,
    en: badgesEn,
    fr: badgesFr,
    de: badgesDe
};

const LUCIDE_ICONS = {
    'Trophy': Trophy, 'Award': Award, 'Medal': Award, 'Gift': Gift, 'Star': Star, 'Heart': Heart,
    'Bell': Bell, 'Info': Info, 'Megaphone': Megaphone, 'Message': MessageCircle, 'Announcement': Megaphone,
    'Bot': Bot, 'AI': Sparkles, 'Brain': Brain, 'Cpu': Cpu, 'Wand': Wand2, 'Magic': Wand2, 'Lightbulb': Lightbulb, 'Idea': Lightbulb,
    'Rocket': Rocket, 'Update': RefreshCw, 'New': Sparkles, 'History': History, 'Zap': Zap, 'Flash': Zap, 'Party': PartyPopper,
    'BookOpenText': BookOpenText, 'Bible': BookOpen, 'BookOpen': BookOpen, 'Scroll': Scroll, 'Church': Church, 'Pray': Heart,
    'Map': Map, 'Search': Search, 'Settings': Settings, 'Globe': Globe, 'Shield': Shield, 'Verified': ShieldCheck,
    'Calendar': Calendar, 'Camera': Camera, 'Mail': Mail, 'Link': LinkIcon, 'External': ExternalLink,
    'Lock': Lock, 'Unlock': Unlock, 'QrCode': QrCode, 'Translate': Languages, 'Mic': Mic,
    'Users': Users, 'People': Users, 'Like': ThumbsUp, 'Share': Share2, 'Music': Music, 'Video': Video, 'Headphones': Headphones,
    'Sun': Sun, 'Moon': Moon, 'Cloud': Cloud, 'Flame': Flame, 'Fire': Flame, 'Target': Target, 'MapPin': MapPin, 'BrainCircuit': BrainCircuit
};

const HIGHLIGHT_COLORS = [
  '#FFC107', '#FF5722', '#F44336', '#E91E63', '#9C27B0',
  '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFECB3',
  '#F8BBD0', '#E1BEE7', '#CFD8DC'
];

const formatReference = (ref) => {
    if (!ref) return "";
    const rlm = "\u200F";
    const lrm = "\u200E";
    const cleanRef = ref.replace(/[()]/g, '').trim();
    const parts = cleanRef.split(' ');
    if (parts.length < 2) return ref;

    const rawNumbers = parts[parts.length - 1];
    const bookName = parts.slice(0, -1).join(' ');

    if (rawNumbers.includes(':')) {
        const [rawCh, rawV] = rawNumbers.split(':');
        return `${rlm}(${bookName} ${rawCh}${lrm}:${rlm}${rawV})`;
    }

    return `${rlm}(${bookName} ${rawNumbers})`;
};

const FOLDER_MAP = {
    ar: 'arabic',
    en: 'English',
    de: 'german',
    fr: 'French'
};

const LandingPage = () => {
    const { language, strings, allBookNames, formatNumber, dir } = useLanguage();
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { triggerBadgeUnlock } = useBadge();
    const [dailyVerse, setDailyVerse] = useState(null);
    const [dailyQuestion, setDailyQuestion] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isDailyLoading, setIsDailyLoading] = useState(true); // حالة تحميل مستقلة للمحتوى اليومي
    const [startedPlans, setStartedPlans] = useState([]);
    const [user, setUser] = useState(null);
    const [userStats, setUserStats] = useState({ points: 0, streak: 0 });
    const [userBadges, setUserBadges] = useState([]);
    const [favouriteVerses, setFavouriteVerses] = useState({});
    const [lastRead, setLastRead] = useState(null);
    const [readingHistory, setReadingHistory] = useState([]);
    const [dailyGoals, setDailyGoals] = useState([]);
    const [remoteNews, setRemoteNews] = useState([]);
    const [activeNewsIndex, setActiveNewsIndex] = useState(0);
    const [badgesData, setBadgesData] = useState(null);
    const [rawUserData, setRawUserData] = useState(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const newsRef = useRef(null);

    const scrollNews = (direction) => {
        if (newsRef.current) {
            const scrollAmount = newsRef.current.offsetWidth * 0.8;
            newsRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const unlockBadge = useCallback(async (badgeId) => {
        if (user) {
          try {
            const userRef = doc(firestore, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            const currentBadges = userSnap.data()?.badges || [];
            if (!currentBadges.includes(badgeId)) {
              await updateDoc(userRef, { badges: arrayUnion(badgeId) });
              triggerBadgeUnlock(badgeId);
            }
          } catch (e) { console.error(e); }
        } else {
            const localBadges = await StorageService.get(KEYS.LOCAL_BADGES) || [];
            if (!localBadges.includes(badgeId)) {
                localBadges.push(badgeId);
                await StorageService.save(KEYS.LOCAL_BADGES, localBadges);
                triggerBadgeUnlock(badgeId);
                setUserBadges([...localBadges]);
            }
        }
    }, [user, triggerBadgeUnlock]);

    const checkTimeBadges = useCallback(async () => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        if (hour < 7) await unlockBadge('early_bird');
        if (hour === 3 && minute === 0) await unlockBadge('ghost_user');
        if (hour >= 0 && hour < 4) await unlockBadge('night_owl');
    }, [unlockBadge]);

    const checkStreakBadges = useCallback(async (streak) => {
        const streakTargets = [3, 7, 15, 30, 60, 90, 180, 365];
        for (const target of streakTargets) {
            if (streak >= target) {
                await unlockBadge(`streak_${target}`);
            }
        }
    }, [unlockBadge]);

    const calculatePlanStats = useCallback((planOrId, isCustom, customPlanData, completionData) => {
        let completedDays = {};
        let totalDays = 0;

        if (isCustom && customPlanData) {
            completedDays = customPlanData.completedDays || {};
            totalDays = customPlanData.readings?.length || 0;
        } else {
            const plan = typeof planOrId === 'object' ? planOrId : staticPlans.find(p => p.id === planOrId);
            totalDays = plan?.readings?.length || 0;
            const planId = plan?.id || planOrId;
            completedDays = completionData?.[planId]?.completedDays || {};
        }

        const daysDone = Object.values(completedDays).filter(d => d.isCompleted || d === true).length;
        const percent = totalDays > 0 ? Math.round((daysDone / totalDays) * 100) : 0;

        return { daysDone, totalDays, percent };
    }, []);

// Cache داخل نفس جلسة التطبيق لمنع إعادة تحميل نفس المحتوى
const dailyContentCache = new globalThis.Map();
const dailyContentPromises = new globalThis.Map();

const fetchDailyContent = useCallback(async () => {
    if (!allBookNames || Object.keys(allBookNames).length === 0) return;

    const { month, day } = getCairoDateInfo();
    const cacheKey = `${language}-${month}-${day}`;

    // لو المحتوى موجود بالفعل في الذاكرة، استخدمه فورًا
    if (dailyContentCache.has(cacheKey)) {
        const cached = dailyContentCache.get(cacheKey);

        setDailyVerse(cached.verse);
        setDailyQuestion(cached.question);
        setIsDailyLoading(false);

        return;
    }

    // لو فيه تحميل شغال بالفعل لنفس المحتوى، استخدم نفس الـ Promise
    if (dailyContentPromises.has(cacheKey)) {
        setIsDailyLoading(true);

        try {
            const result = await dailyContentPromises.get(cacheKey);

            if (result) {
                setDailyVerse(result.verse);
                setDailyQuestion(result.question);
            }
        } catch (e) {
            console.error("Daily content shared fetch error:", e);
        } finally {
            setIsDailyLoading(false);
        }

        return;
    }

    setIsDailyLoading(true);

    const loadPromise = (async () => {
        try {
            // 1. جلب مراجع آية اليوم
            const verseRefsRes = await fetchWithTimeout(
                '/data/dailyVerses.json',
                { timeout: 3000 }
            );

            if (!verseRefsRes.ok) {
                throw new Error("Daily verses file not found");
            }

            const verseRefs = await verseRefsRes.json();

            const todayRef = verseRefs.find(
                v =>
                    Number(v.month) === month &&
                    Number(v.day) === day
            );

            const folder = FOLDER_MAP[language] || 'arabic';

            let todayQuestion = null;
            let todayVerse = null;

            // 2. تحميل السؤال اليومي
            const questFile = `dailyQuestions_${language}.json`;

            try {
                const questData = await languageManager.getFile(
                    folder,
                    questFile
                );

                if (questData) {
                    todayQuestion = questData.find(
                        q =>
                            Number(q.month) === month &&
                            Number(q.day) === day
                    ) || null;
                }
            } catch (e) {
                console.error(
                    "Questions R2 fetch error:",
                    e
                );
            }

            // 3. تحميل آية اليوم
            if (todayRef) {
                const bibleFileMap = {
                    ar: 'ar_svd_no_tashkeel.json',
                    en: 'en_web.json',
                    fr: 'fr_segond.json',
                    de: 'de_luther.json'
                };

                const bibleFile = bibleFileMap[language];

                if (bibleFile) {
                    try {
                        const bibleData =
                            await languageManager.getFile(
                                folder,
                                bibleFile
                            );

                        if (bibleData) {
                            const bibleBook = bibleData.find(
                                b =>
                                    (
                                        b.abbrev &&
                                        b.abbrev.toUpperCase() ===
                                        todayRef.book.toUpperCase()
                                    ) ||
                                    (
                                        b.book_id &&
                                        b.book_id.toUpperCase() ===
                                        todayRef.book.toUpperCase()
                                    )
                            );

                            const bookInfo =
                                allBookNames[language]?.find(
                                    b =>
                                        b.book_id ===
                                        todayRef.book
                                ) ||
                                allBookNames['en']?.find(
                                    b =>
                                        b.book_id ===
                                        todayRef.book
                                );

                            if (
                                bibleBook &&
                                bibleBook.chapters[
                                    todayRef.chapter - 1
                                ]
                            ) {
                                const verseText =
                                    bibleBook.chapters[
                                        todayRef.chapter - 1
                                    ][
                                        todayRef.verse - 1
                                    ];

                                if (verseText) {
                                    todayVerse = {
                                        verse: verseText,
                                        reference:
                                            `${bookInfo?.name} ${todayRef.chapter}:${todayRef.verse}`,
                                        month,
                                        day,
                                        bookId: todayRef.book,
                                        chapter: todayRef.chapter,
                                        verseNum: todayRef.verse
                                    };
                                }
                            }
                        }
                    } catch (e) {
                        console.error(
                            "Bible R2 fetch error:",
                            e
                        );
                    }
                }
            }

            const result = {
                verse: todayVerse,
                question: todayQuestion
            };

            // حفظ النتيجة في الذاكرة
            dailyContentCache.set(cacheKey, result);

            return result;

        } finally {
            // إزالة الـ Promise بعد انتهاء التحميل
            dailyContentPromises.delete(cacheKey);
        }
    })();

    // تسجيل الـ Promise فورًا لمنع duplicate requests
    dailyContentPromises.set(cacheKey, loadPromise);

    try {
        const result = await loadPromise;

        if (result) {
            setDailyVerse(result.verse);
            setDailyQuestion(result.question);
        }
    } catch (e) {
        console.error(
            "Home Daily Content Fetch Error:",
            e
        );
    } finally {
        setIsDailyLoading(false);
    }
}, [language, allBookNames]);

useEffect(() => {
    if (
        allBookNames &&
        Object.keys(allBookNames).length > 0
    ) {
        fetchDailyContent();
    }
}, [fetchDailyContent, allBookNames]);
    useEffect(() => {
        setMounted(true);
        checkTimeBadges();

        setBadgesData(badgeFiles[language] || badgeFiles.ar);
    }, [checkTimeBadges, language]);

    useEffect(() => {
        const handleDeepLink = (e) => {
            const path = e.detail?.path;
            if (!path) return;
            if (path === '/#daily-verse') {
                document.getElementById('daily-verse')?.scrollIntoView({ behavior: 'smooth' });
            } else if (path === '/#daily-question') {
                document.getElementById('daily-question')?.scrollIntoView({ behavior: 'smooth' });
            }
        };

        window.addEventListener('agiosDeepLink', handleDeepLink);

        if (window.__agiosDeepLink) {
            setTimeout(() => {
                handleDeepLink({ detail: { path: window.__agiosDeepLink } });
                window.__agiosDeepLink = null;
            }, 600);
        }

        return () => window.removeEventListener('agiosDeepLink', handleDeepLink);
    }, []);

    useEffect(() => {
        const fetchRemoteConfig = async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return;
            try {
                const config = await getFirebaseRemoteConfig();
                if (config) {
                    // تحديد مهلة زمنية لمحاولة جلب الإعدادات من سيرفر Firebase
                    config.settings.minimumFetchIntervalMillis = 3600000;
                    config.settings.fetchTimeoutMillis = 5000;

                    await fetchAndActivate(config);

                    const newsJson = getValue(config, 'app_news').asString();
                    if (newsJson && newsJson.trim() !== "") {
                        const parsed = JSON.parse(newsJson);
                        if (Array.isArray(parsed)) {
                            setRemoteNews(parsed.filter(n => n.active));
                        } else if (parsed && parsed.active) {
                            setRemoteNews([parsed]);
                        }
                    }
                }
            } catch (err) {
                console.error("Remote Config Fetch Failed or Timed out.");
            }
        };
        fetchRemoteConfig();
    }, []);

    const handleNewsScroll = (e) => {
        const scrollLeft = Math.abs(e.target.scrollLeft);
        const itemWidth = e.target.offsetWidth * 0.9;
        if (itemWidth <= 0) return;
        const index = Math.round(scrollLeft / itemWidth);
        if (!isNaN(index) && index !== activeNewsIndex) {
            setActiveNewsIndex(index);
        }
    };

    useEffect(() => {
        let unsubSnap = null;
        setIsLoading(true);

        const unsubAuth = auth?.onAuthStateChanged(async (u) => {
            setUser(u);
            const today = getCairoDate();

            if (u) {
                syncLocalDataToFirebase(u).catch(e => console.log("Sync deferred:", e));

                if (unsubSnap) { unsubSnap(); unsubSnap = null; }

                unsubSnap = onSnapshot(doc(firestore, 'users', u.uid), async (snap) => {
                    if (snap.exists()) {
                        const data = snap.data();
                        setRawUserData(data);
                        const streak = data.streak || 0;
                        const points = data.totalPoints || 0;
                        setUserStats({ points: points, streak: streak });
                        checkStreakBadges(streak);

                        setUserBadges(data.badges || []);
                        setFavouriteVerses(data.favorites?.verses || {});

                        const lastReadData = data.lastRead || null;
                        setLastRead(lastReadData);

                        const ls = await StorageService.getLocalStats();
                        setReadingHistory(ls.readingHistory || []);

                        setHasAnswered(!!data.answeredQuestions?.[today]?.answered);

                        const serverComp = data.completedPlans || {};
                        const customPlans = data.customPlans || {};

                        const activeStatic = (language === 'ar' ? staticPlans : [])
                            .map(plan => {
                                const stats = calculatePlanStats(plan, false, null, serverComp);
                                return { ...plan, stats };
                            })
                            .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                        const activeCustom = Object.values(customPlans)
                            .filter(p => p.language === language || (!p.language && language === 'ar'))
                            .map(plan => {
                                const stats = calculatePlanStats(plan, true, plan, null);
                                return { ...plan, isCustom: true, stats };
                            })
                            .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                        const activeShared = Object.values(serverComp)
                            .filter(p => p.type === 'shared' || p.isShared)
                            .filter(p => p.language === language || (!p.language && language === 'ar'))
                            .map(plan => {
                                const stats = calculatePlanStats(plan, true, plan, null);
                                return { ...plan, stats };
                            })
                            .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                        const allStarted = [...activeCustom, ...activeStatic, ...activeShared];
                        setStartedPlans(allStarted);

                        if (Capacitor.isNativePlatform() && window.AgiosScannerNative?.updateUserStats) {
                            try {
                                const plansSummary = allStarted.map(p => ({
                                    id: p.id,
                                    title: p.title,
                                    percent: p.stats?.percent || 0,
                                    remainingDays: (p.stats?.totalDays || 0) - (p.stats?.daysDone || 0)
                                }));
                                window.AgiosScannerNative.updateUserStats(streak, JSON.stringify(plansSummary), points);
                            } catch (err) {
                                console.error("Native Bridge Error:", err);
                            }
                        }

                        const historyRaw = data.pointsHistory || [];
                        const history = Array.isArray(historyRaw) ? historyRaw : Object.values(historyRaw);

                        const completedTodayTypes = new Set(
                            history.filter(h => {
                                if (!h.timestamp) return false;
                                const ts = h.timestamp?.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                                return getCairoDate(ts) === today;
                            }).map(h => h.type)
                        );

                        const goals = [
                            { id: 'dailyLogin', label: strings.home.goals.dailyLogin, completed: data.lastActiveDate === today },
                            { id: 'dailyQuestion', label: strings.home.goals.dailyQuestion, completed: !!data.answeredQuestions?.[today]?.answered },
                            { id: 'mapExploration', label: strings.home.goals.mapExploration, completed: completedTodayTypes.has('mapExploration') },
                            { id: 'share', label: strings.home.goals.share, completed: completedTodayTypes.has('share') },
                            { id: 'completedChapter', label: strings.home.goals.completedChapter, completed: completedTodayTypes.has('completedChapter') },
                            { id: 'favouriteVerse', label: strings.home.goals.favouriteVerse, completed: completedTodayTypes.has('favouriteVerse') },
                            { id: 'verseAnalysis', label: strings.home.goals.verseAnalysis, completed: completedTodayTypes.has('verseAnalysis') },
                            { id: 'studyPlanProgress', label: strings.home.goals.studyPlanProgress, completed: completedTodayTypes.has('studyPlanProgress') || completedTodayTypes.has('studyPlanDay') },
                        ];
                        setDailyGoals(goals);
                        setIsLoading(false);
                    } else {
                        setIsLoading(false);
                    }
                }, (error) => {
                    console.error("Snapshot error:", error);
                    setIsLoading(false);
                });
            } else {
                if (unsubSnap) { unsubSnap(); unsubSnap = null; }

                const localStats = await StorageService.getLocalStats();
                const localHistory = await StorageService.get(KEYS.POINTS_HISTORY) || [];
                const localAnswered = await StorageService.get(KEYS.ANSWERED_QUESTIONS) || {};

                const localStaticCompletion = await StorageService.get(KEYS.COMPLETED_PLANS) || {};
                const localCustomPlans = await StorageService.get(KEYS.CUSTOM_PLANS) || {};

                const localBadges = await StorageService.get(KEYS.LOCAL_BADGES) || [];
                const localLastRead = await StorageService.get(KEYS.LAST_READ);
                const localChapters = await StorageService.get(KEYS.COMPLETED_CHAPTERS) || {};

                setUserStats({ points: localStats.points, streak: localStats.streak });
                checkStreakBadges(localStats.streak);
                setFavouriteVerses(localStats.favorites || {});
                setUserBadges(localBadges);
                setLastRead(localLastRead);
                setReadingHistory(localStats.readingHistory || []);
                setHasAnswered(!!localAnswered[today]?.answered);

                const activeStatic = (language === 'ar' ? staticPlans : [])
                    .map(plan => {
                        const stats = calculatePlanStats(plan, false, null, localStaticCompletion);
                        return { ...plan, stats };
                    })
                    .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                const activeCustom = Object.values(localCustomPlans)
                    .filter(p => p.language === language || (!p.language && language === 'ar'))
                    .map(plan => {
                        const stats = calculatePlanStats(plan, true, plan, null);
                        return { ...plan, isCustom: true, stats };
                    })
                    .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                const activeShared = Object.values(localStaticCompletion)
                    .filter(p => p.type === 'shared' || p.isShared)
                    .filter(p => p.language === language || (!p.language && language === 'ar'))
                    .map(plan => {
                        const stats = calculatePlanStats(plan, true, plan, null);
                        return { ...plan, stats };
                    })
                    .filter(p => p.stats.daysDone >= 1 && p.stats.percent < 100);

                const allStarted = [...activeCustom, ...activeStatic, ...activeShared];
                setStartedPlans(allStarted);

                const completedTodayTypes = new Set(
                    localHistory.filter(h => {
                        try {
                            return getCairoDate(new Date(h.timestamp)) === today;
                        } catch(e) { return false; }
                    }).map(h => h.type)
                );

                const lastActive = await StorageService.get(KEYS.LAST_ACTIVE);

                const goals = [
                    { id: 'dailyLogin', label: strings.home.goals.dailyLogin, completed: lastActive === today },
                    { id: 'dailyQuestion', label: strings.home.goals.dailyQuestion, completed: !!localAnswered[today]?.answered },
                    { id: 'mapExploration', label: strings.home.goals.mapExploration, completed: completedTodayTypes.has('mapExploration') },
                    { id: 'share', label: strings.home.goals.share, completed: completedTodayTypes.has('share') },
                    { id: 'completedChapter', label: strings.home.goals.completedChapter, completed: completedTodayTypes.has('completedChapter') },
                    { id: 'favouriteVerse', label: strings.home.goals.favouriteVerse, completed: completedTodayTypes.has('favouriteVerse') },
                    { id: 'verseAnalysis', label: strings.home.goals.verseAnalysis, completed: completedTodayTypes.has('verseAnalysis') },
                    { id: 'studyPlanProgress', label: strings.home.goals.studyPlanProgress, completed: completedTodayTypes.has('studyPlanProgress') || completedTodayTypes.has('studyPlanDay') },
                ];
                setDailyGoals(goals);

                setRawUserData({
                    streak: localStats.streak,
                    completedChapters: localChapters,
                    completedQuizzes: await StorageService.get('completed_quizzes') || [],
                    favorites: { verses: localStats.favorites || {} },
                    visitedMapPoints: await StorageService.get('visited_map_points') || [],
                    pointsHistory: localHistory,
                    badges: localBadges
                });
                setIsLoading(false);
            }
        });

        return () => {
            unsubAuth?.();
            if (unsubSnap) unsubSnap();
        };
    }, [calculatePlanStats, checkStreakBadges, language, strings, unlockBadge]);

    const handleShareSuccess = async () => {
        if (user) {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, {
                totalPoints: increment(10),
                pointsHistory: arrayUnion({
                    type: 'share',
                    points: 10,
                    reason: 'مشاركة آية اليوم من الصفحة الرئيسية',
                    timestamp: getCairoIsoString()
                })
            });
            const userSnap = await getDoc(userRef);
            const history = userSnap.data()?.pointsHistory || [];
            const shareCount = history.filter(h => h.type === 'share').length;
            if (shareCount >= 1) await unlockBadge('share_1');
            if (shareCount >= 50) await unlockBadge('social_influencer');
        } else {
            await StorageService.addPoints(10);
            const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
            history.push({
                type: 'share',
                points: 10,
                reason: 'مشاركة آية اليوم من الصفحة الرئيسية',
                timestamp: getCairoIsoString()
            });
            await StorageService.save(KEYS.POINTS_HISTORY, history);
            setUserStats(prev => ({ ...prev, points: prev.points + 10 }));

            const shareCount = history.filter(h => h.type === 'share').length;
            if (shareCount >= 1) await unlockBadge('share_1');
            if (shareCount >= 50) await unlockBadge('social_influencer');
        }
        toast.success(strings.home.toasts.share_success);
    };

    const handleOptionClick = async (index) => {
        if (hasAnswered || !dailyQuestion) return;

        const dateKey = getCairoDate();
        const yesterdayStr = getCairoYesterday();
        const isCorrect = index === dailyQuestion.answerIndex;

        setSelectedAnswer(index);
        setHasAnswered(true);
        localStorage.setItem(`questionAnswered_${dateKey}`, 'true');

        if (user) {
            const userRef = doc(firestore, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.data() || {};
            let qStreak = userData.questionStreak || 0;
            const lastQDate = userData.lastQuestionDate;

            if (lastQDate === yesterdayStr) { qStreak += 1; }
            else if (lastQDate !== dateKey) { qStreak = 1; }

            const updatePayload = {
                [`answeredQuestions.${dateKey}`]: { answered: true, correct: isCorrect, timestamp: getCairoIsoString() },
                questionStreak: qStreak,
                lastQuestionDate: dateKey
            };

            if (isCorrect) {
                toast.success(strings.home.toasts.correct_answer);
                await updateDoc(userRef, {
                    ...updatePayload,
                    totalPoints: increment(20),
                    correctAnswersCount: increment(1),
                    pointsHistory: arrayUnion({
                        type: 'dailyQuestion',
                        points: 20,
                        reason: 'إجابة صحيحة على سؤال اليوم',
                        timestamp: getCairoIsoString()
                    })
                });
            } else {
                toast.error(strings.home.toasts.wrong_answer);
                await updateDoc(userRef, updatePayload);
            }
            if (qStreak >= 30) await unlockBadge('verse_sync');
        } else {
            const localQuestions = await StorageService.get(KEYS.ANSWERED_QUESTIONS) || {};
            localQuestions[dateKey] = { answered: true, correct: isCorrect, timestamp: getCairoIsoString() };
            await StorageService.save(KEYS.ANSWERED_QUESTIONS, localQuestions);

            if (Object.keys(localQuestions).length >= 30) await unlockBadge('verse_sync');

            if (isCorrect) {
                toast.success(strings.home.toasts.correct_answer);
                await StorageService.addPoints(20);
                const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
                history.push({
                    type: 'dailyQuestion',
                    points: 20,
                    reason: 'إجابة صحيحة على سؤال اليوم',
                    timestamp: getCairoIsoString()
                });
                await StorageService.save(KEYS.POINTS_HISTORY, history);
                setUserStats(prev => ({ ...prev, points: prev.points + 20 }));
            } else {
                toast.error(strings.home.toasts.wrong_answer);
            }
        }
    };

    const handleUpdateDailyVerse = async (color = null, isDelete = false) => {
        if (!dailyVerse) return;
        const verseKey = `daily-verse-${dailyVerse.month}-${dailyVerse.day}-${language}`;

        if (isDelete) {
            if (user) {
                const userRef = doc(db, 'users', user.uid);
                let newFavs = { ...favouriteVerses };
                if (newFavs[verseKey]) {
                    delete newFavs[verseKey];
                    setFavouriteVerses(newFavs);
                    await updateDoc(userRef, { [`favorites.verses.${verseKey}`]: deleteField() });
                    toast.error(strings.home.toasts.deleted_from_treasures);
                }
            } else {
                const updatedFavs = await StorageService.toggleFavorite(verseKey, null);
                setFavouriteVerses(updatedFavs);
                toast.error(strings.home.toasts.deleted_from_favs);
            }
            setShowColorPicker(false);
            return;
        }

        const verseData = {
            text: dailyVerse.verse,
            reference: formatReference(dailyVerse.reference),
            book: dailyVerse.bookId,
            ch: dailyVerse.chapter,
            v: dailyVerse.verseNum,
            color: color || '#FFC107',
            dateAdded: getCairoIsoString()
        };

        if (user) {
            const userRef = doc(db, 'users', user.uid);
            let newFavs = { ...favouriteVerses };
            const isNew = !newFavs[verseKey];
            newFavs[verseKey] = verseData;
            setFavouriteVerses(newFavs);
            await updateDoc(userRef, {
                totalPoints: isNew ? increment(5) : increment(0),
                [`favorites.verses.${verseKey}`]: verseData,
                pointsHistory: isNew ? arrayUnion({
                    type: 'favouriteVerse',
                    points: 5,
                    reason: 'تظليل آية اليوم من الصفحة الرئيسية',
                    timestamp: getCairoIsoString()
                }) : arrayUnion()
            });
            if (isNew) {
                toast.success(strings.home.toasts.added_to_favs_points);
                const favCount = Object.keys(newFavs).length;
                if (favCount >= 1) await unlockBadge('fav_1');
                if (favCount >= 20) await unlockBadge('fav_20');
                if (favCount >= 100) await unlockBadge('fav_100');
            } else {
                toast.success(strings.home.toasts.highlight_updated);
            }
        } else {
            const updatedFavs = await StorageService.toggleFavorite(verseKey, verseData);
            setFavouriteVerses(updatedFavs);
            if (updatedFavs[verseKey]) {
                await StorageService.addPoints(5);
                const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
                history.push({
                    type: 'favouriteVerse',
                    points: 5,
                    reason: 'تظليل آية اليوم من الصفحة الرئيسية',
                    timestamp: getCairoIsoString()
                });
                await StorageService.save(KEYS.POINTS_HISTORY, history);
                setUserStats(prev => ({ ...prev, points: prev.points + 5 }));
                toast.success(strings.home.toasts.added_points);

                const favCount = Object.keys(updatedFavs).length;
                if (favCount >= 1) await unlockBadge('fav_1');
                if (favCount >= 20) await unlockBadge('fav_20');
                if (favCount >= 100) await unlockBadge('fav_100');
            } else {
                toast.error(strings.home.toasts.deleted_from_favs);
            }
        }
        setShowColorPicker(false);
    };

    const handleGoalClick = (goalId) => {
        switch (goalId) {
            case 'dailyQuestion':
                document.getElementById('daily-question')?.scrollIntoView({ behavior: 'smooth' });
                break;
            case 'verseAnalysis':
                if (dailyVerse) {
                    router.push(`/bible/analysis?book=${encodeURIComponent(dailyVerse.bookId)}&chapter=${dailyVerse.chapter}`);
                } else {
                    router.push('/bible');
                }
                break;
            case 'studyPlanProgress':
                router.push('/studyPlans');
                break;
            case 'share':
                document.getElementById('daily-verse')?.scrollIntoView({ behavior: 'smooth' });
                break;
            case 'mapExploration':
                router.push('/maps');
                break;
            case 'completedChapter':
                router.push('/bible');
                break;
            case 'favouriteVerse':
                router.push('/bible');
                break;
            case 'dailyLogin':
                router.push('/profile');
                break;
            default:
                break;
        }
    };

    const quickLinks = [
        { name: strings.home.quick_links.bible, icon: <BookOpenText size={24} />, path: '/bible', color: '#6366f1' },
        { name: strings.home.quick_links.maps, icon: <Map size={24} />, path: '/maps', color: '#10b981' },
        { name: strings.home.quick_links.search, icon: <Search size={24} />, path: '/search', color: '#f59e0b' },
        { name: strings.home.quick_links.plans, icon: <BookMarked size={24} />, path: '/studyPlans', color: '#ec4899' },
        language === 'ar' ? { name: strings.home.quick_links.competitions, icon: <Trophy size={24} />, path: '/competitions', color: '#8b5cf6' } : null,
        { name: strings.home.quick_links.favorites, icon: <Heart size={24} />, path: '/favourites', color: '#ef4444' },
        Capacitor.getPlatform() === 'android' ? { name: strings.home.quick_links.widgets || "Widgets", icon: <LayoutGrid size={24} />, path: '/widgets', color: '#8b5cf6' } : null,
    ].filter(Boolean);

    const completedGoalsCount = useMemo(() => dailyGoals.filter(g => g.completed).length, [dailyGoals]);

    const highlightBadges = useMemo(() => {
        if (!badgesData || !rawUserData) return { acquired: [], near: [] };

        const allBadges = badgesData.badge_families.flatMap(f => f.badges.map(b => ({ ...b, family_name: f.family_name })));

        const acquired = allBadges
            .filter(b => userBadges.includes(b.id))
            .sort((a, b) => {
                const rarityOrder = { "خرافي": 0, "أسطوري": 1, "نادر": 2, "مميز": 3, "عادي": 4, "سري": 5 };
                return rarityOrder[a.rarity] - rarityOrder[b.rarity];
            })
            .slice(0, 5);

        const stats = {
            streak: rawUserData?.streak || 0,
            chapters: Object.keys(rawUserData?.completedChapters || {}).filter(k => rawUserData.completedChapters[k]).length,
            quizzes: (rawUserData?.completedQuizzes || []).length,
            perfectQuizzes: (rawUserData?.completedQuizzes || []).filter(q => q.score === q.total).length,
            favorites: Object.keys(rawUserData?.favorites?.verses || {}).length,
            maps: (rawUserData?.visitedMapPoints || []).length,
            shares: (rawUserData?.pointsHistory || []).filter(h => h.type === 'share').length
        };

        const near = allBadges
            .filter(b => !userBadges.includes(b.id) && b.rarity !== "سري")
            .map(b => {
                let progress = 0;
                let target = 1;
                if (b.id.startsWith('streak_')) {
                    target = parseInt(b.id.split('_')[1]);
                    progress = stats.streak;
                } else if (b.id === 'map_pioneer') { target = 5; progress = stats.maps; }
                else if (b.id === 'ancient_navigator') { target = 20; progress = stats.maps; }
                else if (b.id.startsWith('reader_')) {
                    target = parseInt(b.id.split('_')[1]);
                    progress = stats.chapters;
                } else if (b.id === 'bible_finisher') { target = 1189; progress = stats.chapters; }
                else if (b.id === 'reader_594') { target = 594; progress = stats.chapters; }
                else if (b.id.startsWith('scholar_')) {
                    target = parseInt(b.id.split('_')[1]);
                    progress = stats.quizzes;
                } else if (b.id === 'bible_master') { target = 73; progress = stats.quizzes; }
                else if (b.id.startsWith('perfect_')) {
                    target = b.id === 'perfect_all' ? 73 : parseInt(b.id.split('_')[1]);
                    progress = stats.perfectQuizzes;
                } else if (b.id.startsWith('fav_')) {
                    target = parseInt(b.id.split('_')[1]);
                    progress = stats.favorites;
                } else if (b.id === 'share_1') { target = 1; progress = stats.shares; }
                else if (b.id === 'social_influencer') { target = 50; progress = stats.shares; }

                return { ...b, progress: Math.min(100, (progress / target) * 100), currentVal: progress, targetVal: target };
            })
            .filter(b => b.progress > 0 && b.progress < 100)
            .sort((a, b) => b.progress - a.progress)
            .slice(0, 5);

        return { acquired, near };
    }, [badgesData, rawUserData, userBadges]);

    const formattedDailyRef = useMemo(() => formatReference(dailyVerse?.reference), [dailyVerse]);

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    const handleFacebookOpen = (e) => {
        e.preventDefault();
        openExternalLink('https://www.facebook.com/AgiosSystem/');
    };

    const dailyVerseKey = `daily-verse-${dailyVerse?.month}-${dailyVerse?.day}-${language}`;

    if (!mounted) return null;

    return (
        <main className={`${styles.hubContainer} ${dir === 'rtl' ? styles.rtl : styles.ltr}`} dir={dir}>
            <header className={styles.header}>
                <div className={styles.topBar}>
                    <div className={styles.welcomeInfo}>
                        <h1 className={styles.siteTitle}>Agios Bible</h1>
                        <p className={styles.userGreeting}>
                            {user
                              ? strings.home.greeting_user.replace('{name}', user.displayName?.split(' ')[0] || '')
                              : strings.home.greeting_guest}
                        </p>
                    </div>
                    <div className={styles.topActions}>
                        {mounted && (
                            <button onClick={toggleTheme} className={styles.iconCircle} aria-label="Toggle Theme">
                                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                        )}
                        <Link href={"/points"} prefetch={false} className={styles.iconCircle}><Award size={20} /></Link>
                        <Link href={"/profile"} prefetch={false} className={styles.iconCircle}><User size={20} /></Link>
                        <Link href="/settings" prefetch={false} className={styles.iconCircle}><Settings size={20} /></Link>
                        <a href="https://www.facebook.com/AgiosSystem/" target="_blank" rel="noreferrer" className={styles.iconCircle} aria-label="Facebook Page" onClick={handleFacebookOpen}>
                            <ExternalLink size={20} />
                        </a>
                    </div>
                </div>

                <div className={styles.statsRow}>
                    <Link href={"/points"} prefetch={false} className={styles.statPill}>
                        <Award size={16} />
                        <span>{formatNumber(userStats.points)} XP</span>
                    </Link>
                    <div className={styles.statPill}>
                        <Flame size={16} color="#ff4500" />
                        <span>{formatNumber(userStats.streak)} {strings.common.day}</span>
                    </div>
                </div>
            </header>

            {remoteNews.length > 0 && (
                <div className={styles.newsSliderWrapper}>
                    <button className={`${styles.navBtn} ${styles.prevBtn}`} onClick={() => scrollNews('right')} aria-label="Previous News">
                        <ChevronRight size={20} />
                    </button>
                    <button className={`${styles.navBtn} ${styles.nextBtn}`} onClick={() => scrollNews('left')} aria-label="Next News">
                        <ChevronLeft size={20} />
                    </button>
                    <div className={styles.newsContainer} ref={newsRef} onScroll={handleNewsScroll}>
                        {remoteNews.map((news, idx) => {
                            const IconComponent = LUCIDE_ICONS[news.iconName] || Bell;
                            return (
                                <section
                                    key={news.id || idx}
                                    className={styles.newsBanner}
                                    style={{
                                        backgroundColor: news.bgColor || '#eff6ff',
                                        '--accent-color': news.accentColor || '#3b82f6'
                                    }}
                                    onClick={() => news.link && router.push(news.link)}
                                >
                                    <div className={styles.newsMainRow}>
                                        <div className={styles.newsContent}>
                                            <div className={styles.newsHeaderLine}>
                                                <span className={styles.newsIconBoxSmall}>
                                                    <IconComponent size={16} color={news.accentColor || '#3b82f6'} />
                                                </span>
                                                <h3 style={{ color: news.accentColor || '#1e40af' }}>{news.title}</h3>
                                            </div>
                                            <p>{news.message}</p>
                                            {news.buttonText && (
                                                <span className={styles.newsActionBadge} style={{ backgroundColor: news.accentColor || '#3b82f6' }}>
                                                    {news.buttonText} <ArrowRight size={12} />
                                                </span>
                                            )}
                                        </div>
                                        {news.imageUrl ? (
                                            <div className={styles.newsImageBox}>
                                                <img src={news.imageUrl} alt={news.title} className={styles.newsImage} />
                                            </div>
                                        ) : (
                                            <div className={styles.newsIconBox} style={{ backgroundColor: `${news.accentColor}15` }}>
                                                <IconComponent size={28} color={news.accentColor || '#3b82f6'} />
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                    {remoteNews.length > 1 && (
                        <div className={styles.newsDots}>
                            {remoteNews.map((_, i) => (
                                <div key={i} className={`${styles.dot} ${activeNewsIndex === i ? styles.activeDot : ''}`} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <section className={styles.quickGrid}>
                {quickLinks.map((link, i) => (
                    <Link href={link.path} prefetch={false} key={i} className={styles.hubCard}>
                        <div className={styles.hubIcon} style={{ color: link.color, backgroundColor: `${link.color}15` }}>{link.icon}</div>
                        <div className={styles.hubName}>{link.name}</div>
                    </Link>
                ))}
            </section>

            <BibleBookSelector />

            {(isLoading) ? (
                <div className={styles.skeletonSection} style={{ height: '100px', margin: '16px' }} />
            ) : (
                <section className={styles.dailyGoalsSummary}>
                    <div className={styles.goalsHeader}>
                        <div className={styles.goalsTitle}><Award size={18} color="#f59e0b" /><span>{strings.home.daily_goals}</span></div>
                        <Link href="/points" prefetch={false} className={styles.viewMoreLink}>{strings.common.details} <ArrowUpRight size={14} /></Link>
                    </div>
                    <div className={styles.goalsProgressWrapper}>
                        <div className={styles.goalsProgressText}>
                            {strings.home.goals_progress
                              .replace('{done}', formatNumber(completedGoalsCount))
                              .replace('{total}', formatNumber(dailyGoals.length))}
                        </div>
                        <div className={styles.miniProgressBar}><div className={styles.miniProgressFill} style={{ width: `${(completedGoalsCount / Math.max(1, dailyGoals.length)) * 100}%` }} /></div>
                    </div>
                    <div className={styles.goalsMiniList}>
                        {dailyGoals.map(goal => (
                            <div
                                key={goal.id}
                                className={`${styles.miniGoalItem} ${goal.completed ? styles.goalDone : ''}`}
                                onClick={() => handleGoalClick(goal.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                {goal.completed ? <CheckCircle size={14} color="#10b981" /> : <Circle size={14} color="#94a3b8" />}
                                <span>{goal.label}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {readingHistory.length > 0 && (
                <section className={styles.historySection}>
                    <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitleWithIcon}>
                            <Clock size={20} color="var(--color-accent)" />
                            <h2 className={styles.sectionTitleMini}>واصل القراءة</h2>
                        </div>
                        <Link href="/bible/history" className={styles.viewMoreLink}>المزيد <ArrowUpRight size={14} /></Link>
                    </div>
                    <div className={styles.historyGrid}>
                        {readingHistory.slice(0, 3).map((item, idx) => (
                            <button
                                key={idx}
                                className={styles.historyCard}
                                onClick={() => router.push(`/bible?book=${encodeURIComponent(item.bookName)}&chapter=${item.chapterIndex + 1}`)}
                            >
                                <div className={styles.historyIcon}><BookOpen size={18} /></div>
                                <div className={styles.historyInfo}>
                                    <span className={styles.historyBook}>{item.bookName}</span>
                                    <span className={styles.historyChapter}>{strings.common.chapter} {formatNumber(item.chapterIndex + 1)}</span>
                                </div>
                                <ArrowRight size={16} className={styles.historyArrow} />
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {(highlightBadges.acquired.length > 0 || highlightBadges.near.length > 0) && (
                <section className={styles.badgesHighlightSection}>
                    <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitleWithIcon}>
                            <Trophy size={20} color="#f59e0b" />
                            <h2 className={styles.sectionTitleMini}>{strings.home.badges_section}</h2>
                        </div>
                        <Link href="/points" prefetch={false} className={strings.home.badges_all}><ArrowUpRight size={14} /></Link>
                    </div>

                    <div className={styles.badgesDashboard}>
                        {highlightBadges.acquired.length > 0 && (
                            <div className={styles.badgeColumn}>
                                <span className={styles.columnLabel}>{strings.home.badges_owned}</span>
                                <div className={styles.badgeHorizontalGrid}>
                                    {highlightBadges.acquired.map(badge => (
                                        <Badge
                                            key={badge.id}
                                            badge={badge}
                                            familyName={badge.family_name}
                                            isUnlocked={true}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {highlightBadges.near.length > 0 && (
                            <div className={styles.badgeColumn}>
                                <span className={styles.columnLabel}>{strings.home.badges_near}</span>
                                <div className={styles.badgeHorizontalGrid}>
                                    {highlightBadges.near.map(badge => (
                                        <div key={badge.id} className={styles.badgeWithProgressWrapper}>
                                            <Badge
                                                badge={badge}
                                                familyName={badge.family_name}
                                                isUnlocked={false}
                                            />
                                            <div className={styles.badgeProgressMini}>
                                                <div className={styles.progressText}>
                                                    {formatNumber(badge.currentVal)} / {formatNumber(badge.targetVal)}
                                                </div>
                                                <div className={styles.progressLine}>
                                                    <div
                                                        className={styles.progressFill}
                                                        style={{ width: `${badge.progress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {lastRead && !readingHistory.length && (
                <button
                    onClick={() => {
                        router.push(`/bible?book=${encodeURIComponent(lastRead.bookName)}&chapter=${lastRead.chapterIndex + 1}`)
                    }}
                    className={styles.lastReadBar}
                >
                    <div className={styles.lastReadContent}>
                        <ChevronLeft size={18} />
                        <div className={styles.lastReadText}>
                            <small>{strings.common.continue_reading}</small>
                            <strong>{lastRead.bookName} - {strings.common.chapter} {formatNumber(lastRead.chapterIndex + 1)}</strong>
                        </div>
                    </div>
                    <div className={styles.lastReadIcon}><BookOpenText size={20} /></div>
                </button>
            )}

            <section className={styles.dailyHighlight} id="daily-verse">
                <div className={styles.verseGlass}>
                    <div className={styles.glassHeader}><Sparkles size={18} color="#ffd700" /><span>{strings.home.daily_verse}</span></div>
                    {isDailyLoading ? <div className={styles.skeletonText} /> : dailyVerse ? (
                        <>
                            <p className={styles.verseText} style={{
                                backgroundColor: favouriteVerses[dailyVerseKey]?.color ? `${favouriteVerses[dailyVerseKey].color}66` : 'transparent',
                                borderRadius: '8px',
                                padding: '4px'
                            }}>
                                "{dailyVerse?.verse}"
                            </p>
                            <span className={styles.verseRef}>{formattedDailyRef}</span>
                            <div className={styles.verseActions}>
                                <button onClick={() => {
                                    navigator.clipboard.writeText(`"${dailyVerse?.verse}" ${formattedDailyRef}`);
                                    toast.success(strings.home.toasts.copied);
                                }} className={`${styles.glassBtn} ${styles.copyBtn}`}>{strings.home.verse_copy}</button>
                                <button onClick={() => setShowColorPicker(!showColorPicker)} className={`${styles.glassBtn} ${favouriteVerses[dailyVerseKey] ? styles.activeFav : ''}`}>
                                    {favouriteVerses[dailyVerseKey] ? strings.home.verse_highlighted : strings.home.verse_highlight}
                                </button>
                                <button
                                    onClick={() => {
                                        router.push(`/bible/analysis?book=${encodeURIComponent(dailyVerse?.bookId)}&chapter=${dailyVerse?.chapter}`);
                                    }}
                                    className={`${styles.glassBtn} ${styles.aiAskBtn}`}
                                >
                                    <Bot size={18} />
                                    <span>{strings.home.ask_agios}</span>
                                </button>
                                <div className={styles.fullWidthAction}>
                                    <ShareVerseCard
                                        verse={dailyVerse?.verse}
                                        reference={formattedDailyRef}
                                        onShareSuccess={handleShareSuccess}
                                    />
                                </div>
                            </div>

                            {showColorPicker && (
                                <div className={styles.dailyColorPalette}>
                                    <div className={styles.paletteHeader}>
                                        <span>{strings.home.color_palette_title}</span>
                                        <button onClick={() => setShowColorPicker(false)} className={styles.closePalette}><X size={16} /></button>
                                    </div>
                                    <div className={styles.colorsGrid}>
                                        {HIGHLIGHT_COLORS.map(color => (
                                            <div
                                                key={color}
                                                className={`${styles.colorCircle} ${favouriteVerses[dailyVerseKey]?.color === color ? styles.activeColor : ''}`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => handleUpdateDailyVerse(color)}
                                            >
                                                {favouriteVerses[dailyVerseKey]?.color === color && <Check size={14} color="white" />}
                                            </div>
                                        ))}
                                        <div className={styles.clearColor} onClick={() => handleUpdateDailyVerse(null, true)} title={strings.home.clear_highlight}>
                                            <Trash2 size={16} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                    <div className={styles.bottomDivider} style={{margin: '20px 0', opacity: 0.1, height: '1px', background: 'var(--color-text-primary)'}} />
                    {isDailyLoading ? <div className={styles.skeletonText} style={{height: '100px'}} /> : dailyQuestion ? (
                        <div className={styles.questionSection} id="daily-question">
                            <div className={styles.glassHeader}><Trophy size={18} color="#f59e0b" /><span>{strings.home.daily_challenge}</span></div>
                            <p className={styles.questionTitle} style={{fontWeight: '700', marginBottom: '12px'}}>{dailyQuestion.question}</p>
                            <div className={styles.optionsList}>
                                {dailyQuestion.options.map((opt, i) => (
                                    <button key={i} disabled={hasAnswered} onClick={() => handleOptionClick(i)} className={`${styles.optBtn} ${hasAnswered && i === dailyQuestion.answerIndex ? styles.correct : ''} ${hasAnswered && selectedAnswer === i && i !== dailyQuestion.answerIndex ? styles.wrong : ''}`}>{opt}</button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>

            <section className={styles.aiFeaturesSection}>
                <h2 className={styles.sectionTitle}>{strings.home.ai_features_title}</h2>
                <div className={styles.aiFeaturesGrid}>
                    <Link href="/search?type=derivatives" prefetch={false} className={styles.aiFeatureCard}>
                        <div className={styles.aiFeatureIcon} style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            <Search size={24} />
                        </div>
                        <div className={styles.aiFeatureInfo}>
                            <h3>{strings.home.ai_features.derivatives.title}</h3>
                            <p>{strings.home.ai_features.derivatives.desc}</p>
                        </div>
                        <ArrowRight size={18} className={styles.aiArrow} />
                    </Link>
                    <Link href="/search?type=semantic" prefetch={false} className={styles.aiFeatureCard}>
                        <div className={styles.aiFeatureIcon} style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                            <Sparkles size={24} />
                        </div>
                        <div className={styles.aiFeatureInfo}>
                            <h3>{strings.home.ai_features.semantic.title}</h3>
                            <p>{strings.home.ai_features.semantic.desc}</p>
                        </div>
                        <ArrowRight size={18} className={styles.aiArrow} />
                    </Link>
                    <Link href="/studyPlans/custom" prefetch={false} className={styles.aiFeatureCard}>
                        <div className={styles.aiFeatureIcon} style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                            <Wand2 size={24} />
                        </div>
                        <div className={styles.aiFeatureInfo}>
                            <h3>{strings.home.ai_features.custom_plan.title}</h3>
                            <p>{strings.home.ai_features.custom_plan.desc}</p>
                        </div>
                        <ArrowRight size={18} className={styles.aiArrow} />
                    </Link>
                    <Link href="/bible" prefetch={false} className={styles.aiFeatureCard}>
                        <div className={styles.aiFeatureIcon} style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                            <BrainCircuit size={24} />
                        </div>
                        <div className={styles.aiFeatureInfo}>
                            <h3>{strings.home.ai_features.analysis.title}</h3>
                            <p>{strings.home.ai_features.analysis.desc}</p>
                        </div>
                        <ArrowRight size={18} className={styles.aiArrow} />
                    </Link>
                </div>
            </section>

            {startedPlans.length > 0 && (
                <section className={styles.startedPlansSection}>
                    <h2 className={styles.sectionTitle}>{strings.home.active_plans}</h2>
                    <div className={styles.plansVerticalList}>
                        {startedPlans.map((plan) => (
                            <button key={plan.id} onClick={() => router.push(`/studyPlans/details?id=${plan.id}${plan.isCustom || plan.isShared || plan.type === 'shared' ? '&type=' + (plan.isCustom ? 'custom' : 'shared') : ''}`)} className={styles.planProgressCardVertical}>
                                <div className={styles.planInfo}>
                                    <div className={styles.planNameRow}><span className={styles.planTitle}>{plan.title}</span><span className={styles.planPercent}>{formatNumber(plan.stats?.percent)}%</span></div>
                                    <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${plan.stats?.percent}%` }} /></div>
                                    <div className={styles.planMeta}>
                                        <span>
                                            {strings.home.plan_progress
                                              .replace('{done}', formatNumber(plan.stats?.daysDone))
                                              .replace('{total}', formatNumber(plan.stats?.totalDays))}
                                        </span>
                                        <div className={styles.planActionText}>{strings.common.continue_reading} <ArrowRight size={14} /></div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </main>
    );
};

export default LandingPage;
