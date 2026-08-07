// Firebase 초기화 (클라이언트 전용)
//
// 이 설정값은 비밀이 아닙니다. Firebase 웹 SDK config는 "프로젝트 주소"에 해당하며,
// 그 자체로는 어떤 접근 권한도 주지 않습니다. 공개 저장소에 커밋해도 됩니다.
// 데이터를 실제로 지키는 것은 Firestore 보안 규칙(firestore.rules)입니다.

import { initializeApp } from 'firebase/app';
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
