// src/app/favourites/favourites.module.jsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from './favourites.module.css';

function convertToArabicNumber(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicNums[+d]).join('');
}

export default function FavouritesPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('verses');
  const [favourites, setFavourites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // دالة موحدة لحفظ البيانات في Local Storage
  const saveFavouritesToLocalStorage = useCallback((key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, []);

  const fetchFavourites = useCallback(() => {
    setIsLoading(true);
    setError('');
    try {
      const key = activeTab === 'verses' ? 'favourite_verses' : 'favourite_chapters';
      const data = JSON.parse(localStorage.getItem(key)) || {};
      
      // تحويل الكائن إلى مصفوفة لعرضه
      const favouritesArray = Object.values(data);
      setFavourites(favouritesArray);
    } catch (e) {
      console.error(e);
      setError(language === 'ar' ? 'فشل تحميل المفضلة.' : 'Failed to load favorites.');
      setFavourites([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, language]);

  useEffect(() => {
    fetchFavourites();
  }, [activeTab, fetchFavourites]);

  const handleRemove = (itemToRemove) => {
    try {
      let key;
      let existingFavourites;

      if (itemToRemove.type === 'verse') {
        key = 'favourite_verses';
        existingFavourites = JSON.parse(localStorage.getItem(key)) || {};
        delete existingFavourites[itemToRemove.verseKey];
      } else if (itemToRemove.type === 'chapter') {
        key = 'favourite_chapters';
        existingFavourites = JSON.parse(localStorage.getItem(key)) || {};
        delete existingFavourites[itemToRemove.chapterKey];
      }
      
      if (key && existingFavourites) {
        saveFavouritesToLocalStorage(key, existingFavourites);
        
        // تحديث حالة favourites بعد الحذف
        const updatedFavouritesArray = Object.values(existingFavourites);
        setFavourites(updatedFavouritesArray);
      }
    } catch (e) {
      console.error('Failed to remove item:', e);
      setError(language === 'ar' ? 'فشل حذف العنصر.' : 'Failed to remove item.');
    }
  };

  const getTitle = () => {
    if (language === 'ar') {
      return activeTab === 'verses' ? 'الآيات المفضلة' : 'الاصحاحات المفضلة';
    } else if (language === 'en') {
      return activeTab === 'verses' ? 'Favorite Verses' : 'Favorite Chapters';
    } else {
      return activeTab === 'verses' ? 'Verset favoris' : 'Chapitres favoris';
    }
  };

  const getReferenceText = (item) => {
    const bookName = item.bookName;
    const chapterNumber = item.chapter + 1;
    let reference;

    if (language === 'ar') {
      reference = `${bookName} ${convertToArabicNumber(chapterNumber)}`;
      if (item.verseIndex !== undefined) {
        reference += `:${convertToArabicNumber(item.verseIndex + 1)}`;
      }
    } else {
      reference = `${bookName} ${chapterNumber}`;
      if (item.verseIndex !== undefined) {
        reference += `:${item.verseIndex + 1}`;
      }
    }
    return reference;
  };

  return (
    <main className={`${styles.container} ${language === 'ar' ? styles.ar : ''}`}>
      <h1 className={styles.title}>
        {language === 'ar' ? '⭐ المفضلة' : language === 'en' ? '⭐ Favorites' : '⭐ Favoris'}
      </h1>

      <nav className={styles.tabContainer}>
        <div
          className={`${styles.tab} ${activeTab === 'verses' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('verses')}
        >
          {language === 'ar' ? 'آيات' : language === 'en' ? 'Verses' : 'Versets'}
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'chapters' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('chapters')}
        >
          {language === 'ar' ? 'اصحاحات' : language === 'en' ? 'Chapters' : 'Chapitres'}
        </div>
      </nav>

      {isLoading && (
        <div className={styles.loadingMessage}>
          {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
        </div>
      )}

      {error && <div className={styles.errorMessage}>{error}</div>}

      {!isLoading && !error && favourites.length === 0 && (
        <div className={styles.emptyMessage}>
          {language === 'ar' ? 'لا توجد عناصر مفضلة.' : 'No favorites found.'}
        </div>
      )}

      {!isLoading && !error && favourites.length > 0 && (
        <ul className={styles.favouritesList}>
          {favourites.map((item) => (
            <li key={item.verseKey || item.chapterKey} className={styles.favouriteItem}>
              <div className={styles.favouriteContent}>
                {item.text}
                <span className={styles.favouriteReference}>
                  {getReferenceText(item)}
                </span>
              </div>
              <button
                onClick={() => handleRemove(item)}
                className={styles.removeButton}
                aria-label={language === 'ar' ? 'حذف من المفضلة' : 'Remove from favorites'}
              >
                ✖
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}