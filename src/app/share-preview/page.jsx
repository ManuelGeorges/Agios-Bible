"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { useRef, useState, Suspense, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { motion } from 'framer-motion'; 
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';
import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';
import { 
  Share2, Download, Loader2, Check, 
  Sparkles, Move, Type, Maximize2, AlignCenter, ArrowUpDown, X
} from 'lucide-react';
import styles from './SharePreview.module.css';
import { useLanguage } from '../context/LanguageContext';
import { toast } from 'react-hot-toast';

// إضافات لدعم نظام النقاط والمهام اليومية
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, increment, arrayUnion } from "firebase/firestore";
import { db } from '../../lib/firebase';
import { getCairoIsoString } from '../../lib/dateUtils';
import { StorageService, KEYS } from '../../lib/storage';

const TEMPLATES = Array.from({ length: 28 }, (_, i) => ({
  id: i + 1,
  url: `/templates/${i + 1}.webp`
}));

const FONTS = [
  { name: 'Cairo', family: "'Cairo', sans-serif" },
  { name: 'Amiri', family: "'Amiri', serif" },
  { name: 'Tajawal', family: "'Tajawal', sans-serif" },
  { name: 'El Messiri', family: "'El Messiri', sans-serif" },
  { name: 'Lateef', family: "'Lateef', cursive" }
];

const CACHE_KEY = 'agios_share_vFinal_prod_vfinal_v4';

function PreviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateRef = useRef(null);
  const constraintsRef = useRef(null);

  const verse = searchParams.get('verse');
  const reference = searchParams.get('ref');

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [fontSize, setFontSize] = useState(32);
  const [selectedFont, setSelectedFont] = useState(FONTS[0]);
  const [containerWidth, setContainerWidth] = useState(85);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [user, setUser] = useState(null);

  const { strings, dir } = useLanguage();

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));

    try {
      const saved = localStorage.getItem(CACHE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.templateId) {
          const t = TEMPLATES.find(temp => temp.id === config.templateId);
          if (t) setSelectedTemplate(t);
        }
        if (config.fontSize) setFontSize(config.fontSize);
        if (config.fontName) {
          const f = FONTS.find(font => font.name === config.fontName);
          if (f) setSelectedFont(f);
        }
        if (config.containerWidth) setContainerWidth(config.containerWidth);
        if (config.lineHeight) setLineHeight(config.lineHeight);
      }
    } catch (e) {
      console.error("Cache load error:", e);
    }
    setIsInitialized(true);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const config = {
      templateId: selectedTemplate.id,
      fontSize,
      fontName: selectedFont.name,
      containerWidth,
      lineHeight
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  }, [selectedTemplate, fontSize, selectedFont, containerWidth, lineHeight, isInitialized]);

  // دالة تسجيل المشاركة لرفع النقاط وتكملة المهمة اليومية
  const recordShareActivity = async () => {
    const points = 15;
    const reason = strings?.search?.reason_share_multi || "مشاركة تصميم آية من الاستوديو";

    try {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          totalPoints: increment(points),
          pointsHistory: arrayUnion({
            type: 'share',
            points: points,
            reason: reason,
            timestamp: getCairoIsoString()
          })
        });
      } else {
        await StorageService.addPoints(points);
        const history = await StorageService.get(KEYS.POINTS_HISTORY) || [];
        history.push({
          type: 'share',
          points: points,
          reason: reason,
          timestamp: getCairoIsoString()
        });
        await StorageService.save(KEYS.POINTS_HISTORY, history);
      }
    } catch (e) {
      console.error("Points Update Error:", e);
    }
  };

  const handleAction = async (type) => {
    if (!templateRef.current) return;
    setIsProcessing(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const isIOS = Capacitor.getPlatform() === 'ios';

      const options = {
        pixelRatio: isIOS ? 2 : 4,
        cacheBust: true,
        style: {
          transform: 'scale(1)',
          backgroundColor: '#000',
        },
        width: templateRef.current.offsetWidth,
        height: templateRef.current.offsetHeight,
        backgroundColor: '#000',
      };

      if (isIOS) {
        try {
          await toPng(templateRef.current, options);
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.warn("First pass failed, retrying...");
        }
      }

      const dataUrl = await toPng(templateRef.current, options);
      const fileName = `Agios-Verse-${Date.now()}.png`;
      const base64Data = dataUrl.split(',')[1];

      if (Capacitor.isNativePlatform()) {
        const cacheFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        });

        if (type === 'share') {
          await Share.share({
            files: [cacheFile.uri],
            title: strings?.share_preview?.share_title || "Agios Bible",
            dialogTitle: strings?.share_preview?.share_dialog || "Share Verse",
          });
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
          recordShareActivity(); // تسجيل النشاط هنا
        } else {
          if (isIOS) {
            await Media.savePhoto({ path: cacheFile.uri, album: 'Agios Bible' });
          } else {
            await Filesystem.writeFile({
              path: `Pictures/${fileName}`,
              data: base64Data,
              directory: Directory.ExternalStorage,
              recursive: true
            });
          }
          await Toast.show({ text: strings?.share_preview?.save_success || "Saved to gallery" });
        }
      } else {
        if (type === 'share' && navigator.share) {
          try {
            const blob = await fetch(dataUrl).then(res => res.blob());
            const file = new File([blob], fileName, { type: 'image/png' });
            const shareData = {
              files: [file],
              title: strings?.share_preview?.share_title || "Agios Bible",
            };

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share(shareData);
              recordShareActivity();
            } else {
              await navigator.share({
                title: strings?.share_preview?.share_title || "Agios Bible",
                text: `"${verse}" (${reference})`
              });
              recordShareActivity();
            }
          } catch (err) {
            console.warn("Share failed, falling back to download:", err);
            const link = document.createElement('a');
            link.download = fileName; link.href = dataUrl; link.click();
          }
        } else {
          const link = document.createElement('a');
          link.download = fileName; link.href = dataUrl; link.click();
        }
      }
    } catch (e) {
      console.error(e);
      toast.error(strings?.share_preview?.error_generic || "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.container} dir={dir}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;700;900&family=El+Messiri:wght@400;700&family=Lateef&family=Tajawal:wght@400;700&display=swap');
      `}</style>

      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <X size={24} />
        </button>
        <div className={styles.headerTitle}>
           <h1>{strings?.share_preview?.title}</h1>
           <p>{strings?.share_preview?.subtitle}</p>
        </div>
      </div>

      <div className={styles.mainLayout}>
        <div className={styles.previewContainer} ref={constraintsRef}>
          <div
            ref={templateRef}
            className={styles.previewCard}
            dir={dir}
          >
            <img
              src={selectedTemplate.url}
              alt=""
              className={styles.cardBackground}
              crossOrigin="anonymous"
            />

            <div className={styles.cardOverlay}></div>
            
            <motion.div
              drag
              dragConstraints={constraintsRef}
              dragElastic={0.05}
              dragMomentum={false}
              initial={{ x: 0, y: 0 }}
              className={styles.draggableArea}
              style={{ width: `${containerWidth}%` }}
            >
              <div className={styles.textContent} style={{ lineHeight: lineHeight }}>
                <p className={styles.verseText} style={{ fontSize: `${fontSize}px`, fontFamily: selectedFont.family }}>
                  {verse}
                </p>
                <p className={styles.refText} style={{ fontSize: `${Math.max(14, fontSize * 0.55)}px`, fontFamily: selectedFont.family }}>
                  {reference}
                </p>
              </div>
            </motion.div>

            <div className={styles.brandTag}>
               <Sparkles size={10} color="#38bdf8" />
               <span className={styles.brandName}>AGIOS BIBLE</span>
            </div>
          </div>
        </div>

        <div className={styles.editorPanel}>
          <div className={styles.controlRow}>
            <label><Type size={18} /> {strings?.share_preview?.label_font}</label>
            <div className={styles.fontScroll}>
              {FONTS.map(f => (
                <button 
                  key={f.name}
                  className={`${styles.fontOption} ${selectedFont.name === f.name ? styles.activeFont : ''}`}
                  onClick={() => setSelectedFont(f)}
                  style={{ fontFamily: f.family }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlRow}>
            <label><Maximize2 size={18} /> {strings?.share_preview?.label_font_size?.replace('{size}', fontSize)}</label>
            <input
              type="range"
              min="16"
              max="64"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className={styles.slider}
            />
          </div>

          <div className={styles.controlRow}>
            <label><AlignCenter size={18} /> {strings?.share_preview?.label_box_width?.replace('{width}', containerWidth)}</label>
            <input
              type="range"
              min="40"
              max="100"
              value={containerWidth}
              onChange={(e) => setContainerWidth(parseInt(e.target.value))}
              className={styles.slider}
            />
          </div>

          <div className={styles.controlRow}>
            <label><ArrowUpDown size={18} /> {strings?.share_preview?.label_line_height?.replace('{height}', lineHeight)}</label>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.1"
              value={lineHeight}
              onChange={(e) => setLineHeight(parseFloat(e.target.value))}
              className={styles.slider}
            />
          </div>

          <div className={styles.controlRow}>
            <label><Move size={18} /> {strings?.share_preview?.label_background}</label>
            <div className={styles.templatesGrid}>
              {TEMPLATES.map(t => (
                <div
                  key={t.id}
                  className={`${styles.thumb} ${selectedTemplate.id === t.id ? styles.activeThumb : ''}`}
                  onClick={() => setSelectedTemplate(t)}
                >
                  <img src={t.url} alt="" />
                  {selectedTemplate.id === t.id && (
                    <div className={styles.activeCheck}>
                      <Check size={12} color="white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actionFooter}>
        <button onClick={() => handleAction('share')} className={styles.shareBtn} disabled={isProcessing}>
          <Share2 size={20} /> {strings?.share_preview?.share_btn}
        </button>
        <button onClick={() => handleAction('download')} className={styles.saveBtn} disabled={isProcessing}>
          {isProcessing ? <Loader2 className={styles.spin} /> : <Download size={20} />} {strings?.share_preview?.download_btn}
        </button>
      </div>
    </div>
  );
}

export default function SharePreviewPage() {
  return <Suspense fallback={null}><PreviewContent /></Suspense>;
}
