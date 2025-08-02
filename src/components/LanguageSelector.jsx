'use client';

import { useLanguage } from '../context/LanguageContext';

export default function LanguageSelector() {
  const { language, changeLanguage } = useLanguage();

  return (
    <select
      value={language}
      onChange={(e) => changeLanguage(e.target.value)}
      style={{ padding: '5px 10px', margin: '1rem', borderRadius: '5px' }}
    >
      <option value="ar">العربية 🇪🇬</option>
      <option value="en">English 🇬🇧</option>
      <option value="fr">Français 🇫🇷</option>
    </select>
  );
}
