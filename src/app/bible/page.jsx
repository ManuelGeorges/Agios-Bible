'use client';

import { useState, useEffect } from 'react'; // Import useEffect
import { useLanguage } from '@/context/LanguageContext';
import arabicBible from '@/data/bibles/ar_svd.json';
import englishBible from '@/data/bibles/en_bbe.json';
import frenchBible from '@/data/bibles/fr_apee.json';
import { bookNames } from '@/data/bookNames';
import styles from './Bible.module.css';

// Helper function to convert numbers to Arabic numerals
function convertToArabicNumber(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicNums[+d]).join('');
}

export default function BiblePage() {
  const { language } = useLanguage();

  const bibles = {
    ar: arabicBible,
    en: englishBible,
    fr: frenchBible,
  };

  const bible = bibles[language];
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState('');
  // State to store selected verses for multi-copy
  // Stores a Set of unique keys: "bookIndex-chapterIndex-verseIndex"
  const [selectedVerses, setSelectedVerses] = useState(new Set());

  // Effect to clear the copied message after a timeout
  useEffect(() => {
    let timerId;
    if (copiedMessage) {
      timerId = setTimeout(() => {
        setCopiedMessage('');
      }, 2000);
    }
    // Cleanup function: clear the timeout if component unmounts or message changes
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [copiedMessage]); // Dependency array: re-run effect when copiedMessage changes

  const handleBookChange = (e) => {
    setSelectedBookIndex(parseInt(e.target.value));
    setSelectedChapterIndex(0); // Reset chapter to 0 when book changes
    setSelectedVerses(new Set()); // Clear selected verses when book changes
  };

  const handleChapterChange = (e) => {
    setSelectedChapterIndex(parseInt(e.target.value));
    setSelectedVerses(new Set()); // Clear selected verses when chapter changes
  };

  const selectedBook = bible[selectedBookIndex];
  const chapters = selectedBook?.chapters || [];
  const verses = chapters[selectedChapterIndex] || [];

  const getBookName = (index) => {
    return bookNames[language]?.[index] || 'Unknown Book'; // Fallback for unknown
  };

  const getChapterLabel = (index) => {
    if (language === 'ar') return `الإصحاح ${convertToArabicNumber(index + 1)}`;
    if (language === 'fr') return `Chapitre ${index + 1}`;
    return `Chapter ${index + 1}`;
  };

  const getVerseNumber = (index) => {
    return language === 'ar' ? convertToArabicNumber(index + 1) : index + 1;
  };

  // Generates the full verse text with its reference
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

  // Unified function for copying text to clipboard using document.execCommand
  const copyTextToClipboard = (textToCopy) => {
    let textarea = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      // Make the textarea invisible and out of the viewport
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      document.execCommand('copy');

      setCopiedMessage(
        language === 'ar' ? 'تم النسخ!' : language === 'en' ? 'Copied!' : 'Copié!'
      );
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopiedMessage(
        language === 'ar' ? 'فشل النسخ!' : language === 'en' ? 'Failed to copy!' : 'Échec de la copie!'
      );
    } finally {
      // Ensure the textarea is removed from the DOM
      if (textarea && document.body.contains(textarea)) {
        document.body.removeChild(textarea);
      }
    }
  };

  // Handles copying a single verse
  const handleCopySingleVerse = (verse, verseIndex) => {
    const textToCopy = getFullVerseText(selectedBookIndex, selectedChapterIndex, verseIndex, verse);
    copyTextToClipboard(textToCopy);
  };

  // Handles selecting/deselecting a verse for multi-copy
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

  // Handles copying all selected verses
  const handleCopySelectedVerses = () => {
    if (selectedVerses.size === 0) return;

    let compiledText = [];
    // Sort selected verses by their index to maintain order
    const sortedSelectedVerseKeys = Array.from(selectedVerses).sort((a, b) => {
      const [, , verseIdxA] = a.split('-').map(Number);
      const [, , verseIdxB] = b.split('-').map(Number);
      return verseIdxA - verseIdxB;
    });

    sortedSelectedVerseKeys.forEach(key => {
      const [bookIdx, chapterIdx, verseIdx] = key.split('-').map(Number);
      // Ensure the verse still exists in the current view (important if user navigates while verses are selected)
      if (bookIdx === selectedBookIndex && chapterIdx === selectedChapterIndex && verses[verseIdx]) {
        compiledText.push(getFullVerseText(bookIdx, chapterIdx, verseIdx, verses[verseIdx]));
      }
    });

    const textToCopy = compiledText.join('\n\n'); // Join with double newline for readability
    copyTextToClipboard(textToCopy);
    setSelectedVerses(new Set()); // Clear selection after copying
  };

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
            {bible.map((_, index) => (
              <option key={index} value={index}>
                {getBookName(index)}
              </option>
            ))}
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
            {chapters.map((_, index) => (
              <option key={index} value={index}>
                {getChapterLabel(index)}
              </option>
            ))}
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
          {verses.map((verse, index) => {
            const verseKey = `${selectedBookIndex}-${selectedChapterIndex}-${index}`;
            const isSelected = selectedVerses.has(verseKey);

            return (
              <li
                key={index}
                className={`${styles.verseItem} ${isSelected ? styles.selectedVerse : ''}`}
                // Allow clicking the entire list item to toggle selection
                onClick={() => handleVerseSelection(verseKey)}
              >
                <div className={styles.verseContent}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleVerseSelection(verseKey)}
                    className={styles.verseCheckbox}
                    // Prevent the li's click handler from firing twice when checkbox is clicked directly
                    onClick={(e) => e.stopPropagation()}
                  />
                  <strong className={styles.verseNumber}>
                    {getVerseNumber(index)}.
                  </strong>{' '}
                  {verse}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent li's click handler from firing
                    handleCopySingleVerse(verse, index);
                  }}
                  className={styles.copyButton}
                  title={language === 'ar' ? 'نسخ الآية' : language === 'en' ? 'Copy Verse' : 'Copier le verset'}
                >
                  📋
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
