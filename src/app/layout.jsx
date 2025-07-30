// src/app/layout.js
// لا تضع 'use client'; هنا! هذا يجب أن يظل Server Component

import './globals.css';
import { LanguageProvider } from '@/context/LanguageContext'; // تأكد من المسار

export const metadata = {
  title: 'Bible Study App',
  description: 'A comprehensive Bible study application',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar">
      <body>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}