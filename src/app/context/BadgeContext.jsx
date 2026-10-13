'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import BadgeUnlockModal from '../../components/BadgeUnlockModal/BadgeUnlockModal';
import { AnimatePresence } from 'framer-motion';
import { StorageService, KEYS } from '../../lib/storage';
import { useLanguage } from './LanguageContext';

// استيراد بيانات الأوسمة مباشرة من المسار الجديد في src/app/data
import badgesAr from '../data/translations/arabic/badges_ar.json';
import badgesEn from '../data/translations/English/badges_en.json';
import badgesFr from '../data/translations/French/badges_fr.json';
import badgesDe from '../data/translations/german/badges_de.json';

const BadgeContext = createContext();

const badgeFiles = {
  ar: badgesAr,
  en: badgesEn,
  fr: badgesFr,
  de: badgesDe
};

export const BadgeProvider = ({ children }) => {
  const [badgeQueue, setBadgeQueue] = useState([]);
  const [currentBadge, setCurrentBadge] = useState(null);
  const [badgesData, setBadgesData] = useState(null);
  const pendingIdsRef = useRef([]);
  const shownBadgesRef = useRef(new Set());
  const { language } = useLanguage();

  useEffect(() => {
    // تعيين البيانات بناءً على اللغة المختارة
    const data = badgeFiles[language] || badgeFiles.ar;
    setBadgesData(data);

    if (pendingIdsRef.current.length > 0) {
      pendingIdsRef.current.forEach(id => processBadgeId(id, data));
      pendingIdsRef.current = [];
    }

    // تحميل الأوسمة التي عُرضت سابقاً
    const loadShownBadges = async () => {
      try {
        const stored = await StorageService.get(KEYS.SHOWN_BADGES);
        if (stored && Array.isArray(stored)) {
          shownBadgesRef.current = new Set(stored);
        }
      } catch (err) {
        console.error("Failed to load shown badges:", err);
      }
    };
    loadShownBadges();
  }, [language]);

  const processBadgeId = (badgeId, data) => {
    if (!data || shownBadgesRef.current.has(badgeId)) return;

    for (const family of data.badge_families) {
      const badge = family.badges.find(b => b.id === badgeId);
      if (badge) {
        const badgeWithFamily = { ...badge, familyName: family.family_name };
        setBadgeQueue(prev => [...prev, badgeWithFamily]);
        return;
      }
    }
  };

  const triggerBadgeUnlock = useCallback((badgeId) => {
    if (shownBadgesRef.current.has(badgeId)) return;

    if (!badgesData) {
      pendingIdsRef.current.push(badgeId);
      return;
    }

    processBadgeId(badgeId, badgesData);
  }, [badgesData]);

  useEffect(() => {
    if (!currentBadge && badgeQueue.length > 0) {
      setCurrentBadge(badgeQueue[0]);
      setBadgeQueue(prev => prev.slice(1));
    }
  }, [badgeQueue, currentBadge]);

  const closeReached = async () => {
    if (currentBadge) {
      const badgeId = currentBadge.id;
      shownBadgesRef.current.add(badgeId);
      await StorageService.save(KEYS.SHOWN_BADGES, Array.from(shownBadgesRef.current));
    }
    setCurrentBadge(null);
  };

  const contextValue = useMemo(() => ({ triggerBadgeUnlock }), [triggerBadgeUnlock]);

  return (
    <BadgeContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {currentBadge && (
          <BadgeUnlockModal
            badge={currentBadge}
            onClose={closeReached}
          />
        )}
      </AnimatePresence>
    </BadgeContext.Provider>
  );
};

export const useBadge = () => {
  const context = useContext(BadgeContext);
  if (!context) {
    throw new Error('useBadge must be used within a BadgeProvider');
  }
  return context;
};
