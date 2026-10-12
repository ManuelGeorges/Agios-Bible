'use client';

import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame, X, Sparkles, Zap } from 'lucide-react';
import styles from './StreakCelebration.module.css';
import { useLanguage } from '../../app/context/LanguageContext';

const streakTranslations = {
  ar: {
    title: 'سلسلتك مشتعلة!',
    headline: 'أنت تبني عادة عظيمة!',
    subtitle: 'يوم جديد من الالتزام. استمر في رحلتك الروحية!',
    days: 'يوم ستريك',
    reward: 'مكافأة اليوم',
    continue: 'رائع، أكمل!',
  },
  en: {
    title: 'Your streak is on fire!',
    headline: "You're building an amazing habit!",
    subtitle: 'Another day of showing up. Keep your spiritual journey burning bright!',
    days: 'DAY STREAK',
    reward: "Today's reward",
    continue: 'Amazing, keep going!',
  },
  fr: {
    title: 'Votre série est en feu !',
    headline: 'Vous créez une belle habitude !',
    subtitle: 'Un jour de plus dans votre parcours spirituel. Continuez ainsi !',
    days: 'JOURS DE SÉRIE',
    reward: 'Récompense du jour',
    continue: 'Bravo, continuez !',
  },
  de: {
    title: 'Deine Serie brennt!',
    headline: 'Du baust eine großartige Gewohnheit auf!',
    subtitle: 'Ein weiterer Tag auf deinem geistlichen Weg. Bleib dran!',
    days: 'TAGE IN FOLGE',
    reward: 'Heutige Belohnung',
    continue: 'Großartig, weiter so!',
  },
};

export default function StreakCelebration({ streak, rewardPoints, onClose }) {
  const { strings, dir, language, formatNumber } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const copy = streakTranslations[language] || streakTranslations.en;
  const particles = Array.from({ length: 22 }, (_, index) => ({
    angle: `${index * (360 / 22)}deg`,
    distance: `${84 + (index % 5) * 13}px`,
    delay: `${(index % 7) * 0.035}s`,
    color: ['#fff4b5', '#ffd166', '#ff934f', '#ff5e62', '#ffdc78'][index % 5],
  }));

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
      <motion.div
        className={styles.overlay}
        dir={dir}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.01 : 0.25 }}
      >
        <motion.section
          className={styles.card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="streak-title"
          aria-describedby="streak-subtitle"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72, y: 44, rotateX: -12 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, rotateX: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 24 }}
          transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 280, damping: 20 }}
        >
          <div className={styles.glowTop} />
          <button className={styles.close} onClick={onClose} aria-label={strings.common?.close || 'Close'}>
            <X size={20} />
          </button>

          <motion.div
            className={styles.eyebrow}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.12 }}
          >
            <Sparkles size={17} /> {copy.title} <Sparkles size={17} />
          </motion.div>

          <div className={styles.fireStage}>
            <div className={styles.fireHalo} />
            <div className={styles.fireRing} />
            {!shouldReduceMotion && particles.map((particle, index) => (
              <i
                className={styles.ember}
                key={index}
                style={{
                  '--ember-angle': particle.angle,
                  '--ember-distance': particle.distance,
                  '--ember-delay': particle.delay,
                  '--ember-color': particle.color,
                }}
              />
            ))}
            <motion.div
              className={styles.flameBadge}
              initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.2, rotate: -24, y: 28 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { scale: [0.2, 1.2, 0.92, 1], rotate: [-24, 8, -3, 0], y: [28, -10, 4, 0] }}
              transition={shouldReduceMotion ? { duration: 0.01 } : { delay: 0.18, duration: 0.95, times: [0, 0.52, 0.78, 1], ease: 'easeOut' }}
            >
              <div className={styles.flameInner}><Flame size={72} strokeWidth={1.8} fill="currentColor" /></div>
            </motion.div>
            {!shouldReduceMotion && <div className={styles.fireLicks}><span /><span /><span /></div>}
          </div>

          <motion.div
            className={styles.streakCount}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={shouldReduceMotion ? { duration: 0.01 } : { delay: 0.62, type: 'spring', stiffness: 340, damping: 16 }}
          >
            <span className={styles.number}>{formatNumber(streak)}</span>
            <span className={styles.dayLabel}>{copy.days}</span>
          </motion.div>

          <motion.h2
            id="streak-title"
            className={styles.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.78, duration: 0.3 }}
          >{copy.headline}</motion.h2>
          <motion.p
            id="streak-subtitle"
            className={styles.subtitle}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.88, duration: 0.3 }}
          >{copy.subtitle}</motion.p>

          {rewardPoints > 0 && (
            <motion.div
              className={styles.reward}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.96, type: 'spring', stiffness: 300, damping: 18 }}
            >
              <Zap size={18} fill="currentColor" />
              <span>{copy.reward}</span>
              <strong>+{formatNumber(rewardPoints)}</strong>
            </motion.div>
          )}

          <motion.button
            className={styles.continue}
            onClick={onClose}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: shouldReduceMotion ? 0 : 1.04, duration: 0.3 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
          >{copy.continue}</motion.button>
        </motion.section>
      </motion.div>
  );
}
