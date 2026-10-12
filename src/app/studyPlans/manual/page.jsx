'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../../../lib/firebase';
import { doc, setDoc, serverTimestamp, collection, addDoc, getDoc } from "firebase/firestore";
import styles from './manualPlan.module.css';
import toast from 'react-hot-toast';
import { getCairoIsoString } from '../../../lib/dateUtils';
import { PenLine, Plus, Trash2, ChevronUp, ChevronDown, Share2, X } from 'lucide-react';
import { StorageService, KEYS } from '../../../lib/storage';
import { useLanguage } from '../../context/LanguageContext';

const MAX_DAYS = 365;
const MAX_ENTRIES_PER_DAY = 10;

// نصوص الصفحة (يمكن نقلها لاحقاً إلى ملف strings الرئيسي) Amen
const T = {
  ar: {
    title: 'ألّف خطتك بنفسك',
    subtitle: 'اختر الأسفار والأصحاحات لكل يوم، ورتّب رحلتك الروحية كما تحب.',
    plan_title: 'اسم الخطة',
    plan_title_ph: 'مثال: رحلتي مع الأناجيل',
    plan_desc: 'وصف قصير (اختياري)',
    plan_desc_ph: 'عن ماذا تدور هذه الخطة؟',
    day: 'اليوم',
    book: 'السفر',
    choose_book: 'اختر السفر',
    from: 'من أصحاح',
    to: 'إلى أصحاح',
    add_reading: 'إضافة قراءة',
    add_day: 'إضافة يوم',
    remove_day: 'حذف اليوم',
    move_up: 'تحريك لأعلى',
    move_down: 'تحريك لأسفل',
    remove_reading: 'حذف القراءة',
    share_label: 'مشاركة',
    share_check: 'شارك هذه الخطة مع المجتمع',
    show_author: 'أظهر اسمي كمؤلف',
    save: 'حفظ الخطة',
    saving: 'جاري الحفظ...',
    anonymous: 'مشارك مجهول',
    author_default: 'مستخدم',
    err_title: 'اكتب اسماً للخطة (3 أحرف على الأقل)',
    err_empty_day: 'أضف قراءة واحدة على الأقل في',
    err_incomplete: 'أكمل بيانات السفر والأصحاح في',
    err_range: 'رقم الأصحاح الأخير يجب ألا يقل عن الأول في',
    err_chapter_max: 'رقم الأصحاح أكبر من عدد أصحاحات السفر في',
    err_max_days: 'الحد الأقصى للأيام هو',
    success: 'تم حفظ خطتك!',
    error: 'حدث خطأ أثناء الحفظ، حاول مرة أخرى.',
    days_count: 'يوم',
  },
  en: {
    title: 'Create your own plan',
    subtitle: 'Pick books and chapters for each day and shape your own journey.',
    plan_title: 'Plan name',
    plan_title_ph: 'e.g. My journey through the Gospels',
    plan_desc: 'Short description (optional)',
    plan_desc_ph: 'What is this plan about?',
    day: 'Day',
    book: 'Book',
    choose_book: 'Choose a book',
    from: 'From chapter',
    to: 'To chapter',
    add_reading: 'Add reading',
    add_day: 'Add day',
    remove_day: 'Remove day',
    move_up: 'Move up',
    move_down: 'Move down',
    remove_reading: 'Remove reading',
    share_label: 'Sharing',
    share_check: 'Share this plan with the community',
    show_author: 'Show my name as author',
    save: 'Save plan',
    saving: 'Saving...',
    anonymous: 'Anonymous User',
    author_default: 'User',
    err_title: 'Enter a plan name (at least 3 characters)',
    err_empty_day: 'Add at least one reading on',
    err_incomplete: 'Complete the book and chapter on',
    err_range: 'The last chapter cannot be before the first on',
    err_chapter_max: 'The chapter number exceeds the book length on',
    err_max_days: 'Maximum number of days is',
    success: 'Your plan was saved!',
    error: 'Something went wrong while saving. Please try again.',
    days_count: 'days',
  },
  fr: {
    title: 'Créez votre propre plan',
    subtitle: 'Choisissez les livres et les chapitres de chaque jour et composez votre propre parcours.',
    plan_title: 'Nom du plan',
    plan_title_ph: 'Ex. : Mon parcours dans les Évangiles',
    plan_desc: 'Courte description (facultatif)',
    plan_desc_ph: 'De quoi parle ce plan ?',
    day: 'Jour',
    book: 'Livre',
    choose_book: 'Choisir un livre',
    from: 'Du chapitre',
    to: 'Au chapitre',
    add_reading: 'Ajouter une lecture',
    add_day: 'Ajouter un jour',
    remove_day: 'Supprimer le jour',
    move_up: 'Monter',
    move_down: 'Descendre',
    remove_reading: 'Supprimer la lecture',
    share_label: 'Partage',
    share_check: 'Partager ce plan avec la communauté',
    show_author: 'Afficher mon nom comme auteur',
    save: 'Enregistrer le plan',
    saving: 'Enregistrement...',
    anonymous: 'Utilisateur anonyme',
    author_default: 'Utilisateur',
    err_title: 'Saisissez un nom de plan (3 caractères minimum)',
    err_empty_day: 'Ajoutez au moins une lecture pour le',
    err_incomplete: 'Complétez le livre et le chapitre pour le',
    err_range: 'Le dernier chapitre ne peut pas précéder le premier pour le',
    err_chapter_max: 'Le numéro du chapitre dépasse la longueur du livre pour le',
    err_max_days: 'Le nombre maximum de jours est',
    success: 'Votre plan a été enregistré !',
    error: "Une erreur s'est produite lors de l'enregistrement. Réessayez.",
    days_count: 'jours',
  },
  de: {
    title: 'Erstelle deinen eigenen Plan',
    subtitle: 'Wähle für jeden Tag Bücher und Kapitel und gestalte deinen eigenen Weg.',
    plan_title: 'Name des Plans',
    plan_title_ph: 'z. B. Meine Reise durch die Evangelien',
    plan_desc: 'Kurzbeschreibung (optional)',
    plan_desc_ph: 'Worum geht es in diesem Plan?',
    day: 'Tag',
    book: 'Buch',
    choose_book: 'Buch auswählen',
    from: 'Ab Kapitel',
    to: 'Bis Kapitel',
    add_reading: 'Lesung hinzufügen',
    add_day: 'Tag hinzufügen',
    remove_day: 'Tag entfernen',
    move_up: 'Nach oben',
    move_down: 'Nach unten',
    remove_reading: 'Lesung entfernen',
    share_label: 'Teilen',
    share_check: 'Diesen Plan mit der Community teilen',
    show_author: 'Meinen Namen als Autor anzeigen',
    save: 'Plan speichern',
    saving: 'Wird gespeichert...',
    anonymous: 'Anonymer Nutzer',
    author_default: 'Nutzer',
    err_title: 'Gib einen Plannamen ein (mindestens 3 Zeichen)',
    err_empty_day: 'Füge mindestens eine Lesung hinzu für',
    err_incomplete: 'Vervollständige Buch und Kapitel für',
    err_range: 'Das letzte Kapitel darf nicht vor dem ersten liegen bei',
    err_chapter_max: 'Die Kapitelnummer übersteigt die Länge des Buches bei',
    err_max_days: 'Die maximale Anzahl an Tagen ist',
    success: 'Dein Plan wurde gespeichert!',
    error: 'Beim Speichern ist ein Fehler aufgetreten. Bitte versuche es erneut.',
    days_count: 'Tage',
  },
};

let uid = 0;
const newEntry = () => ({ key: `e${++uid}`, book: '', from: '', to: '' });
const newDay = () => ({ key: `d${++uid}`, entries: [newEntry()] });

export default function ManualPlanForm() {
  const { bookNames, language, formatNumber } = useLanguage();
  const t = T[language] || T.en;
  const router = useRouter();

  // أقصى عدد أصحاحات للسفر (لو البيانات متاحة في bookNames، وإلا بدون حد)
  const getMaxChapters = (bookName) => {
    const b = bookNames.find(x => x.name === bookName);
    if (!b) return null;
    const raw = b.chapters ?? b.chaptersCount ?? b.chapters_count ?? b.numChapters ?? b.total_chapters;
    const n = Array.isArray(raw) ? raw.length : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(() => [newDay()]);
  const [isShared, setIsShared] = useState(false);
  const [showAuthor, setShowAuthor] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) setUserData(snap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  /* ---------- تعديل الأيام والقراءات ---------- */
  const addDay = () => {
    if (days.length >= MAX_DAYS) {
      toast.error(`${t.err_max_days} ${formatNumber(MAX_DAYS)}`);
      return;
    }
    setDays(prev => [...prev, newDay()]);
  };

  const removeDay = (dayKey) => setDays(prev => prev.filter(d => d.key !== dayKey));

  const moveDay = (index, direction) => {
    setDays(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const addEntry = (dayKey) => {
    setDays(prev => prev.map(d =>
      d.key === dayKey && d.entries.length < MAX_ENTRIES_PER_DAY
        ? { ...d, entries: [...d.entries, newEntry()] }
        : d
    ));
  };

  const removeEntry = (dayKey, entryKey) => {
    setDays(prev => prev.map(d =>
      d.key === dayKey ? { ...d, entries: d.entries.filter(e => e.key !== entryKey) } : d
    ));
  };

  const updateEntry = (dayKey, entryKey, field, value) => {
    setDays(prev => prev.map(d =>
      d.key === dayKey
        ? { ...d, entries: d.entries.map(e => e.key === entryKey ? { ...e, [field]: value } : e) }
        : d
    ));
  };

  /* ---------- التحقق وبناء الخطة ---------- */
  const buildReadings = () => {
    if (title.trim().length < 3) {
      toast.error(t.err_title);
      return null;
    }

    const readings = [];
    for (let i = 0; i < days.length; i++) {
      const label = `${t.day} ${formatNumber(i + 1)}`;
      const entries = days[i].entries;

      if (entries.length === 0) {
        toast.error(`${t.err_empty_day} ${label}`);
        return null;
      }

      const books = [];
      for (const e of entries) {
        const from = parseInt(e.from, 10);
        const to = e.to === '' ? null : parseInt(e.to, 10);

        if (!e.book || !from || from < 1) {
          toast.error(`${t.err_incomplete} ${label}`);
          return null;
        }
        if (to !== null && (Number.isNaN(to) || to < from)) {
          toast.error(`${t.err_range} ${label}`);
          return null;
        }
        const max = getMaxChapters(e.book);
        if (max && (from > max || (to !== null && to > max))) {
          toast.error(`${t.err_chapter_max} ${label}`);
          return null;
        }
        // نفس صيغة الخطط الجاهزة: "اسم السفر رقم" أو "اسم السفر من-إلى"
        books.push(to && to !== from ? `${e.book} ${from}-${to}` : `${e.book} ${from}`);
      }

      readings.push({ day: i + 1, books });
    }
    return readings;
  };

  const handleSubmit = async () => {
    if (saving) return;
    const readings = buildReadings();
    if (!readings) return;

    setSaving(true);
    try {
      const planId = `manual_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      const currentUser = auth.currentUser;

      const newPlanObject = {
        id: planId,
        title: title.trim(),
        description: description.trim(),
        type: 'custom',
        isManual: true,
        creationMethod: 'manual',
        readings,
        createdAt: getCairoIsoString(),
        completedDays: {},
        completionPercentage: 0,
        language,
      };

      if (currentUser) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          customPlans: { [planId]: newPlanObject },
        }, { merge: true });
      } else {
        const localCustom = await StorageService.get(KEYS.CUSTOM_PLANS) || {};
        localCustom[planId] = newPlanObject;
        await StorageService.save(KEYS.CUSTOM_PLANS, localCustom);
      }

      if (isShared) {
        await addDoc(collection(db, 'sharedPlans'), {
          ...newPlanObject,
          authorId: currentUser ? currentUser.uid : 'guest',
          authorName: (currentUser && showAuthor)
            ? (userData?.displayName || t.author_default)
            : t.anonymous,
          isShared: true,
          createdAt: serverTimestamp(),
          originalPlanId: planId,
        });
        await StorageService.save(KEYS.LAST_SHARED_PLANS_FETCH, 0);
      }

      toast.success(t.success);
      router.push(`/studyPlans/details?id=${planId}&type=custom`);
    } catch (err) {
      console.error('Manual plan save error:', err);
      toast.error(t.error);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- الواجهة ---------- */
  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <div className={styles.iconCircle}><PenLine size={26} /></div>
          <h1 className={styles.mainTitle}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="plan-title">{t.plan_title}</label>
          <input
            id="plan-title"
            className={styles.input}
            maxLength={80}
            disabled={saving}
            placeholder={t.plan_title_ph}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="plan-desc">{t.plan_desc}</label>
          <textarea
            id="plan-desc"
            className={styles.input}
            rows={3}
            maxLength={300}
            disabled={saving}
            placeholder={t.plan_desc_ph}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.daysList}>
          {days.map((d, index) => (
            <div key={d.key} className={styles.dayCard}>
              <div className={styles.dayHeader}>
                <h3 className={styles.dayTitle}>{t.day} {formatNumber(index + 1)}</h3>
                <div className={styles.dayActions}>
                  <button type="button" className={styles.iconBtn} title={t.move_up}
                    disabled={index === 0 || saving} onClick={() => moveDay(index, -1)}>
                    <ChevronUp size={18} />
                  </button>
                  <button type="button" className={styles.iconBtn} title={t.move_down}
                    disabled={index === days.length - 1 || saving} onClick={() => moveDay(index, 1)}>
                    <ChevronDown size={18} />
                  </button>
                  <button type="button" className={`${styles.iconBtn} ${styles.danger}`} title={t.remove_day}
                    disabled={days.length === 1 || saving} onClick={() => removeDay(d.key)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {d.entries.map((e) => (
                <div key={e.key} className={styles.entryRow}>
                  <select
                    className={`${styles.input} ${styles.bookSelect}`}
                    aria-label={t.book}
                    value={e.book}
                    disabled={saving}
                    onChange={(ev) => updateEntry(d.key, e.key, 'book', ev.target.value)}
                  >
                    <option value="">{t.choose_book}</option>
                    {bookNames.map(b => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>

                  <input
                    type="number" min="1" max={getMaxChapters(e.book) || undefined} inputMode="numeric"
                    className={`${styles.input} ${styles.chapterInput}`}
                    aria-label={t.from}
                    placeholder={t.from}
                    value={e.from}
                    disabled={saving}
                    onChange={(ev) => updateEntry(d.key, e.key, 'from', ev.target.value)}
                  />
                  <input
                    type="number" min="1" max={getMaxChapters(e.book) || undefined} inputMode="numeric"
                    className={`${styles.input} ${styles.chapterInput}`}
                    aria-label={t.to}
                    placeholder={t.to}
                    value={e.to}
                    disabled={saving}
                    onChange={(ev) => updateEntry(d.key, e.key, 'to', ev.target.value)}
                  />

                  <button type="button" className={`${styles.iconBtn} ${styles.danger}`}
                    title={t.remove_reading}
                    disabled={d.entries.length === 1 || saving}
                    onClick={() => removeEntry(d.key, e.key)}>
                    <X size={18} />
                  </button>
                </div>
              ))}

              <button type="button" className={styles.addEntryBtn}
                disabled={saving || d.entries.length >= MAX_ENTRIES_PER_DAY}
                onClick={() => addEntry(d.key)}>
                <Plus size={16} /> {t.add_reading}
              </button>
            </div>
          ))}
        </div>

        <button type="button" className={styles.addDayBtn} disabled={saving} onClick={addDay}>
          <Plus size={18} /> {t.add_day}
          <span className={styles.dayCounter}>({formatNumber(days.length)} {t.days_count})</span>
        </button>

        <div className={styles.field}>
          <span className={styles.label}><Share2 size={16} /> {t.share_label}</span>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={isShared} disabled={saving}
              onChange={(e) => setIsShared(e.target.checked)} />
            <span>{t.share_check}</span>
          </label>
          {isShared && (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={showAuthor} disabled={saving}
                onChange={(e) => setShowAuthor(e.target.checked)} />
              <span>{t.show_author}</span>
            </label>
          )}
        </div>

        <button type="button" className={styles.submitBtn} disabled={saving} onClick={handleSubmit}>
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}