// src/app/bible/page.jsx

import { Suspense } from 'react';
import BibleContent from './BibleContent'; 
import styles from './Bible.module.css'; 

export default function BiblePage() {
  return (
    <main className={styles.container}>
      <Suspense fallback={<div className={styles.loadingMessage}>جارٍ تحميل المحتوى...</div>}>
        <BibleContent />
      </Suspense>
    </main>
  );
}