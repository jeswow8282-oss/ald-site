// Firebase 초기화 (클라이언트 전용)
//
// 이 설정값은 비밀이 아닙니다. Firebase 웹 SDK config와 reCAPTCHA 사이트 키는
// 브라우저에 노출되도록 설계된 값이며, 그 자체로는 접근 권한을 주지 않습니다.
// 데이터를 실제로 지키는 것은 Firestore 보안 규칙(firestore.rules)과 App Check입니다.
//
// ⚠️ reCAPTCHA "비밀 키(secret key)"는 여기에 넣지 마십시오.
//    그것은 Firebase 콘솔의 App Check 설정에만 등록합니다.

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBUoOHHZwpLTGxn1U_Gay-YqeFZVUfnheM',
  authDomain: 'korea-ald.firebaseapp.com',
  projectId: 'korea-ald',
  storageBucket: 'korea-ald.firebasestorage.app',
  messagingSenderId: '76473651856',
  appId: '1:76473651856:web:70d8c177671a4ce73cfe15',
};

// reCAPTCHA v3 사이트 키 (공개값)
const RECAPTCHA_SITE_KEY = '6LcHD3otAAAAAJ8nMVm92nWmEke9813KuW7ujTI7';

const app = initializeApp(firebaseConfig);

// ── App Check ──────────────────────────────────────────────────────
// 우리 사이트에서 온 요청만 Firestore에 닿게 합니다.
// 공개 저장소라 config가 노출되므로, 봇이 직접 Firestore를 두드리는 것을 막습니다.
// 다른 Firebase 서비스보다 먼저 초기화해야 합니다.
if (typeof window !== 'undefined') {
  // 로컬 개발(localhost)에서는 디버그 토큰을 사용합니다.
  // 콘솔에 찍히는 토큰을 Firebase App Check → 앱 → 디버그 토큰 관리에 등록하면
  // 개발 중에도 정상 동작합니다.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // App Check 초기화 실패가 페이지 전체를 막지 않도록 합니다.
    console.warn('App Check 초기화 실패:', e);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
