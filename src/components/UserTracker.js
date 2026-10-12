'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, increment, arrayUnion, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { getCairoDate, getCairoIsoString } from '../lib/dateUtils';
import { Capacitor } from '@capacitor/core';
import { StorageService, KEYS } from '../lib/storage';
import { useLanguage } from '../app/context/LanguageContext';
import StreakCelebration from './StreakCelebration/StreakCelebration';

const auth = typeof window !== 'undefined' ? getAuth() : null;

export default function UserTracker() {
  const { strings, language } = useLanguage();
  const [streakCelebration, setStreakCelebration] = useState(null);

  useEffect(() => {
    const trackActivity = async (user) => {
      try {
        const today = getCairoDate();

        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const userName = user.displayName || strings.common.default_first_name;

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: userName,
              email: user.email,
              photoURL: user.photoURL,
              streak: 1,
              lastActiveDate: today,
              totalPoints: 10,
              dailyInteractionPoints: 0,
              badges: [],
              streakFreezes: 0,
              inventory: [],
              createdAt: serverTimestamp(),
              favorites: { verses: {} },
              completedChapters: {},
              completedPlans: {}
            });
            await StorageService.updateStreak(1);
            await StorageService.save('agios_last_active', today);
            setStreakCelebration({ streak: 1, rewardPoints: 10 });
          } else {
            const userData = userSnap.data();
            const lastActive = userData.lastActiveDate || userData.lastLoginDate;

            if (lastActive !== today) {
              let newStreak = (userData.streak || 0) + 1;
              let usedFreeze = false;

              if (lastActive) {
                const diffDays = calculateDiffDays(lastActive, today);

                if (diffDays > 1) {
                  // محاولة استخدام تجميد الستريك إذا وجد (للمسجلين)
                  if (userData.streakFreezes > 0) {
                    newStreak = (userData.streak || 0) + 1;
                    usedFreeze = true;
                  } else {
                    newStreak = 1;
                  }
                }
              }

              const streakBonuses = { 3: 50, 7: 150, 15: 400, 30: 1000, 90: 3000 };
              let bonusPoints = streakBonuses[newStreak] || 0;

              const streakMilestones = {
                3: { id: 'streak_3', name: language === 'ar' ? 'المواظب المبتدئ (3 أيام)' : 'Beginner Diligent (3 days)' },
                7: { id: 'streak_7', name: language === 'ar' ? 'المجتهد (أسبوع)' : 'Hardworking (Week)' },
                15: { id: 'streak_15', name: language === 'ar' ? 'المثابر (15 يوم)' : 'Perserverant (15 days)' },
                30: { id: 'streak_30', name: language === 'ar' ? 'الوفي (شهر)' : 'Loyal (Month)' },
                90: { id: 'streak_90', name: language === 'ar' ? 'الأسطورة (3 شهور)' : 'Legend (3 months)' }
              };

              let updates = {
                lastActiveDate: today,
                lastLoginDate: today,
                streak: newStreak,
                totalPoints: increment(10 + bonusPoints),
                dailyInteractionPoints: 0
              };

              if (usedFreeze) {
                updates.streakFreezes = increment(-1);
                toast(strings.shop?.use_freeze_toast || "تم استخدام تجميد الستريك لحمايتك! ❄️", { icon: '❄️' });
              }

              if (streakMilestones[newStreak] && !userData.badges?.includes(streakMilestones[newStreak].id)) {
                updates.badges = arrayUnion(streakMilestones[newStreak].id);
                toast.success(strings.home.toasts.badge_unlocked.replace('{badgeName}', streakMilestones[newStreak].name), { icon: '🔥' });
              }

              await updateDoc(userRef, updates);
              await StorageService.updateStreak(newStreak);
              await StorageService.save('agios_last_active', today);
              setStreakCelebration({ streak: newStreak, rewardPoints: 10 + bonusPoints });

            } else {
              await StorageService.save('agios_last_active', today);
            }
          }
        } else {
          // المنطق المحلي للضيوف (Local First)
          const localStats = await StorageService.getLocalStats();
          const lastActive = await StorageService.get('agios_last_active');

          if (lastActive !== today) {
            let newStreak = (localStats.streak || 0) + 1;
            let usedFreeze = false;

            if (lastActive) {
              const diffDays = calculateDiffDays(lastActive, today);
              if (diffDays > 1) {
                // محاولة استخدام التجميد المحلي للضيف
                const currentFreezes = localStats.streakFreezes || 0;
                if (currentFreezes > 0) {
                  newStreak = (localStats.streak || 0) + 1;
                  usedFreeze = true;
                  await StorageService.save(KEYS.STREAK_FREEZES, currentFreezes - 1);
                } else {
                  newStreak = 1;
                }
              }
            }

            await StorageService.updateStreak(newStreak);
            await StorageService.save('agios_last_active', today);
            await StorageService.addPoints(10);

            const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
            history.push({
              type: 'dailyLogin',
              points: 10,
              reason: strings.points?.points_reasons?.daily_login || 'Daily login',
              timestamp: getCairoIsoString()
            });
            await StorageService.save(KEYS.POINTS_HISTORY, history);
            setStreakCelebration({ streak: newStreak, rewardPoints: 10 });

            if (usedFreeze) {
              toast(strings.shop?.use_freeze_toast || "تم استخدام تجميد الستريك لحمايتك! ❄️", { icon: '❄️' });
            }
          }
        }

        if (Capacitor.isNativePlatform() && window.AgiosScannerNative?.updateUserStats) {
          const userData = user ? (await getDoc(doc(db, 'users', user.uid))).data() : null;
          const currentStreak = userData ? userData.streak : (await StorageService.get(KEYS.STREAK));
          const currentPoints = userData ? (userData.totalPoints || 0) : (await StorageService.getLocalStats()).points;

          window.AgiosScannerNative.updateUserStats(currentStreak || 0, null, currentPoints || 0);
        }

      } catch (error) {
        console.error("Tracker Error:", error);
      }
    };

    const calculateDiffDays = (lastDate, today) => {
      if (!lastDate || !today) return 0;
      const lastParts = lastDate.split('-').map(Number);
      const todayParts = today.split('-').map(Number);
      const lastDateObj = new Date(lastParts[0], lastParts[1] - 1, lastParts[2]);
      const todayDateObj = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

      const diffTime = todayDateObj.getTime() - lastDateObj.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    };

    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, trackActivity);
    return () => unsubscribe();
  }, [strings, language]);

  return (
    <AnimatePresence>
      {streakCelebration && (
        <StreakCelebration
          key={`${streakCelebration.streak}-${streakCelebration.rewardPoints}`}
          streak={streakCelebration.streak}
          rewardPoints={streakCelebration.rewardPoints}
          onClose={() => setStreakCelebration(null)}
        />
      )}
    </AnimatePresence>
  );
}
