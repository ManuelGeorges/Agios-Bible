'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Bible.module.css';
import { useLanguage } from '../../context/LanguageContext';
import { useSearchParams } from 'next/navigation';

// دالة لتحويل الأرقام الإنجليزية إلى عربية
function convertToArabicNumber(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicNums[+d]).join('');
}

// مكون الـ popup الجديد
const VerseActionsPopup = ({ verse, onClose, onCopy, onFavourite }) => {
  const { language } = useLanguage();
  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupContent} onClick={e => e.stopPropagation()}>
        <p className={styles.popupText}>{verse.text}</p>
        <div className={styles.popupButtons}>
          <button className={styles.copyButton} onClick={onCopy}>
            📋 {language === 'ar' ? 'نسخ' : language === 'en' ? 'Copy' : 'Copier'}
          </button>
          <button className={styles.favouriteButton} onClick={onFavourite}>
            ⭐ {language === 'ar' ? 'مفضلة' : language === 'en' ? 'Favorite' : 'Favori'}
          </button>
        </div>
        <button className={styles.closeButton} onClick={onClose}>&times;</button>
      </div>
    </div>
  );
};

export default function BibleContent() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();

  const [bibleData, setBibleData] = useState(null);
  const [isLoadingBible, setIsLoadingBible] = useState(true);
  const [bookNamesData, setBookNamesData] = useState(null);
  const [hasBookNamesError, setHasBookNamesError] = useState(false);

  const [favouriteVerses, setFavouriteVerses] = useState({});
  const [favouriteChapters, setFavouriteChapters] = useState({});

  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const bookDropdownRef = useRef(null);

  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const chapterDropdownRef = useRef(null);
  
  const [selectedVerses, setSelectedVerses] = useState(new Set());
  
  const [copiedMessage, setCopiedMessage] = useState('');
  const [favouriteMessage, setFavouriteMessage] = useState('');
  
  const [popupVerse, setPopupVerse] = useState(null);
  const touchTimeout = useRef(null);
  const isLongPress = useRef(false);

  // جلب المفضلة من التخزين المحلي
  const fetchFavourites = useCallback(() => {
    try {
      const verses = JSON.parse(localStorage.getItem('favourite_verses')) || {};
      const chapters = JSON.parse(localStorage.getItem('favourite_chapters')) || {};
      setFavouriteVerses(verses);
      setFavouriteChapters(chapters);
    } catch (error) {
      console.error('Failed to load favorites from localStorage:', error);
    }
  }, []);

  // حفظ المفضلة في التخزين المحلي
  const saveFavourites = useCallback((verses, chapters) => {
    try {
      localStorage.setItem('favourite_verses', JSON.stringify(verses));
      localStorage.setItem('favourite_chapters', JSON.stringify(chapters));
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error);
    }
  }, []);

  // ----------------- بداية التعديل -----------------
  // دالة لجلب اسم السفر باللغة المختارة من الكائن
  const getBookName = useCallback((index) => {
    return bookNamesData?.[language]?.[index]?.name || 'Unknown Book';
  }, [bookNamesData, language]);

  // دالة لجلب فهرس السفر من اسمه (تم التعديل لتتناسب مع صيغة الكائن)
  const getBookIndexByName = useCallback((name) => {
    if (!bookNamesData?.[language] || !name) return 0;
    const index = bookNamesData[language].findIndex(book => book.name?.toLowerCase() === name.toLowerCase());
    return index !== -1 ? index : 0;
  }, [bookNamesData, language]);
  // ----------------- نهاية التعديل -----------------

  // جلب اختصار اسم السفر
  const getBookAbbreviation = useCallback((index) => {
    return bookNamesData?.abbreviations?.[index] || '';
  }, [bookNamesData]);

  useEffect(() => {
    fetchFavourites();
  }, [fetchFavourites]);
  
  // إظهار رسائل التنبيه لفترة محدودة
  useEffect(() => {
    let timerId;
    if (copiedMessage || favouriteMessage) {
      timerId = setTimeout(() => {
        setCopiedMessage('');
        setFavouriteMessage('');
      }, 2000);
    }
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [copiedMessage, favouriteMessage]);

  // إغلاق القائمة المنسدلة للأسفار عند النقر خارجها
  useEffect(() => {
    const handleClickOutsideBook = (event) => {
      if (bookDropdownRef.current && !bookDropdownRef.current.contains(event.target)) {
        setIsBookDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideBook);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideBook);
    };
  }, []);

  // إغلاق القائمة المنسدلة للإصحاحات عند النقر خارجها
  useEffect(() => {
    const handleClickOutsideChapter = (event) => {
      if (chapterDropdownRef.current && !chapterDropdownRef.current.contains(event.target)) {
        setIsChapterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideChapter);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideChapter);
    };
  }, []);

  // جلب أسماء الأسفار
  useEffect(() => {
    const loadBookNames = async () => {
      try {
        const response = await fetch('/data/bookNames.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} for /data/bookNames.json`);
        }
        const data = await response.json();
        setBookNamesData(data);
        setHasBookNamesError(false);
      } catch (error) {
        console.error('Failed to load bookNames:', error);
        setBookNamesData({});
        setHasBookNamesError(true);
      }
    };
    loadBookNames();
  }, []);

  // جلب بيانات الكتاب المقدس بناءً على اللغة
  useEffect(() => {
    const loadBible = async () => {
      setIsLoadingBible(true);
      setBibleData(null);
      
      try {
        let jsonFileName = '';
        if (language === 'ar') {
          jsonFileName = 'ar_svd.json';
        } else if (language === 'en') {
          jsonFileName = 'en_bbe.json';
        } else if (language === 'fr') {
          jsonFileName = 'fr_apee.json';
        } else {
          setBibleData([]);
          setIsLoadingBible(false);
          return;
        }

        const jsonFilePath = `/data/bibles/${jsonFileName}`;
        const response = await fetch(jsonFilePath);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} for ${jsonFilePath}`);
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          setBibleData(data);
          
          const bookNameFromUrl = searchParams.get('book');
          const chapterFromUrl = searchParams.get('chapter');

          let initialBookIndex = 0;
          let initialChapterIndex = 0;

          if (bookNameFromUrl && bookNamesData?.[language]) {
            initialBookIndex = getBookIndexByName(decodeURIComponent(bookNameFromUrl));
          }

          if (chapterFromUrl) {
            initialChapterIndex = parseInt(decodeURIComponent(chapterFromUrl)) - 1;
            if (isNaN(initialChapterIndex) || initialChapterIndex < 0 || initialChapterIndex >= data?.[initialBookIndex]?.chapters.length) {
              initialChapterIndex = 0;
            }
          }

          setSelectedBookIndex(initialBookIndex);
          setSelectedChapterIndex(initialChapterIndex);
          setSelectedVerses(new Set());
        } else {
          setBibleData([]);
        }
      } catch (error) {
        console.error(`Failed to fetch bible data for "${language}":`, error);
        setBibleData(null);
      } finally {
        setIsLoadingBible(false);
      }
    };

    if (language && ['ar', 'en', 'fr'].includes(language) && bookNamesData) {
      loadBible();
    } else if (language && ['ar', 'en', 'fr'].includes(language) && !bookNamesData) {
      // لا يوجد إجراء هنا، سيتم استدعاء loadBible() بمجرد توفر bookNamesData
    } else {
      setIsLoadingBible(false);
      setBibleData([]);
    }
  }, [language, bookNamesData, searchParams, getBookIndexByName]);

  // معالج النقر على السفر المخصص
  const handleBookItemClick = (index) => {
    setSelectedBookIndex(index);
    setSelectedChapterIndex(0);
    setSelectedVerses(new Set());
    setIsBookDropdownOpen(false);
  };
  
  // معالج النقر على الإصحاح المخصص
  const handleChapterItemClick = (index) => {
    setSelectedChapterIndex(index);
    setSelectedVerses(new Set());
    setIsChapterDropdownOpen(false);
  };

  const selectedBook = bibleData?.[selectedBookIndex] || null;
  const chapters = selectedBook?.chapters || [];
  const verses = chapters?.[selectedChapterIndex] || [];
  
  // دالة لجلب تسمية الإصحاح
  const getChapterLabel = (index) => {
    if (language === 'ar') return `الإصحاح ${convertToArabicNumber(index + 1)}`;
    if (language === 'fr') return `Chapitre ${index + 1}`;
    return `Chapter ${index + 1}`;
  };

  // دالة لجلب رقم الآية
  const getVerseNumber = (index) => {
    return language === 'ar' ? convertToArabicNumber(index + 1) : index + 1;
  };

  // دمج نص الآية مع المرجع
  const getFullVerseText = (bookIdx, chapterIdx, verseIdx, verseText) => {
    const bookName = getBookName(bookIdx);
    const chapterNumber = chapterIdx + 1;
    const verseNumber = verseIdx + 1;

    let reference;
    if (language === 'ar') {
      reference = `(${bookName} ${convertToArabicNumber(chapterNumber)}:${convertToArabicNumber(verseNumber)})`;
    } else {
      reference = `(${bookName} ${chapterNumber}:${verseNumber})`;
    }

    return `${verseText} ${reference}`;
  };

  // دالة لنسخ النص إلى الحافظة
  const copyTextToClipboard = async (textToCopy) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const el = document.createElement('textarea');
        el.value = textToCopy;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      
      setCopiedMessage(
        language === 'ar' ? 'تم النسخ!' : language === 'en' ? 'Copied!' : 'Copié!'
      );
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopiedMessage(
        language === 'ar' ? 'فشل النسخ!' : language === 'en' ? 'Failed to copy!' : 'Échec de la copie!'
      );
    }
  };
  
  const handleCopySingleVerse = (verse, index) => {
    const textToCopy = getFullVerseText(selectedBookIndex, selectedChapterIndex, index, verse);
    copyTextToClipboard(textToCopy);
  };

  const handleFavouriteChapter = () => {
    const chapterKey = `${selectedBookIndex}-${selectedChapterIndex}`;
    const isFavourite = favouriteChapters[chapterKey] !== undefined;
    
    let newFavouriteChapters = { ...favouriteChapters };
    if (isFavourite) {
      delete newFavouriteChapters[chapterKey];
      setFavouriteMessage(language === 'ar' ? 'تم حذف الإصحاح من المفضلة!' : 'Chapter removed from favorites!');
    } else {
      const chapterData = {
        type: 'chapter',
        chapterKey,
        text: verses.map((v, i) => {
          let verseNumber = language === 'ar' ? convertToArabicNumber(i + 1) : i + 1;
          return `${verseNumber}. ${v}`;
        }).join('\n'),
        bookName: getBookName(selectedBookIndex),
        bookNameAbbrev: getBookAbbreviation(selectedBookIndex),
        chapter: selectedChapterIndex,
        language: language,
      };
      newFavouriteChapters[chapterKey] = chapterData;
      setFavouriteMessage(language === 'ar' ? 'تم إضافة الإصحاح إلى المفضلة!' : 'Chapter added to favorites!');
    }
    
    setFavouriteChapters(newFavouriteChapters);
    saveFavourites(favouriteVerses, newFavouriteChapters);
  };

  const handleFavouriteSingleVerse = (verse, verseIndex) => {
    const verseKey = `${selectedBookIndex}-${selectedChapterIndex}-${verseIndex}`;
    const isFavourite = favouriteVerses[verseKey] !== undefined;
    
    let newFavouriteVerses = { ...favouriteVerses };
    if (isFavourite) {
      delete newFavouriteVerses[verseKey];
      setFavouriteMessage(language === 'ar' ? 'تم الحذف من المفضلة!' : 'Removed from favorites!');
    } else {
      const verseData = {
        type: 'verse',
        verseKey,
        text: verse,
        bookName: getBookName(selectedBookIndex),
        bookNameAbbrev: getBookAbbreviation(selectedBookIndex),
        chapter: selectedChapterIndex,
        verseIndex: verseIndex,
        language: language,
      };
      newFavouriteVerses[verseKey] = verseData;
      setFavouriteMessage(language === 'ar' ? 'تم الإضافة إلى المفضلة!' : 'Added to favorites!');
    }
    
    setFavouriteVerses(newFavouriteVerses);
    saveFavourites(newFavouriteVerses, favouriteChapters);
  };

  const handleVerseSelection = (verseKey) => {
    setSelectedVerses(prevSelected => {
      const newSelection = new Set(prevSelected);
      if (newSelection.has(verseKey)) {
        newSelection.delete(verseKey);
      } else {
        newSelection.add(verseKey);
      }
      return newSelection;
    });
  };

  const handleCopySelectedVerses = () => {
    if (selectedVerses.size === 0) return;

    let compiledText = [];
    const sortedSelectedVerseKeys = Array.from(selectedVerses).sort((a, b) => {
      const [, , verseIdxA] = a.split('-').map(Number);
      const [, , verseIdxB] = b.split('-').map(Number);
      return verseIdxA - verseIdxB;
    });

    sortedSelectedVerseKeys.forEach(key => {
      const [bookIdx, chapterIdx, verseIdx] = key.split('-').map(Number);
      if (bookIdx === selectedBookIndex && chapterIdx === selectedChapterIndex && verses[verseIdx]) {
        compiledText.push(getFullVerseText(bookIdx, chapterIdx, verseIdx, verses[verseIdx]));
      }
    });

    const textToCopy = compiledText.join('\n\n');
    copyTextToClipboard(textToCopy);
    setSelectedVerses(new Set());
  };

  const handleFavouriteSelectedVerses = () => {
    if (selectedVerses.size === 0) return;
    
    let newFavouriteVerses = { ...favouriteVerses };

    for (const key of Array.from(selectedVerses)) {
      const isFavourite = favouriteVerses[key] !== undefined;
      const [bookIdx, chapterIdx, verseIdx] = key.split('-').map(Number);

      if (isFavourite) {
        delete newFavouriteVerses[key];
      } else {
        const verseData = {
          type: 'verse',
          verseKey: key,
          text: verses[verseIdx],
          bookName: getBookName(bookIdx),
          bookNameAbbrev: getBookAbbreviation(bookIdx),
          chapter: chapterIdx,
          verseIndex: verseIdx,
          language: language,
        };
        newFavouriteVerses[key] = verseData;
      }
    }
    
    setFavouriteVerses(newFavouriteVerses);
    saveFavourites(newFavouriteVerses, favouriteChapters);
    
    setFavouriteMessage(
      language === 'ar' ? `تم تحديث المفضلة (${convertToArabicNumber(selectedVerses.size)} آية)!` : `Favorites updated (${selectedVerses.size} Verses)!`
    );
    setSelectedVerses(new Set());
  };
  
  const isCurrentChapterFavourite = favouriteChapters[`${selectedBookIndex}-${selectedChapterIndex}`] !== undefined;

  // منطق اللمسة الواحدة واللمسة المطولة
  const handleVerseTouchStart = (e, verseKey, verseText) => {
      e.stopPropagation();
      isLongPress.current = false;
      touchTimeout.current = setTimeout(() => {
          isLongPress.current = true;
          setPopupVerse({ key: verseKey, text: verseText });
      }, 500); // 500ms for a long press
  };

  const handleVerseTouchEnd = (e, verseKey) => {
      e.stopPropagation();
      clearTimeout(touchTimeout.current);
      if (!isLongPress.current) {
          // This is a single tap
          handleVerseSelection(verseKey);
      }
      isLongPress.current = false;
  };

  const handleClosePopup = () => {
      setPopupVerse(null);
  };
  
  const handleCopyPopup = () => {
    if (popupVerse) {
        const [bookIdx, chapterIdx, verseIdx] = popupVerse.key.split('-').map(Number);
        const textToCopy = getFullVerseText(bookIdx, chapterIdx, verseIdx, popupVerse.text);
        copyTextToClipboard(textToCopy);
    }
    handleClosePopup();
  };

  const handleFavouritePopup = () => {
    if (popupVerse) {
        const [bookIdx, chapterIdx, verseIdx] = popupVerse.key.split('-').map(Number);
        handleFavouriteSingleVerse(popupVerse.text, verseIdx);
    }
    handleClosePopup();
  };
  
  // لضمان عدم حدوث conflict بين أحداث اللمس والنقر
  const isTouchDevice = () => {
      if (typeof window === 'undefined') return false;
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  };

  if (isLoadingBible || bookNamesData === null) {
    return (
      <div className={styles.loadingMessage}>
        {language === 'ar' ? 'جارٍ تحميل الكتاب المقدس...' : language === 'en' ? 'Loading Bible...' : 'Chargement de la Bible...'}
      </div>
    );
  }

  if (!bibleData || bibleData.length === 0 || hasBookNamesError || !bookNamesData?.[language] || Object.keys(bookNamesData[language]).length === 0) {
    return (
      <div className={styles.errorMessage}>
        {language === 'ar' ? 'فشل تحميل بيانات الكتاب المقدس أو البيانات فارغة.' : language === 'en' ? 'Failed to load Bible data or data is empty.' : 'Échec du chargement des données de la Bible ou données vides.'}
        <br />
        {hasBookNamesError && (language === 'ar' ? 'الرجاء التحقق من مسار ملف bookNames.json.' : 'Please check the path to bookNames.json.')}
        {!hasBookNamesError && (language === 'ar' ? 'الرجاء التحقق من: 1. قيمة اللغة من `LanguageContext`. 2. مسارات ملفات JSON في مجلد `public/data/bibles`. 3. بنية ملفات JSON.' : 'Please check: 1. Language value from `LanguageContext`. 2. JSON file paths in `public/data/bibles` folder. 3. JSON file structure.')}
      </div>
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <h1 className={styles.title}>
        📚 {
          language === 'ar'
            ? 'دراسة الكتاب المقدس'
            : language === 'en'
            ? 'Bible Study'
            : 'Étude de la Bible'
        }
      </h1>
      <div className={styles.controls}>
        {/* قائمة منسدلة مخصصة لاختيار السفر */}
        <div className={styles.customSelectWrapper} ref={bookDropdownRef}>
          <label className={styles.label}>
            📖 {
              language === 'ar'
                ? 'اختر السفر:'
                : language === 'en'
                ? 'Select Book:'
                : 'Choisir un livre:'
            }
          </label>
          <div
            className={`${styles.selectTrigger} ${isBookDropdownOpen ? styles.active : ''}`}
            onClick={() => setIsBookDropdownOpen(!isBookDropdownOpen)}
          >
            <span>{getBookName(selectedBookIndex)}</span>
            <div className={styles.arrow}></div>
          </div>
          <ul className={`${styles.dropdownMenu} ${isBookDropdownOpen ? styles.open : ''}`}>
            {/* ----------------- بداية التعديل ----------------- */}
            {bookNamesData?.[language]?.map((book, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedBookIndex === index ? styles.selected : ''}`}
                onClick={() => handleBookItemClick(index)}
              >
                {book.name} {/* هنا تم إضافة .name لعرض اسم السفر فقط */}
              </li>
            ))}
            {/* ----------------- نهاية التعديل ----------------- */}
          </ul>
        </div>
        
        {/* قائمة منسدلة مخصصة لاختيار الإصحاح */}
        <div className={styles.customSelectWrapper} ref={chapterDropdownRef}>
          <label className={styles.label}>
            🔢 {
              language === 'ar'
                ? 'اختر الإصحاح:'
                : language === 'en'
                ? 'Select Chapter:'
                : 'Choisir un chapitre:'
            }
          </label>
          <div
            className={`${styles.selectTrigger} ${isChapterDropdownOpen ? styles.active : ''}`}
            onClick={() => setIsChapterDropdownOpen(!isChapterDropdownOpen)}
          >
            <span>{getChapterLabel(selectedChapterIndex)}</span>
            <div className={styles.arrow}></div>
          </div>
          <ul className={`${styles.dropdownMenu} ${isChapterDropdownOpen ? styles.open : ''}`}>
            {chapters?.map((_, index) => (
              <li
                key={index}
                className={`${styles.dropdownItem} ${selectedChapterIndex === index ? styles.selected : ''}`}
                onClick={() => handleChapterItemClick(index)}
              >
                {getChapterLabel(index)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {copiedMessage && (
        <div className={`${styles.messageBox} ${styles.copiedMessage}`}>
          {copiedMessage}
        </div>
      )}

      {favouriteMessage && (
        <div className={`${styles.messageBox} ${styles.favouriteMessage}`}>
          {favouriteMessage}
        </div>
      )}

      {selectedVerses.size > 0 && (
        <div className={styles.actionButtons}>
          <button
            onClick={handleCopySelectedVerses}
            className={styles.copySelectedButton}
          >
            {language === 'ar' ? `نسخ ${convertToArabicNumber(selectedVerses.size)} آية مختارة` : `Copy ${selectedVerses.size} Selected Verses`}
          </button>
          <button
            onClick={handleFavouriteSelectedVerses}
            className={styles.favouriteSelectedButton}
          >
            {language === 'ar' ? `تحديث المفضلة (${convertToArabicNumber(selectedVerses.size)} آية)` : `Update Favorites (${selectedVerses.size} Verses)`}
          </button>
        </div>
      )}

      <div>
        <h2 className={styles.chapterTitle}>
          📜 {getBookName(selectedBookIndex)} {getChapterLabel(selectedChapterIndex)}
        </h2>
        
        <button
          onClick={handleFavouriteChapter}
          className={`${styles.favouriteChapterButton} ${isCurrentChapterFavourite ? styles.isFavourite : ''}`}
          title={isCurrentChapterFavourite ? (language === 'ar' ? 'إزالة الإصحاح من المفضلة' : 'Remove Chapter from Favorites') : (language === 'ar' ? 'أضف الإصحاح للمفضلة' : 'Add Chapter to Favorites')}
        >
          {isCurrentChapterFavourite ? (language === 'ar' ? 'إزالة الإصحاح' : 'Remove Chapter') : (language === 'ar' ? 'أضف الإصحاح' : 'Add Chapter')} ⭐
        </button>
        
        <div className={styles.verseContainer}>
          {verses?.map((verse, index) => {
            const verseKey = `${selectedBookIndex}-${selectedChapterIndex}-${index}`;
            const isSelected = selectedVerses.has(verseKey);
            const isFavourite = favouriteVerses[verseKey] !== undefined;

            return (
              <span 
                key={index} 
                className={`${styles.singleVerse} ${isSelected ? styles.selectedVerse : ''} ${isFavourite ? styles.favouriteVerse : ''}`}
                // أحداث اللمس للشاشات الصغيرة
                onTouchStart={(e) => isTouchDevice() && handleVerseTouchStart(e, verseKey, verse)}
                onTouchEnd={(e) => isTouchDevice() && handleVerseTouchEnd(e, verseKey)}
                // حدث النقر للشاشات الكبيرة
                onClick={(e) => !isTouchDevice() && handleVerseSelection(verseKey)}
              >
                <div 
                  className={styles.verseNumberAndText}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleVerseSelection(verseKey)}
                    className={styles.verseCheckbox}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <strong className={styles.verseNumber}>
                    {getVerseNumber(index)}.
                  </strong>{' '}
                  {verse}{' '}
                </div>

                <div className={styles.verseActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFavouriteSingleVerse(verse, index);
                    }}
                    className={`${styles.favouriteButton} ${isFavourite ? styles.isFavourite : ''}`}
                    title={language === 'ar' ? (isFavourite ? 'إزالة من المفضلة' : 'أضف للمفضلة') : (isFavourite ? 'Remove from Favorites' : 'Add to Favorites')}
                  >
                    ⭐
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopySingleVerse(verse, index);
                    }}
                    className={styles.copyButton}
                    title={language === 'ar' ? 'نسخ الآية' : language === 'en' ? 'Copy Verse' : 'Copier le verset'}
                  >
                    📋
                  </button>
                </div>
              </span>
            );
          }) || <div className={styles.noVersesMessage}>
            {language === 'ar' ? 'لا توجد آيات متاحة لهذا الإصحاح أو السفر.' : 'No verses available for this chapter or book.'}
          </div>}
        </div>
      </div>
      
      {popupVerse && (
        <VerseActionsPopup 
            verse={popupVerse} 
            onClose={handleClosePopup}
            onCopy={handleCopyPopup}
            onFavourite={handleFavouritePopup}
        />
      )}
    </div>
  );
}