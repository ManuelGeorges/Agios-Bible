// src/app/studyPlans/[planId]/page.jsx

'use client'; // يجب إضافة هذه السطر لأننا سنستخدم useState و localStorage

import React, { useState, useEffect } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from './PlanDetails.module.css';
import studyPlansData from '../studyPlansData.json';

// استخراج مصفوفة الخطط من كائن JSON
const allPlans = studyPlansData.plans;

export default function PlanDetailsPage({ params }) {
  // استخدام params مباشرةً بدلاً من React.use(params) في مكونات العميل
  const { planId } = params;

  // البحث عن الخطة المطابقة لـ planId (نحوله إلى عدد صحيح)
  const plan = allPlans.find((p) => p.id === parseInt(planId));

  // إذا لم يتم العثور على الخطة، اعرض صفحة 404
  if (!plan) {
    notFound();
  }

  const [completedDays, setCompletedDays] = useState({});

  // استخدام useEffect لتحميل حالة الأيام المكتملة من localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedCompletedDays = localStorage.getItem(`completedDays_${planId}`);
      if (storedCompletedDays) {
        setCompletedDays(JSON.parse(storedCompletedDays));
      }
    }
  }, [planId]);

  // استخدام useEffect لحفظ حالة الأيام المكتملة في localStorage عند التغيير
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(completedDays).length > 0) {
      localStorage.setItem(`completedDays_${planId}`, JSON.stringify(completedDays));
    }
  }, [completedDays, planId]);

  // دالة لتغيير حالة إكمال اليوم
  const handleCheck = (day) => {
    setCompletedDays((prevCompletedDays) => {
      const newCompletedDays = {
        ...prevCompletedDays,
        [day]: !prevCompletedDays[day],
      };
      return newCompletedDays;
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{plan.title}</h1>
        <p className={styles.description}>{plan.description}</p>
      </header>
      
      <div className={styles.details}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>المدة:</span>
          <span className={styles.detailValue}>{plan.duration}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>النوع:</span>
          <span className={styles.detailValue}>{plan.type}</span>
        </div>
      </div>

      <main className={styles.mainContent}>
        <h2 className={styles.readingsTitle}>قراءات الخطة</h2>
        <ul className={styles.readingsList}>
          {plan.readings.map((reading) => {
            const isCompleted = completedDays[reading.day];
            return (
              <li 
                key={reading.day} 
                className={`${styles.readingItem} ${isCompleted ? styles.completedDay : ''}`}
              >
                <div className={styles.readingHeader}>
                  <div className={styles.dayNumber}>يوم {reading.day}</div>
                  <input
                    type="checkbox"
                    checked={isCompleted || false}
                    onChange={() => handleCheck(reading.day)}
                    className={styles.completionCheckbox}
                  />
                </div>
                <div className={styles.books}>
                  {reading.books.map((book, index) => {
                    // This is the updated logic to correctly parse the book name and chapter
                    // to ensure a valid URL is always created.
                    const parts = book.split(/\s*(\d+)/).filter(Boolean);
                    const bookName = parts[0] ? parts[0].trim() : '';
                    const chapter = parts[1] ? parts[1].trim() : '';
                    
                    return (
                      <Link 
                        key={index} 
                        // The href now only includes a chapter if it exists,
                        // preventing the 'undefined' error in the URL.
                        href={chapter ? `/bible?book=${encodeURIComponent(bookName)}&chapter=${encodeURIComponent(chapter)}` : `/bible?book=${encodeURIComponent(bookName)}`}
                        className={styles.book}
                      >
                        {book}
                      </Link>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
