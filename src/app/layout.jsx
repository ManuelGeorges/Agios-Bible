import './globals.css';
import styles from './layout.module.css';
import BibleNavbar from '../components/BibleNavbar';
import Footer from '../components/Footer';
import Script from 'next/script';
import SEOlinks from '../components/SEOlinks';
import CapacitorFeatures from '../components/CapacitorFeatures';
import SplashHandler from '../components/SplashHandler';
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'react-hot-toast';
import UserTracker from '../components/UserTracker';
import StatsWatcher from '../components/StatsWatcher';
import { BadgeProvider } from './context/BadgeContext';
import { AudioProvider } from './context/AudioContext';
import { LanguageProvider } from './context/LanguageContext';
import GlobalAudioPlayer from '../components/GlobalAudioPlayer';
import LanguageWelcome from '../components/LanguageWelcome';
import TopHeader from '../components/TopHeader';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f4f8' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export const metadata = {
  publisher: 'Agios Bible',
  title: 'Agios Bible - الكتاب المقدس وأدوات دراسة متطورة',
  description: 'تطبيق أجيوس بايبل: الكتاب المقدس باللغات العربية والإنجليزية والفرنسية والألمانية مع خرائط تفاعلية، بحث ذكي بالذكاء الاصطناعي، وخطط قراءة يومية.',
  authors: [{ name: 'Manuel Georges', url: 'https://mano-dev.vercel.app/' }],
  robots: 'index, follow',
  keywords: ['Agios Bible', 'أجيوس', 'الكتاب المقدس', 'Bible study', 'دراسة الكتاب المقدس', 'آية اليوم', 'Verse of the day', 'خرائط الكتاب المقدس', 'Bible maps', 'خطط دراسة الكتاب المقدس', 'مسابقات مسيحية', 'تفسير الكتاب المقدس', 'مانويل جورج', 'Manuel Georges'],

  itunes: {
    appId: '6773141320',
    appArgument: 'https://agios-bible.vercel.app/',
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Agios Bible',
  },
  openGraph: {
    title: 'Agios Bible - الكتاب المقدس التفاعلي',
    description: 'قراءة ودراسة الكتاب المقدس مع خرائط وأدوات ذكية.',
    type: 'website',
    url: 'https://agios-bible.vercel.app/',
    siteName: 'Agios Bible',
    locale: 'ar_EG',
    images: [
      {
        url: 'https://agios-bible.vercel.app/favicon.ico',
        width: 1200,
        height: 630,
        type: 'image/png',
      },
    ],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  verification: {
    google: 'JTfGW-LIKZCB-BMpO_0Ziky-cRpExV_HedDEHumxLqY',
  },
  other: {
    'google-play-app': 'app-id=com.agios.bible',
  },
};

export default function RootLayout({ children }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Agios Bible",
    "operatingSystem": "Android, iOS, Web",
    "applicationCategory": "ReligiousApplication",
    "author": {
      "@type": "Person",
      "name": "Manuel Georges",
      "url": "https://mano-dev.vercel.app/"
    },
    "downloadUrl": [
      "https://play.google.com/store/apps/details?id=com.agios.bible",
      "https://apps.apple.com/eg/app/agios-bible-holy-bible/id6773141320"
    ],
    "featureList": "Interactive Bible Maps, AI Bible Search, Daily Study Plans, Multi-language support"
  };

  return (
    <html suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <link rel="alternate" href="android-app://com.agios.bible/https/agios-bible.vercel.app/" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem={true}
          storageKey="theme"
        >
          <LanguageProvider>
            <LanguageWelcome />
            <BadgeProvider>
              <AudioProvider>
                <StatsWatcher />
                <Toaster
                  position="top-center"
                  containerStyle={{
                    zIndex: 1000000,
                    top: 'calc(env(safe-area-inset-top) + 16px)'
                  }}
                />
                <UserTracker />
                <TopHeader />
                <BibleNavbar />

                <SplashHandler>
                  <main className={styles.mainContent}>
                    <div className={styles.container}>{children}</div>
                  </main>
                  <GlobalAudioPlayer />
                  <Footer />
                  <CapacitorFeatures />
                  <SEOlinks />
                </SplashHandler>

                <Script
                  src="https://www.googletagmanager.com/gtag/js?id=G-J90H6JXHNG"
                  strategy="lazyOnload"
                />
                <Script id="google-analytics" strategy="lazyOnload">
                  {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'G-J90H6JXHNG');
                  `}
                </Script>
              </AudioProvider>
            </BadgeProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
