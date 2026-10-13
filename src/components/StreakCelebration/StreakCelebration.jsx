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
  const particles = Array.from({ length: 8 }, (_, index) => ({
    angle: `${index * (360 / 8)}deg`,
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
        transition={{ duration: shouldReduceMotion ? 0.01 : 0.16 }}
      >
        <motion.section
          className={styles.card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="streak-title"
          aria-describedby="streak-subtitle"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
          transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.glowTop} />
          <button className={styles.close} onClick={onClose} aria-label={strings.common?.close || 'Close'}>
            <X size={20} />
          </button>

          <div className={styles.eyebrow}>
            <Sparkles size={17} /> {copy.title} <Sparkles size={17} />
          </div>

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
              initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.82, y: 10 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { scale: [0.82, 1.04, 1], y: [10, -2, 0] }}
              transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.flameInner}><Flame size={72} strokeWidth={1.8} fill="currentColor" /></div>
            </motion.div>
            {!shouldReduceMotion && <div className={styles.fireLicks}><span /><span /><span /></div>}
          </div>

          <div className={styles.streakCount}>
            <span className={styles.number}>{formatNumber(streak)}</span>
            <span className={styles.dayLabel}>{copy.days}</span>
          </div>

          <h2 id="streak-title" className={styles.title}>{copy.headline}</h2>
          <p id="streak-subtitle" className={styles.subtitle}>{copy.subtitle}</p>

          {rewardPoints > 0 && (
              <div className={styles.reward}>
              <Zap size={18} fill="currentColor" />
              <span>{copy.reward}</span>
              <strong dir="ltr">+{formatNumber(rewardPoints)}</strong>
              </div>
          )}

          <motion.button
            className={styles.continue}
            onClick={onClose}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
          >{copy.continue}</motion.button>
        </motion.section>
      </motion.div>
  );
}
