import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Aviso temprano si faltan variables de entorno (.env.local)
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    '[firebase] Faltan variables VITE_FIREBASE_*. Copiá .env.example a .env.local y completá la config.',
  );
}

export const app = initializeApp(firebaseConfig);

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;

function initAppCheck(): AppCheck | null {
  if (typeof window === 'undefined' || !appCheckSiteKey) return null;

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.error('[firebase.appCheck]', error);
    return null;
  }
}

// Servicios: punto único de acceso para toda la app (los services importan de acá).
// Nota: no usamos Firebase Storage (las imágenes van a Cloudinary, gratis sin tarjeta).
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const appCheck = initAppCheck();

// Analytics solo si el entorno lo soporta (evita errores en dev / navegadores sin soporte)
export const analyticsPromise = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
