// src/context/LanguageContext.jsx
'use client'; // هذا السطر يجب أن يكون الأول تمامًا في الملف

import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedLanguage = localStorage.getItem('appLanguage');
      console.log(`[LanguageContext] Initializing with storedLanguage: ${storedLanguage || 'N/A'}, defaulting to: ${storedLanguage || 'ar'}`);
      return storedLanguage || 'ar';
    }
    console.log('[LanguageContext] Initializing for SSR, defaulting to: ar');
    return 'ar';
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && language) {
      console.log(`[LanguageContext] Language changed to "${language}". Saving to localStorage.`);
      localStorage.setItem('appLanguage', language);
    }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};  