'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from './Bible.module.css';

function convertToArabicNumber(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicNums[+d]).join('');
}

export default function BiblePage() {
  const { language } = useLanguage();
  console.log('Current language from context:', language); // Debug

  const [bibleData, setBibleData] = useState(null);
  const [isLoadingBible, setIsLoadingBible] = useState(true);
  const [bookNamesData, setBookNamesData] = useState(null);
  const [hasBookNamesError, setHasBookNamesError] = useState(false);

  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState('');
  const [selectedVerses, setSelectedVerses] = useState(new Set());

  useEffect(() => {
    const loadBookNames = async () => {
      console.log('Attempting to load bookNames.json'); // Debug
      try {
        const response = await fetch('/data/bookNames.json');
        console.log('bookNames.json fetch response status:', response.status); // Debug
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} for /data/bookNames.json`);
        }
        const data = await response.json();
        console.log('bookNames.json data loaded:', data); // Debug
        setBookNamesData(data);
        setHasBookNamesError(false);
      } catch (error) {
        console.error('Failed to load bookNames:', error); // Debug
        setBookNamesData({});
        setHasBookNamesError(true);
      }
    };
    loadBookNames();
  }, []);

  useEffect(() => {
    const loadBible = async () => {
      setIsLoadingBible(true);
      setBibleData(null);
      console.log(`Attempting to load Bible for language: "${language}"`); // Debug
      try {
        let jsonFileName = '';
        if (language === 'ar') {
          jsonFileName = 'ar_svd.json';
        } else if (language === 'en') {
          jsonFileName = 'en_bbe.json';
        } else if (language === 'fr') {
          jsonFileName = 'fr_apee.json';
        } else {
          console.warn(`No valid language "${language}" provided. Setting Bible data to empty.`); // Debug
          setBibleData([]);
          setIsLoadingBible(false);
          return;
        }

        const jsonFilePath = `/data/bibles/${jsonFileName}`;
        console.log(`Fetching Bible data from: "${jsonFilePath}"`); // Debug

        const response = await fetch(jsonFilePath);
        console.log(`Bible data fetch response status for ${jsonFileName}:`, response.status); // Debug

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} for ${jsonFilePath}`);
        }

        const data = await response.json();
        console.log(`Raw Bible data for ${jsonFileName}:`, data); // Debug
        console.log(`Is Bible data an array for ${jsonFileName}?`, Array.isArray(data)); // Debug
        console.log(`Bible data length for ${jsonFileName}:`, data?.length); // Debug


        if (Array.isArray(data) && data.length > 0) {
          setBibleData(data);
          setSelectedBookIndex(0);
          setSelectedChapterIndex(0);
          setSelectedVerses(new Set());
        } else {
          console.warn(`Fetched Bible data for "${language}" is empty or not an array as expected. Data:`, data); // Debug
          setBibleData([]);
        }
      } catch (error) {
        console.error(`Failed to fetch bible data for "${language}":`, error); // Debug
        setBibleData(null);
      } finally {
        setIsLoadingBible(false);
        console.log(`Loading finished for language: "${language}".`); // Debug
      }
    };

    if (language && ['ar', 'en', 'fr'].includes(language)) {
      loadBible();
    } else {
      console.log('Skipping Bible load due to invalid or missing language.'); // Debug
      setIsLoadingBible(false);
      setBibleData([]);
    }
  }, [language]);

  useEffect(() => {
    let timerId;
    if (copiedMessage) {
      timerId = setTimeout(() => {
        setCopiedMessage('');
      }, 2000);
    }
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [copiedMessage]);

  const handleBookChange = (e) => {
    setSelectedBookIndex(parseInt(e.target.value));
    setSelectedChapterIndex(0);
    setSelectedVerses(new Set());
  };

  const handleChapterChange = (e) => {
    setSelectedChapterIndex(parseInt(e.target.value));
    setSelectedVerses(new Set());
  };

  const selectedBook = bibleData?.[selectedBookIndex] || null;

  const chapters = selectedBook?.chapters || [];

  const verses = chapters?.[selectedChapterIndex] || [];

  const getBookName = (index) => {
    return bookNamesData?.[language]?.[index] || 'Unknown Book';
  };

  const getChapterLabel = (index) => {
    if (language === 'ar') return `الإصحاح ${convertToArabicNumber(index + 1)}`;
    if (language === 'fr') return `Chapitre ${index + 1}`;
    return `Chapter ${index + 1}`;
  };

  const getVerseNumber = (index) => {
    return language === 'ar' ? convertToArabicNumber(index + 1) : index + 1;
  };

  const getFullVerseText = (bookIdx, chapterIdx, verseIdx, verseText) => {
    const bookName = getBookName(bookIdx);
    const chapterNumber = chapterIdx + 1;
    const verseNumber = verseIdx + 1;

    let reference;
    if (language === 'ar') {
      reference = `(${bookName} ${convertToArabicNumber(chapterNumber)}:${convertToArabicNumber(verseNumber)})`;
    } else if (language === 'fr') {
      reference = `(${bookName} ${chapterNumber}:${verseNumber})`;
    } else {
      reference = `(${bookName} ${chapterNumber}:${verseNumber})`;
    }

    return `${verseText} ${reference}`;
  };

  const copyTextToClipboard = async (textToCopy) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
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

  const handleCopySingleVerse = (verse, verseIndex) => {
    const textToCopy = getFullVerseText(selectedBookIndex, selectedChapterIndex, verseIndex, verse);
    copyTextToClipboard(textToCopy);
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

  if (isLoadingBible || bookNamesData === null) {
    return (
      <main className={styles.container} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <div className={styles.loadingMessage}>
          {language === 'ar' ? 'جارٍ تحميل الكتاب المقدس...' : language === 'en' ? 'Loading Bible...' : 'Chargement de la Bible...'}
        </div>
      </main>
    );
  }

  if (!bibleData || bibleData.length === 0 || hasBookNamesError || !bookNamesData?.[language] || Object.keys(bookNamesData[language]).length === 0) {
    return (
      <main className={styles.container} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <div className={styles.errorMessage}>
          {language === 'ar' ? 'فشل تحميل بيانات الكتاب المقدس أو البيانات فارغة.' : language === 'en' ? 'Failed to load Bible data or data is empty.' : 'Échec du chargement des données de la Bible ou données vides.'}
          <br />
          {hasBookNamesError && (language === 'ar' ? 'الرجاء التحقق من مسار ملف bookNames.json.' : 'Please check the path to bookNames.json.')}
          {!hasBookNamesError && (language === 'ar' ? 'الرجاء التحقق من: 1. قيمة اللغة من `LanguageContext`. 2. مسارات ملفات JSON في مجلد `public/data/bibles`. 3. بنية ملفات JSON.' : 'Please check: 1. Language value from `LanguageContext`. 2. JSON file paths in `public/data/bibles` folder. 3. JSON file structure.')}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container} dir={language === 'ar' ? 'rtl' : 'ltr'}>
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
        <div className={styles.selectGroup}>
          <label htmlFor="book-select" className={styles.label}>
            📖 {
              language === 'ar'
                ? 'اختر السفر:'
                : language === 'en'
                ? 'Select Book:'
                : 'Choisir un livre:'
            }
          </label>
          <select
            id="book-select"
            value={selectedBookIndex}
            onChange={handleBookChange}
            className={styles.selectBox}
          >
            {bibleData?.map((book, index) => (
                <option key={index} value={index}>
                    {getBookName(index)}
                </option>
            )) || <option value="">{language === 'ar' ? 'لا توجد أسفار متاحة' : 'No books available'}</option>}
          </select>
        </div>

        <div className={styles.selectGroup}>
          <label htmlFor="chapter-select" className={styles.label}>
            🔢 {
              language === 'ar'
                ? 'اختر الإصحاح:'
                : language === 'en'
                ? 'Select Chapter:'
                : 'Choisir un chapitre:'
            }
          </label>
          <select
            id="chapter-select"
            value={selectedChapterIndex}
            onChange={handleChapterChange}
            className={styles.selectBox}
          >
            {chapters?.map((_, index) => (
                <option key={index} value={index}>
                    {getChapterLabel(index)}
                </option>
            )) || <option value="">{language === 'ar' ? 'لا توجد إصحاحات متاحة' : 'No chapters available'}</option>}
          </select>
        </div>
      </div>

      {copiedMessage && (
        <div className={`${styles.copiedMessage} ${language === 'ar' ? styles.copiedMessageArabic : ''}`}>
          {copiedMessage}
        </div>
      )}

      {selectedVerses.size > 0 && (
        <button
          onClick={handleCopySelectedVerses}
          className={styles.copySelectedButton}
        >
          {language === 'ar' ? `نسخ ${convertToArabicNumber(selectedVerses.size)} آية مختارة` : `Copy ${selectedVerses.size} Selected Verses`}
        </button>
      )}

      <div>
        <h2 className={styles.chapterTitle}>
          📜 {getBookName(selectedBookIndex)} {getChapterLabel(selectedChapterIndex)}
        </h2>
        <ul className={styles.verseList}>
          {verses?.map((verse, index) => {
            const verseKey = `${selectedBookIndex}-${selectedChapterIndex}-${index}`;
            const isSelected = selectedVerses.has(verseKey);

            return (
              <li
                key={index}
                className={`${styles.verseItem} ${isSelected ? styles.selectedVerse : ''}`}
                onClick={() => handleVerseSelection(verseKey)}
              >
                <div className={styles.verseContent}>
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
                  {verse}
                </div>
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
              </li>
            );
          }) || <li className={styles.noVersesMessage}>
            {language === 'ar' ? 'لا توجد آيات متاحة لهذا الإصحاح أو السفر.' : 'No verses available for this chapter or book.'}
          </li>}
        </ul>
      </div>
    </main>
  );
}