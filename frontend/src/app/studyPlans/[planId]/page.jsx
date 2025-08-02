// src/app/studyPlans/[planId]/page.jsx

'use client'; 

import React, { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import styles from './PlanDetails.module.css';
import studyPlansData from '../studyPlansData.json';

const allPlans = studyPlansData.plans;

export default function PlanDetailsPage() {
  const params = useParams();
  const { planId } = params;

  const plan = allPlans.find((p) => p.id === parseInt(planId));

  if (!plan) {
    notFound();
  }

  const [completedDays, setCompletedDays] = useState({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedCompletedDays = localStorage.getItem(`completedDays_${planId}`);
      if (storedCompletedDays) {
        setCompletedDays(JSON.parse(storedCompletedDays));
      }
    }
  }, [planId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(completedDays).length > 0) {
      localStorage.setItem(`completedDays_${planId}`, JSON.stringify(completedDays));
    }
  }, [completedDays, planId]);

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
                    const parts = book.split(/\s*(\d+)/).filter(Boolean);
                    const bookName = parts[0] ? parts[0].trim() : '';
                    const chapter = parts[1] ? parts[1].trim() : '';
                    
                    return (
                      <Link 
                        key={index} 
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