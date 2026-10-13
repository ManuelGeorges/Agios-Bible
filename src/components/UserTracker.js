'use client';

import { useEffect, useRef, useState } from 'react';
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
  const activityCopyRef = useRef({ strings, language });
  activityCopyRef.current = { strings, language };

  useEffect(() => {
    const trackActivity = async (user) => {
      try {
        const { strings: activeStrings, language: activeLanguage } = activityCopyRef.current;
        const today = getCairoDate();
        let nativeStats = null;

        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const userName = user.displayName || activeStrings.common.default_first_name;

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
            nativeStats = { streak: 1, points: 10 };
            setStreakCelebration({ streak: 1, rewardPoints: 10 });
            await StorageService.updateStreak(1);
            await StorageService.save('agios_last_active', today);
          } else {
            const userData = userSnap.data();
            nativeStats = { streak: userData.streak || 0, points: userData.totalPoints || 0 };
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
                3: { id: 'streak_3', name: activeLanguage === 'ar' ? 'المواظب المبتدئ (3 أيام)' : 'Beginner Diligent (3 days)' },
                7: { id: 'streak_7', name: activeLanguage === 'ar' ? 'المجتهد (أسبوع)' : 'Hardworking (Week)' },
                15: { id: 'streak_15', name: activeLanguage === 'ar' ? 'المثابر (15 يوم)' : 'Perserverant (15 days)' },
                30: { id: 'streak_30', name: activeLanguage === 'ar' ? 'الوفي (شهر)' : 'Loyal (Month)' },
                90: { id: 'streak_90', name: activeLanguage === 'ar' ? 'الأسطورة (3 شهور)' : 'Legend (3 months)' }
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
                toast(activeStrings.shop?.use_freeze_toast || "تم استخدام تجميد الستريك لحمايتك! ❄️", { icon: '❄️' });
              }

              if (streakMilestones[newStreak] && !userData.badges?.includes(streakMilestones[newStreak].id)) {
                updates.badges = arrayUnion(streakMilestones[newStreak].id);
                toast.success(activeStrings.home.toasts.badge_unlocked.replace('{badgeName}', streakMilestones[newStreak].name), { icon: '🔥' });
              }

              await updateDoc(userRef, updates);
              nativeStats = { streak: newStreak, points: nativeStats.points + 10 + bonusPoints };
              setStreakCelebration({ streak: newStreak, rewardPoints: 10 + bonusPoints });
              await StorageService.updateStreak(newStreak);
              await StorageService.save('agios_last_active', today);

            } else {
              await StorageService.save('agios_last_active', today);
            }
          }
        } else {
          // المنطق المحلي للضيوف (Local First)
          const [localStreak, localFreezes, lastActive, localPoints] = await Promise.all([
            StorageService.get(KEYS.STREAK),
            StorageService.get(KEYS.STREAK_FREEZES),
            StorageService.get(KEYS.LAST_ACTIVE),
            StorageService.get(KEYS.POINTS)
          ]);
          nativeStats = { streak: localStreak || 0, points: localPoints || 0 };

          if (lastActive !== today) {
            let newStreak = (localStreak || 0) + 1;
            let usedFreeze = false;

            if (lastActive) {
              const diffDays = calculateDiffDays(lastActive, today);
              if (diffDays > 1) {
                // محاولة استخدام التجميد المحلي للضيف
                const currentFreezes = localFreezes || 0;
                if (currentFreezes > 0) {
                  newStreak = (localStreak || 0) + 1;
                  usedFreeze = true;
                } else {
                  newStreak = 1;
                }
              }
            }

            setStreakCelebration({ streak: newStreak, rewardPoints: 10 });
            nativeStats = { streak: newStreak, points: (localPoints || 0) + 10 };
            const timestamp = getCairoIsoString();
            const recordDailyPoints = async () => {
              const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
              history.push({
                type: 'dailyLogin',
                points: 10,
                reason: activeStrings.points?.points_reasons?.daily_login || 'Daily login',
                timestamp
              });
              await StorageService.save(KEYS.POINTS_HISTORY, history);
            };
            const persistenceTasks = [
              StorageService.updateStreak(newStreak),
              StorageService.save(KEYS.LAST_ACTIVE, today),
              StorageService.addPoints(10),
              recordDailyPoints()
            ];
            if (usedFreeze) persistenceTasks.push(StorageService.save(KEYS.STREAK_FREEZES, (localFreezes || 0) - 1));
            await Promise.all(persistenceTasks);

            if (usedFreeze) {
              toast(activeStrings.shop?.use_freeze_toast || "تم استخدام تجميد الستريك لحمايتك! ❄️", { icon: '❄️' });
            }
          }
        }

        if (Capacitor.isNativePlatform() && window.AgiosScannerNative?.updateUserStats) {
          window.AgiosScannerNative.updateUserStats(nativeStats?.streak || 0, null, nativeStats?.points || 0);
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
  }, []);

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
