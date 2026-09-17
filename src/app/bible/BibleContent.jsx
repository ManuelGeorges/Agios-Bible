"use client";

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import styles from './Bible.module.css';
import { useSearchParams, useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, increment, arrayUnion, deleteField } from "firebase/firestore";
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Share2, Copy, Check, MessageSquare, Volume2, Loader2, CircleCheck, Sparkles, Image as ImageIcon, ChevronDown, Settings } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useBadge } from '../context/BadgeContext';
import { useAudio } from '../context/AudioContext';
import { useLanguage } from '../context/LanguageContext';
import studyPlansData from '../studyPlans/studyPlansData.json';
import { getCairoIsoString } from '../../lib/dateUtils';

// Local-first imports
import { StorageService, KEYS } from '../../lib/storage';
import { languageManager } from '../../services/languageManager';

const firestore = db;
const allPlans = studyPlansData.plans;

// Cache داخل جلسة التطبيق لمنع إعادة تحميل ملفات الكتاب
const bibleFileCache = new globalThis.Map();
const bibleFilePromises = new globalThis.Map();

const getCachedBibleFile = async (folder, fileName) => {
  const cacheKey = `${folder}/${fileName}`;

  // موجود بالفعل في الذاكرة
  if (bibleFileCache.has(cacheKey)) {
    return bibleFileCache.get(cacheKey);
  }

  // فيه تحميل شغال بالفعل لنفس الملف
  if (bibleFilePromises.has(cacheKey)) {
    return bibleFilePromises.get(cacheKey);
  }

  const promise = languageManager
    .getFile(folder, fileName)
    .then(data => {
      bibleFileCache.set(cacheKey, data);
      return data;
    })
    .finally(() => {
      bibleFilePromises.delete(cacheKey);
    });

  // نحفظ الـ Promise فورًا لمنع duplicate requests
  bibleFilePromises.set(cacheKey, promise);

  return promise;
};

const HIGHLIGHT_COLORS = [
  '#FFC107', '#FF5722', '#F44336', '#E91E63', '#9C27B0',
  '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFECB3',
  '#F8BBD0', '#E1BEE7', '#CFD8DC'
];

// جميع الخطوط الموجودة في Settings
const fontOptionsMap = {
  // Arabic
  'Cairo': "'Cairo', sans-serif",
  'Amiri': "'Amiri', serif",
  'Almarai': "'Almarai', sans-serif",
  'Tajawal': "'Tajawal', sans-serif",
  'ReemKufi': "'Reem Kufi', sans-serif",
  'NotoNaskh': "'Noto Naskh Arabic', serif",
  'Scheherazade': "'Scheherazade New', serif",
  'ElMessiri': "'El Messiri', sans-serif",
  'Lemonada': "'Lemonada', cursive",
  'Lalezar': "'Lalezar', system-ui",

  // Latin
  'Inter': "'Inter', sans-serif",
  'Lora': "'Lora', serif",
  'EBGaramond': "'EB Garamond', serif",
  'Montserrat': "'Montserrat', sans-serif",
  'Playfair': "'Playfair Display', serif",
  'Cinzel': "'Cinzel', serif",
  'Spectral': "'Spectral', serif"
};

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? 30 : direction < 0 ? -30 : 0,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({
    x: direction < 0 ? 30 : direction > 0 ? -30 : 0,
    opacity: 0,
  }),
};

// --- مكون الآية المحسن (السرعة) ---
const VerseItem = memo(({
  v, v2, i, verseNumber, isReading, isSelected, annotation, versePerLine, formatNumber,
  handleTouchStart, handleTouchMove, handleTouchEnd, onVerseClick, openNoteEditor, keyId, isParallel
}) => {
  const content = (
    <>
      <span className={styles.styledVerseNumber}>{formatNumber(i + 1)}</span>
      <span className={styles.verseText}>{v} </span>
      {annotation?.note && (
        <span
          className={styles.miniNoteIndicator}
          onClick={(e) => {
            e.stopPropagation();
            openNoteEditor(keyId);
          }}
        >
          📝
        </span>
      )}
    </>
  );

  if (isParallel && v2) {
    return (
      <div
        id={`verse-${verseNumber}`}
        className={`${styles.parallelVerseRow} ${isSelected ? styles.selectedVerse : ''} ${isReading ? styles.readingHighlight : ''}`}
        onTouchStart={(e) => handleTouchStart(e, v, i)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => onVerseClick(v, i)}
        style={{
          backgroundColor: isReading
            ? '#ffd54f'
            : (annotation?.color ? `${annotation.color}44` : 'transparent'),
        }}
      >
        <div className={styles.verseSide} style={{ direction: 'rtl' }}>
          {content}
        </div>

        <div className={styles.verseSide} style={{ direction: 'ltr' }}>
          <span className={styles.verseTextParallel}>{v2}</span>
        </div>
      </div>
    );
  }

  return (
    <span
      id={`verse-${verseNumber}`}
      className={`${styles.inlineVerse} ${isSelected ? styles.selectedVerse : ''} ${isReading ? styles.readingHighlight : ''}`}
      onTouchStart={(e) => handleTouchStart(e, v, i)}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => handleTouchEnd(e, v, i)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => onVerseClick(v, i)}
      style={{
        backgroundColor: isReading
          ? '#ffd54f'
          : (annotation?.color ? `${annotation.color}66` : 'transparent'),
        display: versePerLine ? 'block' : 'inline',
        marginBottom: versePerLine ? '15px' : '0',
        padding: '2px 4px',
        borderRadius: '4px',
        position: 'relative'
      }}
    >
      {content}
    </span>
  );
});

VerseItem.displayName = 'VerseItem';

export default function BibleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { triggerBadgeUnlock } = useBadge();
  const {
    language,
    useTashkeel,
    parallelLanguage,
    strings,
    dir: pageDir,
    bookNames: bookNamesData,
    allBookNames,
    formatNumber
  } = useLanguage();

  const {
    playTrack,
    isPlaying,
    currentVerseId,
    setIsPanelOpen,
    audioUrl: globalAudioUrl,
    setNavigationCallback,
    registerPeekNavigationCallback,
    isAutoNext,
    fetchAudioData: contextFetchAudio,
    isAudioLoading: contextAudioLoading
  } = useAudio();

  // --- Refs & Optimized Storage ---
  const bibleDataRef = useRef(null);
  const bibleData2Ref = useRef(null);
  const lastAudioSyncRef = useRef("");
  const longPressTimer = useRef(null);
  const isMoving = useRef(false);
  const isLongPressActive = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  // --- State ---
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChapterVerses, setCurrentChapterVerses] = useState([]);
  const [currentChapterVerses2, setCurrentChapterVerses2] = useState([]);
  const [favouriteVerses, setFavouriteVerses] = useState({});
  const [completedChapters, setCompletedChapters] = useState({});
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [selectedVerses, setSelectedVerses] = useState([]);
  const [copiedMessage, setCopiedMessage] = useState('');
  const [versePerLine, setVersePerLine] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [currentNoteText, setCurrentNoteText] = useState('');
  const [targetVerseKey, setTargetVerseKey] = useState(null);

  const getBookName = useCallback(
    (i) => bookNamesData?.[i]?.name || '',
    [bookNamesData]
  );

  // --- Badges Logic (Local-First) ---
  const unlockBadge = useCallback(async (badgeId) => {
    // دائماً نحفظ محلياً أولاً
    const localBadges = await StorageService.get(KEYS.LOCAL_BADGES) || [];

    if (!localBadges.includes(badgeId)) {
      localBadges.push(badgeId);
      await StorageService.save(KEYS.LOCAL_BADGES, localBadges);
      triggerBadgeUnlock(badgeId);
    }
  }, [triggerBadgeUnlock]);

  const saveLastRead = useCallback(async (bookIdx, chapIdx) => {
    if (!bookNamesData[bookIdx]) return;

    const lastReadData = {
      bookIndex: bookIdx,
      chapterIndex: chapIdx,
      bookName: bookNamesData[bookIdx].name,
      timestamp: getCairoIsoString()
    };

    localStorage.setItem(
      'lastReadLocation',
      JSON.stringify(lastReadData)
    );

    await StorageService.save(KEYS.LAST_READ, lastReadData);
    await StorageService.addToReadingHistory(lastReadData);

    // Alpha-Omega check
    if (bookIdx === 0 && chapIdx === 0) {
      localStorage.setItem('read_alpha', Date.now());
    }

    if (bookIdx === 65 && chapIdx === 21) {
      const alphaTime = localStorage.getItem('read_alpha');

      if (
        alphaTime &&
        (Date.now() - parseInt(alphaTime)) < 60000
      ) {
        unlockBadge('alpha_omega');
      }
    }
  }, [bookNamesData, unlockBadge]);

  // --- التمرير التلقائي للآية النشطة عند تشغيل الصوت ---
  useEffect(() => {
    if (currentVerseId && currentVerseId !== -1 && isPlaying) {
      const element = document.getElementById(`verse-${currentVerseId}`);

      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [currentVerseId, isPlaying]);

  // --- Initial Data Load ---
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        const folderMap = {
          ar: 'arabic',
          en: 'English',
          de: 'german',
          fr: 'French'
        };

        // Load Primary
        const folder = folderMap[language] || 'arabic';

        let fileName = "";

        if (language === 'ar') {
          fileName = useTashkeel
            ? "ar_svd_tashkeel_site.json"
            : "ar_svd_no_tashkeel.json";
        } else if (language === 'en') {
          fileName = "en_web.json";
        } else if (language === 'fr') {
          fileName = "fr_segond.json";
        } else if (language === 'de') {
          fileName = "de_luther.json";
        }

        // استخدام languageManager لجلب الملف بدلاً من fetch المباشر
        const data = await getCachedBibleFile(folder, fileName);
        bibleDataRef.current = data;

        // Load Parallel
        if (parallelLanguage) {
          const folder2 = folderMap[parallelLanguage] || 'arabic';

          let fileName2 = "";

          if (parallelLanguage === 'ar') {
            fileName2 = "ar_svd_no_tashkeel.json";
          } else if (parallelLanguage === 'en') {
            fileName2 = "en_web.json";
          } else if (parallelLanguage === 'fr') {
            fileName2 = "fr_segond.json";
          } else if (parallelLanguage === 'de') {
            fileName2 = "de_luther.json";
          }

          try {
            // استخدام languageManager للغة الموازية أيضاً
            bibleData2Ref.current = await getCachedBibleFile(
              folder2,
              fileName2
            );
          } catch (e) {
            console.error("Failed to load parallel bible:", e);
            bibleData2Ref.current = null;
          }
        } else {
          bibleData2Ref.current = null;
        }

        const bParam = searchParams.get('book');
        const cParam = searchParams.get('chapter');
        const savedLastRead = await StorageService.get(KEYS.LAST_READ);

        let bIdx = 0;
        let cIdx = 0;

        if (bParam && bookNamesData.length > 0) {
          const idx = bookNamesData.findIndex(
            b => b.name === decodeURIComponent(bParam)
          );

          if (idx !== -1) {
            bIdx = idx;

            if (cParam) {
              cIdx = Math.max(0, parseInt(cParam) - 1);
            }
          }
        } else if (savedLastRead) {
          bIdx = savedLastRead.bookIndex;
          cIdx = savedLastRead.chapterIndex;
        }

        setSelectedBookIndex(bIdx);
        setSelectedChapterIndex(cIdx);

        // تحديث الآيات مع مراعاة اختلاف الأسفار القانونية
        syncVerses(
          bIdx,
          cIdx,
          data,
          bibleData2Ref.current
        );

        setIsLoading(false);
      } catch (e) {
        console.error("Bible Content Load Error:", e);
        setIsLoading(false);
      }
    };

    if (bookNamesData.length) {
      loadData();
    }
  }, [
    language,
    useTashkeel,
    parallelLanguage,
    bookNamesData,
    searchParams
  ]);

  // دالة لمزامنة الآيات بين اللغتين بناءً على الـ book_id وليس رقم السفر
  const syncVerses = useCallback((bIdx, cIdx, primaryData, parallelData) => {
    if (!primaryData || !primaryData[bIdx]) return;

    // ضبط اللغة الأساسية
    const primaryVerses = primaryData[bIdx].chapters[cIdx] || [];
    setCurrentChapterVerses(primaryVerses);

    // ضبط اللغة الموازية بالبحث عن الـ book_id
    if (parallelData && parallelLanguage) {
      const currentBookId = bookNamesData[bIdx]?.book_id;

      // البحث عن ترتيب السفر في اللغة الموازية باستخدام المعرف المختصر
      const parallelBookIndex = allBookNames[parallelLanguage]?.findIndex(
        b => b.book_id === currentBookId
      );

      if (
        parallelBookIndex !== -1 &&
        parallelData[parallelBookIndex]
      ) {
        setCurrentChapterVerses2(
          parallelData[parallelBookIndex].chapters[cIdx] || []
        );
      } else {
        // السفر غير موجود في اللغة الموازية
        setCurrentChapterVerses2([]);
      }
    } else {
      setCurrentChapterVerses2([]);
    }
  }, [
    bookNamesData,
    parallelLanguage,
    allBookNames
  ]);

  useEffect(() => {
    if (bibleDataRef.current) {
      syncVerses(
        selectedBookIndex,
        selectedChapterIndex,
        bibleDataRef.current,
        bibleData2Ref.current
      );

      saveLastRead(
        selectedBookIndex,
        selectedChapterIndex
      );
    }
  }, [
    selectedBookIndex,
    selectedChapterIndex,
    saveLastRead,
    syncVerses
  ]);

  // Battery Check
  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.getBattery
    ) {
      navigator.getBattery().then(b => {
        if (b.level <= 0.05) {
          unlockBadge('battery_saver');
        }
      });
    }
  }, [selectedChapterIndex, unlockBadge]);

  // Audio Sync logic
  useEffect(() => {
    const syncAudio = async () => {
      if (isLoading || bookNamesData.length === 0) return;

      const supportedAudioLangs = ['ar', 'en', 'fr'];

      if (!supportedAudioLangs.includes(language)) return;

      const book = bookNamesData[selectedBookIndex];
      const chapter = selectedChapterIndex + 1;

      const currentLocKey = `${book.book_id}-${chapter}`;

      if (lastAudioSyncRef.current === currentLocKey) return;

      const isPlayingThis =
        globalAudioUrl &&
        globalAudioUrl.includes(`/${book.book_id}/${chapter}`);

      if (isPlayingThis) {
        lastAudioSyncRef.current = currentLocKey;
      } else if (isPlaying || isAutoNext) {
        const data = await contextFetchAudio(
          selectedBookIndex,
          selectedChapterIndex
        );

        if (data) {
          lastAudioSyncRef.current = currentLocKey;

          playTrack(
            data.url,
            data.title,
            data.times,
            selectedBookIndex,
            selectedChapterIndex,
            false
          );
        }
      }
    };

    syncAudio();
  }, [
    selectedChapterIndex,
    selectedBookIndex,
    isLoading,
    bookNamesData,
    contextFetchAudio,
    globalAudioUrl,
    isPlaying,
    isAutoNext,
    playTrack,
    language
  ]);

  // =========================================================
  // FIX: تسجيل شاشة القراءة كـ "مصدر الحقيقة الوحيد" للتنقل بين الإصحاحات
  // =========================================================
  // AudioContext مبني أصلاً عشان يستدعي دالة الملاحة دي بدل ما يمشي على نسخته
  // الداخلية من بيانات الكتاب المقدس (اللي بتكون غالبًا مش متزامنة مع الشاشة).
  // الدالة هنا بتحسب الإصحاح الجاي/اللي فات وبتحرّك شاشة القراءة فعليًا في نفس
  // اللحظة، فمستحيل الصوت والنص يختلفوا تاني - سواء التنقل جه من زرار الشاشة،
  // من نهاية المقطع الصوتي (autoplay)، أو من أزرار الميديا سيشن/السماعة.
  const resolveAdjacentChapter = useCallback((direction) => {
    const data = bibleDataRef.current;
    if (!data) return null;

    let bIdx = selectedBookIndex;
    let cIdx = selectedChapterIndex + direction;
    const currentBookChapters = data[bIdx]?.chapters || [];

    if (cIdx < 0 || cIdx >= currentBookChapters.length) {
      if (direction > 0 && bIdx < bookNamesData.length - 1) {
        bIdx++;
        cIdx = 0;
      } else if (direction < 0 && bIdx > 0) {
        bIdx--;
        cIdx = (data[bIdx]?.chapters?.length || 1) - 1;
      } else {
        return null; // وصلنا لأول/آخر الكتاب المقدس
      }
    }

    return { bookIdx: bIdx, chapIdx: cIdx };
  }, [selectedBookIndex, selectedChapterIndex, bookNamesData]);

  useEffect(() => {
    // دي الدالة اللي AudioContext هينده عليها فعليًا لتحديد وتحريك الإصحاح الجاي/اللي فات.
    // بتحرّك الشاشة (side effect) عشان تفضل متزامنة مع الصوت مية بالمية.
    const navigationHandler = (direction) => {
      const target = resolveAdjacentChapter(direction);
      if (!target) return null;

      setDirection(direction);
      setSelectedBookIndex(target.bookIdx);
      setSelectedChapterIndex(target.chapIdx);
      setSelectedVerses([]);
      window.scrollTo(0, 0);

      return target;
    };

    setNavigationCallback(navigationHandler);

    return () => setNavigationCallback(null);
  }, [resolveAdjacentChapter, setNavigationCallback]);

  useEffect(() => {
    // نسخة "بدون آثار جانبية" من نفس الحساب، تستخدمها AudioContext بس عشان
    // تعمل prefetch هادئ للإصحاح الجاي في الخلفية - من غير ما تحرك الشاشة.
    if (!registerPeekNavigationCallback) return;

    registerPeekNavigationCallback((direction) => resolveAdjacentChapter(direction));

    return () => registerPeekNavigationCallback(null);
  }, [resolveAdjacentChapter, registerPeekNavigationCallback]);

  // =========================================================
  // App Settings Logic
  // التعديل هنا فقط: قراءة مفتاح الخط الجديد حسب اللغة
  // =========================================================
  useEffect(() => {
    const syncAppSettings = () => {
      const savedTheme =
        localStorage.getItem('theme') || 'system';

      const savedFontSize =
        localStorage.getItem('bibleFontSize') || '18';

      // المفتاح الجديد الخاص بكل لغة
      const fontStorageKey = `bibleFontFamily_${language}`;

      const defaultFont =
        language === 'ar' ? 'Cairo' : 'Inter';

      const savedFontId =
        localStorage.getItem(fontStorageKey) || defaultFont;

      const savedFontWeight =
        localStorage.getItem('bibleFontWeight') || '400';

      const savedLayout =
        localStorage.getItem('versePerLine') === 'true';

      const isDark =
        savedTheme === 'dark' ||
        (
          savedTheme === 'system' &&
          window.matchMedia(
            '(prefers-color-scheme: dark)'
          ).matches
        );

      if (!isDark) {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }

      document.documentElement.style.setProperty(
        '--main-font-size',
        savedFontSize + 'px'
      );

      document.documentElement.style.setProperty(
        '--bible-font-family',
        fontOptionsMap[savedFontId] ||
        fontOptionsMap[defaultFont] ||
        fontOptionsMap['Cairo']
      );

      document.documentElement.style.setProperty(
        '--bible-font-weight',
        savedFontWeight
      );

      setVersePerLine(savedLayout);
    };

    syncAppSettings();

    window.addEventListener(
      'storage',
      syncAppSettings
    );

    return () =>
      window.removeEventListener(
        'storage',
        syncAppSettings
      );
  }, [language]);

  // User Data Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(
      getAuth(),
      async (authUser) => {
        setUser(authUser);

        // جلب البيانات المحلية أولاً
        const ls = await StorageService.getLocalStats();
        const lc =
          await StorageService.get(
            KEYS.COMPLETED_CHAPTERS
          ) || {};

        if (authUser) {
          const s = await getDoc(
            doc(firestore, 'users', authUser.uid)
          );

          if (s.exists()) {
            const fbData = s.data();

            setFavouriteVerses(
              Object.keys(ls.favorites).length > 0
                ? ls.favorites
                : (fbData.favorites?.verses || {})
            );

            setCompletedChapters(
              Object.keys(lc).length > 0
                ? lc
                : (fbData.completedChapters || {})
            );
          }
        } else {
          setFavouriteVerses(ls.favorites || {});
          setCompletedChapters(lc || {});
        }
      }
    );

    return () => unsubAuth();
  }, []);

  // --- Handlers ---

  const buildReferenceText = useCallback((verseIndexes) => {
    const chapterLabel =
      formatNumber(selectedChapterIndex + 1);

    const isArabic = language === 'ar';

    const rlm = isArabic ? "\u200F" : "";
    const lrm = isArabic ? "\u200E" : "";

    const bookName =
      getBookName(selectedBookIndex);

    const sorted = (
      Array.isArray(verseIndexes)
        ? [...verseIndexes]
        : [verseIndexes]
    ).sort((a, b) => a - b);

    const numbers =
      sorted.map(i => formatNumber(i + 1));

    let vRange =
      numbers.length === 1
        ? numbers[0]
        : (
          sorted.every(
            (v, idx) =>
              idx === 0 ||
              v === sorted[idx - 1] + 1
          )
            ? `${numbers[0]} - ${numbers[numbers.length - 1]}`
            : numbers.join(
              isArabic ? '، ' : ', '
            )
        );

    return `${bookName} ${chapterLabel}${lrm}:${rlm}${vRange}`;
  }, [
    selectedChapterIndex,
    selectedBookIndex,
    getBookName,
    formatNumber,
    language
  ]);

  const updateUserPoints = useCallback(
    async (
      amount,
      reason,
      type = 'general',
      isNegative = false
    ) => {
      const finalAmount =
        isNegative ? -amount : amount;

      await StorageService.addPoints(finalAmount);

      const history =
        await StorageService.get(
          KEYS.POINTS_HISTORY
        ) || [];

      history.push({
        type,
        points: finalAmount,
        reason,
        timestamp: getCairoIsoString()
      });

      await StorageService.save(
        KEYS.POINTS_HISTORY,
        history
      );
    },
    []
  );

  const saveBibleData = useCallback(
    async (v, c) => {
      await StorageService.save(
        KEYS.FAVORITES,
        v
      );

      await StorageService.save(
        KEYS.COMPLETED_CHAPTERS,
        c
      );
    },
    []
  );

  const toggleVerseSelection = useCallback(
    (v, i) => {
      setSelectedVerses(prev => {
        const exists =
          prev.find(item => item.index === i);

        if (exists) {
          return prev.filter(
            item => item.index !== i
          );
        }

        return [
          ...prev,
          {
            text: v,
            index: i
          }
        ];
      });
    },
    []
  );

  const handleTouchStart = useCallback(
    (e, v, i) => {
      isMoving.current = false;
      isLongPressActive.current = false;

      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };

      longPressTimer.current =
        setTimeout(() => {
          if (!isMoving.current) {
            isLongPressActive.current = true;

            toggleVerseSelection(v, i);

            if (window.navigator.vibrate) {
              window.navigator.vibrate(60);
            }
          }
        }, 700);
    },
    [toggleVerseSelection]
  );

  const handleTouchMove = useCallback((e) => {
    if (
      Math.abs(
        e.touches[0].clientX -
        touchStartPos.current.x
      ) > 10
    ) {
      isMoving.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(
    () => clearTimeout(longPressTimer.current),
    []
  );

  const openNoteEditor = useCallback(
    (key) => {
      setTargetVerseKey(key);

      setCurrentNoteText(
        favouriteVerses[key]?.note || ''
      );

      setIsNoteModalOpen(true);
    },
    [favouriteVerses]
  );

const copySelected = () => {
  const chapterLabel =
    formatNumber(selectedChapterIndex + 1);

  const isArabic =
    language === 'ar';

  const rlm = isArabic ? "\u200F" : "";
  const lrm = isArabic ? "\u200E" : "";

  const bookName =
    getBookName(selectedBookIndex);

  const sorted =
    [...selectedVerses].sort(
      (a, b) => a.index - b.index
    );

  // مهم:
  // ناخد النص مباشرة من currentChapterVerses
  // عشان نضمن إنه نفس النص المعروض، بالتشكيل أو بدونه.
  const versesText =
    sorted
      .map(sv => currentChapterVerses[sv.index])
      .filter(Boolean)
      .join(' ');

  const isConsecutive =
    sorted.length > 1 &&
    sorted.every(
      (v, i) =>
        i === 0 ||
        v.index === sorted[i - 1].index + 1
    );

  let verseRange;

  if (sorted.length === 1) {
    verseRange =
      formatNumber(
        sorted[0].index + 1
      );
  } else if (isConsecutive) {
    verseRange =
      `${formatNumber(sorted[0].index + 1)} - ${formatNumber(
        sorted[sorted.length - 1].index + 1
      )}`;
  } else {
    verseRange =
      sorted
        .map(sv =>
          formatNumber(sv.index + 1)
        )
        .join(
          isArabic ? '، ' : ', '
        );
  }

  const fullText =
    `${versesText} ${rlm}(${bookName} ${chapterLabel}${lrm}:${rlm}${verseRange})`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText);
  }

  setCopiedMessage(
    strings.bible.toasts.copied_precise
  );

  updateUserPoints(
    15,
    strings.bible.reasons.share_verses,
    'share'
  );

  setSelectedVerses([]);

  setTimeout(
    () => setCopiedMessage(''),
    2000
  );
};

  const highlightSelected = async (color) => {
    const firstVerseKey =
      selectedVerses.length > 0
        ? `${selectedBookIndex}-${selectedChapterIndex}-${selectedVerses[0].index}`
        : null;

    const isAlreadyThisColor =
      firstVerseKey &&
      favouriteVerses[firstVerseKey]?.color === color;

    const targetColor =
      isAlreadyThisColor ? null : color;

    const next = {
      ...favouriteVerses
    };

    let newlyAddedCount = 0;

    selectedVerses.forEach(sv => {
      const key =
        `${selectedBookIndex}-${selectedChapterIndex}-${sv.index}`;

      if (targetColor) {
        if (!next[key]) {
          newlyAddedCount++;
        }

        next[key] = {
          text: sv.text,
          book: getBookName(selectedBookIndex),
          ch: selectedChapterIndex,
          v: sv.index,
          book_index: selectedBookIndex,
          color: targetColor,
          dateAdded: getCairoIsoString(),
          synced: !!user
        };
      } else {
        delete next[key];
      }
    });

    setFavouriteVerses(next);

    if (newlyAddedCount > 0) {
      updateUserPoints(
        newlyAddedCount * 5,
        strings.bible.reasons.favourite,
        'favouriteVerse'
      );

      const count =
        Object.keys(next).length;

      if (count >= 1) {
        unlockBadge('fav_1');
      }

      if (count >= 20) {
        unlockBadge('fav_20');
      }

      if (count >= 100) {
        unlockBadge('fav_100');
      }
    }

    if (user) {
      try {
        await updateDoc(
          doc(
            db,
            'users',
            user.uid
          ),
          {
            'favorites.verses': next
          }
        );
      } catch (e) {
        console.error(
          "Firebase update failed",
          e
        );
      }
    }

    saveBibleData(
      next,
      completedChapters
    );

    setCopiedMessage(
      targetColor
        ? strings.bible.toasts.highlighted
        : strings.bible.toasts.highlight_removed
    );

    setSelectedVerses([]);

    setTimeout(
      () => setCopiedMessage(''),
      2000
    );
  };

  const shareVerse = async (
    text,
    verseIndexes
  ) => {
    const reference =
      buildReferenceText(verseIndexes);

    const rlm =
      language === 'ar'
        ? "\u200F"
        : "";

    const fullText =
      `${text} ${rlm}(${reference})`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: strings.bible.share_title,
          text: fullText,
          dialogTitle:
            strings.bible.share_dialog
        });
      } else if (navigator.share) {
        await navigator.share({
          title: strings.bible.share_title,
          text: fullText
        });
      } else {
        if (
          Array.isArray(verseIndexes) &&
          verseIndexes.length > 0
        ) {
          copyVerse(
            text,
            verseIndexes[0]
          );
        } else {
          copyVerse(
            text,
            verseIndexes
          );
        }

        toast.info(
          strings.bible.share_not_supported
        );

        return;
      }

      updateUserPoints(
        15,
        strings.bible.reasons.share_verse,
        'share'
      );

      unlockBadge('share_1');
    } catch (err) {}
  };

const copyVerse = (
  text,
  index
) => {
  const chapterLabel =
    formatNumber(
      selectedChapterIndex + 1
    );

  const verseLabel =
    formatNumber(index + 1);

  const rlm =
    language === 'ar'
      ? "\u200F"
      : "";

  const lrm =
    language === 'ar'
      ? "\u200E"
      : "";

  // ناخد النص الحالي من بيانات الإصحاح
  // وبالتالي لو التشكيل مفعّل، يفضل موجود.
  const verseText =
    currentChapterVerses[index] || text;

  const fullText =
    `${verseText} ${rlm}(${getBookName(selectedBookIndex)} ${chapterLabel}${lrm}:${rlm}${verseLabel})`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText);
  }

  setCopiedMessage(
    strings.bible.toasts.copied
  );

  updateUserPoints(
    5,
    strings.bible.reasons.copy_verse,
    'search'
  );

  setTimeout(
    () => setCopiedMessage(''),
    2000
  );
};

  const saveNote = async () => {
    const next = {
      ...favouriteVerses
    };

    if (!next[targetVerseKey]) {
      const [b, c, v] =
        targetVerseKey.split('-');

      next[targetVerseKey] = {
        text:
          bibleDataRef.current[b]
            .chapters[c][v],

        book:
          getBookName(b),

        ch:
          parseInt(c),

        v:
          parseInt(v),

        book_index:
          parseInt(b),

        color:
          '#FFC107',

        dateAdded:
          getCairoIsoString(),

        synced:
          !!user
      };
    }

    next[targetVerseKey].note =
      currentNoteText;

    next[targetVerseKey].noteDate =
      getCairoIsoString();

    // حفظ ملاحظة محلياً
    await StorageService.addNote({
      verseKey:
        targetVerseKey,

      text:
        currentNoteText,

      book:
        next[targetVerseKey].book,

      reference:
        `${next[targetVerseKey].book} ${next[targetVerseKey].v + 1}:${next[targetVerseKey].ch + 1}`
    });

    setFavouriteVerses(next);

    if (user) {
      try {
        await updateDoc(
          doc(
            db,
            'users',
            user.uid
          ),
          {
            'favorites.verses': next
          }
        );
      } catch (e) {
        console.error(
          "Firebase update failed",
          e
        );
      }
    }

    saveBibleData(
      next,
      completedChapters
    );

    setIsNoteModalOpen(false);

    updateUserPoints(
      5,
      strings.bible.reasons.note,
      'favouriteVerse'
    );

    setCopiedMessage(
      strings.bible.toasts.note_saved
    );

    setTimeout(
      () => setCopiedMessage(''),
      2000
    );
  };

  const checkDayReadingCompleted = useCallback(
    (readings, allCompleted) => {
      if (!readings) return false;

      return readings.every(reading => {
        const parts =
          reading.trim().split(' ');

        const chaptersPart =
          parts.pop();

        const bookName =
          parts.join(' ');

        const bIdx =
          bookNamesData.findIndex(
            b => b.name === bookName
          );

        if (bIdx === -1) return false;

        let chs =
          chaptersPart.includes('-')
            ? (function () {
                const [s, e] =
                  chaptersPart
                    .split('-')
                    .map(Number);

                let a = [];

                for (
                  let i = s;
                  i <= e;
                  i++
                ) {
                  a.push(i);
                }

                return a;
              })()
            : chaptersPart
                .split(',')
                .map(Number);

        return chs.every(
          ch =>
            allCompleted[
              `${bIdx}-${ch - 1}`
            ]
        );
      });
    },
    [bookNamesData]
  );

  const updateStudyPlanProgress = async (
    planId,
    planType,
    day,
    currentCompleted
  ) => {
    const key =
      planType === 'custom'
        ? KEYS.CUSTOM_PLANS
        : KEYS.COMPLETED_PLANS;

    const all =
      await StorageService.get(key) || {};

    let planInfo =
      all[planId] ||
      allPlans.find(
        p =>
          p.id === parseInt(planId)
      );

    if (!planInfo) return;

    const dayReading =
      planInfo.readings?.find(
        r =>
          r.day === parseInt(day)
      )?.books;

    const isDone =
      checkDayReadingCompleted(
        dayReading,
        currentCompleted
      );

    const dayData = {
      isCompleted: isDone,
      dateCompleted:
        isDone
          ? getCairoIsoString()
          : null
    };

    const planData =
      all[planId] || {
        ...planInfo,
        completedDays: {},
        completionPercentage: 0
      };

    const newDays = {
      ...planData.completedDays,
      [day]: dayData
    };

    const total =
      planInfo.readings?.length || 0;

    const percent =
      total > 0
        ? Math.round(
            (
              Object.values(newDays)
                .filter(
                  d => d.isCompleted
                ).length /
              total
            ) * 100
          )
        : 0;

    all[planId] = {
      ...planData,
      completedDays: newDays,
      completionPercentage:
        percent
    };

    await StorageService.save(
      key,
      all
    );

    if (isDone) {
      toast.success(
        strings.bible.toasts.plan_day_complete
      );

      if (percent === 100) {
        unlockBadge(
          `plan_finish_${planId}`
        );
      }
    }
  };

  const toggleChapterCompletion = async () => {
    const key =
      `${selectedBookIndex}-${selectedChapterIndex}`;

    const next = {
      ...completedChapters,
      [key]:
        !completedChapters[key]
    };

    setCompletedChapters(next);

    saveBibleData(
      favouriteVerses,
      next
    );

    updateUserPoints(
      20,
      next[key]
        ? strings.bible.reasons.complete_chapter
        : strings.bible.reasons.undo_chapter,
      'completedChapter',
      !next[key]
    );

    const planId =
      searchParams.get('planId');

    const planType =
      searchParams.get('planType');

    const day =
      searchParams.get('day');

    if (planId && day) {
      updateStudyPlanProgress(
        planId,
        planType,
        parseInt(day),
        next
      );
    }

    if (next[key]) {
      const count =
        Object.keys(next)
          .filter(k => next[k])
          .length;

      [
        '10',
        '50',
        '100',
        '250',
        '500',
        '594'
      ].forEach(c => {
        if (
          count >= parseInt(c)
        ) {
          unlockBadge(
            `reader_${c}`
          );
        }
      });

      if (count >= 1189) {
        unlockBadge(
          'bible_finisher'
        );
      }

      const otTotal =
        bookNamesData
          .filter(
            b => b.type === 'old'
          )
          .reduce(
            (s, b) =>
              s + (b.chapters || 0),
            0
          );

      const ntTotal =
        bookNamesData
          .filter(
            b => b.type === 'new'
          )
          .reduce(
            (s, b) =>
              s + (b.chapters || 0),
            0
          );

      if (
        Object.keys(next)
          .filter(
            k =>
              next[k] &&
              bookNamesData[
                k.split('-')[0]
              ]?.type === 'old'
          ).length === otTotal
      ) {
        unlockBadge(
          'testament_old'
        );
      }

      if (
        Object.keys(next)
          .filter(
            k =>
              next[k] &&
              bookNamesData[
                k.split('-')[0]
              ]?.type === 'new'
          ).length === ntTotal
      ) {
        unlockBadge(
          'testament_new'
        );
      }
    }
  };

  const handleAudioButtonClick = async () => {
    if (contextAudioLoading) return;

    const supportedAudioLangs = [
      'ar',
      'en',
      'fr'
    ];

    if (
      !supportedAudioLangs.includes(
        language
      )
    ) {
      toast.error(
        strings.bible.toasts.audio_not_available_lang
      );

      return;
    }

    const book =
      bookNamesData[
        selectedBookIndex
      ];

    const chapter =
      selectedChapterIndex + 1;

    if (
      globalAudioUrl &&
      globalAudioUrl.includes(
        `/${book.book_id}/${chapter}`
      )
    ) {
      setIsPanelOpen(true);
    } else {
      const data =
        await contextFetchAudio(
          selectedBookIndex,
          selectedChapterIndex
        );

      if (data) {
        playTrack(
          data.url,
          data.title,
          data.times,
          selectedBookIndex,
          selectedChapterIndex,
          true
        );
      } else {
        toast.error(
          strings.bible.toasts.audio_not_found
        );
      }
    }
  };

  // Rendering Helpers
  const selectedIndicesSet = useMemo(
    () =>
      new Set(
        selectedVerses.map(
          sv => sv.index
        )
      ),
    [selectedVerses]
  );

  const shortAskLabel =
    (strings.bible.ask_agios || '')
      .split(/\s+/)[0] ||
    "Ask";

  if (
    isLoading ||
    !currentChapterVerses.length
  ) {
    return (
      <div className={styles.loading}>
        {strings.common.loading}
      </div>
    );
  }

  return (
    <div
      dir={pageDir}
      className={`${styles.container} ${
        pageDir === 'rtl'
          ? styles.rtl
          : styles.ltr
      }`}
    >
      {selectedVerses.length > 0 && (
        <div className={styles.selectionBar}>
          <div className={styles.selectionActions}>

            <button
              onClick={() =>
                setSelectedVerses([])
              }
              className={styles.actionBtn}
            >
              ✕
            </button>

            <button
              onClick={copySelected}
              className={styles.actionBtn}
              title={
                strings.bible.tooltips.copy
              }
            >
              <Copy size={20} />
            </button>

            <button
              onClick={() =>
                shareVerse(
                  selectedVerses
                    .map(v => v.text)
                    .join(' '),
                  selectedVerses.map(
                    v => v.index
                  )
                )
              }
              className={styles.actionBtn}
            >
              <Share2 size={20} />
            </button>

            {selectedVerses.length === 1 && (
              <button
                onClick={() =>
                  router.push(
                    `/share-preview?verse=${encodeURIComponent(
                      selectedVerses[0].text
                    )}&ref=${encodeURIComponent(
                      buildReferenceText([
                        selectedVerses[0].index
                      ])
                    )}`
                  )
                }
                className={styles.actionBtn}
                title={
                  strings.bible.tooltips.image_design
                }
              >
                <ImageIcon size={20} />
              </button>
            )}

            <button
              onClick={() =>
                openNoteEditor(
                  `${selectedBookIndex}-${selectedChapterIndex}-${selectedVerses[0].index}`
                )
              }
              className={styles.actionBtn}
              title={
                strings.bible.tooltips.note
              }
            >
              <MessageSquare size={20} />
            </button>

            <button
              onClick={() =>
                router.push(
                  `/bible/analysis/?book=${encodeURIComponent(
                    getBookName(
                      selectedBookIndex
                    )
                  )}&chapter=${
                    selectedChapterIndex + 1
                  }&verses=${selectedVerses
                    .map(
                      v => v.index + 1
                    )
                    .sort(
                      (a, b) => a - b
                    )
                    .join(',')}`
                )
              }
              className={styles.aiBtn}
              title={
                strings.bible.tooltips.ai_analysis
              }
            >
              <Sparkles size={20} />
              <span
                className={styles.aiBtnText}
              >
                {shortAskLabel}
              </span>
            </button>
          </div>

          <div className={styles.colorGrid}>
            {HIGHLIGHT_COLORS.map(
              (c, i) => (
                <span
                  key={i}
                  className={styles.colorDot}
                  style={{
                    backgroundColor: c
                  }}
                  onClick={() =>
                    highlightSelected(c)
                  }
                />
              )
            )}
          </div>
        </div>
      )}

      {isNoteModalOpen && (
        <div
          className={
            styles.modalOverlay
          }
        >
          <div
            className={
              styles.noteModal
            }
          >
            <h3>
              {strings.bible.notes.title}
            </h3>

            <textarea
              value={currentNoteText}
              onChange={e =>
                setCurrentNoteText(
                  e.target.value
                )
              }
              placeholder={
                strings.bible.notes.placeholder
              }
            />

            <div
              className={
                styles.modalActions
              }
            >
              <button
                onClick={saveNote}
                className={
                  styles.saveBtn
                }
              >
                {strings.common.save}
              </button>

              <button
                onClick={() =>
                  setIsNoteModalOpen(false)
                }
                className={
                  styles.cancelBtn
                }
              >
                {strings.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className={styles.title}>
        {strings.bible.title}
      </h1>

      <div className={styles.controls}>
        <div
          className={
            styles.navigationDisplay
          }
        >
          <div
            className={
              styles.navContent
            }
          >
            <span
              className={styles.navText}
              onClick={() => {
                const currentBook =
                  bookNamesData[
                    selectedBookIndex
                  ];

                const testament =
                  currentBook?.testament ||
                  (
                    currentBook?.type === 'new'
                      ? 'NT'
                      : 'OT'
                  );

                router.push(
                  `/bible/books?tab=${testament}`
                );
              }}
            >
              {getBookName(
                selectedBookIndex
              )}

              <ChevronDown
                size={14}
                className={
                  styles.navSubIcon
                }
              />
            </span>

            <span
              className={
                styles.navSeparator
              }
            >
              |
            </span>

            <span
              className={styles.navText}
              onClick={() =>
                router.push(
                  `/bible/chapters?book=${encodeURIComponent(
                    getBookName(
                      selectedBookIndex
                    )
                  )}`
                )
              }
            >
              {`${strings.bible.chapter_label} ${formatNumber(
                selectedChapterIndex + 1
              )}`}

              <ChevronDown
                size={14}
                className={
                  styles.navSubIcon
                }
              />
            </span>
          </div>
        </div>
      </div>

      {copiedMessage && (
        <div className={styles.toast}>
          {copiedMessage}
        </div>
      )}

      <AnimatePresence
        mode="wait"
        custom={direction}
      >
        <motion.div
          key={`${selectedBookIndex}-${selectedChapterIndex}`}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: {
              type: "spring",
              stiffness: 450,
              damping: 35
            },
            opacity: {
              duration: 0.15
            }
          }}
          className={
            styles.verseContainer
          }
          style={{
            lineHeight: '2',
            padding: '15px'
          }}
          dir={pageDir}
        >
          <div
            className={
              styles.chapterHeader
            }
          >
            <h2
              className={
                styles.chapterTitle
              }
            >
              {getBookName(
                selectedBookIndex
              )}{' '}
              {formatNumber(
                selectedChapterIndex + 1
              )}
            </h2>

            <button
              className={styles.aiBtn}
              onClick={() =>
                router.push(
                  `/bible/analysis/?book=${encodeURIComponent(
                    getBookName(
                      selectedBookIndex
                    )
                  )}&chapter=${
                    selectedChapterIndex + 1
                  }`
                )
              }
              title={
                strings.bible.tooltips.ai_analysis
              }
            >
              <Sparkles size={20} />

              <span
                className={
                  styles.aiBtnText
                }
              >
                {strings.bible.ask_agios}
              </span>
            </button>
          </div>

          <div
            className={`${
              versePerLine ||
              !!parallelLanguage
                ? styles.versesList
                : styles.versesParagraph
            } optimize-list`}
          >
            {currentChapterVerses.map(
              (v, i) => (
                <VerseItem
                  key={`${selectedBookIndex}-${selectedChapterIndex}-${i}`}
                  v={v}
                  v2={
                    currentChapterVerses2[i]
                  }
                  i={i}
                  verseNumber={i + 1}
                  isReading={
                    Number(currentVerseId) ===
                    i + 1
                  }
                  isSelected={selectedIndicesSet.has(
                    i
                  )}
                  annotation={
                    favouriteVerses[
                      `${selectedBookIndex}-${selectedChapterIndex}-${i}`
                    ]
                  }
                  versePerLine={
                    versePerLine
                  }
                  formatNumber={
                    formatNumber
                  }
                  handleTouchStart={
                    handleTouchStart
                  }
                  handleTouchMove={
                    handleTouchMove
                  }
                  handleTouchEnd={
                    handleTouchEnd
                  }
                  onVerseClick={
                    toggleVerseSelection
                  }
                  openNoteEditor={
                    openNoteEditor
                  }
                  keyId={`${selectedBookIndex}-${selectedChapterIndex}-${i}`}
                  isParallel={
                    !!parallelLanguage
                  }
                />
              )
            )}
          </div>

          <div
            className={
              styles.completionWrapper
            }
          >
            <button
              className={`${styles.completionBtn} ${
                completedChapters[
                  `${selectedBookIndex}-${selectedChapterIndex}`
                ]
                  ? styles.completed
                  : ''
              }`}
              onClick={
                toggleChapterCompletion
              }
            >
              <span>
                {
                  strings.bible
                    .chapter_complete_btn
                }
              </span>

              {completedChapters[
                `${selectedBookIndex}-${selectedChapterIndex}`
              ] ? (
                <CircleCheck
                  size={24}
                  color="#4CAF50"
                />
              ) : (
                <Check
                  size={24}
                  opacity={0.6}
                />
              )}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className={styles.navigation}>
        <button
          disabled={
            selectedChapterIndex === 0 && selectedBookIndex === 0
          }
          onClick={() => {
            const target = resolveAdjacentChapter(-1);
            if (!target) return;
            setDirection(-1);
            setSelectedBookIndex(target.bookIdx);
            setSelectedChapterIndex(target.chapIdx);
            setSelectedVerses([]);
            window.scrollTo(0, 0);
          }}
        >
          «
        </button>

        <div
          style={{
            display: 'flex',
            gap: '15px',
            alignItems: 'center'
          }}
        >
          <button
            onClick={() =>
              router.push(
                '/settings#text-settings'
              )
            }
            style={{
              display: 'flex'
            }}
            title={
              strings.bible.tooltips.text_settings
            }
          >
            <Settings
              size={28}
              color="var(--color-text-primary)"
            />
          </button>

          {language !== 'de' && (
            <button
              onClick={
                handleAudioButtonClick
              }
              disabled={
                contextAudioLoading
              }
              style={{
                display: 'flex'
              }}
            >
              {contextAudioLoading ? (
                <Loader2
                  size={28}
                  className={
                    styles.spinning
                  }
                />
              ) : (
                <Volume2
                  size={28}
                  color={
                    isPlaying
                      ? "#FFC107"
                      : "var(--color-text-primary)"
                  }
                />
              )}
            </button>
          )}
        </div>

        <button
          disabled={
            selectedChapterIndex >=
            (
              bibleDataRef.current?.[
                selectedBookIndex
              ]?.chapters.length - 1
            ) && selectedBookIndex >= bookNamesData.length - 1
          }
          onClick={() => {
            const target = resolveAdjacentChapter(1);
            if (!target) return;
            setDirection(1);
            setSelectedBookIndex(target.bookIdx);
            setSelectedChapterIndex(target.chapIdx);
            setSelectedVerses([]);
            window.scrollTo(0, 0);
          }}
        >
          »
        </button>
      </div>
    </div>
  );
}