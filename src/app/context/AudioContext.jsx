"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { toast } from 'react-hot-toast';
import { useLanguage } from './LanguageContext';
import { languageManager } from '../../services/languageManager';

const AudioContext = createContext();

const FOLDER_MAP = {
    ar: 'arabic',
    en: 'English',
    de: 'german',
    fr: 'French'
};

const BIBLE_FILE_MAP = {
    ar: 'ar_svd_no_tashkeel.json',
    en: 'en_web.json',
    fr: 'fr_segond.json',
    de: 'de_luther.json'
};

// كام ثانية نقبل الفرق بينها وبين البداية/النهاية عشان "نستأنف" التشغيل بدل ما نبدأ من الصفر
const RESUME_MIN_OFFSET = 5;
// كل قد ايه (بالثواني) نحفظ آخر موضع تشغيل عشان الاستئناف
const POSITION_SAVE_INTERVAL = 5;
// مدة صلاحية الكاش المؤقت لبيانات الإصحاح اللي اتعمله prefetch (بالميلي ثانية)
const PREFETCH_TTL = 5 * 60 * 1000;
// عدد محاولات إعادة الجلب عند فشل الشبكة
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY = 700;

const buildLocKey = (book, chapter) => `${book.book_id}-${chapter}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function AudioProvider({ children }) {
    const { strings, language, bookNames } = useLanguage();

    const [audioUrl, setAudioUrl] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [trackTitle, setTrackTitle] = useState("");
    const [currentVerseId, setCurrentVerseId] = useState(-1);
    const [timestamps, setTimestamps] = useState([]);
    const [isAutoNext, setIsAutoNext] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    // FIX #A1: نظهر تفرقة بين "بيحمل الملف من الأول" و"بيتعلق (buffering) وهو شغال"
    const [isBuffering, setIsBuffering] = useState(false);

    const [downloadedChapters, setDownloadedChapters] = useState({});
    const [downloadProgress, setDownloadProgress] = useState({});

    const [isRepeat, setIsRepeat] = useState(false);
    const [isAutoPlay, setIsAutoPlay] = useState(true);
    const [volume, setVolumeState] = useState(1);
    const [isHighlightEnabled, setIsHighlightEnabled] = useState(true);

    // FIX #A2: مؤقت النوم أصبح شغال فعليًا (كان فيه state بس مفيش أي useEffect بيحرّكه)
    const [sleepTimer, setSleepTimer] = useState(null); // عدد الدقايق المختارة، أو null
    const [timeLeft, setTimeLeft] = useState(null); // الثواني المتبقية

    const [currentLocation, setCurrentLocation] = useState({ bookIdx: -1, chapIdx: -1 });
    const [bibleData, setBibleData] = useState(null);
    const [navigationCallback, setNavigationCallbackState] = useState(null);
    // FIX #A3: callback ثانٍ "بدون آثار جانبية" يسمح بمعرفة الإصحاح الجاي/اللي فات
    // من غير ما يحرّك شاشة القراءة، عشان نقدر نعمل prefetch هادئ في الخلفية.
    const [peekNavigationCallback, setPeekNavigationCallbackState] = useState(null);

    const audioRef = useRef(null);
    const lastUrlRef = useRef(null);
    const timestampsRef = useRef([]);
    const fetchingRef = useRef(null);
    const currentLocationRef = useRef({ bookIdx: -1, chapIdx: -1 });
    const downloadingRef = useRef({});
    const dataLoadTokenRef = useRef(0);

    // FIX #A4: توكن لكل طلب تنقل/تشغيل، عشان لو المستخدم دوس "التالي" أكتر من مرة بسرعة
    // ميحصلش تعارض بين نتيجتين شبكة راجعين في نفس الوقت (آخر طلب هو اللي يفوز فعلاً).
    const requestTokenRef = useRef(0);
    const fetchAbortRef = useRef(null);

    // كاش مؤقت في الذاكرة لبيانات الإصحاحات اللي اتعمللها prefetch أو جلب عادي
    const prefetchCacheRef = useRef({});
    const sleepIntervalRef = useRef(null);
    const lastSavedPositionRef = useRef(0);
    const resumeAllowedRef = useRef(true);

    useEffect(() => {
        currentLocationRef.current = currentLocation;
    }, [currentLocation]);

    useEffect(() => {
        const loadDownloads = async () => {
            try {
                const { value } = await Preferences.get({ key: 'downloaded_audio' });
                if (value) setDownloadedChapters(JSON.parse(value));
            } catch (e) {
                console.error('Failed to load downloaded chapters list', e);
            }
        };
        if (Capacitor.isNativePlatform()) loadDownloads();
    }, []);

    // FIX #A5: استرجاع مستوى الصوت وسرعة التشغيل المحفوظين من جلسة سابقة
    useEffect(() => {
        const loadAudioPrefs = async () => {
            try {
                const [{ value: savedVolume }, { value: savedSpeed }] = await Promise.all([
                    Preferences.get({ key: 'audio_volume' }),
                    Preferences.get({ key: 'audio_speed' })
                ]);
                if (savedVolume !== null && savedVolume !== undefined) {
                    const v = parseFloat(savedVolume);
                    if (!isNaN(v)) setVolumeState(v);
                }
                if (savedSpeed !== null && savedSpeed !== undefined) {
                    const s = parseFloat(savedSpeed);
                    if (!isNaN(s)) setPlaybackSpeed(s);
                }
            } catch (e) {
                console.error('Failed to load audio preferences', e);
            }
        };
        loadAudioPrefs();
    }, []);

    const setVolume = useCallback((v) => {
        setVolumeState(v);
        Preferences.set({ key: 'audio_volume', value: String(v) }).catch(() => {});
    }, []);

    const setPlaybackSpeedPersisted = useCallback((s) => {
        setPlaybackSpeed(s);
        Preferences.set({ key: 'audio_speed', value: String(s) }).catch(() => {});
    }, []);

    // تنظيف مؤقت النوم عند تفكيك الكومبوننت
    useEffect(() => {
        return () => {
            if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
        };
    }, []);

    const parseTimeToSeconds = useCallback((val) => {
        if (val === undefined || val === null) return -1;
        if (typeof val === 'number') return val;
        const s = String(val).trim();
        if (!s) return -1;

        if (s.includes(':')) {
            const parts = s.split(':').map(parseFloat);
            if (parts.some(isNaN)) return -1;
            if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
            if (parts.length === 2) return (parts[0] * 60) + parts[1];
        }
        const num = parseFloat(s);
        return isNaN(num) ? -1 : num;
    }, []);

    const processTimestamps = useCallback((rawTimes) => {
        if (!rawTimes || !Array.isArray(rawTimes)) return [];

        return rawTimes
            .map((ts) => {
                let startTime = -1;
                if (ts.timestamp !== undefined) startTime = parseTimeToSeconds(ts.timestamp);
                else if (ts.verse_start_time !== undefined) startTime = parseTimeToSeconds(ts.verse_start_time);
                else if (ts.seconds !== undefined) startTime = parseTimeToSeconds(ts.seconds);
                else if (ts.verse_start !== undefined) startTime = parseTimeToSeconds(ts.verse_start);

                let vIdRaw = ts.verse_id ?? ts.verse ?? ts.verse_number;
                if (vIdRaw === undefined || vIdRaw === null) return null;

                let vId = "";
                const s = String(vIdRaw).trim();
                const parts = s.split('.');
                const lastPart = parts[parts.length - 1];

                if (/^\d{6,}$/.test(lastPart)) {
                    vId = String(parseInt(lastPart) % 1000);
                } else {
                    const m = lastPart.match(/\d+/);
                    vId = m ? m[0] : lastPart;
                }

                return { startTime, vId: String(parseInt(vId) || vId) };
            })
            .filter(ts => ts !== null && ts.startTime >= 0 && !isNaN(ts.startTime) && ts.vId !== "" && ts.vId !== "NaN")
            .sort((a, b) => a.startTime - b.startTime);
    }, [parseTimeToSeconds]);

    // FIX #A6: حفظ آخر موضع تشغيل لكل إصحاح (throttled) عشان لو المستخدم قفل التطبيق يرجع من نفس المكان
    const savePlaybackPosition = useCallback((locKey, seconds) => {
        if (!locKey) return;
        Preferences.set({ key: `pos_${locKey}`, value: String(Math.floor(seconds)) }).catch(() => {});
    }, []);

    const playTrack = useCallback((url, title, chapterTimestamps = [], bookIdx, chapIdx, shouldOpenPanel = true, options = {}) => {
        const { allowResume = true } = options;
        setIsAutoNext(false);

        const isSameUrl = lastUrlRef.current === url;
        const isSameLocation = currentLocationRef.current.bookIdx === bookIdx && currentLocationRef.current.chapIdx === chapIdx;

        if (isSameUrl && isSameLocation) {
            if (shouldOpenPanel) setIsPanelOpen(true);
            return;
        }

        lastUrlRef.current = url;
        resumeAllowedRef.current = allowResume;
        lastSavedPositionRef.current = 0;
        const finalUrl = (url && url.startsWith('file://')) ? Capacitor.convertFileSrc(url) : url;

        setAudioUrl(finalUrl);
        setTrackTitle(title);
        setIsBuffering(true);

        const processed = processTimestamps(chapterTimestamps);
        timestampsRef.current = processed;
        setTimestamps(processed);

        setCurrentLocation({ bookIdx, chapIdx });
        setCurrentVerseId(-1);

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = finalUrl;
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    if (e.name !== 'AbortError') {
                        console.error("Playback error", e);
                        toast.error(strings?.audio?.playback_error || 'Could not play audio.');
                    }
                });
            }
        }
        if (shouldOpenPanel) setIsPanelOpen(true);
    }, [processTimestamps, strings]);

    // FIX #A7: طلب واحد بمحاولات إعادة (retry) بسيطة، عشان تقلبة الشبكة موجايبتش
    // رسالة خطأ من أول فشل عابر.
    const fetchWithRetry = useCallback(async (url, opts, retries = FETCH_RETRIES) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, opts);
                if (res.ok) return res;
                if (attempt === retries) return res;
            } catch (e) {
                if (opts?.signal?.aborted) throw e;
                if (attempt === retries) throw e;
            }
            await sleep(FETCH_RETRY_DELAY * (attempt + 1));
        }
        return null;
    }, []);

    const fetchAudioData = useCallback(async (bookIdx, chapIdx, { silent = false } = {}) => {
        if (language === 'de') return null;

        const book = bookNames[bookIdx];
        if (!book || !book.book_id) return null;

        const chapter = chapIdx + 1;
        const locKey = buildLocKey(book, chapter);

        // 1) نتاعت مسبقًا (prefetch) وسليمة؟ نستخدمها فورًا من غير أي انتظار شبكة
        const cached = prefetchCacheRef.current[locKey];
        if (cached && (Date.now() - cached.time) < PREFETCH_TTL) {
            delete prefetchCacheRef.current[locKey];
            return cached.data;
        }

        // 2) متاحة محليًا (تم تنزيلها)؟
        if (downloadedChapters[locKey]) {
            try {
                const fileResult = await Filesystem.getUri({
                    directory: Directory.Data,
                    path: `audio/${locKey}.mp3`
                });

                const { value: storedTimes } = await Preferences.get({ key: `times_${locKey}` });
                const times = storedTimes ? JSON.parse(storedTimes) : [];

                const displayChapter = language === 'ar' ? chapter.toLocaleString('ar-EG') : chapter;
                const title = strings.audio.track_title
                    .replace('{book}', book.name)
                    .replace('{chapter}', displayChapter);

                return { url: fileResult.uri, title, times };
            } catch (e) {
                console.error("Local file fetch error, falling back to network", e);
            }
        }

        // 3) لازم نطلب من الشبكة
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (!silent) toast.error(strings?.audio?.offline_error || 'No internet connection.');
            return null;
        }

        if (fetchingRef.current === locKey) return null;
        fetchingRef.current = locKey;

        if (!silent) setIsAudioLoading(true);
        const key = '5e4b1535-5f2b-4f13-9032-9db0297664a6';

        const fcbhMappings = {
            'ar': { new: 'ARZVDVN1DA', old: 'ARZVDVO1DA', bible: 'ARZVDV' },
            'en': { new: 'EN1WEBN2DA', old: 'EN1WEBO2DA', bible: 'ENGWEB' },
            'fr': { new: 'FRNTLSN2DA', old: 'FRNTLSO2DA', bible: 'FRNTLS' }
        };

        let config = fcbhMappings[language] || {
            new: `${language.toUpperCase()}N1DA`,
            old: `${language.toUpperCase()}O1DA`,
            bible: null
        };

        let audioFilesetId = book.type === 'new' ? config.new : config.old;

        try {
            const primaryAudioPromise = fetchWithRetry(`https://4.dbt.io/api/bibles/filesets/${audioFilesetId}/${book.book_id}/${chapter}?v=4&key=${key}`, { priority: 'high' })
                .then(r => r && r.ok ? r.json() : null);

            let timingCandidates = [audioFilesetId];
            if (language === 'ar') timingCandidates.push('ARZVDVN1DA', 'ARZVDVO1DA');
            else if (language === 'en') timingCandidates.push('EN1WEBN2DA', 'EN1WEBO2DA');
            else if (language === 'fr') timingCandidates.push('FRNTLSN2DA', 'FRNTLSO2DA');

            const timestampsPromise = Promise.all(timingCandidates.map(tId =>
                fetch(`https://4.dbt.io/api/timestamps/${tId}/${book.book_id}/${chapter}?v=4&key=${key}`, { priority: 'low' })
                .then(r => r.ok ? r.json() : null)
                .then(tData => tData?.data || (Array.isArray(tData) ? tData : []))
                .catch(() => [])
            )).then(allResults => allResults.find(t => t.length > 0) || []);

            const audioData = await primaryAudioPromise;
            let url = audioData?.data?.[0]?.path;

            if (!url) throw new Error("Audio URL not found");

            const times = await Promise.race([
                timestampsPromise,
                new Promise(resolve => setTimeout(() => resolve([]), 1500))
            ]);

            const displayChapter = language === 'ar' ? chapter.toLocaleString('ar-EG') : chapter;
            const title = strings.audio.track_title
                .replace('{book}', book.name)
                .replace('{chapter}', displayChapter);

            const result = { url, title, times };
            return result;
        } catch (error) {
            console.error("Fetch audio error", error);
            if (!silent) toast.error(strings?.audio?.fetch_error || 'Could not load audio for this chapter.');
            return null;
        } finally {
            if (fetchingRef.current === locKey) fetchingRef.current = null;
            if (!silent) setIsAudioLoading(false);
        }
    }, [bookNames, strings, language, downloadedChapters, fetchWithRetry]);

    const downloadChapter = useCallback(async (bookIdx, chapIdx) => {
        if (!Capacitor.isNativePlatform()) {
            toast.error(strings?.audio?.download_native_only || 'Downloads are only available in the mobile app.');
            return;
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error(strings?.audio?.offline_error || 'No internet connection.');
            return;
        }

        const book = bookNames[bookIdx];
        if (!book) return;
        const chapter = chapIdx + 1;
        const locKey = buildLocKey(book, chapter);

        if (downloadedChapters[locKey]) {
            toast(strings?.audio?.already_downloaded || 'This chapter is already downloaded.');
            return;
        }
        if (downloadingRef.current[locKey]) return;
        downloadingRef.current[locKey] = true;

        try {
            const data = await fetchAudioData(bookIdx, chapIdx);
            if (!data || data.url.startsWith('file://')) {
                downloadingRef.current[locKey] = false;
                return;
            }

            setDownloadProgress(prev => ({ ...prev, [locKey]: 0 }));
            await Filesystem.mkdir({ path: 'audio', directory: Directory.Data, recursive: true }).catch(() => {});

            const base64Data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', data.url, true);
                xhr.responseType = 'blob';
                xhr.onprogress = (evt) => {
                    if (evt.lengthComputable) {
                        const pct = Math.round((evt.loaded / evt.total) * 100);
                        setDownloadProgress(prev => ({ ...prev, [locKey]: pct }));
                    }
                };
                xhr.onload = () => {
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error(`Download failed with status ${xhr.status}`));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(xhr.response);
                };
                xhr.onerror = () => reject(new Error('Network error during download'));
                xhr.send();
            });

            await Filesystem.writeFile({
                path: `audio/${locKey}.mp3`,
                data: base64Data,
                directory: Directory.Data
            });

            const newDownloads = { ...downloadedChapters, [locKey]: true };
            setDownloadedChapters(newDownloads);
            await Preferences.set({ key: 'downloaded_audio', value: JSON.stringify(newDownloads) });
            await Preferences.set({ key: `times_${locKey}`, value: JSON.stringify(data.times) });

            toast.success(strings?.audio?.download_success || 'Download complete.');
        } catch (e) {
            console.error("Download Error:", e);
            toast.error(strings?.audio?.download_failed || 'Download failed. Please try again.');
        } finally {
            setDownloadProgress(prev => {
                const next = { ...prev };
                delete next[locKey];
                return next;
            });
            downloadingRef.current[locKey] = false;
        }
    }, [bookNames, downloadedChapters, fetchAudioData, strings]);

    const deleteDownload = useCallback(async (bookIdx, chapIdx) => {
        const book = bookNames[bookIdx];
        if (!book) return;
        const locKey = `${book.book_id}-${chapIdx + 1}`;
        try {
            await Filesystem.deleteFile({ path: `audio/${locKey}.mp3`, directory: Directory.Data });
            const newDownloads = { ...downloadedChapters };
            delete newDownloads[locKey];
            setDownloadedChapters(newDownloads);
            await Preferences.set({ key: 'downloaded_audio', value: JSON.stringify(newDownloads) });
            await Preferences.remove({ key: `times_${locKey}` }).catch(() => {});
            toast.success(strings?.audio?.delete_success || 'Download removed.');
        } catch (e) {
            console.error(e);
            toast.error(strings?.audio?.delete_failed || 'Could not remove download.');
        }
    }, [bookNames, downloadedChapters, strings]);

    // --- تسجيل دوال التنقل من الشاشة (الملّاحة الحقيقية + النظرة المسبقة الهادئة) ---
    const registerNavigationCallback = useCallback((fn) => {
        setNavigationCallbackState(() => fn);
    }, []);

    const registerPeekNavigationCallback = useCallback((fn) => {
        setPeekNavigationCallbackState(() => fn);
    }, []);

    const goToChapter = useCallback(async (direction, forceOpen = false) => {
        const myToken = ++requestTokenRef.current;
        let target = null;

        if (navigationCallback) {
            target = navigationCallback(direction);
        } else {
            const { bookIdx, chapIdx } = currentLocationRef.current;
            if (bookIdx === -1 || !bibleData) return;

            let bIdx = bookIdx;
            let cIdx = chapIdx + direction;
            const currentBookChapters = bibleData[bIdx]?.chapters || [];

            if (cIdx < 0 || cIdx >= currentBookChapters.length) {
                if (direction > 0 && bIdx < bookNames.length - 1) {
                    bIdx++; cIdx = 0;
                } else if (direction < 0 && bIdx > 0) {
                    bIdx--;
                    cIdx = (bibleData[bIdx]?.chapters?.length || 1) - 1;
                } else {
                    return;
                }
            }
            target = { bookIdx: bIdx, chapIdx: cIdx };
        }

        if (!target) return;

        const data = await fetchAudioData(target.bookIdx, target.chapIdx);

        // FIX #A4: لو المستخدم دوس تنقل تاني قبل ما الطلب ده يخلص، نتجاهل النتيجة القديمة
        if (myToken !== requestTokenRef.current) return;

        if (data) playTrack(data.url, data.title, data.times, target.bookIdx, target.chapIdx, forceOpen, { allowResume: false });
    }, [navigationCallback, bibleData, bookNames, fetchAudioData, playTrack]);

    // FIX #A8: prefetch هادئ للإصحاح الجاي في الخلفية أول ما التشغيل الحالي يبدأ،
    // عشان لما يخلص المقطع ويحصل autoplay يبقى الطلب جاهز فورًا من غير أي تأخير محسوس.
    useEffect(() => {
        if (!isPlaying || !peekNavigationCallback) return;
        let cancelled = false;

        const doPrefetch = async () => {
            const target = peekNavigationCallback(1);
            if (!target || cancelled) return;
            const book = bookNames[target.bookIdx];
            if (!book) return;
            const locKey = buildLocKey(book, target.chapIdx + 1);
            if (prefetchCacheRef.current[locKey] || downloadedChapters[locKey]) return;

            const data = await fetchAudioData(target.bookIdx, target.chapIdx, { silent: true });
            if (data && !cancelled) {
                prefetchCacheRef.current[locKey] = { data, time: Date.now() };
            }
        };

        const t = setTimeout(doPrefetch, 3000);
        return () => { cancelled = true; clearTimeout(t); };
    }, [isPlaying, currentLocation, peekNavigationCallback, bookNames, downloadedChapters, fetchAudioData]);

    useEffect(() => {
        const loadInitialData = async () => {
            const myToken = ++dataLoadTokenRef.current;
            try {
                const folder = FOLDER_MAP[language] || 'arabic';
                const fileName = BIBLE_FILE_MAP[language] || BIBLE_FILE_MAP.ar;

                const data = await languageManager.getFile(folder, fileName);

                if (myToken !== dataLoadTokenRef.current) return;

                if (!data) {
                    throw new Error(`Failed to load ${fileName}`);
                }

                setBibleData(data);
            } catch (e) {
                console.error("AudioContext Data Load Error:", e);
                if (myToken === dataLoadTokenRef.current && strings) setBibleData(strings);
            }
        };
        if (language) loadInitialData();
    }, [language, strings]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeed;
            audioRef.current.volume = volume;
        }
    }, [playbackSpeed, volume]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'mediaSession' in navigator && audioUrl) {
            const book = bookNames[currentLocation.bookIdx];
            const chapter = currentLocation.chapIdx + 1;
            const iconUrl = "https://agios-bible.vercel.app/images/agios.png";

            if ('MediaMetadata' in window) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: trackTitle || `${strings.common.chapter} ${chapter}`,
                    artist: book ? book.name : strings.audio.artist_default,
                    album: strings.audio.album,
                    artwork: [
                        { src: iconUrl, sizes: '192x192', type: 'image/png' },
                        { src: iconUrl, sizes: '512x512', type: 'image/png' },
                    ]
                });
            }

            const handlers = {
                play: () => audioRef.current?.play().catch(() => {}),
                pause: () => audioRef.current?.pause(),
                stop: () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } },
                previoustrack: () => goToChapter(-1),
                nexttrack: () => goToChapter(1),
                seekbackward: (details) => {
                    const skipTime = details?.seekOffset || 10;
                    if (audioRef.current) audioRef.current.currentTime -= skipTime;
                },
                seekforward: (details) => {
                    const skipTime = details?.seekOffset || 10;
                    if (audioRef.current) audioRef.current.currentTime += skipTime;
                },
                seekto: (details) => {
                    if (details?.seekTime !== undefined && audioRef.current) {
                        audioRef.current.currentTime = details.seekTime;
                    }
                }
            };

            Object.entries(handlers).forEach(([action, handler]) => {
                try {
                    navigator.mediaSession.setActionHandler(action, handler);
                } catch (e) {}
            });

            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }

        // FIX #A9: تنضيف الميديا سيشن لما ما يبقاش فيه صوت شغال، عشان ميفضلش زرار
        // "السابق/التالي" في شاشة القفل شغال على تراك اتشال بالفعل.
        return () => {
            if (typeof window !== 'undefined' && 'mediaSession' in navigator && !audioUrl) {
                try {
                    ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'].forEach(a => {
                        navigator.mediaSession.setActionHandler(a, null);
                    });
                } catch (e) {}
            }
        };
    }, [audioUrl, trackTitle, currentLocation, bookNames, goToChapter, strings, isPlaying]);

    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play().catch(() => {
            toast.error(strings?.audio?.playback_error || 'Could not play audio.');
        });
    }, [isPlaying, strings]);

    const handleTimeUpdate = () => {
        if (!audioRef.current) return;
        const curTime = audioRef.current.currentTime;
        setCurrentTime(curTime);

        // حفظ الموضع بشكل مقتصد (مش كل tick) عشان منضربش الـ storage كتير
        const { bookIdx, chapIdx } = currentLocationRef.current;
        const book = bookNames[bookIdx];
        if (book && curTime - lastSavedPositionRef.current >= POSITION_SAVE_INTERVAL) {
            lastSavedPositionRef.current = curTime;
            savePlaybackPosition(buildLocKey(book, chapIdx + 1), curTime);
        }

        const currentTimes = timestampsRef.current;
        if (isHighlightEnabled && currentTimes.length > 0) {
            let activeTs = null;
            for (let i = 0; i < currentTimes.length; i++) {
                if (curTime >= currentTimes[i].startTime) activeTs = currentTimes[i];
                else break;
            }
            if (activeTs && activeTs.vId !== String(currentVerseId)) {
                setCurrentVerseId(activeTs.vId);
            } else if (!activeTs && currentVerseId !== -1) {
                setCurrentVerseId(-1);
            }
        }
    };

    // FIX #A6: بعد ما الميتاداتا تحمّل، نجرب نرجع لآخر موضع كان المستخدم واقف عنده
    // في نفس الإصحاح (مش في حالة التنقل التلقائي للإصحاح الجاي).
    const handleLoadedMetadata = async (e) => {
        const dur = e.target.duration;
        setDuration(dur);
        setIsBuffering(false);

        if (!resumeAllowedRef.current) return;
        const { bookIdx, chapIdx } = currentLocationRef.current;
        const book = bookNames[bookIdx];
        if (!book || !dur) return;

        try {
            const { value } = await Preferences.get({ key: `pos_${buildLocKey(book, chapIdx + 1)}` });
            const savedPos = value ? parseFloat(value) : 0;
            if (savedPos > RESUME_MIN_OFFSET && savedPos < dur - RESUME_MIN_OFFSET && audioRef.current) {
                audioRef.current.currentTime = savedPos;
            }
        } catch (err) {
            // تجاهل بهدوء - مش سبب كافي لوقف التشغيل
        }
    };

    const handleAudioError = () => {
        setIsBuffering(false);
        console.error("Audio element error", audioRef.current?.error);
        toast.error(strings?.audio?.playback_error || 'Could not play audio.');
    };

    const handleEnded = () => {
        // نمسح موضع الاستئناف المحفوظ للإصحاح اللي خلص، عشان ما يفضلش يرجّع نفس النقطة تاني
        const { bookIdx, chapIdx } = currentLocationRef.current;
        const book = bookNames[bookIdx];
        if (book) Preferences.remove({ key: `pos_${buildLocKey(book, chapIdx + 1)}` }).catch(() => {});

        if (isRepeat) {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
            }
        } else if (isAutoPlay) {
            setIsAutoNext(true);
            goToChapter(1, false);
        }
    };

    // --- مؤقت النوم ---
    const startSleepTimer = useCallback((minutes) => {
        if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);

        if (!minutes || minutes <= 0) {
            setSleepTimer(null);
            setTimeLeft(null);
            return;
        }

        setSleepTimer(minutes);
        setTimeLeft(minutes * 60);

        sleepIntervalRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(sleepIntervalRef.current);
                    sleepIntervalRef.current = null;
                    if (audioRef.current) audioRef.current.pause();
                    setSleepTimer(null);
                    toast(strings?.audio?.sleep_timer_ended || 'Sleep timer ended.');
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    }, [strings]);

    const cancelSleepTimer = useCallback(() => {
        if (sleepIntervalRef.current) {
            clearInterval(sleepIntervalRef.current);
            sleepIntervalRef.current = null;
        }
        setSleepTimer(null);
        setTimeLeft(null);
    }, []);

    const contextValue = useMemo(() => ({
        audioUrl, isPlaying, currentTime, duration, playbackSpeed, isPanelOpen, trackTitle, currentVerseId,
        isRepeat, isAutoPlay, volume, isHighlightEnabled, sleepTimer, timeLeft, currentLocation, bookNames, isAutoNext, isAudioLoading,
        isBuffering,
        downloadedChapters, downloadProgress,
        setIsPanelOpen, playTrack, togglePlay, seek: (t) => { if(audioRef.current) audioRef.current.currentTime = t; },
        skip: (amt) => { if(audioRef.current) audioRef.current.currentTime += amt; },
        setPlaybackSpeed: setPlaybackSpeedPersisted,
        setVolume,
        setTimestamps: (t) => {
            const p = processTimestamps(t);
            timestampsRef.current = p;
            setTimestamps(p);
        },
        fetchAudioData,
        downloadChapter,
        deleteDownload,
        setIsRepeat, setIsAutoPlay, setIsHighlightEnabled,
        // مؤقت النوم: الدوال الجديدة الشغالة فعليًا
        startSleepTimer,
        cancelSleepTimer,
        // aliases قديمة، محتفظ بيها لأي كود تاني بينده عليها مباشرة
        setSleepTimer: startSleepTimer,
        setTimeLeft,
        setNavigationCallback: registerNavigationCallback,
        registerNavigationCallback,
        registerPeekNavigationCallback,
        goToChapter
    }), [
        audioUrl, isPlaying, currentTime, duration, playbackSpeed, isPanelOpen, trackTitle, currentVerseId,
        isRepeat, isAutoPlay, volume, isHighlightEnabled, sleepTimer, timeLeft, currentLocation, bookNames, isAutoNext, isAudioLoading,
        isBuffering, downloadedChapters, downloadProgress,
        playTrack, togglePlay, goToChapter, processTimestamps, fetchAudioData, downloadChapter, deleteDownload,
        registerNavigationCallback, registerPeekNavigationCallback, setPlaybackSpeedPersisted, setVolume,
        startSleepTimer, cancelSleepTimer
    ]);

    return (
        <AudioContext.Provider value={contextValue}>
            {children}
            <audio
                ref={audioRef}
                preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => setIsBuffering(false)}
                onCanPlay={() => setIsBuffering(false)}
                onError={handleAudioError}
                onEnded={handleEnded}
            />
        </AudioContext.Provider>
    );
}

export const useAudio = () => useContext(AudioContext);