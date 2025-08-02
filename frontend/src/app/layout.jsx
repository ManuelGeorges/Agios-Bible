// app/layout.jsx
import './globals.css';
import styles from './layout.module.css'; // تأكد من المسار الصحيح
import { LanguageProvider } from '../context/LanguageContext';
import BibleNavbar from '../components/BibleNavbar';

export const metadata = {
  title: 'Bible App',
  description: 'Your Bible Study Application',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <LanguageProvider>
          <BibleNavbar />
          {/* تطبيق الأنماط هنا */}
          <main className={styles.mainContent}>
            <div className={styles.container}>
              {children}
            </div>
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}