"use client";

import { useState, useEffect, useCallback } from 'react';
import styles from './favourites.module.css';
import { BookOpen, Bookmark, Check, ChevronLeft, FileText, Heart, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { db } from '../../lib/firebase';
import { useLanguage } from '../context/LanguageContext';
import { StorageService, KEYS } from '../../lib/storage';

const HIGHLIGHT_COLORS = [
  '#FFC107', '#FF5722', '#F44336', '#E91E63', '#9C27B0',
  '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFECB3',
  '#F8BBD0', '#E1BEE7', '#CFD8DC'
];

export default function FavouritesPage() {
  const { strings, formatNumber, dir } = useLanguage();
  const [activeTab, setActiveTab] = useState('favourites'); 
  const [selectedColor, setSelectedColor] = useState(null); 
  const [allData, setAllData] = useState([]);
  const [colorLabels, setColorLabels] = useState({});
  const [editingColor, setEditingColor] = useState(null);
  const [tempLabel, setTempLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const fetchData = useCallback(async (u) => {
    setIsLoading(true);
    try {
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          const verses = data.favorites?.verses || {};
          const formatted = Object.entries(verses).map(([key, val]) => ({
            id: key,
            ...val
          }));
          setAllData(formatted);
          setColorLabels(data.favorites?.colorLabels || {});
        } else {
          setAllData([]);
          setColorLabels({});
        }
      } else {
        const localFavs = await StorageService.get(KEYS.FAVORITES) || {};
        const formatted = Object.entries(localFavs).map(([key, val]) => ({
          id: key,
          ...val
        }));
        setAllData(formatted);
        const localLabels = await StorageService.get('color_labels') || {};
        setColorLabels(localLabels);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      fetchData(u);
    });
    return () => unsub();
  }, [fetchData]);

  const saveColorLabel = async () => {
    if (!editingColor) return;
    const newLabels = { ...colorLabels, [editingColor]: tempLabel };
    setColorLabels(newLabels);

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          'favorites.colorLabels': newLabels
        });
      } catch (e) {
        alert(strings.favourites.error_save);
      }
    } else {
      await StorageService.save('color_labels', newLabels);
    }
    setEditingColor(null);
  };

  const handleRemove = async (item) => {
    setAllData(prev => prev.filter(i => i.id !== item.id));

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          [`favorites.verses.${item.id}`]: deleteField()
        });
      } catch (e) { fetchData(user); }
    } else {
      const localFavs = await StorageService.get(KEYS.FAVORITES) || {};
      delete localFavs[item.id];
      await StorageService.save(KEYS.FAVORITES, localFavs);
    }
  };

  const filteredItems = allData.filter(item => {
    if (activeTab === 'notes') return !!item.note;
    if (selectedColor) return item.color === selectedColor;
    return false; 
  });

  const noteCount = allData.filter(item => !!item.note).length;
  const activeColorLabel = activeTab === 'notes'
    ? strings.favourites.tab_notes
    : selectedColor
      ? colorLabels[selectedColor] || strings.favourites.no_title
      : strings.favourites.color_categories;

  if (isLoading) return <div className={styles.loadingMessage}>{strings.common.loading}</div>;

  return (
    <div className={styles.container} dir={dir}>
      <section className={styles.hero} aria-labelledby="favourites-title">
        <div className={styles.heroOrnament} aria-hidden="true"><Sparkles /><span /></div>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><BookOpen size={15} /> AGIOS · {strings.favourites.tab_favs}</span>
          <h1 id="favourites-title" className={styles.title}>{strings.favourites.title}</h1>
          <p className={styles.heroSubtitle}>{strings.favourites.color_categories}</p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statIcon}><Bookmark size={19} /></div>
          <div><strong>{formatNumber(allData.length)}</strong><span>{strings.favourites.tab_favs}</span></div>
          <i />
          <div className={styles.statIcon}><FileText size={19} /></div>
          <div><strong>{formatNumber(noteCount)}</strong><span>{strings.favourites.tab_notes}</span></div>
        </div>
      </section>

      <div className={styles.library}>
        <nav className={styles.tabContainer} aria-label={strings.favourites.title}>
          <button type="button" className={`${styles.tab} ${activeTab === 'favourites' ? styles.activeTab : ''}`} aria-pressed={activeTab === 'favourites'} onClick={() => { setActiveTab('favourites'); setSelectedColor(null); }}>
            <Heart size={17} />{strings.favourites.tab_favs}<span>{formatNumber(allData.length)}</span>
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === 'notes' ? styles.activeTab : ''}`} aria-pressed={activeTab === 'notes'} onClick={() => { setActiveTab('notes'); setSelectedColor(null); }}>
            <FileText size={17} />{strings.favourites.tab_notes}<span>{formatNumber(noteCount)}</span>
          </button>
        </nav>

        {activeTab === 'favourites' && (
          <section className={styles.categoriesSection} aria-label={strings.favourites.color_categories}>
            <div className={styles.sectionHeading}>
              <div><span className={styles.sectionKicker}>{strings.favourites.tab_favs}</span><h2>{strings.favourites.color_categories}</h2></div>
              {selectedColor && <button className={styles.clearFilter} onClick={() => setSelectedColor(null)}>{strings.common.all}<ChevronLeft size={15} /></button>}
            </div>
            <div className={styles.colorGrid}>
              {HIGHLIGHT_COLORS.map((color) => {
                const count = allData.filter(item => item.color === color).length;
                if (!count) return null;
                const label = colorLabels[color] || strings.favourites.no_title;
                return (
                  <article key={color} className={`${styles.colorCard} ${selectedColor === color ? styles.selectedColorCard : ''}`}>
                    <button type="button" className={styles.categorySelect} onClick={() => setSelectedColor(color)} aria-pressed={selectedColor === color} aria-label={`${label}, ${formatNumber(count)}`}>
                      <span className={styles.categorySwatch} style={{ '--swatch-color': color }}><Check size={14} /></span>
                      <span className={styles.categoryInfo}><strong>{label}</strong><small>{formatNumber(count)} · {strings.favourites.tab_favs}</small></span>
                      <ChevronLeft className={styles.categoryArrow} size={17} />
                    </button>
                    <button type="button" className={styles.editCategory} onClick={() => { setEditingColor(color); setTempLabel(colorLabels[color] || ''); }} aria-label={strings.favourites.modal_title}><Pencil size={14} /></button>
                  </article>
                );
              })}
              {allData.length === 0 && <div className={styles.categoriesEmpty}><Bookmark size={18} />{strings.favourites.empty_list}</div>}
            </div>
          </section>
        )}

        <section className={styles.versesSection}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.sectionKicker}>{activeTab === 'notes' ? strings.favourites.tab_notes : activeColorLabel}</span><h2>{activeTab === 'notes' ? strings.favourites.tab_notes : strings.favourites.tab_favs}</h2></div>
            <span className={styles.resultCount}>{formatNumber(filteredItems.length)}</span>
          </div>
          {activeTab === 'favourites' && !selectedColor ? (
            <div className={styles.emptyState}><span className={styles.emptyIcon}><Bookmark size={24} /></span><strong>{strings.favourites.empty_color_prompt}</strong><span>{strings.favourites.color_categories}</span></div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}><span className={styles.emptyIcon}><FileText size={24} /></span><strong>{strings.favourites.empty_list}</strong><span>{strings.favourites.tab_favs}</span></div>
          ) : (
            <div className={styles.favouritesList}>
              {filteredItems.map((item) => (
                <article key={item.id} className={styles.favouriteItem} style={{ '--verse-color': item.color || 'var(--color-accent)' }}>
                  <div className={styles.verseAccent} />
                  <div className={styles.favouriteContent}>
                    <div className={styles.favouriteMeta}>
                      <span className={styles.favouriteReference}><BookOpen size={14} />{item.reference || `${item.book} ${formatNumber((item.ch || 0) + 1)}:${formatNumber((item.v || 0) + 1)}`}</span>
                      {item.note && <span className={styles.noteBadge}><FileText size={13} />{strings.favourites.tab_notes}</span>}
                    </div>
                    <p className={styles.favouriteText}>{item.text}</p>
                    {item.note && <div className={styles.userNote}><span>{strings.favourites.tab_notes}</span><p>{item.note}</p></div>}
                  </div>
                  <button type="button" onClick={() => handleRemove(item)} className={styles.removeButton} aria-label={strings.common.delete} title={strings.common.delete}><Trash2 size={17} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {editingColor && (
        <div className={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingColor(null); }}>
          <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="edit-category-title">
            <span className={styles.modalIcon} style={{ '--swatch-color': editingColor }}><Pencil size={19} /></span>
            <h3 id="edit-category-title">{strings.favourites.modal_title}</h3>
            <p>{strings.favourites.color_categories}</p>
            <input type="text" value={tempLabel} onChange={(event) => setTempLabel(event.target.value)} placeholder={strings.favourites.modal_placeholder} autoFocus />
            <div className={styles.modalActions}>
              <button type="button" onClick={saveColorLabel} className={styles.saveBtn}>{strings.common.save}</button>
              <button type="button" onClick={() => setEditingColor(null)} className={styles.cancelBtn}>{strings.common.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
