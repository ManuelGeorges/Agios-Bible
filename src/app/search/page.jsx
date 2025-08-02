'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './search.module.css';

function convertToArabicNumber(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicNums[+d]).join('');
}

function CustomSelect({ label, options, value, onChange, dir }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);

  const selectedLabel = options.find(opt => opt.value.toString() === value.toString())?.label || `اختر ${label}`;

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSelect = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  const handleClickOutside = useCallback((event) => {
    if (selectRef.current && !selectRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  return (
    <div className={styles.customSelectWrapper} ref={selectRef}>
      <label className={styles.label}>{label}</label>
      <div
        className={`${styles.selectTrigger} ${isOpen ? styles.active : ''}`}
        onClick={handleToggle}
        dir={dir}
      >
        <span>{selectedLabel}</span>
        <div className={styles.arrow}></div>
      </div>
      <ul className={`${styles.dropdownMenu} ${isOpen ? styles.open : ''}`}>
        {options.map(option => (
          <li
            key={option.value}
            className={`${styles.dropdownItem} ${value.toString() === option.value.toString() ? styles.selected : ''}`}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BibleSearchPage() {
  const [inputTerm, setInputTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [bibleData, setBibleData] = useState(null);
  const [bookNamesData, setBookNamesData] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allVerses, setAllVerses] = useState([]);
  const [selectedTestament, setSelectedTestament] = useState('');
  const [selectedBookIndex, setSelectedBookIndex] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const language = 'ar';
  const dir = 'rtl';
  const [favouriteVerses, setFavouriteVerses] = useState({});
  const [favouriteMessage, setFavouriteMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState('');
  const [selectedVerses, setSelectedVerses] = useState(new Set());
  const [isMobileSelectionMode, setIsMobileSelectionMode] = useState(false);
  const [pressTimer, setPressTimer] = useState(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  // useRef to prevent immediate deselection after a long press on mobile
  const didHoldRef = useRef(false);

  const fetchFavourites = useCallback(() => {
    try {
      const verses = JSON.parse(localStorage.getItem('favourite_verses')) || {};
      setFavouriteVerses(verses);
    } catch (error) {
      console.error('Failed to load favorites from localStorage:', error);
    }
  }, []);

  const saveFavourites = useCallback((verses) => {
    try {
      localStorage.setItem('favourite_verses', JSON.stringify(verses));
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error);
    }
  }, []);

  const getBookName = useCallback((index) => {
    return bookNamesData?.[language]?.[index] || 'Unknown Book';
  }, [bookNamesData, language]);
  
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
      setCopiedMessage(language === 'ar' ? 'تم النسخ!' : 'Copied!');
      setTimeout(() => setCopiedMessage(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopiedMessage(language === 'ar' ? 'فشل النسخ!' : 'Failed to copy!');
      setTimeout(() => setCopiedMessage(''), 2000);
    }
  };
  
  const handleCopySingleVerse = (verse) => {
    const reference = `(${verse.book} ${language === 'ar' ? convertToArabicNumber(verse.chapter + 1) : verse.chapter + 1}:${language === 'ar' ? convertToArabicNumber(verse.verse + 1) : verse.verse + 1})`;
    const textToCopy = `${verse.text} ${reference}`;
    copyTextToClipboard(textToCopy);
  };

  const handleFavouriteSingleVerse = (verse) => {
    const verseKey = `${verse.book_index}-${verse.chapter}-${verse.verse}`;
    const isFavourite = favouriteVerses[verseKey] !== undefined;

    let newFavouriteVerses = { ...favouriteVerses };
    if (isFavourite) {
      delete newFavouriteVerses[verseKey];
      setFavouriteMessage(language === 'ar' ? 'تم الحذف من المفضلة!' : 'Removed from favorites!');
    } else {
      newFavouriteVerses[verseKey] = {
        type: 'verse',
        verseKey,
        text: verse.text,
        bookName: verse.book,
        chapter: verse.chapter,
        verseIndex: verse.verse,
        language: language,
      };
      setFavouriteMessage(language === 'ar' ? 'تم الإضافة إلى المفضلة!' : 'Added to favorites!');
    }

    setFavouriteVerses(newFavouriteVerses);
    saveFavourites(newFavouriteVerses);
    setTimeout(() => setFavouriteMessage(''), 2000);
  };
  
  const handleVerseSelection = (verseKey) => {
    setSelectedVerses(prevSelected => {
      const newSelection = new Set(prevSelected);
      if (newSelection.has(verseKey)) {
        newSelection.delete(verseKey);
      } else {
        newSelection.add(verseKey);
      }
      if (newSelection.size === 0) {
        setIsMobileSelectionMode(false);
      }
      return newSelection;
    });
  };

  const handleVerseTouchStart = (verseKey) => {
    if (!isSmallScreen) return;
    didHoldRef.current = false; // Reset on every new touch
    setPressTimer(
      setTimeout(() => {
        setIsMobileSelectionMode(true);
        setSelectedVerses(new Set([verseKey]));
        didHoldRef.current = true; // Flag indicates a long press succeeded
        setPressTimer(null);
      }, 500)
    );
  };

  const handleVerseTouchEnd = (verseKey) => {
    if (!isSmallScreen) return;
    
    // Clear the timer if it exists (i.e., this was a short tap)
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
    
    // If a long press was just completed, the selection is already handled.
    // We do nothing here to prevent immediate deselection.
    if (didHoldRef.current) {
        didHoldRef.current = false;
        return;
    }

    // Now, for a short tap (not a long press)
    // If we are already in selection mode, a short tap should toggle the verse.
    if (isMobileSelectionMode) {
      handleVerseSelection(verseKey);
    }
  };
  
  const handleCopySelectedVerses = () => {
    if (selectedVerses.size === 0) return;
    
    const compiledText = searchResults
      .filter(verse => selectedVerses.has(`${verse.book_index}-${verse.chapter}-${verse.verse}`))
      .map(verse => {
        const reference = `(${verse.book} ${language === 'ar' ? convertToArabicNumber(verse.chapter + 1) : verse.chapter + 1}:${language === 'ar' ? convertToArabicNumber(verse.verse + 1) : verse.verse + 1})`;
        return `${verse.text} ${reference}`;
      }).join('\n\n');
    
    copyTextToClipboard(compiledText);
    setSelectedVerses(new Set());
    setIsMobileSelectionMode(false);
  };
  
  const handleFavouriteSelectedVerses = () => {
    if (selectedVerses.size === 0) return;
    
    let newFavouriteVerses = { ...favouriteVerses };
    const selectedResults = searchResults.filter(verse => selectedVerses.has(`${verse.book_index}-${verse.chapter}-${verse.verse}`));
    
    selectedResults.forEach(verse => {
      const verseKey = `${verse.book_index}-${verse.chapter}-${verse.verse}`;
      newFavouriteVerses[verseKey] = {
        type: 'verse',
        verseKey,
        text: verse.text,
        bookName: verse.book,
        chapter: verse.chapter,
        verseIndex: verse.verse,
        language: language,
      };
    });
    
    setFavouriteVerses(newFavouriteVerses);
    saveFavourites(newFavouriteVerses);
    setFavouriteMessage(language === 'ar' ? `تم إضافة ${selectedResults.length} آية إلى المفضلة!` : `Added ${selectedResults.length} verses to favorites!`);
    setTimeout(() => setFavouriteMessage(''), 2000);
    setSelectedVerses(new Set());
    setIsMobileSelectionMode(false);
  };
  
  const handleCopyAllResults = () => {
    if (searchResults.length === 0) return;
    
    const compiledText = searchResults
      .map(verse => {
        const reference = `(${verse.book} ${language === 'ar' ? convertToArabicNumber(verse.chapter + 1) : verse.chapter + 1}:${language === 'ar' ? convertToArabicNumber(verse.verse + 1) : verse.verse + 1})`;
        return `${verse.text} ${reference}`;
      }).join('\n\n');
      
    copyTextToClipboard(compiledText);
  };
  
  const handleFavouriteAllResults = () => {
    if (searchResults.length === 0) return;
    
    let newFavouriteVerses = { ...favouriteVerses };
    searchResults.forEach(verse => {
      const verseKey = `${verse.book_index}-${verse.chapter}-${verse.verse}`;
      newFavouriteVerses[verseKey] = {
        type: 'verse',
        verseKey,
        text: verse.text,
        bookName: verse.book,
        chapter: verse.chapter,
        verseIndex: verse.verse,
        language: language,
      };
    });
    
    setFavouriteVerses(newFavouriteVerses);
    saveFavourites(newFavouriteVerses);
    setFavouriteMessage(language === 'ar' ? `تم إضافة ${searchResults.length} آية إلى المفضلة!` : `Added ${searchResults.length} verses to favorites!`);
    setTimeout(() => setFavouriteMessage(''), 2000);
  };
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bibleResponse, bookNamesResponse] = await Promise.all([
          fetch(`/data/bibles/ar_svd.json`),
          fetch(`/data/bookNames.json`)
        ]);
        
        if (!bibleResponse.ok || !bookNamesResponse.ok) {
          throw new Error('فشل في جلب البيانات من المسارات المحلية.');
        }

        const bibleJson = await bibleResponse.json();
        const bookNamesJson = await bookNamesResponse.json();
        
        setBibleData(bibleJson);
        setBookNamesData(bookNamesJson);
        
        const flattenedVerses = bibleJson.flatMap((book, bookIndex) => 
          book.chapters.flatMap((chapter, chapterIndex) =>
            chapter.map((verseText, verseIndex) => ({
              text: verseText,
              book: bookNamesJson[language][bookIndex],
              book_index: bookIndex,
              chapter: chapterIndex,
              verse: verseIndex,
              testament: book.testament,
            }))
          )
        );
        setAllVerses(flattenedVerses);
        
        setIsLoading(false);
      } catch (err) {
        setError('فشل في جلب البيانات. تأكد من وجود ملفات البيانات في المسار /data/bibles/ و /data/.');
        setIsLoading(false);
        console.error(err);
      }
    };
    fetchFavourites();
    fetchData();
  }, [fetchFavourites, language]);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(inputTerm.trim());
  };

  useEffect(() => {
    if (searchQuery.length > 0 && allVerses.length > 0) {
      let filteredVerses = allVerses;

      if (selectedTestament) {
        filteredVerses = filteredVerses.filter(verse => verse.testament === selectedTestament);
      }

      if (selectedBookIndex !== '') {
Verses = filteredVerses.filter(verse => verse.book_index.toString() === selectedBookIndex.toString());
      }

      if (selectedChapter !== '') {
        filteredVerses = filteredVerses.filter(verse => verse.chapter.toString() === selectedChapter.toString());
      }
      
      const results = filteredVerses.filter(verse => verse.text.includes(searchQuery));
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, allVerses, selectedTestament, selectedBookIndex, selectedChapter]);

  const renderHighlightedText = (text, highlight) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => (
          <span key={i} className={part.toLowerCase() === highlight.toLowerCase() ? styles.highlight : ''}>
            {part}
          </span>
        ))}
      </span>
    );
  };
  
  const allBooks = bookNamesData ? bookNamesData[language] : [];
  const availableBooks = allBooks.filter((_, index) => {
    if (!selectedTestament || !bibleData) return true;
    return bibleData[index].testament === selectedTestament;
  });

  const availableChapters = selectedBookIndex !== '' && bibleData ? bibleData[selectedBookIndex].chapters.map((_, index) => index) : [];

  return (
    <div className={styles.container} dir={dir}>
      {copiedMessage && <div className={`${styles.messageBox} ${styles.copiedMessage}`}>{copiedMessage}</div>}
      {favouriteMessage && <div className={`${styles.messageBox} ${styles.favouriteMessage}`}>{favouriteMessage}</div>}
      <div className={styles.card}>
        <h1 className={styles.heading}>الباحث الإنجيلي</h1>
        <p className={styles.description}>
          ابحث في الكتاب المقدس باللغة العربية عن آيات أو كلمات محددة، مع خيارات لتحديد العهد أو السفر أو الأصحاح لتصفية نتائج البحث.
        </p>
        <form onSubmit={handleSearch} className={styles.controls}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              value={inputTerm}
              onChange={(e) => setInputTerm(e.target.value)}
              className={styles.input}
              placeholder="ابحث بكلمة أو جملة..."
            />
            <button type="submit" className={styles.searchButton}>بحث</button>
          </div>
          <div className={styles.inputGroup}>
            <CustomSelect
              label="العهد"
              options={[{ value: '', label: 'كل العهدين' }, { value: 'OT', label: 'العهد القديم' }, { value: 'NT', label: 'العهد الجديد' }]}
              value={selectedTestament}
              onChange={(e) => { setSelectedTestament(e.target.value); setSelectedBookIndex(''); setSelectedChapter(''); }}
              dir={dir}
            />
            <CustomSelect
              label="السفر"
              options={[{ value: '', label: 'كل الأسفار' }, ...availableBooks.map((bookName, index) => ({ value: allBooks.indexOf(bookName), label: bookName }))]}
              value={selectedBookIndex}
              onChange={(e) => { setSelectedBookIndex(e.target.value); setSelectedChapter(''); }}
              dir={dir}
            />
            <CustomSelect
              label="الأصحاح"
              options={[{ value: '', label: 'كل الأصحاحات' }, ...availableChapters.map(chapterIndex => ({ value: chapterIndex, label: convertToArabicNumber(chapterIndex + 1) }))]}
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              dir={dir}
            />
          </div>
        </form>
        {isLoading && <p className={styles.loading}>يتم تحميل البيانات...</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!isLoading && !error && (
          <div className={styles.resultsWrapper}>
            {searchResults.length > 0 && searchQuery && (
              <p className={styles.resultsCount}>
                {`تم العثور على ${convertToArabicNumber(searchResults.length)} نتيجة لـ "${searchQuery}"`}
              </p>
            )}
            {searchResults.length === 0 && searchQuery && (
              <p className={styles.noResults}>
                لم يتم العثور على نتائج لـ "{searchQuery}"
              </p>
            )}
            {searchResults.length > 0 && (
              <>
                <div className={styles.batchActions}>
                    <button onClick={handleCopyAllResults}>
                      نسخ كل النتائج ({convertToArabicNumber(searchResults.length)})
                    </button>
                    <button onClick={handleFavouriteAllResults}>
                      إضافة كل النتائج للمفضلة ({convertToArabicNumber(searchResults.length)})
                    </button>
                  </div>
                {selectedVerses.size > 0 && (
                  <div className={styles.batchActions}>
                    <button onClick={handleCopySelectedVerses}>
                      نسخ الآيات المحددة ({convertToArabicNumber(selectedVerses.size)})
                    </button>
                    <button onClick={handleFavouriteSelectedVerses}>
                      إضافة للمفضلة ({convertToArabicNumber(selectedVerses.size)})
                    </button>
                  </div>
                )}
                <div className={styles.resultsContainer}>
                  {searchResults.map((verse, index) => {
                    const verseKey = `${verse.book_index}-${verse.chapter}-${verse.verse}`;
                    const isFavourite = favouriteVerses[verseKey] !== undefined;
                    const isSelected = selectedVerses.has(verseKey);
                    
                    const verseProps = {};
                    if (isSmallScreen) {
                      verseProps.onTouchStart = () => handleVerseTouchStart(verseKey);
                      verseProps.onTouchEnd = () => handleVerseTouchEnd(verseKey);
                    } else {
                      verseProps.onClick = () => handleVerseSelection(verseKey);
                    }
                    
                    return (
                      <div
                        key={verseKey}
                        className={`${styles.verseItem} ${isSelected ? styles.selectedVerse : ''} ${isFavourite ? styles.isFavourite : ''}`}
                        {...verseProps}
                      >
                        <div className={styles.verseHeader}>
                          {!isSmallScreen && (
                            <input
                              type="checkbox"
                              className={styles.verseCheckbox}
                              checked={isSelected}
                              readOnly
                            />
                          )}
                          <span className={styles.verseReference}>
                            {`${verse.book} ${convertToArabicNumber(verse.chapter + 1)}:${convertToArabicNumber(verse.verse + 1)}`}
                          </span>
                          <div className={styles.verseActions}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopySingleVerse(verse); }}
                              title="نسخ الآية"
                            >
                              📋
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleFavouriteSingleVerse(verse); }}
                              className={`${styles.favouriteButton} ${isFavourite ? styles.isFavourite : ''}`}
                              title={isFavourite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                            >
                              {isFavourite ? '⭐' : '☆'}
                            </button>
                          </div>
                        </div>
                        <p
                          className={styles.verseText}
                          style={{ fontSize: isSmallScreen ? '0.9em' : '1em' }}
                        >
                          {renderHighlightedText(verse.text, searchQuery)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
