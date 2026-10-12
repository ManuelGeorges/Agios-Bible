'use client';

import React, { useEffect } from 'react';
import styles from './BadgeUnlockModal.module.css';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Share2, Trophy, ArrowRight, Flame, BookOpen, BrainCircuit, Target, MapPin, Heart, Zap, Lock, CalendarCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../../app/context/LanguageContext';

const BadgeUnlockModal = ({ badge, onClose }) => {
  const router = useRouter();
  const { strings, dir } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const badgeId = badge?.id || '';
  const IconComponent = badgeId.startsWith('streak_') ? Flame
    : /^(reader_|testament_|bible_)/.test(badgeId) ? BookOpen
    : /^(quiz_|scholar_)/.test(badgeId) ? BrainCircuit
    : badgeId.startsWith('plan_') ? CalendarCheck
    : badgeId.startsWith('map_') ? MapPin
    : badgeId.startsWith('favorite_') ? Heart
    : badgeId.startsWith('accuracy_') ? Target
    : badgeId.startsWith('secret_') ? Lock
    : badgeId.startsWith('tech_') ? Zap
    : Trophy;

  const rarity = String(badge?.rarity || '').toLowerCase();
  const rarityClass = /عادي|common|commun|gewöhnlich/.test(rarity) ? 'common'
    : /مميز|uncommon|peu commun|ungewöhnlich/.test(rarity) ? 'uncommon'
    : /نادر|rare|selten/.test(rarity) ? 'rare'
    : /أسطوري|epic|épique|episch/.test(rarity) ? 'epic'
    : /خرافي|mythic|mythique|mythisch/.test(rarity) ? 'mythic'
    : /سري|secret|geheim/.test(rarity) ? 'secret' : 'common';

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleShare = async () => {
    const text = strings.components.badges.share_text
      .replace('{badge}', badge.name)
      .replace('{req}', badge.requirement);

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: strings.components.badges.share_title,
          text: text,
          url: 'https://agios-bible.vercel.app/',
          dialogTitle: strings.components.badges.share_dialog,
        });
      } else if (navigator.share) {
        await navigator.share({
          title: strings.components.badges.share_title,
          text: text,
          url: 'https://agios-bible.vercel.app/'
        });
      }
    } catch (err) {
      console.log('Share error', err);
    }
  };

  if (!badge) return null;

  const particles = Array.from({ length: 24 }, (_, index) => ({
    angle: `${index * 15}deg`,
    distance: `${82 + (index % 4) * 12}px`,
    color: ['#ffd166', '#66e3c4', '#8b7cff', '#ff78a8', '#ffffff'][index % 5],
    delay: `${(index % 6) * 0.025}s`,
  }));

  return (
    <motion.div
      className={styles.overlay}
      dir={dir}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0.01 : 0.25 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-unlock-title"
        aria-describedby="badge-unlock-description"
        initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.78, y: 42, opacity: 0, rotateX: -10 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1, rotateX: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0.92, y: 20, opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 320, damping: 22, mass: 0.85 }}
        className={styles.modal}
      >
        <div className={styles.topShine} />
        <button className={styles.closeBtn} onClick={onClose} aria-label={strings.common?.close || 'Close'}>
          <X size={20} />
        </button>

        <motion.div
          className={styles.celebrationText}
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.16, duration: shouldReduceMotion ? 0.01 : 0.35 }}
        >
          <Sparkles size={18} />
          {strings.components.badges.congrats}
          <Sparkles size={18} />
        </motion.div>

        <div className={styles.badgeDisplay}>
          <div className={styles.badgeStage}>
            <div className={styles.rays} />
            {!shouldReduceMotion && particles.map((particle, index) => (
              <span
                key={index}
                className={styles.particle}
                style={{
                  '--particle-angle': particle.angle,
                  '--particle-distance': particle.distance,
                  '--particle-color': particle.color,
                  '--particle-delay': particle.delay,
                }}
              />
            ))}
            <motion.div
              className={styles.iconWrapper}
              initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.15, rotate: -32, y: 24 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { scale: [0.15, 1.18, 0.92, 1], rotate: [-32, 8, -4, 0], y: [24, -8, 3, 0] }}
              transition={shouldReduceMotion ? { duration: 0.01 } : { delay: 0.2, duration: 0.9, times: [0, 0.55, 0.78, 1], ease: 'easeOut' }}
            >
              <div className={styles.glow} />
              <div className={styles.iconInner}><IconComponent size={54} strokeWidth={1.7} /></div>
            </motion.div>
          </div>
          <motion.div
            className={`${styles.rarityTag} ${styles[`rarity_${rarityClass}`]}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.72, type: 'spring', stiffness: 450, damping: 18 }}
          >
            <Sparkles size={13} />
            {badge.rarity}
          </motion.div>
          <motion.h2
            id="badge-unlock-title"
            className={styles.badgeName}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.78, duration: shouldReduceMotion ? 0.01 : 0.32 }}
          >{badge.name}</motion.h2>
        </div>

        <motion.p
          id="badge-unlock-description"
          className={styles.description}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.88, duration: shouldReduceMotion ? 0.01 : 0.3 }}
        >{badge.requirement}</motion.p>

        <motion.div
          className={styles.actions}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.98, duration: shouldReduceMotion ? 0.01 : 0.32 }}
        >
          <button className={styles.primaryBtn} onClick={handleShare}>
            <Share2 size={20} /> {strings.components.badges.share_achievement}
          </button>
          <button className={styles.secondaryBtn} onClick={() => { router.push('/points'); onClose(); }}>
            {strings.components.badges.view_all} <ArrowRight size={20} />
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default BadgeUnlockModal;
