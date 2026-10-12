'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import styles from './studyPlans.module.css';
import studyPlansData from './studyPlansData.json';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, updateDoc, deleteField, arrayUnion, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from '../../lib/firebase';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Sparkles, User, Share2, Search, X, PenLine } from 'lucide-react';
import { useBadge } from '../context/BadgeContext';
import { useLanguage } from '../context/LanguageContext';
import { StorageService, KEYS } from '../../lib/storage';

const staticPlans = studyPlansData.plans;

// نصوص زر وبادج الخطة اليدوية (يمكن نقلها لاحقاً إلى ملف strings الرئيسي)
const manualLabels = {
  ar: 'ألّف خطتك',
  en: 'Create manually',
  fr: 'Créer moi-même',
  de: 'Selbst erstellen',
};
const manualBadgeLabels = {
  ar: 'يدوية',
  en: 'Manual',
  fr: 'Manuel',
  de: 'Manuell',
};

const normalizeArabic = (text) => {
  if (!text) return "";
  return text.toString()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[\u064B-\u0652]/g, "")
    .toLowerCase()
    .trim();
};

export default function StudyPlans() {
  const router = useRouter();
  const { triggerBadgeUnlock } = useBadge();
  const { strings, dir, language } = useLanguage();
  const [activeFilter, setActiveFilter] = useState(strings.studyPlans.filters.all);
  const [searchQuery, setSearchQuery] = useState('');
  const [completionData, setCompletionData] = useState({});
  const [customPlans, setCustomPlans] = useState({});
  const [sharedPlans, setSharedPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const filterRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  const manualLabel = manualLabels[language] || manualLabels.en;
  const manualBadgeLabel = manualBadgeLabels[language] || manualBadgeLabels.en;

  // فلترة الخطط الثابتة حسب اللغة (تظهر في العربية فقط حالياً)
  const availableStaticPlans = useMemo(() => {
    return language === 'ar' ? staticPlans : [];
  }, [language]);

  const filtersList = useMemo(() => {
    const baseFilters = [
      strings.studyPlans.filters.all,
      strings.studyPlans.filters.custom,
      strings.studyPlans.filters.shared
    ];
    // جلب الأنواع من الخطط المتاحة فقط
    const types = [...new Set(availableStaticPlans.map(plan => plan.type))];
    return [...baseFilters, ...types];
  }, [strings, availableStaticPlans]);

  const unlockBadge = async (badgeId, currentBadges) => {
    if (user) {
      if (currentBadges?.includes(badgeId)) return;
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { badges: arrayUnion(badgeId) });
        triggerBadgeUnlock(badgeId);
      } catch (e) { console.error(e); }
    } else {
      const localBadges = await StorageService.get(KEYS.LOCAL_BADGES) || [];
      if (!localBadges.includes(badgeId)) {
        localBadges.push(badgeId);
        await StorageService.save(KEYS.LOCAL_BADGES, localBadges);
        triggerBadgeUnlock(badgeId);
      }
    }
  };

  const checkPlanBadges = (userData) => {
    const currentBadges = userData.badges || [];
    const allPlans = { ...(userData.completedPlans || {}), ...(userData.customPlans || {}) };

    let totalPlanDays = 0;
    let finishedCount = 0;
    let startedCount = 0;

    Object.values(allPlans).forEach(plan => {
      const doneDays = Object.values(plan.completedDays || {}).filter(d => d.isCompleted).length;
      totalPlanDays += doneDays;
      if (doneDays > 0) startedCount++;
      if (plan.completionPercentage === 100) finishedCount++;
    });

    const dayMilestones = [
      { d: 365, id: 'plan_streak_365' }, { d: 180, id: 'plan_streak_180' },
      { d: 90, id: 'plan_streak_90' }, { d: 60, id: 'plan_streak_60' },
      { d: 30, id: 'plan_streak_30' }, { d: 14, id: 'plan_streak_14' },
      { d: 7, id: 'plan_streak_7' }, { d: 3, id: 'plan_streak_3' },
      { d: 1, id: 'plan_streak_1' }
    ];

    dayMilestones.forEach(m => {
      if (totalPlanDays >= m.d) unlockBadge(m.id, currentBadges);
    });

    if (startedCount >= 1) unlockBadge('plan_start_1', currentBadges);
    if (finishedCount >= 1) unlockBadge('plan_finish_1', currentBadges);
    if (finishedCount >= 3) unlockBadge('plan_finish_3', currentBadges);
    if (finishedCount >= 5) unlockBadge('plan_finish_5', currentBadges);
    if (finishedCount >= 10) unlockBadge('plan_finish_10', currentBadges);
    if (finishedCount >= 20) unlockBadge('plan_finish_20', currentBadges);
  };

  // جلب الخطط المشتركة مع نظام التخزين المؤقت (مرة واحدة يومياً)
  useEffect(() => {
    const fetchSharedPlans = async () => {
      try {
        const lastFetch = await StorageService.get(KEYS.LAST_SHARED_PLANS_FETCH);
        const cachedPlans = await StorageService.get(KEYS.SHARED_PLANS_CACHE);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (lastFetch && cachedPlans && (now - lastFetch < oneDay)) {
          // استخدام البيانات المخزنة
          const filtered = cachedPlans.filter(plan => {
            return plan.language === language || (!plan.language && language === 'ar');
          });
          setSharedPlans(filtered);
          return;
        }

        // سحب بيانات جديدة من Firestore
        const sharedQuery = query(collection(db, 'sharedPlans'), orderBy('createdAt', 'desc'), limit(50));
        const snapshot = await getDocs(sharedQuery);
        const shared = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, isShared: true }));

        // حفظ في التخزين المؤقت
        await StorageService.save(KEYS.SHARED_PLANS_CACHE, shared);
        await StorageService.save(KEYS.LAST_SHARED_PLANS_FETCH, now);

        const filtered = shared.filter(plan => {
          return plan.language === language || (!plan.language && language === 'ar');
        });
        setSharedPlans(filtered);
      } catch (error) {
        console.error("Error fetching shared plans:", error);
        // في حالة الخطأ، حاول تحميل الكاش القديم إن وجد
        const cached = await StorageService.get(KEYS.SHARED_PLANS_CACHE);
        if (cached) {
          setSharedPlans(cached.filter(p => p.language === language || (!p.language && language === 'ar')));
        }
      }
    };

    fetchSharedPlans();
  }, [language]);

  useEffect(() => {
    const auth = getAuth();
    let unsubFirestore = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (loggedInUser) => {
      setUser(loggedInUser);
      if (loggedInUser) {
        const userRef = doc(db, "users", loggedInUser.uid);
        unsubFirestore = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCompletionData(data.completedPlans || {});
            setCustomPlans(data.customPlans || {});
            checkPlanBadges(data);
          }
          setLoading(false);
        }, () => setLoading(false));
      } else {
        const localCompletion = await StorageService.get(KEYS.COMPLETED_PLANS) || await StorageService.get('local_completed_plans') || {};
        const localCustom = await StorageService.get(KEYS.CUSTOM_PLANS) || await StorageService.get('local_custom_plans') || {};
        const localBadges = await StorageService.get(KEYS.LOCAL_BADGES) || await StorageService.get('local_badges') || [];

        setCompletionData(localCompletion);
        setCustomPlans(localCustom);
        checkPlanBadges({ completedPlans: localCompletion, customPlans: localCustom, badges: localBadges });
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubFirestore();
    };
  }, []);

  const checkScroll = () => {
    if (filterRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = filterRef.current;
      const canScrollFurther = Math.abs(scrollLeft) < (scrollWidth - clientWidth - 15);
      setShowScrollHint(canScrollFurther);
    }
  };

  useEffect(() => {
    const el = filterRef.current;
    if (el && !loading) {
      const timer = setTimeout(checkScroll, 500);
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        clearTimeout(timer);
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [loading]);

  const handleDeletePlan = async (e, planId) => {
    e.preventDefault();
    e.stopPropagation();

    toast((t) => (
      <div style={{ direction: dir, textAlign: 'center' }}>
        <p style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '1.1rem' }}>
          {strings.studyPlans.delete_toast.confirm_title}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button 
            onClick={async () => {
              toast.dismiss(t.id);
              if (user) {
                const userRef = doc(db, "users", user.uid);
                if (customPlans[planId]) {
                  await updateDoc(userRef, { [`customPlans.${planId}`]: deleteField() });
                } else {
                  await updateDoc(userRef, { [`completedPlans.${planId}`]: deleteField() });
                }
              } else {
                const localCustom = await StorageService.get(KEYS.CUSTOM_PLANS) || {};
                const localCompletion = await StorageService.get(KEYS.COMPLETED_PLANS) || {};

                if (localCustom[planId]) {
                  delete localCustom[planId];
                  await StorageService.save(KEYS.CUSTOM_PLANS, localCustom);
                  setCustomPlans(localCustom);
                } else if (localCompletion[planId]) {
                  delete localCompletion[planId];
                  await StorageService.save(KEYS.COMPLETED_PLANS, localCompletion);
                  setCompletionData(localCompletion);
                }
              }
              toast.success(strings.studyPlans.delete_toast.delete_success);
            }}
            style={{ 
              background: '#ef4444', color: '#fff', border: 'none', 
              padding: '10px 20px', borderRadius: '12px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '1rem'
            }}
          >
            {strings.common.confirm}
          </button>
          <button onClick={() => toast.dismiss(t.id)} style={{ background: 'var(--color-bg-end)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontSize: '1rem' }}>
            {strings.common.undo}
          </button>
        </div>
      </div>
    ), { duration: 6000, position: 'top-center', style: { background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: '20px', minWidth: '300px' } });
  };

  const allAvailablePlans = useMemo(() => {
    let basePlans = [];

    const personalPlans = [
      ...Object.values(customPlans).map(plan => ({ ...plan, isCustom: true })),
      ...Object.values(completionData).filter(plan => plan.isShared && plan.readings)
    ].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    if (activeFilter === strings.studyPlans.filters.shared) {
      basePlans = sharedPlans;
    } else if (activeFilter === strings.studyPlans.filters.custom) {
      basePlans = personalPlans;
    } else if (activeFilter === strings.studyPlans.filters.all) {
      const personalIds = new Set(personalPlans.map(p => String(p.id)));
      const filteredShared = sharedPlans.filter(p => !personalIds.has(String(p.id)));

      basePlans = [...personalPlans, ...filteredShared, ...availableStaticPlans];
    } else {
      basePlans = availableStaticPlans.filter(p => p.type === activeFilter);
    }

    if (!searchQuery.trim()) return basePlans;

    const normalizedQuery = normalizeArabic(searchQuery);
    const queryWords = normalizedQuery.split(/\s+/);

    return basePlans.filter(plan => {
      const planContent = normalizeArabic(`${plan.title} ${plan.description} ${plan.type}`);
      return queryWords.every(word => planContent.includes(word));
    });
  }, [customPlans, sharedPlans, completionData, activeFilter, searchQuery, strings, availableStaticPlans]);

  if (loading) return <div className={styles.container}><div className={styles.loading}>{strings.common.loading}</div></div>;

  return (
    <div className={styles.container}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>{strings.studyPlans.title}</h1>
        <div className={styles.heroActions}>
          <Link href="/studyPlans/custom" className={styles.aiCreateButton}>
            <Sparkles size={18} /> {strings.studyPlans.ai_button}
          </Link>
          <Link href="/studyPlans/manual" className={styles.aiCreateButton}>
            <PenLine size={18} /> {manualLabel}
          </Link>
        </div>
      </div>

      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <Search size={20} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={strings.studyPlans.search_placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.filterWrapper}>
        <div className={styles.filterSection} ref={filterRef}>
          {filtersList.map(filter => (
            <button key={filter} className={`${styles.filterButton} ${activeFilter === filter ? styles.activeFilter : ''}`} onClick={() => setActiveFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.plansGrid}>
        {allAvailablePlans.length > 0 ? (
          allAvailablePlans.map(plan => {
            const isSharedPlan = plan.isShared;
            const progress = plan.isCustom 
              ? { percent: plan.completionPercentage || 0, done: Object.values(plan.completedDays || {}).filter(d => d.isCompleted).length }
              : {
                  percent: completionData[plan.id]?.completionPercentage || 0,
                  done: Object.values(completionData[plan.id]?.completedDays || {}).filter(d => d.isCompleted).length
                };

            const hasStarted = progress.done > 0;
            const isPersonalCopy = plan.isCustom || (plan.isShared && plan.readings);

            const planUrl = isSharedPlan
                ? `/studyPlans/details?id=${plan.id}&type=shared`
                : (plan.isCustom ? `/studyPlans/details?id=${plan.id}&type=custom` : `/studyPlans/details?id=${plan.id}`);

            return (
              <div key={plan.id} className={styles.card}>
                {isPersonalCopy && <button className={styles.deleteBtn} onClick={(e) => handleDeletePlan(e, plan.id)}>✕</button>}
                <div className={styles.cardContent}>
                  {plan.isCustom && !plan.isManual && (
                    <span className={styles.aiBadge}><Sparkles size={14} /> {strings.studyPlans.card.ai_badge}</span>
                  )}
                  {plan.isCustom && plan.isManual && (
                    <span className={styles.aiBadge}><PenLine size={14} /> {manualBadgeLabel}</span>
                  )}
                  {isSharedPlan && <span className={styles.sharedBadge}><Share2 size={14} /> {strings.studyPlans.card.shared_badge}</span>}

                  <h3 className={styles.cardTitle}>{plan.title}</h3>
                  <p className={styles.cardType}>
                    {isSharedPlan ? strings.studyPlans.card.community_type : (plan.isCustom ? strings.studyPlans.card.personal_type : plan.type)}
                  </p>

                  {isSharedPlan && plan.authorName && (
                    <div className={styles.authorInfo}>
                      <User size={12} /> {strings.studyPlans.card.by_author.replace('{name}', plan.authorName)}
                    </div>
                  )}

                  {hasStarted && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${progress.percent}%` }}></div>
                      </div>
                      <span className={styles.percentageText}>
                        {strings.studyPlans.card.completed_percent.replace('{percent}', progress.percent)}
                      </span>
                    </div>
                  )}
                  <Link href={planUrl} className={styles.cardButton}>
                    {hasStarted ? strings.studyPlans.card.continue : strings.studyPlans.card.start}
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <h3>{searchQuery ? strings.studyPlans.empty.no_search_results : strings.studyPlans.empty.no_plans}</h3>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={styles.resetSearch}>
                {strings.studyPlans.empty.reset_search}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}