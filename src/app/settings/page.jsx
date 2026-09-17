"use client"
import { useTheme } from 'next-themes'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Sun, Moon, BookOpen, HelpCircle,
  Clock, X, Settings as SettingsIcon,
  Type, LayoutList, Flame, RefreshCw, Sparkles, Monitor, Palette,
  Trash2, LogOut, LogIn, CloudSync, CaseSensitive, Bold, Languages,
  Columns, Zap, Book, Crown
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { LocalNotifications } from '@capacitor/local-notifications'
import { syncNotifications } from '../../lib/notificationService';
import { signOut, deleteUser, onAuthStateChanged } from 'firebase/auth';
import { doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, getFirebaseRemoteConfig } from '../../lib/firebase';
import { fetchAndActivate, getBoolean } from 'firebase/remote-config';
import styles from './Settings.module.css'
import { useLanguage } from '../context/LanguageContext';

const fontOptions = [
  // Arabic Fonts
  { id: 'Cairo', name: 'Cairo', value: "'Cairo', sans-serif", lang: 'ar' },
  { id: 'Amiri', name: 'Amiri', value: "'Amiri', serif", lang: 'ar' },
  { id: 'Almarai', name: 'Almarai', value: "'Almarai', sans-serif", lang: 'ar' },
  { id: 'Tajawal', name: 'Tajawal', value: "'Tajawal', sans-serif", lang: 'ar' },
  { id: 'ReemKufi', name: 'Reem Kufi', value: "'Reem Kufi', sans-serif", lang: 'ar' },
  { id: 'NotoNaskh', name: 'Noto Naskh', value: "'Noto Naskh Arabic', serif", lang: 'ar' },
  { id: 'Scheherazade', name: 'Scheherazade', value: "'Scheherazade New', serif", lang: 'ar' },
  { id: 'ElMessiri', name: 'El Messiri', value: "'El Messiri', sans-serif", lang: 'ar' },
  { id: 'Lemonada', name: 'Lemonada', value: "'Lemonada', cursive", lang: 'ar' },
  { id: 'Lalezar', name: 'Lalezar', value: "'Lalezar', system-ui", lang: 'ar' },

  // Latin Fonts (English, French, German)
  { id: 'Inter', name: 'Inter', value: "'Inter', sans-serif", lang: 'latin' },
  { id: 'Lora', name: 'Lora', value: "'Lora', serif", lang: 'latin' },
  { id: 'EBGaramond', name: 'EB Garamond', value: "'EB Garamond', serif", lang: 'latin' },
  { id: 'Montserrat', name: 'Montserrat', value: "'Montserrat', sans-serif", lang: 'latin' },
  { id: 'Playfair', name: 'Playfair Display', value: "'Playfair Display', serif", lang: 'latin' },
  { id: 'Cinzel', name: 'Cinzel', value: "'Cinzel', serif", lang: 'latin' },
  { id: 'Spectral', name: 'Spectral', value: "'Spectral', serif", lang: 'latin' }
]

const languages = [
    { id: 'ar', name: 'العربية', flag: '🇪🇬' },
    { id: 'en', name: 'English', flag: '🇺🇸' },
    { id: 'fr', name: 'Français', flag: '🇫🇷' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

const Settings = () => {
  const { theme, setTheme } = useTheme()
  const {
    language: currentLang,
    changeLanguage,
    strings,
    dir,
    useTashkeel,
    toggleTashkeel,
    parallelLanguage,
    changeParallelLanguage,
    keepAppAwake,
    toggleKeepAppAwake,
    keepBibleAwake,
    toggleKeepBibleAwake,
    formatNumber
  } = useLanguage();

  const [mounted, setMounted] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [fontFamily, setFontFamily] = useState('Cairo')
  const [fontWeight, setFontWeight] = useState(400)
  const [versePerLine, setVersePerLine] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [masterNotifications, setMasterNotifications] = useState(false)
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [showSyncLogin, setShowSyncLogin] = useState(true)
  const [notifications, setNotifications] = useState({
    verse: true,
    verseTime: '06:00',
    question: true,
    questionTime: '18:00',
    studyPlans: true,
    studyPlansTime: '10:00',
    streak: true,
    streakTime: '21:00',
    tip: true,
    tipTime: '15:00',
    appSuggestions: true,
    appSuggestionsTime: '12:00',
    updateAlerts: true
  })
  const router = useRouter()

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        const unsubDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data())
          }
        })
        return () => unsubDoc()
      }
    })

    const initSettings = async () => {
      setMounted(true)
      const native = Capacitor.isNativePlatform()
      setIsNative(native)

      const remoteConfig = await getFirebaseRemoteConfig();
      if (remoteConfig) {
        try {
          await fetchAndActivate(remoteConfig);
          const shouldShow = getBoolean(remoteConfig, 'show_sync_login');
          setShowSyncLogin(shouldShow);
        } catch (e) {
          console.error("Remote Config Fetch Error:", e);
        }
      }

      const savedSize = localStorage.getItem('bibleFontSize') || '18'
      const size = parseInt(savedSize)
      setFontSize(size)
      document.documentElement.style.setProperty('--bible-font-size', size + 'px')

      // Each language has its own saved font
      const fontStorageKey = `bibleFontFamily_${currentLang}`;
      const defaultFont = currentLang === 'ar' ? 'Cairo' : 'Inter';

      const savedFont = localStorage.getItem(fontStorageKey);

      const savedFontOption = fontOptions.find(
        f => f.id === savedFont
      );

      const isFontCompatible =
        savedFontOption &&
        (
          currentLang === 'ar'
            ? savedFontOption.lang === 'ar'
            : savedFontOption.lang === 'latin'
        );

      const finalFont = isFontCompatible ? savedFont : defaultFont;

      setFontFamily(finalFont)

      const selectedFont =
        fontOptions.find(f => f.id === finalFont) || fontOptions[0]

      document.documentElement.style.setProperty(
        '--bible-font-family',
        selectedFont.value
      )

      const savedWeight = localStorage.getItem('bibleFontWeight') || '400'
      const weight = parseInt(savedWeight)
      setFontWeight(weight)
      document.documentElement.style.setProperty('--bible-font-weight', weight.toString())

      const savedLayout = localStorage.getItem('versePerLine') === 'true'
      setVersePerLine(savedLayout)

      if (native) {
        const perms = await LocalNotifications.checkPermissions()
        const isGranted = perms.display === 'granted'
        const savedMasterRaw = localStorage.getItem('masterNotifications')

        let finalMasterState
        if (savedMasterRaw === null) {
          finalMasterState = isGranted
        } else {
          finalMasterState = isGranted && savedMasterRaw === 'true'
        }

        setMasterNotifications(finalMasterState)
        localStorage.setItem('masterNotifications', finalMasterState.toString())
      } else {
        const savedMaster = localStorage.getItem('masterNotifications') === 'true'
        setMasterNotifications(savedMaster)
      }

      const savedNotifications = localStorage.getItem('notificationSettings')
      if (savedNotifications) {
        setNotifications(JSON.parse(savedNotifications))
      }
    }

    initSettings()

    return () => unsubscribeAuth()
  }, [currentLang])

  useEffect(() => {
    if (mounted && Capacitor.isNativePlatform() && theme) {
      const syncTheme = async () => {
        try {
          await Preferences.set({ key: 'theme', value: theme });
          if (window.AgiosScannerNative?.refreshWidgets) {
            window.AgiosScannerNative.refreshWidgets();
          }
        } catch (e) {
          console.error("Theme Sync Error:", e);
        }
      };
      syncTheme();
    }
  }, [theme, mounted]);

  const handleMasterToggle = async () => {
    const nextState = !masterNotifications

    if (nextState) {
      let perms = await LocalNotifications.checkPermissions()

      if (perms.display === 'denied') {
        setShowPermissionModal(true)
        return
      }

      if (perms.display !== 'granted') {
        perms = await LocalNotifications.requestPermissions()
      }

      if (perms.display !== 'granted') {
        setMasterNotifications(false)
        localStorage.setItem('masterNotifications', 'false')
        return
      }
    }

    setMasterNotifications(nextState)
    localStorage.setItem('masterNotifications', nextState.toString())

    if (Capacitor.isNativePlatform() && window.AgiosScannerNative?.updateSettings) {
        window.AgiosScannerNative.updateSettings(JSON.stringify(notifications), nextState);
    }

    await syncNotifications()
  }

  const updateSubSetting = async (key, value) => {
    if (!masterNotifications) return;

    const updated = { ...notifications, [key]: value };

    setNotifications(updated)

    localStorage.setItem(
      'notificationSettings',
      JSON.stringify(updated)
    );

    if (
      Capacitor.isNativePlatform() &&
      window.AgiosScannerNative?.updateSettings
    ) {
        window.AgiosScannerNative.updateSettings(
          JSON.stringify(updated),
          masterNotifications
        );
    }

    await syncNotifications()
  };

  const updateFontSize = (size) => {
    const newSize = Math.max(10, Math.min(40, size))

    setFontSize(newSize)

    localStorage.setItem(
      'bibleFontSize',
      newSize.toString()
    )

    document.documentElement.style.setProperty(
      '--bible-font-size',
      newSize + 'px'
    )

    window.dispatchEvent(new Event('storage'))
  }

  const updateFontWeight = (weight) => {
    const newWeight = Math.max(300, Math.min(900, weight))

    setFontWeight(newWeight)

    localStorage.setItem(
      'bibleFontWeight',
      newWeight.toString()
    )

    document.documentElement.style.setProperty(
      '--bible-font-weight',
      newWeight.toString()
    )

    window.dispatchEvent(new Event('storage'))
  }

  const updateFontFamily = (id) => {
    setFontFamily(id)

    // Save font separately for each language
    localStorage.setItem(
      `bibleFontFamily_${currentLang}`,
      id
    )

    const selectedFont =
      fontOptions.find(f => f.id === id) || fontOptions[0]

    document.documentElement.style.setProperty(
      '--bible-font-family',
      selectedFont.value
    )

    window.dispatchEvent(new Event('storage'))
  }

  const toggleVerseLayout = () => {
    const nextState = !versePerLine

    setVersePerLine(nextState)

    localStorage.setItem(
      'versePerLine',
      nextState.toString()
    )

    window.dispatchEvent(new Event('storage'))
  }

  const openSystemSettings = async () => {
    setShowPermissionModal(false)

    try {
      if (Capacitor.isNativePlatform()) {
        const { NativeSettingsCustom } = Capacitor.Plugins

        if (NativeSettingsCustom) {
          await NativeSettingsCustom.openAppSettings()
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push('/')
    } catch (error) {
      console.error("Logout Error:", error)
    }
  };

  const handleDeleteAccount = async () => {
    const currentUser = auth.currentUser

    if (!currentUser) return

    const lastSignInTime =
      new Date(currentUser.metadata.lastSignInTime).getTime()

    const now = new Date().getTime()

    const isFreshSession =
      (now - lastSignInTime) < (5 * 60 * 1000)

    if (!isFreshSession) {
      alert(strings.settings.account.fresh_login_required)
      return
    }

    const confirmed =
      window.confirm(strings.settings.account.delete_confirm)

    if (confirmed) {
      try {
        const userId = currentUser.uid
        const userDocRef = doc(db, 'users', userId)

        await deleteDoc(userDocRef)
        await deleteUser(currentUser)

        alert(strings.settings.account.delete_success)

        router.push('/intro')
      } catch (error) {
        console.error("Error deleting user:", error)

        if (error.code === 'auth/requires-recent-login') {
          alert(strings.settings.account.reauth_required)
        } else {
          alert(strings.settings.account.delete_error)
        }
      }
    }
  };

  const currentFontValue = useMemo(() => {
    return (
      fontOptions.find(f => f.id === fontFamily)?.value ||
      fontOptions[0].value
    )
  }, [fontFamily]);

  const filteredFonts = useMemo(() => {
    return fontOptions.filter(
      f => currentLang === 'ar'
        ? f.lang === 'ar'
        : f.lang === 'latin'
    )
  }, [currentLang]);

  const isGoldUnlocked =
    userData?.inventory?.includes('theme_gold');

  if (!mounted) return null;

  return (
    <div className={styles.container} dir={dir}>
      <h1 className={styles.title}>
        {strings.settings.title}
      </h1>

      {/* Language Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Languages
            size={22}
            className={styles.iconPrimary}
          />
          {strings.settings.language}
        </h2>

        <div className={styles.fontOptionsList}>
          {languages.map(lang => (
            <button
              key={lang.id}
              className={`${styles.fontChip} ${
                currentLang === lang.id
                  ? styles.activeChip
                  : ''
              }`}
              onClick={() => changeLanguage(lang.id)}
            >
              <span
                style={{
                  marginRight: dir === 'rtl' ? '0' : '8px',
                  marginLeft: dir === 'rtl' ? '8px' : '0'
                }}
              >
                {lang.flag}
              </span>

              {lang.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Palette
            size={22}
            className={styles.iconPrimary}
          />
          {strings.settings.appearance.title}
        </h2>

        <div className={styles.themeGrid}>
          <div
            className={`${styles.themeOption} ${
              theme === 'light' ? styles.active : ''
            }`}
            onClick={() => setTheme('light')}
          >
            <div
              className={`${styles.themeCircle} ${styles.light}`}
            >
              <Sun size={24} />
            </div>

            <span className={styles.themeLabel}>
              {strings.settings.appearance.light}
            </span>
          </div>

          <div
            className={`${styles.themeOption} ${
              theme === 'dark' ? styles.active : ''
            }`}
            onClick={() => setTheme('dark')}
          >
            <div
              className={`${styles.themeCircle} ${styles.dark}`}
            >
              <Moon size={24} />
            </div>

            <span className={styles.themeLabel}>
              {strings.settings.appearance.dark}
            </span>
          </div>

          {isGoldUnlocked && (
            <div
              className={`${styles.themeOption} ${
                theme === 'gold' ? styles.active : ''
              }`}
              onClick={() => setTheme('gold')}
            >
              <div
                className={`${styles.themeCircle} ${styles.gold}`}
              >
                <Crown size={24} />
              </div>

              <span className={styles.themeLabel}>
                {strings.shop?.items?.theme_gold?.name}
              </span>
            </div>
          )}

          <div
            className={`${styles.themeOption} ${
              theme === 'system' ? styles.active : ''
            }`}
            onClick={() => setTheme('system')}
          >
            <div
              className={`${styles.themeCircle} ${styles.system}`}
            >
              <Monitor size={24} />
            </div>

            <span className={styles.themeLabel}>
              {strings.settings.appearance.system}
            </span>
          </div>
        </div>
      </div>

      <div
        className={styles.section}
        id="text-settings"
      >
        <h2 className={styles.sectionTitle}>
          <BookOpen
            size={22}
            className={styles.iconPrimary}
          />
          {strings.settings.bible.title}
        </h2>

        {parallelLanguage === null && (
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <div className={styles.textContainer}>
                <span className={styles.settingLabel}>
                  <LayoutList
                    size={20}
                    className={styles.iconPrimary}
                  />
                  {strings.settings.bible.verse_per_line}
                </span>

                <p className={styles.subText}>
                  {strings.settings.bible.verse_per_line_desc}
                </p>
              </div>
            </div>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={versePerLine}
                onChange={toggleVerseLayout}
              />

              <span className={styles.sliderRound}></span>
            </label>
          </div>
        )}

        {currentLang === 'ar' && (
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <div className={styles.textContainer}>
                <span className={styles.settingLabel}>
                  <Type
                    size={20}
                    className={styles.iconPrimary}
                  />
                  {strings.settings.bible.show_tashkeel}
                </span>

                <p className={styles.subText}>
                  {strings.settings.bible.show_tashkeel_desc}
                </p>
              </div>
            </div>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={useTashkeel}
                onChange={toggleTashkeel}
              />

              <span className={styles.sliderRound}></span>
            </label>
          </div>
        )}

        {isNative && (
          <>
            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <div className={styles.textContainer}>
                  <span className={styles.settingLabel}>
                    <Zap
                      size={20}
                      className={styles.iconPrimary}
                    />
                    {strings.settings.bible.keep_app_awake}
                  </span>

                  <p className={styles.subText}>
                    {strings.settings.bible.keep_app_awake_desc}
                  </p>
                </div>
              </div>

              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={keepAppAwake}
                  onChange={toggleKeepAppAwake}
                />

                <span className={styles.sliderRound}></span>
              </label>
            </div>

            {!keepAppAwake && (
              <div
                className={styles.settingItem}
                style={{
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '15px'
                }}
              >
                <div className={styles.settingInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <Book
                        size={20}
                        className={styles.iconPrimary}
                      />
                      {strings.settings.bible.keep_bible_awake}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.bible.keep_bible_awake_desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={keepBibleAwake}
                    onChange={toggleKeepBibleAwake}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>
            )}
          </>
        )}

        <div className={styles.fontControlGroup}>
          <div
            className={styles.settingInfo}
            style={{ marginBottom: '15px' }}
          >
            <span className={styles.settingLabel}>
              <Columns
                size={20}
                className={styles.iconPrimary}
              />
              {strings.settings.bible.parallel_language}
            </span>

            <p className={styles.subText}>
              {strings.settings.bible.parallel_language_desc}
            </p>
          </div>

          <div className={styles.fontOptionsList}>
            <button
              className={`${styles.fontChip} ${
                parallelLanguage === null
                  ? styles.activeChip
                  : ''
              }`}
              onClick={() => changeParallelLanguage(null)}
            >
              {strings.settings.bible.none}
            </button>

            {languages
              .filter(l => l.id !== currentLang)
              .map(lang => (
                <button
                  key={lang.id}
                  className={`${styles.fontChip} ${
                    parallelLanguage === lang.id
                      ? styles.activeChip
                      : ''
                  }`}
                  onClick={() =>
                    changeParallelLanguage(lang.id)
                  }
                >
                  <span
                    style={{
                      marginRight:
                        dir === 'rtl' ? '0' : '8px',
                      marginLeft:
                        dir === 'rtl' ? '8px' : '0'
                    }}
                  >
                    {lang.flag}
                  </span>

                  {lang.name}
                </button>
              ))}
          </div>
        </div>

        <div className={styles.fontControlGroup}>
          <div
            className={styles.settingInfo}
            style={{ marginBottom: '15px' }}
          >
            <span className={styles.settingLabel}>
              <CaseSensitive
                size={20}
                className={styles.iconPrimary}
              />
              {strings.settings.bible.font_type}
            </span>
          </div>

          <div className={styles.fontOptionsList}>
            {filteredFonts.map(option => (
              <button
                key={option.id}
                className={`${styles.fontChip} ${
                  fontFamily === option.id
                    ? styles.activeChip
                    : ''
                }`}
                onClick={() =>
                  updateFontFamily(option.id)
                }
                style={{
                  fontFamily: option.value
                }}
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>

        <div
          className={styles.fontControlGroup}
          style={{ marginTop: '20px' }}
        >
          <div
            className={styles.settingInfo}
            style={{ marginBottom: '15px' }}
          >
            <span className={styles.settingLabel}>
              <Bold
                size={20}
                className={styles.iconPrimary}
              />

              {strings.settings.bible.font_weight.replace(
                '{weight}',
                formatNumber(fontWeight)
              )}
            </span>
          </div>

          <div className={styles.controlsWrapper}>
            <input
              type="range"
              min="300"
              max="900"
              step="100"
              value={fontWeight}
              onChange={(e) =>
                updateFontWeight(
                  parseInt(e.target.value)
                )
              }
              className={styles.slider}
            />
          </div>
        </div>

        <div
          className={styles.fontControlGroup}
          style={{ marginTop: '20px' }}
        >
          <div
            className={styles.settingInfo}
            style={{ marginBottom: '15px' }}
          >
            <span className={styles.settingLabel}>
              <Type
                size={20}
                className={styles.iconPrimary}
              />

              {strings.settings.bible.font_size.replace(
                '{size}',
                formatNumber(fontSize)
              )}
            </span>
          </div>

          <div
            className={styles.fontPreview}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: currentFontValue,
              fontWeight: fontWeight
            }}
          >
            {(versePerLine || parallelLanguage !== null) ? (
              <div className={styles.previewList}>
                <div>
                  {strings.settings.bible.preview.line_1}
                </div>

                <div>
                  {strings.settings.bible.preview.line_2}
                </div>
              </div>
            ) : (
              <p className={styles.previewParagraph}>
                {strings.settings.bible.preview.paragraph}
              </p>
            )}
          </div>

          <div className={styles.controlsWrapper}>
            <button
              className={styles.stepBtn}
              onClick={() =>
                updateFontSize(fontSize - 1)
              }
              disabled={fontSize <= 10}
            >
              −
            </button>

            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="10"
                max="40"
                step="1"
                value={fontSize}
                onChange={(e) =>
                  updateFontSize(
                    parseInt(e.target.value)
                  )
                }
                className={styles.slider}
              />
            </div>

            <button
              className={styles.stepBtn}
              onClick={() =>
                updateFontSize(fontSize + 1)
              }
              disabled={fontSize >= 40}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {isNative && (
        <div className={styles.section}>
          <div className={styles.masterToggleRow}>
            <h2 className={styles.sectionTitle}>
              <Bell
                size={22}
                className={styles.iconPrimary}
              />

              {strings.settings.notifications.title}
            </h2>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={masterNotifications}
                onChange={handleMasterToggle}
              />

              <span className={styles.sliderRound}></span>
            </label>
          </div>

          <div
            className={`${styles.notificationList} ${
              !masterNotifications
                ? styles.disabledList
                : ''
            }`}
          >
            <div className={styles.notificationGroup}>
              <div className={styles.notificationItem}>
                <div className={styles.notificationInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <Bell size={18} />
                      {strings.settings.notifications.verse.title}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.notifications.verse.desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.verse}
                    onChange={() =>
                      updateSubSetting(
                        'verse',
                        !notifications.verse
                      )
                    }
                    disabled={!masterNotifications}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>

              <div
                className={`${styles.timePickerRow} ${
                  !notifications.verse
                    ? styles.dimmed
                    : ''
                }`}
              >
                <Clock size={16} />

                <span>
                  {strings.settings.notifications.alert_time}
                </span>

                <input
                  type="time"
                  value={notifications.verseTime}
                  onChange={(e) =>
                    updateSubSetting(
                      'verseTime',
                      e.target.value
                    )
                  }
                  className={styles.timeInput}
                  disabled={!notifications.verse}
                />
              </div>
            </div>

            <div className={styles.notificationGroup}>
              <div className={styles.notificationItem}>
                <div className={styles.notificationInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <HelpCircle size={18} />

                      {strings.settings.notifications.question.title}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.notifications.question.desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.question}
                    onChange={() =>
                      updateSubSetting(
                        'question',
                        !notifications.question
                      )
                    }
                    disabled={!masterNotifications}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>

              <div
                className={`${styles.timePickerRow} ${
                  !notifications.question
                    ? styles.dimmed
                    : ''
                }`}
              >
                <Clock size={16} />

                <span>
                  {strings.settings.notifications.alert_time}
                </span>

                <input
                  type="time"
                  value={notifications.questionTime}
                  onChange={(e) =>
                    updateSubSetting(
                      'questionTime',
                      e.target.value
                    )
                  }
                  className={styles.timeInput}
                  disabled={!notifications.question}
                />
              </div>
            </div>

            <div className={styles.notificationGroup}>
              <div className={styles.notificationItem}>
                <div className={styles.notificationInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <BookOpen size={18} />

                      {strings.settings.notifications.study_plans.title}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.notifications.study_plans.desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.studyPlans}
                    onChange={() =>
                      updateSubSetting(
                        'studyPlans',
                        !notifications.studyPlans
                      )
                    }
                    disabled={!masterNotifications}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>

              <div
                className={`${styles.timePickerRow} ${
                  !notifications.studyPlans
                    ? styles.dimmed
                    : ''
                }`}
              >
                <Clock size={16} />

                <span>
                  {strings.settings.notifications.alert_time}
                </span>

                <input
                  type="time"
                  value={notifications.studyPlansTime}
                  onChange={(e) =>
                    updateSubSetting(
                      'studyPlansTime',
                      e.target.value
                    )
                  }
                  className={styles.timeInput}
                  disabled={!notifications.studyPlans}
                />
              </div>
            </div>

            <div className={styles.notificationGroup}>
              <div className={styles.notificationItem}>
                <div className={styles.notificationInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <Flame
                        size={18}
                        className={styles.notifIcon}
                      />

                      {strings.settings.notifications.streak.title}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.notifications.streak.desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.streak}
                    onChange={() =>
                      updateSubSetting(
                        'streak',
                        !notifications.streak
                      )
                    }
                    disabled={!masterNotifications}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>

              <div
                className={`${styles.timePickerRow} ${
                  !notifications.streak
                    ? styles.dimmed
                    : ''
                }`}
              >
                <Clock size={16} />

                <span>
                  {strings.settings.notifications.alert_time}
                </span>

                <input
                  type="time"
                  value={notifications.streakTime}
                  onChange={(e) =>
                    updateSubSetting(
                      'streakTime',
                      e.target.value
                    )
                  }
                  className={styles.timeInput}
                  disabled={!notifications.streak}
                />
              </div>
            </div>

            <div className={styles.notificationGroup}>
              <div className={styles.notificationItem}>
                <div className={styles.notificationInfo}>
                  <div className={styles.textContainer}>
                    <span className={styles.settingLabel}>
                      <Sparkles
                        size={18}
                        className={styles.notifIcon}
                      />

                      {strings.settings.notifications.app_suggestions.title}
                    </span>

                    <p className={styles.subText}>
                      {strings.settings.notifications.app_suggestions.desc}
                    </p>
                  </div>
                </div>

                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={notifications.appSuggestions}
                    onChange={() =>
                      updateSubSetting(
                        'appSuggestions',
                        !notifications.appSuggestions
                      )
                    }
                    disabled={!masterNotifications}
                  />

                  <span className={styles.sliderRound}></span>
                </label>
              </div>

              <div
                className={`${styles.timePickerRow} ${
                  !notifications.appSuggestions
                    ? styles.dimmed
                    : ''
                }`}
              >
                <Clock size={16} />

                <span>
                  {strings.settings.notifications.alert_time}
                </span>

                <input
                  type="time"
                  value={notifications.appSuggestionsTime}
                  onChange={(e) =>
                    updateSubSetting(
                      'appSuggestionsTime',
                      e.target.value
                    )
                  }
                  className={styles.timeInput}
                  disabled={!notifications.appSuggestions}
                />
              </div>
            </div>

            <div className={styles.notificationItem}>
              <div className={styles.notificationInfo}>
                <div className={styles.textContainer}>
                  <span className={styles.settingLabel}>
                    <RefreshCw
                      size={18}
                      className={styles.notifIcon}
                    />

                    {strings.settings.notifications.updates.title}
                  </span>

                  <p className={styles.subText}>
                    {strings.settings.notifications.updates.desc}
                  </p>
                </div>
              </div>

              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={notifications.updateAlerts}
                  onChange={() =>
                    updateSubSetting(
                      'updateAlerts',
                      !notifications.updateAlerts
                    )
                  }
                  disabled={!masterNotifications}
                />

                <span className={styles.sliderRound}></span>
              </label>
            </div>
          </div>
        </div>
      )}

      {user ? (
        <div
          className={
            styles.section + ' ' + styles.deleteSection
          }
        >
          <h2 className={styles.sectionTitle}>
            <SettingsIcon
              size={22}
              className={styles.iconPrimary}
            />

            {strings.settings.account.title}
          </h2>

          <p
            className={styles.subText}
            style={{ marginBottom: '15px' }}
          >
            {strings.settings.account.desc}
          </p>

          <div className={styles.accountButtons}>
            <button
              className={styles.logoutButton}
              onClick={handleLogout}
            >
              <LogOut size={20} />

              <span>
                {strings.settings.account.logout}
              </span>
            </button>

            <button
              className={styles.deleteButton}
              onClick={handleDeleteAccount}
            >
              <Trash2 size={20} />

              <span>
                {strings.settings.account.delete_account}
              </span>
            </button>
          </div>
        </div>
      ) : (
        showSyncLogin && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <CloudSync
                size={22}
                className={styles.iconPrimary}
              />

              {strings.settings.sync.title}
            </h2>

            <p
              className={styles.subText}
              style={{ marginBottom: '15px' }}
            >
              {strings.settings.sync.desc}
            </p>

            <button
              className={styles.loginButton}
              onClick={() => router.push('/intro')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor:
                  'var(--primary-color, #2563eb)',
                color: 'white',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              <LogIn size={20} />

              <span>
                {strings.settings.sync.login_button}
              </span>
            </button>
          </div>
        )
      )}

      {showPermissionModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <SettingsIcon
                size={24}
                className={styles.modalIcon}
              />

              <button
                onClick={() =>
                  setShowPermissionModal(false)
                }
                className={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <h3>
              {strings.settings.permission_modal.title}
            </h3>

            <p>
              {strings.settings.permission_modal.desc}
            </p>

            <div className={styles.modalActions}>
              <button
                onClick={openSystemSettings}
                className={styles.primaryBtn}
              >
                {strings.common.open_settings}
              </button>

              <button
                onClick={() =>
                  setShowPermissionModal(false)
                }
                className={styles.cancelBtn}
              >
                {strings.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings;