'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import arabicBible from '@/data/bibles/ar_svd.json';
import englishBible from '@/data/bibles/en_bbe.json';
import frenchBible from '@/data/bibles/fr_apee.json';
import { bookNames } from '@/data/bookNames';

export default function BibleSearchPage() {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const bibles = {
    ar: arabicBible,
    en: englishBible,
    fr: frenchBible,
  };

  const bible = bibles[language];
  const names = bookNames[language];

  const handleSearch = () => {
    const lowerQuery = query.toLowerCase();
    const found = [];

    bible.forEach((book, bookIndex) => {
      book.chapters.forEach((chapter, chapterIndex) => {
        chapter.forEach((verse, verseIndex) => {
          if (verse.toLowerCase().includes(lowerQuery)) {
            found.push({
              book: names[bookIndex] || 'سفر غير معروف',
              chapter: chapterIndex + 1,
              verseNumber: verseIndex + 1,
              verseText: verse,
            });
          }
        });
      });
    });

    setResults(found);
    setHasSearched(true);
  };

  return (
    <main style={{ padding: '2rem' }} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        🔍 {
          language === 'ar'
            ? 'البحث في الكتاب المقدس'
            : language === 'fr'
            ? 'Recherche dans la Bible'
            : 'Bible Search'
        }
      </h1>

      <input
        type="text"
        placeholder={
          language === 'ar'
            ? 'اكتب كلمة أو عبارة...'
            : language === 'fr'
            ? 'Entrez un mot ou une phrase...'
            : 'Enter a word or phrase...'
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: '0.5rem', width: '100%', marginBottom: '1rem' }}
      />

      <button
        onClick={handleSearch}
        style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}
      >
        {
          language === 'ar'
            ? 'ابحث'
            : language === 'fr'
            ? 'Chercher'
            : 'Search'
        }
      </button>

      {hasSearched && results.length === 0 && (
        <p style={{ color: 'gray' }}>
          🙁 {
            language === 'ar'
              ? 'لا توجد نتائج'
              : language === 'fr'
              ? 'Aucun résultat'
              : 'No results found'
          }
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((res, index) => (
          <li
            key={index}
            style={{
              marginBottom: '1rem',
              borderBottom: '1px solid #ccc',
              paddingBottom: '0.5rem',
            }}
          >
            <strong>
              📖 {res.book} {res.chapter}:{res.verseNumber}
            </strong>
            <br />
            {res.verseText}
          </li>
        ))}
      </ul>
    </main>
  );
}
