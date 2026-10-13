'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { allQuestions } from './questionsData';
import englishQuestionsData from './questionsData_en.json';
import frenchQuestionsData from './questionsData_fr.json';
import allBookNames from '../data/bookNames.json';
import styles from './competitions.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '../../lib/firebase'; 
import { doc, getDoc, updateDoc, arrayUnion, increment, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useBadge } from '../context/BadgeContext';
import { getCairoIsoString } from '../../lib/dateUtils';
import { StorageService, KEYS } from '../../lib/storage';
import { HapticService } from '../../lib/hapticsService';
import { useLanguage } from '../context/LanguageContext';

const normalizationCache = new Map();
const normalizeArabic = (text) => {
  if (typeof text !== 'string') return '';
  if (normalizationCache.has(text)) return normalizationCache.get(text);

  const result = text
    .trim()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[أإآ]/g, 'ا')
    .replace(/[يى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ة]/g, 'ه')
    .replace(/[ء]/g, '')
    .replace(/\s+/g, ' ');

  normalizationCache.set(text, result);
  return result;
};

const normalizeBookKey = (text) => normalizeArabic(text)
  .toLocaleLowerCase()
  .replace(/^(?:انجيل|رساله)\s+/, '')
  .replace(/[.,:;؟?!'’`-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const BOOK_ID_BY_NAME = new Map();
Object.values(allBookNames).flat().forEach((book) => {
  if (book?.name && book?.book_id) BOOK_ID_BY_NAME.set(normalizeBookKey(book.name), book.book_id);
});

// The quiz source uses numeric names for these books while the catalog uses words.
BOOK_ID_BY_NAME.set(normalizeBookKey('1 تيموثاوس'), '1TI');
BOOK_ID_BY_NAME.set(normalizeBookKey('2 تيموثاوس'), '2TI');
BOOK_ID_BY_NAME.set(normalizeBookKey('تتمة أستير'), 'EST');
BOOK_ID_BY_NAME.set(normalizeBookKey('تتمة دانيال'), 'DAN');

const buildQuestionIndex = (questions) => {
  const index = new Map();
  questions.forEach((question) => {
    const bookId = BOOK_ID_BY_NAME.get(normalizeBookKey(question.category));
    if (!bookId) return;
    if (!index.has(bookId)) index.set(bookId, []);

    index.get(bookId).push({
      ...question,
      normCorrectAnswer: normalizeArabic(question.correctAnswer),
      options: question.options.map((option) => ({
        original: option,
        normalized: normalizeArabic(option)
      }))
    });
  });
  return index;
};

const ARABIC_QUESTION_INDEX = buildQuestionIndex(allQuestions);
const QUESTION_INDEX_BY_LANGUAGE = {
  ar: ARABIC_QUESTION_INDEX,
  en: buildQuestionIndex(englishQuestionsData.allQuestions),
  fr: buildQuestionIndex(frenchQuestionsData.allQuestions)
};

export default function CompetitionsPage() {
  const { strings, language, bookNames: bookNamesData } = useLanguage();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { triggerBadgeUnlock } = useBadge();

  const [quizState, setQuizState] = useState({
    category: null,
    currentIndex: 0,
    score: 0,
    answered: false,
    isCorrect: null,
    showResults: false,
    streak: 0,
    startTime: null,
  });

  const [questions, setQuestions] = useState([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [userBadges, setUserBadges] = useState([]);
  const [copiedMessage, setCopiedMessage] = useState('');
  const categoryRef = useRef(null);

  useEffect(() => {
    let unsubSnap = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        unsubSnap = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCompletedQuizzes(data.completedQuizzes || []);
            setUserBadges(data.badges || []);
          }
          setAuthLoading(false);
        }, (error) => {
          setAuthLoading(false);
        });
      } else {
        const localQuizzes = await StorageService.get('completed_quizzes') || [];
        const localBadges = await StorageService.get('local_badges') || [];
        setCompletedQuizzes(localQuizzes);
        setUserBadges(localBadges);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSnap) unsubSnap();
    };
  }, []);

  const unlockBadge = useCallback(async (badgeId) => {
    if (userBadges.includes(badgeId)) return;

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { badges: arrayUnion(badgeId) });
        triggerBadgeUnlock(badgeId);
        setUserBadges(prev => [...prev, badgeId]);
        HapticService.success();
      } catch (e) { console.error(e); }
    } else {
      const localBadges = await StorageService.get('local_badges') || [];
      if (!localBadges.includes(badgeId)) {
        localBadges.push(badgeId);
        await StorageService.save('local_badges', localBadges);
        triggerBadgeUnlock(badgeId);
        setUserBadges(localBadges);
        HapticService.success();
      }
    }
  }, [user, userBadges, triggerBadgeUnlock]);

  const handleAnswer = useCallback(async (selectedOption) => {
    if (quizState.answered || questions.length === 0) return;

    const currentQuestion = questions[quizState.currentIndex];
    const correct = selectedOption.normalized === currentQuestion.normCorrectAnswer;
    const newStreak = correct ? quizState.streak + 1 : 0;

    if (correct) {
      HapticService.success();
    } else {
      HapticService.error();
    }

    setQuizState(prev => ({
      ...prev,
      answered: true,
      isCorrect: correct,
      score: correct ? prev.score + 1 : prev.score,
      streak: newStreak
    }));

    if (newStreak === 10) await unlockBadge('rapid_10');
  }, [quizState.answered, quizState.currentIndex, quizState.streak, questions, unlockBadge]);

  const finalizeQuiz = async (record, isPerfect) => {
    let pointsToAdd = 30;
    let reason = strings.competitions.points_reason_complete.replace('{category}', record.category);
    if (isPerfect) {
      pointsToAdd += 50;
      reason = strings.competitions.points_reason_perfect.replace('{category}', record.category);
      HapticService.success();
    }

    const updatedHistory = [record, ...completedQuizzes.filter(q => q.category !== record.category)];

    if (user) {
      const userRef = doc(db, "users", user.uid);
      try {
        await updateDoc(userRef, {
          completedQuizzes: updatedHistory,
          totalPoints: increment(pointsToAdd),
          pointsHistory: arrayUnion({
            type: 'quiz',
            points: pointsToAdd,
            reason: reason,
            timestamp: getCairoIsoString()
          })
        });
      } catch (e) { console.error(e); }
    } else {
      setCompletedQuizzes(updatedHistory);
      await StorageService.save('completed_quizzes', updatedHistory);
      await StorageService.addPoints(pointsToAdd);
      const history = await StorageService.get('points_history') || [];
      history.push({ type: 'quiz', points: pointsToAdd, reason: reason, timestamp: getCairoIsoString() });
      await StorageService.save('points_history', history);
    }

    if (updatedHistory.length >= 1) await unlockBadge('quiz_first');
    if (updatedHistory.length >= 3) await unlockBadge('scholar_3');
    if (updatedHistory.length >= 10) await unlockBadge('scholar_10');
    if (updatedHistory.length >= 30) await unlockBadge('scholar_30');
    if (updatedHistory.length >= 50) await unlockBadge('scholar_50');
    if (updatedHistory.length >= 73) await unlockBadge('bible_master');

    const perfectCount = updatedHistory.filter(q => q.score === q.total).length;
    if (isPerfect) await unlockBadge('perfect_1');
    if (perfectCount >= 10) await unlockBadge('perfect_10');
    if (perfectCount >= 73) await unlockBadge('perfect_all');

    const duration = (Date.now() - quizState.startTime) / 1000;
    if (isPerfect && duration < 30) await unlockBadge('speed_demon');
  };

  const loadQuestionsByCategory = useCallback((category) => {
    HapticService.light();
    startTransition(() => {
      const categoryName = typeof category === 'string' ? category : category?.name;
      const bookId = (typeof category === 'object' && category?.book_id)
        || BOOK_ID_BY_NAME.get(normalizeBookKey(categoryName));
      const localizedQuestions = QUESTION_INDEX_BY_LANGUAGE[language]?.get(bookId) || [];
      const filtered = localizedQuestions.length
        ? localizedQuestions
        : ARABIC_QUESTION_INDEX.get(bookId) || [];

      if (filtered.length === 0) {
        alert(strings.competitions.error_no_questions);
        return;
      }

      setQuestions(filtered);
      setQuizState({
        category: categoryName || '',
        currentIndex: 0,
        score: 0,
        answered: false,
        isCorrect: null,
        showResults: false,
        streak: 0,
        startTime: Date.now(),
      });
      setUserAnswer('');
    });
  }, [language, strings.competitions.error_no_questions]);

  const nextQuestion = async () => {
    HapticService.light();
    if (quizState.currentIndex + 1 < questions.length) {
      setQuizState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1,
        answered: false,
        isCorrect: null,
      }));
      setUserAnswer('');
    } else {
      const finalScore = quizState.score;
      const totalQuestions = questions.length;
      const record = {
        category: quizState.category,
        score: finalScore,
        total: totalQuestions,
        date: getCairoIsoString()
      };
      setQuizState(prev => ({ ...prev, showResults: true }));
      await finalizeQuiz(record, finalScore === totalQuestions);
    }
  };

  const resetQuiz = () => {
    HapticService.medium();
    setQuizState({ category: null, currentIndex: 0, score: 0, answered: false, isCorrect: null, showResults: false, streak: 0, startTime: null });
    setQuestions([]);
    setUserAnswer('');
  };

  if (!strings) return null;
  if (authLoading || !bookNamesData?.length) return <div className={styles.loading}>{strings.common.loading}</div>;

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={styles.mainContainer} style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s' }}>
      {copiedMessage && <div className={styles.toast}>{copiedMessage}</div>}
      
      <header className={styles.header}>
        <h1 className={styles.title}>{strings.competitions.title}</h1>
        <p className={styles.userBadge}>{strings.competitions.greeting.replace('{name}', user?.displayName || strings.competitions.guest_user)}</p>
      </header>

      {!quizState.category && (
        <div className={styles.controls}>
          <div className={styles.customSelectWrapper} ref={categoryRef}>
            <div className={styles.selectTrigger} onClick={() => { HapticService.selection(); setIsCategoryOpen(!isCategoryOpen); }}>
              {quizState.category || strings.competitions.select_book}
            </div>
            <AnimatePresence>
              {isCategoryOpen && (
                <motion.ul
                  initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className={styles.dropdownMenu}
                >
                  {bookNamesData.map((book, i) => (
                    <li key={book.book_id || i} className={styles.dropdownItem} onClick={() => { loadQuestionsByCategory(book); setIsCategoryOpen(false); }}>
                      {book.name}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <main className={styles.quizContentWrapper}>
        {!quizState.category ? (
          <>
            <div className={styles.welcomeMessage}>
              <h2>{strings.competitions.welcome_title}</h2>
              <p>{strings.competitions.welcome_desc}</p>
            </div>

            {completedQuizzes.length > 0 && (
              <div className={styles.historyContainer}>
                <h3>{strings.competitions.history_title} {user ? '☁️' : '📱'}</h3>
                {completedQuizzes.map((quiz, idx) => (
                  <div key={idx} className={styles.historyItem}>
                    <div className={styles.historyInfo}>
                      <span className={styles.historyCategory}>{quiz.category}</span>
                      <span className={styles.historyScore}>{quiz.score} / {quiz.total}</span>
                    </div>
                    <button className={styles.redoButton} onClick={() => loadQuestionsByCategory(quiz.category)}>{strings.competitions.redo}</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : quizState.showResults ? (
          <div className={styles.resultsContainer}>
            <h2 className={styles.questionText}>{strings.competitions.final_results}</h2>
            <div className={styles.mainScore}>{quizState.score} / {questions.length}</div>
            <button className={styles.playAgainButton} onClick={resetQuiz}>{strings.competitions.back_to_books}</button>
          </div>
        ) : (
          <div className={styles.quizActive}>
            <div className={styles.quizStats}>
              <span>{strings.competitions.question_progress.replace('{current}', quizState.currentIndex + 1).replace('{total}', questions.length)}</span>
              <span>🔥 {strings.competitions.streak_count.replace('{count}', quizState.streak)}</span>
            </div>

            <div className={styles.questionCard}>
              <h3 className={styles.questionText}>{questions[quizState.currentIndex]?.questionText}</h3>
              <div className={styles.optionsContainer}>
                {questions[quizState.currentIndex]?.options.map((opt, i) => (
                  <button 
                    key={i} 
                    disabled={quizState.answered}
                    className={`${styles.optionButton} ${quizState.answered ? (opt.normalized === questions[quizState.currentIndex].normCorrectAnswer ? styles.correctAnswer : (opt.original === userAnswer ? styles.incorrectAnswer : '')) : ''}`}
                    onClick={() => { setUserAnswer(opt.original); handleAnswer(opt); }}
                  >{opt.original}</button>
                ))}
              </div>
              
              {quizState.answered && (
                <div className={styles.feedbackContainer}>
                  <p className={quizState.isCorrect ? styles.correctFeedback : styles.incorrectFeedback}>
                    {quizState.isCorrect ? strings.competitions.correct_feedback : strings.competitions.incorrect_feedback.replace('{answer}', questions[quizState.currentIndex].correctAnswer)}
                  </p>
                </div>
              )}

              <div className={styles.quizActions}>
                {quizState.answered && <button onClick={nextQuestion} className={styles.nextButton}>{strings.competitions.next_question}</button>}
                <button className={styles.cancelButton} onClick={resetQuiz}>{strings.competitions.cancel_quiz}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
