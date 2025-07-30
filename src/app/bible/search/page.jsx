// src/app/bible-search/page.js

'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { bookNames } from '@/data/bookNames';
import styles from './page.module.css';

export default function BibleSearchPage() {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [useStemming, setUseStemming] = useState(false);

  const names = bookNames[language];

const handleSearch = async () => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    console.log("❌ Query is empty. Skipping fetch.");
    return;
  }

  setHasSearched(true);
  setLoading(true);
  setResults([]);

  try {
const res = await fetch(`/bible/search?q=${encodeURIComponent(trimmedQuery)}&lang=${language}&stem=${useStemming}`);
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    setResults(data);
  } catch (error) {
    console.error('Error fetching search results:', error);
    alert(`An error occurred during search: ${error.message}`);
  } finally {
    setLoading(false);
  }
};



  return (
    <main className={styles.mainContainer} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <h1 className={styles.pageTitle}>
        🔍 {
          language === 'ar'
            ? 'البحث في الكتاب المقدس'
            : language === 'fr'
            ? 'Recherche dans la Bible'
            : 'Bible Search'
        }
      </h1>

      <div className={styles.searchControls}>
        <input
          type="text"
          placeholder={
            language === 'ar'
              ? 'اكتب كلمة أو عبارة...'
              : language === 'fr'
              ? 'Entrez un word or phrase...'
              : 'Enter a word or phrase...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.searchInput}
        />

        <div className={styles.optionsContainer}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={useStemming}
              onChange={(e) => setUseStemming(e.target.checked)}
              className={styles.checkboxInput}
            />
            {
              language === 'ar'
                ? 'البحث بالجذور'
                : language === 'fr'
                ? 'Recherche par racines'
                : 'Stemming Search'
            }
          </label>
        </div>

        <button
          onClick={handleSearch}
          className={styles.searchButton}
          disabled={loading}
        >
          {loading ? (language === 'ar' ? 'جاري البحث...' : language === 'fr' ? 'Recherche en cours...' : 'Searching...') : (
            language === 'ar'
              ? 'ابحث'
              : language === 'fr'
              ? 'Chercher'
              : 'Search'
          )}
        </button>
      </div>

      {hasSearched && results.length === 0 && !loading && (
        <p className={styles.noResults}>
          🙁 {
            language === 'ar'
              ? 'لا توجد نتائج'
              : language === 'fr'
              ? 'Aucun résultat'
              : 'No results found'
          }
        </p>
      )}

      {loading && (
        <p className={styles.loadingMessage}>
          {language === 'ar' ? 'جاري تحميل النتائج...' : language === 'fr' ? 'Chargement des résultats...' : 'Loading results...'}
        </p>
      )}

      <ul className={styles.resultsList}>
        {results.map((res, index) => (
          <li
            key={index}
            className={styles.resultItem}
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