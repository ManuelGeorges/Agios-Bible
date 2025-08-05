'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import styles from './page.module.css';
import { useRouter } from 'next/navigation';

const LanguageContext = createContext();

const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState('ar');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedLang = localStorage.getItem('language');
            if (savedLang) {
                setLanguage(savedLang);
            }
        }
    }, []);

    const changeLanguage = (lang) => {
        setLanguage(lang);
        if (typeof window !== 'undefined') {
            localStorage.setItem('language', lang);
        }
    };

    return (
        <LanguageContext.Provider value={{ language, changeLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
};


function LandingPage() {
    const router = useRouter();
    const { language, changeLanguage } = useContext(LanguageContext);
    const [selectedLanguage, setSelectedLanguage] = useState(language || 'ar');
    const [dailyVerse, setDailyVerse] = useState(null);
    const [isLoadingVerse, setIsLoadingVerse] = useState(true);

    useEffect(() => {
        const savedLang = typeof window !== 'undefined' ? localStorage.getItem('language') : null;
        if (savedLang) {
            setSelectedLanguage(savedLang);
            changeLanguage(savedLang);
        } else {
            setSelectedLanguage('ar');
            changeLanguage('ar');
        }
    }, []);

    useEffect(() => {
        const fetchDailyVerse = async () => {
            if (!selectedLanguage || !['ar', 'en', 'fr'].includes(selectedLanguage)) {
                setDailyVerse({
                    verse: getText(
                        "حدث خطأ: لغة غير صالحة.",
                        "Error: Invalid language.",
                        "Erreur: Langue invalide."
                    ),
                    reference: ""
                });
                setIsLoadingVerse(false);
                return;
            }

            setIsLoadingVerse(true);
            let dailyVersesData = [];
            const today = new Date();
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();

            try {
                const module = await import(`../data/dailyVerses/${selectedLanguage}.json`);
                dailyVersesData = module.default;
            } catch (error) {
                console.error(`خطأ في تحميل آيات اليوم للغة ${selectedLanguage}:`, error);
                dailyVersesData = [];
            } finally {
                const verseForToday = dailyVersesData.find(v => v.month === currentMonth && v.day === currentDay);

                setDailyVerse(verseForToday || {
                    verse: getText(
                        "آية اليوم غير متوفرة لهذا التاريخ أو اللغة. يرجى التحقق من بيانات الآيات.",
                        "Daily verse not available for this date or language. Please check verse data.",
                        "Verset du jour non disponible pour cette date ou langue. Veuillez vérifier les données du verset."
                    ),
                    reference: ""
                });
                setIsLoadingVerse(false);
            }
        };

        if (selectedLanguage) {
            fetchDailyVerse();
        }
    }, [selectedLanguage]);

    useEffect(() => {
        if (language && language !== selectedLanguage) {
            setSelectedLanguage(language);
        }
    }, [language, selectedLanguage]);


    const handleChange = (e) => {
        const lang = e.target.value;
        setSelectedLanguage(lang);
        changeLanguage(lang);
    };

    const goToSearch = () => {
        router.push('/bible/search');
    };

    const goToBible = () => {
        router.push('/bible');
    };

    const getText = (ar, en, fr) => {
        return selectedLanguage === 'ar' ? ar : selectedLanguage === 'en' ? en : fr;
    };

    return (
        <main className={`${styles.container} ${selectedLanguage === 'ar' ? styles.rtl : ''}`}>
            <h1 className={`${styles.heading} ${styles.floating}`}>
                {getText('مرحباً بك في تطبيق Agios', 'Welcome to the Bible Study App', 'Bienvenue dans l\'application d\'étude de la Bible')}
            </h1>

            {isLoadingVerse ? (
                <div className={`${styles.dailyVerseBox} ${styles.floating}`}>
                    <p>{getText("جارٍ تحميل آية اليوم...", "Loading daily verse...", "Chargement du verset du jour...")}</p>
                </div>
            ) : (
                dailyVerse && (
                    <div className={`${styles.dailyVerseBox} ${styles.floating}`}>
                        <h2 className={styles.dailyVerseTitle}>
                            {getText('آية اليوم', 'Verse of the Day', 'Verset du jour')}
                        </h2>
                        <p className={styles.dailyVerseText}>
                            "{dailyVerse.verse}"
                        </p>
                        <p className={styles.dailyVerseReference}>
                            {dailyVerse.reference}
                        </p>
                    </div>
                )
            )}

        </main>
    );
}

const App = () => {
    return (
        <LanguageProvider>
            <LandingPage />
        </LanguageProvider>
    );
};

export default App;