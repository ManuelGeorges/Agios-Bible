

'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from './Favourites.module.css';

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
  
  useEffect(() => {
    const fetchFavourites = async () => {
      setIsLoading(true);
      setError('');
      try {
        const filePath = activeTab === 'verses'
          ? '/data/favourites/verses.json'
          : '/data/favourites/chapters.json';
        const response = await fetch(filePath);
        if (!response.ok) {
          if (response.status === 404) {
            setFavourites([]);
            return;
          }
          throw new Error(`Failed to load ${filePath}`);
        }
        const data = await response.json();
        setFavourites(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setError(language === 'ar' ? 'فشل تحميل المفضلة.' : 'Failed to load favorites.');
        setFavourites([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavourites();
  }, [activeTab, language]);

  const handleRemove = async (itemToRemove) => {
    try {
      const endpoint = '/api/favourite';
      const verseKey = itemToRemove.verseKey;
      
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verseKeyToDelete: verseKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete item from server.');
      }

      setFavourites(prevFavourites => prevFavourites.filter(item => item.verseKey !== verseKey));

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
            <li key={item.verseKey || `${item.bookName}-${item.chapter}`} className={styles.favouriteItem}>
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