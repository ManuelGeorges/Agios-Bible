'use client';

import React, {
  useState,
  useEffect,
  Suspense,
  useRef,
  useCallback,
} from 'react';

import { useSearchParams } from 'next/navigation';

import styles from './analysis.module.css';

import {
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Share2,
} from 'lucide-react';

import { toast } from 'react-hot-toast';

import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

import { kv, CACHE_KEYS } from '../../../lib/kv';

import { useLanguage } from '../../context/LanguageContext';
import { languageManager } from '../../../services/languageManager';

// FIX: needed to resolve any book name (any language) to its canonical index.
// Same file LanguageContext imports. Adjust the ../ count if your page lives elsewhere.
import allBookNames from '../../data/bookNames.json';

import { getAuth } from 'firebase/auth';

import {
  doc,
  updateDoc,
  increment,
  arrayUnion,
  getDoc,
} from 'firebase/firestore';

import { db } from '../../../lib/firebase';

import { StorageService, KEYS } from '../../../lib/storage';

import {
  getCairoIsoString,
  getCairoDate,
} from '../../../lib/dateUtils';


/* =========================================================
   API
========================================================= */

const API_BASE_URL = 'https://www.agiosbible.com';


/* =========================================================
   IN-MEMORY CACHES
========================================================= */

/*
 * Bible files cached in RAM, so Bible page -> Analysis page ->
 * another analysis does not re-read the translation file.
 */
const bibleFileMemoryCache = new Map();

/*
 * Prevents duplicate simultaneous loads of the same file.
 */
const bibleFilePromises = new Map();

/*
 * Extracted Bible text.  Example key:  ar:matthew:5:1,2,3
 */
const extractedTextCache = new Map();

/*
 * Completed AI responses.
 */
const analysisMemoryCache = new Map();


/* =========================================================
   FONT OPTIONS
========================================================= */

const fontOptionsMap = {
  Cairo: "'Cairo', sans-serif",
  Amiri: "'Amiri', serif",
  Almarai: "'Almarai', sans-serif",
  Tajawal: "'Tajawal', sans-serif",
  // FIX: removed the stray trailing quote that made this value invalid CSS
  ReemKufi: "'Reem Kufi', sans-serif",
};


/* =========================================================
   RETRY
========================================================= */

async function withRetry(
  fn,
  onRetry,
  maxAttempts = 5,
  baseDelayMs = 1200,
  signal
) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (signal?.aborted) {
        throw err;
      }

      const errorMsg = String(err?.message || '').toLowerCase();

      const status = Number(err?.status) || 0;

      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        errorMsg.includes('429') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('rate limit') ||
        errorMsg.includes('500') ||
        errorMsg.includes('502') ||
        errorMsg.includes('503') ||
        errorMsg.includes('504') ||
        errorMsg.includes('overloaded') ||
        errorMsg.includes('busy') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('deadline') ||
        errorMsg.includes('network') ||
        errorMsg.includes('fetch');

      if (!isRetryable || attempt >= maxAttempts - 1) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);

      if (onRetry) {
        onRetry(attempt + 1, maxAttempts);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}


/* =========================================================
   TRANSLATION CONFIG
========================================================= */

const getTranslationConfig = language => {
  switch (language) {
    case 'ar':
      return {
        folder: 'arabic',
        fileName: 'ar_svd_tashkeel_site.json',
      };

    case 'en':
      return {
        folder: 'English',
        fileName: 'en_web.json',
      };

    case 'fr':
      return {
        folder: 'French',
        fileName: 'fr_segond.json',
      };

    case 'de':
      return {
        folder: 'german',
        fileName: 'de_luther.json',
      };

    default:
      return {
        folder: 'arabic',
        fileName: 'ar_svd_tashkeel_site.json',
      };
  }
};


/* =========================================================
   NORMALIZE NUMBER
========================================================= */

const normalizeNumber = value => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(/[٠-٩]/g, digit =>
    String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
  );

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
};


/* =========================================================
   NORMALIZE BOOK NAME

   FIX: Arabic-Indic digits are converted to 0-9, so
   "١ كورنثوس" and "1 كورنثوس" are treated the same.
========================================================= */

const normalizeBookName = name => {
  if (!name) {
    return '';
  }

  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ');
};


/* =========================================================
   BOOK ALIASES
========================================================= */

const BOOK_ALIASES = {
  'متى': ['matthew', 'matt', 'mt'],
  'مرقس': ['mark', 'mk'],
  'لوقا': ['luke', 'lk'],
  'يوحنا': ['john', 'jn', 'joh'],
  'اعمال': ['acts', 'act', 'acts of the apostles'],
  'رومية': ['romans', 'rom'],
  'كورنثوس الاولى': ['1 corinthians', '1corinthians'],
  'كورنثوس الثانية': ['2 corinthians', '2corinthians'],
  'غلاطية': ['galatians', 'gal'],
  'افسس': ['ephesians', 'eph'],
  'فيلبي': ['philippians', 'phil'],
  'كولوسي': ['colossians', 'col'],
  'تسالونيكي الاولى': ['1 thessalonians', '1thessalonians'],
  'تسالونيكي الثانية': ['2 thessalonians', '2thessalonians'],
  'تيموثاوس الاولى': ['1 timothy', '1timothy'],
  'تيموثاوس الثانية': ['2 timothy', '2timothy'],
  'تيطس': ['titus'],
  'فليمون': ['philemon'],
  'عبرانيين': ['hebrews', 'heb'],
  'يعقوب': ['james', 'jas'],
  'بطرس الاولى': ['1 peter', '1peter'],
  'بطرس الثانية': ['2 peter', '2peter'],
  'يوحنا الاولى': ['1 john', '1john'],
  'يوحنا الثانية': ['2 john', '2john'],
  'يوحنا الثالثة': ['3 john', '3john'],
  'يهوذا': ['jude'],
  'رؤيا': ['revelation', 'rev'],
  'التكوين': ['genesis', 'gen'],
  'الخروج': ['exodus', 'exo'],
  'اللاويين': ['leviticus', 'lev'],
  'العدد': ['numbers', 'num'],
  'التثنية': ['deuteronomy', 'deut'],
  'يشوع': ['joshua', 'josh'],
  'القضاة': ['judges', 'judg'],
  'راعوث': ['ruth'],
  'صموئيل الاول': ['1 samuel', '1samuel'],
  'صموئيل الثاني': ['2 samuel', '2samuel'],
  'الملوك الاول': ['1 kings', '1kings'],
  'الملوك الثاني': ['2 kings', '2kings'],
  'المزامير': ['psalms', 'psalm', 'ps'],
  'امثال': ['proverbs', 'prov'],
  'اشعياء': ['isaiah', 'isa'],
  'ارميا': ['jeremiah', 'jer'],
  'حزقيال': ['ezekiel', 'ezek'],
  'دانيال': ['daniel', 'dan'],
};


/* =========================================================
   BOOK INDEX LOOKUP  (FIX)

   One lookup: any book name in ANY language (from bookNames.json)
   or any alias  ->  canonical book index (0..65).
   This is what lets us find the right book whatever the
   Bible file happens to call it.
========================================================= */

const CANONICAL_BOOK_COUNT = 66;

const BOOK_INDEX_LOOKUP = (() => {
  const lookup = new Map();

  const nameOf = entry =>
    typeof entry === 'string' ? entry : entry?.name;

  // Names in every language -> index
  for (const names of Object.values(allBookNames || {})) {
    if (!Array.isArray(names)) {
      continue;
    }

    names.forEach((entry, index) => {
      const key = normalizeBookName(nameOf(entry));

      if (key && !lookup.has(key)) {
        lookup.set(key, index);
      }
    });
  }

  // Abbreviations from BOOK_ALIASES -> same index as their Arabic name
  for (const [arabicName, aliases] of Object.entries(BOOK_ALIASES)) {
    const index = lookup.get(normalizeBookName(arabicName));

    if (index === undefined) {
      continue;
    }

    for (const alias of aliases) {
      const key = normalizeBookName(alias);

      if (key && !lookup.has(key)) {
        lookup.set(key, index);
      }
    }
  }

  return lookup;
})();


/* =========================================================
   BOOK MATCH  (legacy fuzzy matching, now a last resort)
========================================================= */

const bookMatches = (candidate, target) => {
  if (!candidate || !target) {
    return false;
  }

  const a = normalizeBookName(candidate);
  const b = normalizeBookName(target);

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  for (const [arabicName, aliases] of Object.entries(BOOK_ALIASES)) {
    const normalizedArabic = normalizeBookName(arabicName);

    if (a === normalizedArabic) {
      if (aliases.some(alias => normalizeBookName(alias) === b)) {
        return true;
      }
    }

    if (b === normalizedArabic) {
      if (aliases.some(alias => normalizeBookName(alias) === a)) {
        return true;
      }
    }
  }

  return false;
};


/* =========================================================
   GET BOOKS
========================================================= */

const getBooksArray = data => {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.books)) {
    return data.books;
  }

  return [];
};


/* =========================================================
   GET BOOK NAMES
========================================================= */

const getBookNames = bookData => {
  if (!bookData) {
    return [];
  }

  return [
    bookData.name,
    bookData.book,
    bookData.bookName,
    bookData.title,
    bookData.shortName,
    bookData.id,
  ].filter(Boolean);
};


/* =========================================================
   FIND BOOK INDEX  (FIX)

   Order:
     1. exact name match against the names inside the Bible file
     2. canonical index (works whatever the file calls the book,
        as long as the file has the standard 66 books in order)
     3. the old fuzzy alias matching, as a last resort
========================================================= */

const findBookIndex = (books, requestedBook) => {
  if (!Array.isArray(books)) {
    return -1;
  }

  const target = normalizeBookName(requestedBook);

  if (!target) {
    return -1;
  }

  // 1. Exact name match inside the file
  const byName = books.findIndex(bookData => {
    if (!bookData || typeof bookData !== 'object') {
      return false;
    }

    return getBookNames(bookData).some(
      name => normalizeBookName(name) === target
    );
  });

  if (byName !== -1) {
    return byName;
  }

  // 2. Canonical index
  const canonicalIndex = BOOK_INDEX_LOOKUP.get(target);

  if (
    canonicalIndex !== undefined &&
    books.length === CANONICAL_BOOK_COUNT
  ) {
    return canonicalIndex;
  }

  // 3. Legacy fuzzy matching
  return books.findIndex(bookData => {
    if (!bookData || typeof bookData !== 'object') {
      return false;
    }

    return getBookNames(bookData).some(name =>
      bookMatches(name, requestedBook)
    );
  });
};


/* =========================================================
   GET CHAPTERS
========================================================= */

const getChaptersArray = bookData => {
  if (!bookData || !Array.isArray(bookData.chapters)) {
    return [];
  }

  return bookData.chapters;
};


/* =========================================================
   GET VERSE TEXT
========================================================= */

const getVerseText = verseData => {
  if (typeof verseData === 'string') {
    return verseData.trim();
  }

  if (verseData && typeof verseData === 'object') {
    const candidates = [
      verseData.text,
      verseData.verseText,
      verseData.content,
      verseData.value,
      verseData.t,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return '';
};


/* =========================================================
   EXTRACT BIBLE TEXT
========================================================= */

const extractBibleText = (
  bibleData,
  requestedBook,
  requestedChapter,
  requestedVerses
) => {
  const books = getBooksArray(bibleData);

  if (!books.length) {
    throw new Error(
      'لم يتم العثور على أسفار الكتاب المقدس في ملف الترجمة.'
    );
  }

  const bookIndex = findBookIndex(books, requestedBook);

  if (bookIndex === -1) {
    // FIX: log what the file actually calls its books, to make any
    // future mismatch easy to diagnose.
    console.warn(
      'Book not found.',
      'Requested:',
      requestedBook,
      'Books in file:',
      books.length,
      'First names in file:',
      books.slice(0, 5).map(getBookNames)
    );

    throw new Error(`لم يتم العثور على السفر: ${requestedBook}`);
  }

  const bookData = books[bookIndex];

  const chapters = getChaptersArray(bookData);

  if (!chapters.length) {
    throw new Error(`لا توجد فصول للسفر: ${requestedBook}`);
  }

  const chapterNumber = normalizeNumber(requestedChapter);

  if (!chapterNumber || chapterNumber < 1) {
    throw new Error(`رقم الإصحاح غير صحيح: ${requestedChapter}`);
  }

  const chapterIndex = chapterNumber - 1;

  if (chapterIndex < 0 || chapterIndex >= chapters.length) {
    throw new Error(
      `لم يتم العثور على الإصحاح ${requestedChapter} في ${requestedBook}.`
    );
  }

  const chapterData = chapters[chapterIndex];

  if (!Array.isArray(chapterData)) {
    throw new Error(
      `بنية الإصحاح ${requestedChapter} غير صحيحة في ملف الكتاب المقدس.`
    );
  }


  /* =======================================================
     SPECIFIC VERSES
  ======================================================= */

  if (requestedVerses) {
    const requestedVerseNumbers = requestedVerses
      .split(',')
      .map(normalizeNumber)
      .filter(verseNumber => verseNumber !== null && verseNumber > 0);

    if (!requestedVerseNumbers.length) {
      throw new Error('أرقام الآيات المطلوبة غير صحيحة.');
    }

    /*
     * Remove duplicates and sort.  5,2,5,3  ->  2,3,5
     */
    const uniqueVerseNumbers = [...new Set(requestedVerseNumbers)].sort(
      (a, b) => a - b
    );

    const selectedTexts = [];

    for (const verseNumber of uniqueVerseNumbers) {
      const verseIndex = verseNumber - 1;

      if (verseIndex < 0 || verseIndex >= chapterData.length) {
        continue;
      }

      const text = getVerseText(chapterData[verseIndex]);

      if (!text) {
        continue;
      }

      selectedTexts.push(`${verseNumber}. ${text}`);
    }

    if (!selectedTexts.length) {
      throw new Error('لم أتمكن من استخراج نص الآيات المطلوبة.');
    }

    return selectedTexts.join('\n');
  }


  /* =======================================================
     FULL CHAPTER
  ======================================================= */

  const chapterTexts = chapterData
    .map((verseData, index) => {
      const text = getVerseText(verseData);

      if (!text) {
        return '';
      }

      return `${index + 1}. ${text}`;
    })
    .filter(Boolean);

  if (!chapterTexts.length) {
    throw new Error('لم أتمكن من استخراج نص الإصحاح.');
  }

  return chapterTexts.join('\n');
};


/* =========================================================
   LOAD BIBLE FILE
========================================================= */

const loadBibleFile = async language => {
  const { folder, fileName } = getTranslationConfig(language);

  const cacheKey = `${folder}/${fileName}`;

  // RAM cache
  if (bibleFileMemoryCache.has(cacheKey)) {
    return bibleFileMemoryCache.get(cacheKey);
  }

  // Existing promise
  if (bibleFilePromises.has(cacheKey)) {
    return bibleFilePromises.get(cacheKey);
  }

  // New load
  const promise = languageManager
    .getFile(folder, fileName)
    .then(data => {
      if (!data) {
        throw new Error('لم يتم تحميل ملف الترجمة.');
      }

      bibleFileMemoryCache.set(cacheKey, data);

      return data;
    })
    .finally(() => {
      bibleFilePromises.delete(cacheKey);
    });

  bibleFilePromises.set(cacheKey, promise);

  return promise;
};


/* =========================================================
   LOAD EXACT VERSE TEXT
========================================================= */

const loadVerseText = async (language, book, chapter, verses) => {
  const textCacheKey = `${language}:${normalizeBookName(
    book
  )}:${normalizeNumber(chapter)}:${verses || 'all'}`;

  // RAM cache
  if (extractedTextCache.has(textCacheKey)) {
    return extractedTextCache.get(textCacheKey);
  }

  const bibleData = await loadBibleFile(language);

  const text = extractBibleText(bibleData, book, chapter, verses);

  extractedTextCache.set(textCacheKey, text);

  return text;
};


/* =========================================================
   CACHE KEY
========================================================= */

const buildAnalysisCacheKey = (language, book, chapter, verses) => {
  return `${CACHE_KEYS.ANALYSIS}${language}:${normalizeBookName(
    book
  )}:${normalizeNumber(chapter)}:${verses || 'all'}`;
};


/* =========================================================
   READ CACHED ANALYSIS
========================================================= */

const readCachedAnalysis = async cacheKey => {
  // RAM first
  if (analysisMemoryCache.has(cacheKey)) {
    return analysisMemoryCache.get(cacheKey);
  }

  // KV second
  try {
    const cachedRaw = await kv.get(cacheKey);

    if (!cachedRaw) {
      return null;
    }

    let content = '';

    try {
      const parsed =
        typeof cachedRaw === 'string' ? JSON.parse(cachedRaw) : cachedRaw;

      if (typeof parsed === 'string') {
        content = parsed;
      } else if (parsed && typeof parsed === 'object') {
        /*
         * New format:  { ar: "...", en: "..." }
         */
        content = parsed.ar || parsed.en || parsed.fr || parsed.de || '';
      }
    } catch {
      /*
       * Old format: plain string
       */
      if (typeof cachedRaw === 'string') {
        content = cachedRaw;
      }
    }

    if (content) {
      analysisMemoryCache.set(cacheKey, content);

      return content;
    }
  } catch (error) {
    console.error('KV Read Error:', error);
  }

  return null;
};


/* =========================================================
   WRITE CACHED ANALYSIS
========================================================= */

const writeCachedAnalysis = async (cacheKey, language, text) => {
  if (!text) {
    return;
  }

  // RAM immediately
  analysisMemoryCache.set(cacheKey, text);

  // KV in background. The UI does NOT wait for this.
  try {
    const existingRaw = await kv.get(cacheKey);

    let storeObj = {};

    if (existingRaw) {
      try {
        storeObj =
          typeof existingRaw === 'string'
            ? JSON.parse(existingRaw)
            : existingRaw;
      } catch {
        storeObj = {};
      }
    }

    if (!storeObj || typeof storeObj !== 'object' || Array.isArray(storeObj)) {
      storeObj = {};
    }

    storeObj[language || 'en'] = text;

    await kv.set(cacheKey, JSON.stringify(storeObj));
  } catch (error) {
    console.error('KV Write Error:', error);
  }
};


/* =========================================================
   MAIN COMPONENT
========================================================= */

function AnalysisContent() {
  const { strings, language, dir, formatNumber } = useLanguage();

  const searchParams = useSearchParams();

  const book = searchParams.get('book');
  const chapter = searchParams.get('chapter');
  const verses = searchParams.get('verses');

  const [analysis, setAnalysis] = useState('');

  const analysisRef = useRef('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sectionAnchors, setSectionAnchors] = useState([]);

  const hasFetched = useRef(false);

  const sectionRefs = useRef({});

  const abortControllerRef = useRef(null);

  const QUOTA_KEY = 'aiSearchTimestamps';


  /* =====================================================
     FONT
  ===================================================== */

  useEffect(() => {
    const syncFont = () => {
      const savedFontId = localStorage.getItem('bibleFontFamily') || 'Cairo';

      document.documentElement.style.setProperty(
        '--bible-font-family',
        fontOptionsMap[savedFontId] || fontOptionsMap.Cairo
      );
    };

    syncFont();

    window.addEventListener('storage', syncFont);

    return () => {
      window.removeEventListener('storage', syncFont);
    };
  }, []);


  /* =====================================================
     SECTION ANCHORS
  ===================================================== */

  useEffect(() => {
    if (!analysis) {
      setSectionAnchors([]);
      return;
    }

    const lines = analysis.split('\n');

    const anchors = [];

    lines.forEach((line, index) => {
      const cleanLine = line.replace(/[#*]/g, '').trim();

      /*
       * Matches:
       *   1. مقدمة
       *   1. مقدمة:
       *   ١. مقدمة
       *   2. اللغويات:
       */
      const headerMatch = cleanLine.match(
        /^[123456١٢٣٤٥٦]\.\s+[^:]{1,80}:?$/
      );

      if (headerMatch) {
        anchors.push(`section-${index}`);
      }
    });

    setSectionAnchors(anchors);
  }, [analysis]);


  /* =====================================================
     POINTS
  ===================================================== */

  const recordAnalysisGoal = useCallback(async () => {
    try {
      const auth = getAuth();

      const user = auth.currentUser;

      const today = getCairoDate();

      if (user) {
        const userRef = doc(db, 'users', user.uid);

        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();

          const history = data.pointsHistory || [];

          const alreadyDone = history.some(
            item =>
              item.type === 'verseAnalysis' &&
              item.timestamp &&
              getCairoDate(
                item.timestamp.toDate
                  ? item.timestamp.toDate()
                  : new Date(item.timestamp)
              ) === today
          );

          if (!alreadyDone) {
            await updateDoc(userRef, {
              totalPoints: increment(15),

              pointsHistory: arrayUnion({
                type: 'verseAnalysis',

                points: 15,

                reason:
                  strings.points.points_reasons.verse_analysis ||
                  'تحليل آية بالذكاء الاصطناعي',

                timestamp: getCairoIsoString(),
              }),
            });
          }
        }
      } else {
        const localHistory =
          (await StorageService.get(KEYS.POINTS_HISTORY)) || [];

        const alreadyDone = localHistory.some(
          item =>
            item.type === 'verseAnalysis' &&
            getCairoDate(new Date(item.timestamp)) === today
        );

        if (!alreadyDone) {
          await StorageService.addPoints(15);

          localHistory.push({
            type: 'verseAnalysis',

            points: 15,

            reason:
              strings.points.points_reasons.verse_analysis ||
              'تحليل آية بالذكاء الاصطناعي',

            timestamp: getCairoIsoString(),
          });

          await StorageService.save(KEYS.POINTS_HISTORY, localHistory);
        }
      }
    } catch (err) {
      console.error('recordAnalysisGoal error:', err);
    }
  }, [strings]);


  /* =====================================================
     LOCAL RATE LIMIT
  ===================================================== */

  const getRateLimitState = () => {
    let requestTimes = [];

    try {
      requestTimes = JSON.parse(localStorage.getItem(QUOTA_KEY) || '[]');
    } catch {
      requestTimes = [];
    }

    const now = Date.now();

    const oneMinute = 60_000;

    const recentRequests = requestTimes.filter(time => now - time < oneMinute);

    return {
      now,
      recentRequests,
    };
  };


  /* =====================================================
     FETCH ANALYSIS
  ===================================================== */

  const fetchAnalysis = useCallback(async () => {
    if (!book || !chapter) {
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();

    abortControllerRef.current = controller;

    const cacheKey = buildAnalysisCacheKey(language, book, chapter, verses);

    /*
     * ===============================================
     * 1. RAM / KV CACHE
     * ===============================================
     */

    try {
      const cached = await readCachedAnalysis(cacheKey);

      if (cached && !controller.signal.aborted) {
        setAnalysis(cached);

        analysisRef.current = cached;

        setError(null);
        setIsLoading(false);
        setCountdown(0);
        setStatus('');

        void recordAnalysisGoal();

        return;
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }


    /*
     * ===============================================
     * 2. LOCAL RATE LIMIT
     * ===============================================
     */

    const { now, recentRequests } = getRateLimitState();

    if (recentRequests.length >= 2) {
      const oldestInWindow = Math.min(...recentRequests);

      const remaining = Math.ceil((60_000 - (now - oldestInWindow)) / 1000);

      setCountdown(Math.max(1, remaining));

      setIsLoading(false);

      return;
    }


    /*
     * ===============================================
     * 3. REGISTER REQUEST
     * ===============================================
     */

    const updatedRequests = [...recentRequests, now];

    localStorage.setItem(QUOTA_KEY, JSON.stringify(updatedRequests));


    /*
     * ===============================================
     * 4. RESET UI
     * ===============================================
     */

    setIsLoading(true);
    setError(null);
    setAnalysis('');
    analysisRef.current = '';
    setCountdown(0);


    /*
     * ===============================================
     * 5. REFERENCE
     * ===============================================
     */

    const targetText = verses
      ? `${book} ${chapter}:${verses}`
      : `${book} ${chapter}`;


    /*
     * ===============================================
     * 6. EXACT BIBLE TEXT
     * ===============================================
     */

    let verseText = '';

    try {
      setStatus(
        language === 'ar'
          ? 'جاري تجهيز نص الكتاب المقدس للتحليل...'
          : 'Preparing the Bible text for analysis...'
      );

      verseText = await loadVerseText(language, book, chapter, verses);

      if (!verseText) {
        throw new Error('Empty Bible text');
      }

      if (controller.signal.aborted) {
        return;
      }

      console.log('Agios AI reference:', targetText);

      console.log('Agios AI exact Bible text:', verseText);
    } catch (textError) {
      if (textError?.name === 'AbortError') {
        return;
      }

      console.error('Bible text extraction error:', textError);

      setError(
        language === 'ar'
          ? 'تعذر تجهيز نص الكتاب المقدس للتحليل. حاول مرة أخرى.'
          : 'Could not prepare the Bible text for analysis. Please try again.'
      );

      setIsLoading(false);

      return;
    }


    /*
     * ===============================================
     * 7. GEMINI REQUEST
     * ===============================================
     */

    const attemptGeneration = async attemptIndex => {
      const response = await fetch(`${API_BASE_URL}/api/gemini/`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        signal: controller.signal,

        body: JSON.stringify({
          task: 'analysis',

          lang: language,

          attempt: attemptIndex,

          /*
           * IMPORTANT:
           * This allows the server to cache the response too.
           */
          cacheKey,

          payload: {
            targetText,

            verseText,
          },
        }),
      });

      if (!response.ok) {
        const message = await response.text();

        const error = new Error(
          message || `Gemini request failed with ${response.status}`
        );

        error.status = response.status;

        throw error;
      }

      if (!response.body) {
        throw new Error('Gemini returned an empty response stream.');
      }

      const reader = response.body.getReader();

      const decoder = new TextDecoder('utf-8');

      let text = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunkText = decoder.decode(value, { stream: true });

        text += chunkText;

        if (controller.signal.aborted) {
          try {
            await reader.cancel();
          } catch {}

          return '';
        }

        // Render immediately
        setAnalysis(text);

        analysisRef.current = text;
      }

      // Flush decoder
      text += decoder.decode();

      // Final UI update
      if (text) {
        setAnalysis(text);

        analysisRef.current = text;
      }

      return text;
    };


    /*
     * ===============================================
     * 8. RUN WITH RETRY
     * ===============================================
     */

    try {
      setStatus(strings.analysis.status_analyzing);

      const finalText = await withRetry(
        attemptGeneration,

        (attempt, maxAttempts) => {
          setStatus(
            language === 'ar'
              ? `محاولة ${formatNumber(
                  attempt
                )}: مساعد آجيوس الذكي يقوم بتحليل النص...`
              : `Attempt ${formatNumber(
                  attempt
                )}: Agios AI is analyzing text...`
          );
        },

        5,

        1200,

        controller.signal
      );

      if (controller.signal.aborted) {
        return;
      }

      /*
       * =============================================
       * 9. CACHE FINAL RESULT
       * =============================================
       */

      if (finalText) {
        // Do not block UI waiting for KV
        void writeCachedAnalysis(cacheKey, language, finalText);

        void recordAnalysisGoal();
      }

      setStatus('');
      setIsLoading(false);
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }

      console.error('Final Analysis Error:', err);

      /*
       * If Gemini streamed a meaningful partial answer, keep it.
       */
      if (analysisRef.current.trim().length > 100) {
        setIsLoading(false);

        toast.error(strings.analysis.error_incomplete);
      } else {
        setError(strings.analysis.error_generic);

        setIsLoading(false);
      }
    }
  }, [
    book,
    chapter,
    verses,
    language,
    strings,
    formatNumber,
    recordAnalysisGoal,
  ]);


  /* =====================================================
     INITIAL FETCH
  ===================================================== */

  useEffect(() => {
    if (!book || !chapter) {
      return;
    }

    const requestId = `${language}:${book}:${chapter}:${verses || 'all'}`;

    if (hasFetched.current === requestId) {
      return;
    }

    hasFetched.current = requestId;

    void fetchAnalysis();

    return () => {
      // Abort only the current request when dependencies change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [book, chapter, verses, language, fetchAnalysis]);


  /* =====================================================
     COUNTDOWN
  ===================================================== */

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown(previous => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);


  /* =====================================================
     RETRY AFTER COUNTDOWN
  ===================================================== */

  useEffect(() => {
    if (
      countdown === 0 &&
      hasFetched.current &&
      !analysis &&
      !isLoading &&
      !error
    ) {
      void fetchAnalysis();
    }
  }, [countdown, analysis, isLoading, error, fetchAnalysis]);


  /* =====================================================
     CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);


  /* =====================================================
     COPY
  ===================================================== */

  const handleCopy = useCallback(() => {
    if (!analysis) {
      return;
    }

    navigator.clipboard
      .writeText(analysis)
      .then(() => {
        setCopied(true);

        toast.success(strings.analysis.toast_copy);

        setTimeout(() => setCopied(false), 2000);
      })
      .catch(error => {
        console.error('Copy error:', error);
      });
  }, [analysis, strings]);


  /* =====================================================
     SHARE
  ===================================================== */

  const handleShare = useCallback(async () => {
    if (!analysis) {
      return;
    }

    const shareTitle = verses
      ? `${strings.analysis.title_prefix} ${book} ${formatNumber(
          chapter
        )} : ${formatNumber(verses)}`
      : `${strings.analysis.title_prefix} ${book} ${formatNumber(chapter)}`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: shareTitle,

          text: analysis,

          url: window.location.href,

          dialogTitle: strings.share_preview.share_dialog,
        });
      } else if (navigator.share) {
        await navigator.share({
          title: shareTitle,

          text: analysis,

          url: window.location.href,
        });
      } else {
        handleCopy();
      }
    } catch (err) {
      console.error('Share error', err);
    }
  }, [analysis, verses, book, chapter, strings, formatNumber, handleCopy]);


  /* =====================================================
     SHARE PARAGRAPH
  ===================================================== */

  const shareText = useCallback(
    async text => {
      if (!text) {
        return;
      }

      try {
        if (Capacitor.isNativePlatform()) {
          await Share.share({
            text,

            dialogTitle: strings.share_preview.share_dialog,
          });
        } else if (navigator.share) {
          await navigator.share({
            text,
          });
        } else {
          await navigator.clipboard.writeText(text);

          toast.success(strings.common.copied);
        }
      } catch (err) {
        console.error('Share error', err);
      }
    },
    [strings]
  );


  /* =====================================================
     SCROLL
  ===================================================== */

  const scrollToSection = id => {
    const target = sectionRefs.current[id];

    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };


  /* =====================================================
     PARAGRAPH RENDER
  ===================================================== */

  const renderParagraph = (content, key, originalRaw) => {
    /*
     * Support simple **bold**
     */
    const parts = content.split(/(\*\*.*?\*\*)/g);

    const formattedLine = parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      return part.replace(/[#*]/g, '');
    });

    const cleanOriginal = String(originalRaw || content)
      .replace(/[#*]/g, '')
      .trim();

    return (
      <div key={key} className={styles.paragraphWrapper}>
        <p className={styles.paragraph}>{formattedLine}</p>

        <div className={styles.paragraphActions}>
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(cleanOriginal)
                .then(() => {
                  toast.success(strings.analysis.toast_copy_paragraph);
                })
                .catch(error => {
                  console.error('Copy paragraph error:', error);
                });
            }}
            className={styles.miniActionBtn}
            title={strings.common.copy}
          >
            <Copy size={14} />
          </button>

          <button
            onClick={() => shareText(cleanOriginal)}
            className={styles.miniActionBtn}
            title={strings.common.share}
          >
            <Share2 size={14} />
          </button>
        </div>
      </div>
    );
  };


  /* =====================================================
     PARSE / RENDER
  ===================================================== */

  const parseAndRender = text => {
    if (!text) {
      return null;
    }

    return text.split('\n').map((line, index) => {
      const cleanLine = line.replace(/[#*]/g, '').trim();

      if (!cleanLine) {
        return <div key={index} className={styles.spacer} />;
      }

      /*
       * Header examples:
       *   1. مقدمة:
       *   2. معاني الكلمات:
       *   3. الخلفية التاريخية:
       */
      const headerMatch = cleanLine.match(
        /^([123456١٢٣٤٥٦]\.\s+[^:]{1,80}:?)(?:\s*)(.*)$/
      );

      /*
       * Only consider it a section when the line actually starts
       * with one of the expected section numbers.
       */
      if (headerMatch && /^[123456١٢٣٤٥٦]\.\s+/.test(cleanLine)) {
        const headerPart = headerMatch[1].trim();

        const contentPart = headerMatch[2].trim();

        const anchorId = `section-${index}`;

        /*
         * If the AI puts the content after the header on the same
         * line, render it below.
         */
        if (contentPart && contentPart !== ':') {
          return (
            <React.Fragment key={index}>
              <h3
                id={anchorId}
                ref={element => {
                  sectionRefs.current[anchorId] = element;
                }}
                className={styles.sectionHeader}
              >
                {headerPart}
              </h3>

              {renderParagraph(contentPart, `extra-${index}`, contentPart)}
            </React.Fragment>
          );
        }

        return (
          <h3
            id={anchorId}
            ref={element => {
              sectionRefs.current[anchorId] = element;
            }}
            key={index}
            className={styles.sectionHeader}
          >
            {headerPart}
          </h3>
        );
      }

      return renderParagraph(line, index, cleanLine);
    });
  };


  /* =====================================================
     TITLE
  ===================================================== */

  const displayTitle = verses
    ? `${strings.analysis.title_prefix} ${book} ${formatNumber(
        chapter
      )} : ${formatNumber(verses)}`
    : `${strings.analysis.title_prefix} ${book} ${formatNumber(chapter)}`;


  /* =====================================================
     SECTION LABELS
  ===================================================== */

  const getSectionLabels = () => {
    if (language === 'ar') {
      return ['مقدمة', 'لغويات', 'تاريخ', 'تفسير', 'تطبيق', 'شبهات'];
    }

    if (language === 'fr') {
      return [
        'Introduction',
        'Linguistique',
        'Contexte historique',
        'Exégèse',
        'Application',
        'Objections',
      ];
    }

    if (language === 'de') {
      return [
        'Einleitung',
        'Linguistik',
        'Historischer Hintergrund',
        'Exegese',
        'Anwendung',
        'Einwände',
      ];
    }

    return [
      'Introduction',
      'Linguistics',
      'Historical background',
      'Exegesis',
      'Application',
      'Objections',
    ];
  };

  const sectionLabels = getSectionLabels();


  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className={styles.container} dir={dir}>
      <header className={styles.header}>
        <div className={styles.headerRight}>
          <div className={styles.titleInfo}>
            <h1 className={styles.title}>{displayTitle}</h1>

            <span className={styles.aiBadge}>
              <Sparkles size={12} />

              {strings.analysis.ai_badge}
            </span>
          </div>
        </div>

        {!isLoading && analysis && (
          <div className={styles.actionButtons}>
            <button
              onClick={handleShare}
              className={styles.iconBtn}
              title={strings.common.share}
            >
              <Share2 size={20} />
            </button>

            <button
              onClick={handleCopy}
              className={styles.iconBtn}
              title={strings.common.copy}
            >
              {copied ? (
                <Check size={20} color="#4caf50" />
              ) : (
                <Copy size={20} />
              )}
            </button>
          </div>
        )}
      </header>


      <main className={styles.contentCard}>
        {!isLoading && analysis && sectionAnchors.length > 0 && (
          <div className={styles.sectionNav}>
            {sectionAnchors.map((anchor, index) => (
              <button
                key={anchor}
                onClick={() => scrollToSection(anchor)}
                className={styles.sectionNavBtn}
              >
                {sectionLabels[index] ||
                  `${language === 'ar' ? 'قسم' : 'Section'} ${index + 1}`}
              </button>
            ))}
          </div>
        )}


        {countdown > 0 ? (
          <div className={styles.loadingWrapper}>
            <div className={styles.countdownCircle}>
              <span className={styles.countdownNumber}>
                {formatNumber(countdown)}
              </span>
            </div>

            <h2 className={styles.waitTitle}>{strings.analysis.wait_title}</h2>

            <p className={styles.statusText}>{strings.analysis.wait_desc}</p>
          </div>
        ) : isLoading && !analysis ? (
          <div className={styles.loadingWrapper}>
            <div className={styles.aiLoadingIcon}>
              <Sparkles size={50} className={styles.pulseIcon} />
            </div>

            <p className={styles.statusText}>{status}</p>

            <div className={styles.loadingBarContainer}>
              <div className={styles.loadingBarProgress} />
            </div>
          </div>
        ) : error && !analysis ? (
          <div className={styles.errorWrapper}>
            <AlertCircle size={50} className={styles.errorIcon} />

            <h3>{strings.common.error_occurred}</h3>

            <p>{error}</p>

            <button
              onClick={() => {
                hasFetched.current = false;

                void fetchAnalysis();
              }}
              className={styles.retryBtn}
            >
              {strings.common.retry}
            </button>
          </div>
        ) : (
          <div className={styles.analysisContainer}>
            <div className={styles.analysisText}>{parseAndRender(analysis)}</div>

            {isLoading && (
              <div className={styles.streamingIndicator}>
                <div className={styles.typingDots}>
                  <span />
                  <span />
                  <span />
                </div>

                <span>{strings.analysis.streaming_text}</span>
              </div>
            )}

            {!isLoading && (
              <footer className={styles.analysisFooter}>
                <p className={styles.disclaimer}>{strings.analysis.disclaimer}</p>
              </footer>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


/* =========================================================
   PAGE
========================================================= */

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}