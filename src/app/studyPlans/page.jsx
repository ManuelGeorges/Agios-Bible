"use client";
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from './StudyPlans.module.css';
import studyPlansData from './studyPlansData.json';

// استخراج مصفوفة الخطط من كائن JSON
const allPlans = studyPlansData.plans;

export default function StudyPlansPage() {
  const [filteredPlans, setFilteredPlans] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    // استخدم المصفوفة الصحيحة عند تهيئة الحالة
    setFilteredPlans(allPlans);
  }, []);

  const filterPlans = (type) => {
    setActiveFilter(type);
    if (type === 'all') {
      setFilteredPlans(allPlans);
    } else {
      setFilteredPlans(allPlans.filter(plan => plan.type === type));
    }
  };

  return (
    <>
      <Head>
        <title>خطط دراسة الكتاب المقدس - موقعك</title>
      </Head>
      <main className={styles.container}>
        <section className={styles.heroSection}>
          <h1 className={styles.title}>خطط دراسة الكتاب المقدس</h1>
          <p className={styles.description}>اكتشف طرقًا متنوعة ومنظمة للتعمق في كلمة الله. اختر الخطة التي تناسبك وابدأ رحلتك الآن.</p>
        </section>

        <section className={styles.filterSection}>
          <button 
            onClick={() => filterPlans('all')} 
            className={`${styles.filterButton} ${activeFilter === 'all' ? styles.activeFilter : ''}`}
          >
            الكل
          </button>
          <button 
            onClick={() => filterPlans('سنة')} 
            className={`${styles.filterButton} ${activeFilter === 'سنة' ? styles.activeFilter : ''}`}
          >
            خطط سنوية
          </button>
          <button 
            onClick={() => filterPlans('موضوعي')} 
            className={`${styles.filterButton} ${activeFilter === 'موضوعي' ? styles.activeFilter : ''}`}
          >
            موضوعي
          </button>
          <button 
            onClick={() => filterPlans('قصيرة')} 
            className={`${styles.filterButton} ${activeFilter === 'قصيرة' ? styles.activeFilter : ''}`}
          >
            قصيرة المدى
          </button>
        </section>

        <section className={styles.plansGrid}>
          {/* هنا يجب أن يعمل الكود بشكل صحيح الآن */}
          {filteredPlans.map((plan) => (
            <div key={plan.id} className={styles.card}>
              <div className={styles.cardImageContainer}>
                <img src={plan.image} alt={plan.title} className={styles.cardImage} />
              </div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>{plan.title}</h3>
                <p className={styles.cardDescription}>{plan.description}</p>
                <div className={styles.cardDetails}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>المدة:</span>
                    <span className={styles.detailValue}>{plan.duration}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>النوع:</span>
                    <span className={styles.detailValue}>{plan.type}</span>
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <a href="#" className={styles.cardButton}>
                    ابدأ الآن
                  </a>
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}