"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, Pause, X, RotateCcw, RotateCw, SkipBack, SkipForward,
    Settings, Repeat, ListEnd, Volume2, Volume1, VolumeX, Highlighter,
    Moon, ArrowRight, Download, Trash2, Loader2, CheckCircle
} from 'lucide-react';
import { useAudio } from '../app/context/AudioContext';
import styles from './GlobalAudioPlayer.module.css';
import { useLanguage } from '../app/context/LanguageContext';
import { Capacitor } from '@capacitor/core';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [15, 30, 60];

export default function GlobalAudioPlayer() {
    const { strings, dir } = useLanguage();
    const {
        isPlaying, currentTime, duration, playbackSpeed, isPanelOpen, trackTitle,
        isRepeat, isAutoPlay, volume, isHighlightEnabled, sleepTimer, timeLeft,
        currentLocation, bookNames, isAudioLoading, isBuffering,
        downloadedChapters, downloadProgress,
        setIsPanelOpen, togglePlay, seek, skip, setPlaybackSpeed, goToChapter,
        setIsRepeat, setIsAutoPlay, setVolume, setIsHighlightEnabled,
        startSleepTimer, cancelSleepTimer,
        downloadChapter, deleteDownload
    } = useAudio();

    const [showSettings, setShowSettings] = useState(false);

    if (!isPanelOpen) return null;

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds === null) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercent = (currentTime / duration) * 100 || 0;
    const iconStyle = dir === 'rtl' ? { transform: 'scaleX(-1)' } : {};

    // FIX: كان بيبني المعرّف من رقم ترتيب السفر (bookIdx) بدل الـ book_id الحقيقي،
    // فكان أبدًا ما يطابق المفاتيح اللي AudioContext بيحفظها (${book_id}-${chapter})،
    // فكانت حالة "متاح أوفلاين" غلط دايمًا. دلوقتي بنستخدم book_id الصح.
    const currentBook = bookNames?.[currentLocation.bookIdx];
    const locKey = currentBook ? `${currentBook.book_id}-${currentLocation.chapIdx + 1}` : null;
    const isDownloaded = !!(locKey && downloadedChapters[locKey]);
    const downloadPct = locKey ? downloadProgress[locKey] : undefined;
    const isDownloading = downloadPct !== undefined;

    const handleDownloadClick = () => {
        if (!locKey) return;
        if (isDownloaded) {
            if (window.confirm(strings.common.confirm_delete || "هل تريد حذف هذا الملف؟")) {
                deleteDownload(currentLocation.bookIdx, currentLocation.chapIdx);
            }
        } else {
            downloadChapter(currentLocation.bookIdx, currentLocation.chapIdx);
        }
    };

    const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    return (
        <AnimatePresence>
            {isPanelOpen && (
                <>
                    {/* خلفية شفافة خفيفة - دوسة برا اللوحة تقفلها بدون ما توقف الصوت */}
                    <motion.div
                        className={styles.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsPanelOpen(false)}
                    />

                    <motion.div
                        className={styles.audioPanel}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        dir={dir}
                    >
                        <div className={styles.grabber} />

                        {/* FIX الأساسي: قبل كده كانت لوحة الإعدادات .settingsMenu بتتحط
                            position:absolute فوق نفس محتوى المشغّل (الهيدر/البروجرس/الأزرار)
                            من غير ما تشيله من الشاشة. أي شفافية بسيطة في خلفية الكارت كانت
                            كافية إن المحتوى القديم يظهر خلالها ويحصل تراكب/تزاحم بين العناصر.
                            دلوقتي الاتنين "فيوهات" منفصلة تمامًا وبيتم عرض واحدة بس في كل لحظة
                            (AnimatePresence mode="wait")، فمفيش أي احتمال تراكب تاني. */}
                        <AnimatePresence mode="wait" initial={false}>
                            {showSettings ? (
                                <motion.div
                                    key="settings"
                                    className={styles.viewWrapper}
                                    initial={{ opacity: 0, x: dir === 'rtl' ? -16 : 16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: dir === 'rtl' ? -16 : 16 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <div className={styles.panelHeader}>
                                        <button
                                            className={styles.iconBtn}
                                            onClick={() => setShowSettings(false)}
                                            aria-label="back"
                                        >
                                            <ArrowRight size={18} style={iconStyle} />
                                        </button>
                                        <span className={styles.panelHeaderTitle}>
                                            {strings.components.audio_player.settings}
                                        </span>
                                        <button className={styles.iconBtn} onClick={() => setIsPanelOpen(false)}>
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className={styles.settingsBody}>
                                        <div className={styles.settingItem}>
                                            <div className={styles.settingLabel}>
                                                <VolumeIcon size={16} />
                                                <span>{strings.components.audio_player.volume}</span>
                                                <span className={styles.volumeValue}>{Math.round(volume * 100)}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1" step="0.05"
                                                value={volume}
                                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                                className={styles.volumeSlider}
                                                style={{
                                                    background: `linear-gradient(to ${dir === 'rtl' ? 'left' : 'right'}, var(--color-accent) ${volume * 100}%, var(--color-border) ${volume * 100}%)`
                                                }}
                                            />
                                        </div>

                                        <div className={styles.optionsGrid}>
                                            <button
                                                className={`${styles.optionBtn} ${isRepeat ? styles.optionBtnActive : ''}`}
                                                onClick={() => setIsRepeat(!isRepeat)}
                                            >
                                                <Repeat size={18} />
                                                <span>{strings.components.audio_player.repeat}</span>
                                            </button>
                                            <button
                                                className={`${styles.optionBtn} ${isAutoPlay ? styles.optionBtnActive : ''}`}
                                                onClick={() => setIsAutoPlay(!isAutoPlay)}
                                            >
                                                <ListEnd size={18} />
                                                <span>{strings.components.audio_player.auto_play}</span>
                                            </button>
                                            <button
                                                className={`${styles.optionBtn} ${isHighlightEnabled ? styles.optionBtnActive : ''}`}
                                                onClick={() => setIsHighlightEnabled(!isHighlightEnabled)}
                                            >
                                                <Highlighter size={18} />
                                                <span>{strings.components.audio_player.highlight}</span>
                                            </button>
                                        </div>

                                        <div className={styles.sleepSection}>
                                            <div className={styles.settingLabel}>
                                                <Moon size={16} />
                                                <span>{strings.components.audio_player.sleep_timer || 'مؤقت النوم'}</span>
                                                {sleepTimer && timeLeft !== null && (
                                                    <span className={styles.sleepCountdown}>{formatTime(timeLeft)}</span>
                                                )}
                                            </div>
                                            <div className={styles.timerChips}>
                                                <button
                                                    className={`${styles.timerChip} ${!sleepTimer ? styles.activeChip : ''}`}
                                                    onClick={() => cancelSleepTimer()}
                                                >
                                                    {strings.components.audio_player.stop}
                                                </button>
                                                {SLEEP_OPTIONS.map(m => (
                                                    <button
                                                        key={m}
                                                        className={`${styles.timerChip} ${sleepTimer === m ? styles.activeChip : ''}`}
                                                        onClick={() => startSleepTimer(m)}
                                                    >
                                                        {`${m} ${strings.components.audio_player.minutes_short || 'د'}`}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="player"
                                    className={styles.viewWrapper}
                                    initial={{ opacity: 0, x: dir === 'rtl' ? 16 : -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: dir === 'rtl' ? 16 : -16 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <div className={styles.panelHeader}>
                                        <div className={styles.titleContainer}>
                                            <span className={styles.audioPanelTitle}>{trackTitle}</span>
                                            {isDownloaded && <CheckCircle size={14} color="#10b981" title="Offline" />}
                                        </div>
                                        <div className={styles.headerActions}>
                                            {Capacitor.isNativePlatform() && (
                                                <button
                                                    className={`${styles.iconBtn} ${isDownloaded ? styles.downloaded : ''}`}
                                                    onClick={handleDownloadClick}
                                                    disabled={isDownloading}
                                                    title={isDownloading ? `${downloadPct}%` : undefined}
                                                >
                                                    {isDownloading ? (
                                                        <Loader2 size={18} className={styles.spinning} />
                                                    ) : isDownloaded ? (
                                                        <Trash2 size={18} color="#ef4444" />
                                                    ) : (
                                                        <Download size={18} />
                                                    )}
                                                </button>
                                            )}
                                            <button className={styles.iconBtn} onClick={() => setShowSettings(true)}>
                                                <Settings size={18} />
                                            </button>
                                            <button className={styles.iconBtn} onClick={() => setIsPanelOpen(false)}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    {isDownloading && (
                                        <div className={styles.downloadProgressTrack}>
                                            <div className={styles.downloadProgressFill} style={{ width: `${downloadPct}%` }} />
                                        </div>
                                    )}

                                    <div className={styles.progressBarContainer}>
                                        <input
                                            type="range" min="0" max={duration || 0} step="0.1"
                                            value={currentTime}
                                            onChange={(e) => seek(parseFloat(e.target.value))}
                                            className={styles.progressBar}
                                            style={{ background: `linear-gradient(to ${dir === 'rtl' ? 'left' : 'right'}, var(--color-accent) ${progressPercent}%, var(--color-border) ${progressPercent}%)` }}
                                        />
                                        <div className={styles.timeDisplay}>
                                            <span className={styles.elapsedTime}>{formatTime(currentTime)}</span>
                                            <span className={styles.totalTime}>{formatTime(duration)}</span>
                                        </div>
                                    </div>

                                    <div className={styles.audioMainControls}>
                                        <button className={styles.panelBtn} onClick={() => goToChapter(-1)}>
                                            <SkipBack size={22} style={iconStyle} />
                                        </button>

                                        <button className={styles.panelBtn} onClick={() => skip(-10)}>
                                            <RotateCcw size={22} style={iconStyle} />
                                        </button>

                                        <button className={styles.playPauseCircle} onClick={togglePlay}>
                                            {(isAudioLoading || isBuffering) ? (
                                                <Loader2 size={26} className={styles.spinning} />
                                            ) : isPlaying ? (
                                                <Pause size={28} fill="white" />
                                            ) : (
                                                <Play size={28} fill="white" style={{ [dir === 'rtl' ? 'marginRight' : 'marginLeft']: '3px' }} />
                                            )}
                                        </button>

                                        <button className={styles.panelBtn} onClick={() => skip(10)}>
                                            <RotateCw size={22} style={iconStyle} />
                                        </button>

                                        <button className={styles.panelBtn} onClick={() => goToChapter(1)}>
                                            <SkipForward size={22} style={iconStyle} />
                                        </button>
                                    </div>

                                    <div className={styles.speedSelector}>
                                        {SPEED_OPTIONS.map(speed => (
                                            <button
                                                key={speed}
                                                className={`${styles.speedChip} ${playbackSpeed === speed ? styles.speedChipActive : ''}`}
                                                onClick={() => setPlaybackSpeed(speed)}
                                            >
                                                {speed}x
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}