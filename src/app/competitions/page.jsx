'use client';

import { useState, useEffect } from 'react';
import { allQuestions } from './questionsData';
import styles from './competitions.module.css';

export default function HomePage() {
  const [quizType, setQuizType] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  
  const [questions, setQuestions] = useState([]);
  
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  
  const [highScores, setHighScores] = useState({});
  const [savedQuizStates, setSavedQuizStates] = useState({});

  // استرداد الأرقام القياسية وحالات المسابقات المحفوظة عند تحميل المكون لأول مرة
  useEffect(() => {
    try {
      const storedHighScores = localStorage.getItem('bibleQuizHighScores');
      if (storedHighScores) {
        setHighScores(JSON.parse(storedHighScores));
      }
      
      const storedQuizStates = localStorage.getItem('savedQuizStates');
      if (storedQuizStates) {
        const parsedStates = JSON.parse(storedQuizStates);
        setSavedQuizStates(parsedStates);
      }
    } catch (error) {
      console.error('Failed to load data from localStorage:', error);
    }
  }, []);

  // وظيفة لحفظ الأرقام القياسية
  const saveHighScores = (newScores) => {
    try {
      localStorage.setItem('bibleQuizHighScores', JSON.stringify(newScores));
      setHighScores(newScores);
    } catch (error) {
      console.error('Failed to save high scores to localStorage:', error);
    }
  };

  // وظيفة لحفظ حالة المسابقة الحالية
  const saveQuizState = (type, state) => {
    const newSavedStates = { ...savedQuizStates, [type]: state };
    try {
      localStorage.setItem('savedQuizStates', JSON.stringify(newSavedStates));
      setSavedQuizStates(newSavedStates);
    } catch (error) {
      console.error('Failed to save quiz state to localStorage:', error);
    }
  };

  // حفظ حالة المسابقة الحالية عند أي تغيير في الحالة
  useEffect(() => {
    if (quizType && questions.length > 0 && !showResults) {
      const quizState = {
        currentQuestionIndex,
        score,
        questions,
      };
      saveQuizState(quizType, quizState);
    }
  }, [quizType, currentQuestionIndex, score, questions, showResults]);

  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const startQuiz = (type) => {
    setQuizType(type);
    setShowResults(false);
    setUserAnswer('');
    setAnswered(false);
    setIsCorrect(null);

    // التحقق من وجود حالة محفوظة لهذه المسابقة
    const savedState = savedQuizStates[type];
    if (savedState) {
      setCurrentQuestionIndex(savedState.currentQuestionIndex);
      setScore(savedState.score);
      setQuestions(savedState.questions);
    } else {
      // إذا لم يكن هناك حالة محفوظة، يتم بدء مسابقة جديدة
      setCurrentQuestionIndex(0);
      setScore(0);
      const filteredAndShuffledQuestions = shuffleArray(
        allQuestions.filter(q => q.type === type)
      );
      setQuestions(filteredAndShuffledQuestions);
    }
  };

  const handleAnswer = (answer) => {
    if (answered) return;
    
    const currentQuestion = questions[currentQuestionIndex];
    let correct = false;

    if (currentQuestion.type === 'multiple_choice') {
      correct = answer.toLowerCase().trim() === currentQuestion.correctAnswer.toLowerCase().trim();
    } else {
      correct = userAnswer.toLowerCase().trim() === currentQuestion.correctAnswer.toLowerCase().trim();
    }
    
    if (correct) {
      setScore(prevScore => prevScore + 1);
      setIsCorrect(true);
    } else {
      setIsCorrect(false);
    }

    setAnswered(true);
  };

  const handleNextQuestion = () => {
    const nextQuestionIndex = currentQuestionIndex + 1;
    if (nextQuestionIndex < questions.length) {
      setCurrentQuestionIndex(nextQuestionIndex);
      setUserAnswer('');
      setAnswered(false);
      setIsCorrect(null);
    } else {
      setShowResults(true);
      const currentHighScore = highScores[quizType] || 0;
      if (score > currentHighScore) {
        saveHighScores({ ...highScores, [quizType]: score });
      }
      // إزالة حالة المسابقة من الذاكرة المحلية بعد انتهائها
      const newSavedStates = { ...savedQuizStates };
      delete newSavedStates[quizType];
      try {
        localStorage.setItem('savedQuizStates', JSON.stringify(newSavedStates));
        setSavedQuizStates(newSavedStates);
      } catch (error) {
        console.error('Failed to clear quiz state from localStorage:', error);
      }
    }
  };

  const resetQuiz = () => {
    setQuizType(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowResults(false);
    setUserAnswer('');
    setAnswered(false);
    setIsCorrect(null);
  };

  const renderQuizContent = () => {
    if (!quizType && questions.length === 0) {
      return (
        <div className={styles.welcomeMessage}>
          <h2>أهلاً بك في مسابقات الكتاب المقدس!</h2>
          <p>اختر نوع المسابقة من الأعلى لتبدأ.</p>
        </div>
      );
    }

    if (showResults) {
      const totalQuestions = questions.length;
      const currentHighScore = highScores[quizType] || 0;
      const isPerfectScore = score === totalQuestions;
      const isNewHighScore = score > (highScores[quizType] || 0);

      return (
        <div className={`${styles.resultsContainer} ${isPerfectScore ? styles.confetti : ''}`}>
          <h2>انتهت المسابقة!</h2>
          <p>أحرزت درجة: {score} من {totalQuestions}</p>
          {isNewHighScore && <p className={styles.newHighScoreMessage}>رقم قياسي جديد! تهانينا!</p>}
          {isPerfectScore && <p className={styles.perfectScoreMessage}>أداء رائع! إجابات مثالية!</p>}
          <p>أعلى نتيجة لك في هذه المسابقة: {currentHighScore}</p>
          <button className={styles.playAgainButton} onClick={resetQuiz}>ابدأ مسابقة جديدة</button>
        </div>
      );
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return null;

    const totalQuestions = questions.length;
    const progress = (currentQuestionIndex / totalQuestions) * 100;

    const renderProgressBar = () => (
      <div className={styles.progressBarContainer}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }}></div>
      </div>
    );
    
    const renderFeedback = () => {
      if (answered) {
        return (
          <div className={styles.feedbackContainer}>
            <p className={isCorrect ? styles.correctFeedback : styles.incorrectFeedback}>
              {isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة. الإجابة الصحيحة هي: ' + currentQuestion.correctAnswer}
            </p>
            {currentQuestion.verseReference && (
              <p className={styles.verseReference}>
                الآية المرجعية: {currentQuestion.verseReference}
              </p>
            )}
            <button className={styles.nextButton} onClick={handleNextQuestion}>
              {currentQuestionIndex + 1 < totalQuestions ? 'السؤال التالي' : 'عرض النتائج'}
            </button>
          </div>
        );
      }
      return null;
    };

    const renderQuestionCard = () => {
      switch (currentQuestion.type) {
        case 'multiple_choice':
          return (
            <div className={styles.questionCard}>
              <h3>{currentQuestion.questionText}</h3>
              <div className={styles.optionsContainer}>
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    className={`${styles.optionButton} ${answered ? (option === currentQuestion.correctAnswer ? styles.correctAnswer : (option.toLowerCase().trim() === userAnswer.toLowerCase().trim() && !isCorrect ? styles.incorrectAnswer : '')) : ''}`}
                    onClick={() => {
                      setUserAnswer(option);
                      handleAnswer(option);
                    }}
                    disabled={answered}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {renderFeedback()}
            </div>
          );
        case 'complete_verse':
        case 'who_is_it':
          return (
            <div className={styles.questionCard}>
              <h3>{currentQuestion.questionText}</h3>
              <div className={styles.inputContainer}>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className={`${styles.textInput} ${answered ? (isCorrect ? styles.correctInput : styles.incorrectInput) : ''}`}
                  placeholder="اكتب إجابتك هنا..."
                  disabled={answered}
                />
                {!answered && (
                  <button
                    className={styles.submitButton}
                    onClick={() => handleAnswer(userAnswer)}
                    disabled={userAnswer.trim() === ''}
                  >
                    إرسال
                  </button>
                )}
              </div>
              {renderFeedback()}
            </div>
          );
        default:
          return null;
      }
    };
    
    return (
      <div className={styles.quizContentWrapper}>
        <div className={styles.quizHeader}>
          <p>السؤال {currentQuestionIndex + 1} من {totalQuestions}</p>
          <p>النتيجة: {score}</p>
          <p>الرقم القياسي: {highScores[quizType] || 0}</p>
        </div>
        {renderProgressBar()}
        {renderQuestionCard()}
      </div>
    );
  };

  return (
    <div className={styles.mainContainer}>
      <header className={styles.header}>
        <h1>مسابقات الكتاب المقدس</h1>
      </header>

      <nav className={styles.navbar}>
        <button className={quizType === 'multiple_choice' ? styles.active : ''} onClick={() => startQuiz('multiple_choice')}>أسئلة متعددة الاختيارات</button>
        <button className={quizType === 'complete_verse' ? styles.active : ''} onClick={() => startQuiz('complete_verse')}>تحدي إكمال الآية</button>
        <button className={quizType === 'who_is_it' ? styles.active : ''} onClick={() => startQuiz('who_is_it')}>من هو؟</button>
      </nav>

      <main>
        {renderQuizContent()}
      </main>
    </div>
  );
}