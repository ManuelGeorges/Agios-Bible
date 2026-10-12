'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '../../lib/firebase';
import { syncLocalDataToFirebase } from '../../lib/SyncService';
import styles from './signup.module.css';
import { Apple } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function SignUpPage() {
  const { strings, dir } = useLanguage();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const isSubmittingRef = useRef(false);
  const router = useRouter();

  const WEB_CLIENT_ID = '900022943169-p5r8tqgfb603vqtfdthh1hv7vr94eqrr.apps.googleusercontent.com';

  useEffect(() => {
    setIsIOS(Capacitor.getPlatform() === 'ios');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !isSubmittingRef.current) {
        router.replace('/');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const updateSubmitting = (val) => {
    setIsSubmitting(val);
    isSubmittingRef.current = val;
  };

  const handleUserData = async (user) => {
    if (!db || !user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const [fName, ...lName] = (user.displayName || "").split(' ');
        await setDoc(userRef, {
          firstName: firstName || fName || strings.common.default_first_name,
          lastName: lastName || lName.join(' ') || strings.common.default_last_name,
          email: user.email,
          createdAt: new Date().toISOString(),
          favorites: { verses: {} },
          completedChapters: {},
          completedPlans: {}
        }, { merge: true });
      }
    } catch (err) { console.error("Firestore Sync Error:", err); }
    await syncLocalDataToFirebase(user);
  };

  const syncAuthAndRedirect = async (nativeResult) => {
    let user = auth.currentUser;

    if (!user) {
      user = await new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (auth.currentUser || attempts > 10) {
            clearInterval(interval);
            resolve(auth.currentUser);
          }
        }, 200);
      });
    }

    if (!user && nativeResult?.credential) {
      try {
        const isApple = !!nativeResult.credential.nonce;
        const credential = isApple
          ? new OAuthProvider('apple.com').credential({
              idToken: nativeResult.credential.idToken,
              rawNonce: nativeResult.credential.nonce
            })
          : GoogleAuthProvider.credential(nativeResult.credential.idToken);

        const userCredential = await signInWithCredential(auth, credential);
        user = userCredential.user;
      } catch (e) {
        console.warn("Manual sync overlap handled");
        user = auth.currentUser || nativeResult?.user;
      }
    }

    const finalUser = user || nativeResult?.user;
    if (finalUser) {
      await handleUserData(finalUser);
      setTimeout(() => {
        router.replace('/');
      }, 600);
    } else {
      throw new Error(strings.common.sync_error);
    }
  };

  const handleGoogleAuth = async () => {
    if (isSubmitting) return;
    setError(null);
    updateSubmitting(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle({ webClientId: WEB_CLIENT_ID });
        await syncAuthAndRedirect(result);
      } else {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        await handleUserData(result.user);
        router.replace('/');
      }
    } catch (err) {
      console.error(err);
      setError(strings.signup.error_google);
      updateSubmitting(false);
    }
  };

  const handleAppleAuth = async () => {
    if (isSubmitting) return;
    setError(null);
    updateSubmitting(true);

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithApple();
        await syncAuthAndRedirect(result);
      } else {
        const provider = new OAuthProvider('apple.com');
        const result = await signInWithPopup(auth, provider);
        await handleUserData(result.user);
        router.replace('/');
      }
    } catch (err) {
      console.error("Apple Sign-In Error:", err);
      updateSubmitting(false);
      if (err.message?.includes('cancel') || err.code === '1' || err.code === 'auth/cancelled-popup-request') return;
      setError(strings.signup.error_apple);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!firstName || !lastName) { setError(strings.signup.error_name_required); return; }
    setError(null);
    updateSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await handleUserData(userCredential.user);
      router.replace('/');
    } catch (err) {
      setError(strings.signup.error_generic);
      updateSubmitting(false);
    }
  };

  return (
    <div className={styles.container} style={{ direction: dir }}>
      <div className={styles.card}>
        <h1 className={styles.title}>{strings.signup.title}</h1>
        <form onSubmit={handleAuth} className={styles.form}>
          <div className={styles.nameRow}>
            <input type="text" placeholder={strings.signup.first_name} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={styles.input} disabled={isSubmitting} required />
            <input type="text" placeholder={strings.signup.last_name} value={lastName} onChange={(e) => setLastName(e.target.value)} className={styles.input} disabled={isSubmitting} required />
          </div>
          <input type="email" placeholder={strings.common.email} value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} disabled={isSubmitting} required />
          <input type="password" placeholder={strings.common.password} value={password} onChange={(e) => setPassword(e.target.value)} className={styles.input} disabled={isSubmitting} required />
          {error && <div className={styles.errorBox}>{error}</div>}
          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? strings.signup.submitting : strings.signup.submit}
          </button>
        </form>

        {!isIOS && (
          <>
            <div className={styles.divider}><span className={styles.dividerText}>{strings.common.or}</span></div>
            <div className={styles.socialButtons}>
              <button onClick={handleGoogleAuth} className={styles.googleButton} disabled={isSubmitting}>
                <img src="/images/google.png" alt="Google" className={styles.googleIcon} />
                <span>{strings.common.google}</span>
              </button>
              <button onClick={handleAppleAuth} className={styles.appleButton} disabled={isSubmitting}>
                <Apple size={20} />
                <span>{strings.common.apple}</span>
              </button>
            </div>
          </>
        )}

        <p className={styles.toggleMode}>
          {strings.signup.has_account} <span onClick={() => router.push('/login')} className={styles.link}>{strings.signup.login}</span>
        </p>
      </div>
    </div>
  );
}
