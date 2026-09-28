/**
 * 새 문의가 저장되면 관리자에게 알림 메일을 보낸다.
 *
 * 왜 서버에서 하나 — 클라이언트가 직접 메일 큐에 넣게 하면 누구나 우리
 * 계정으로 아무 주소에나 메일을 보낼 수 있다. 그래서 문의 저장을 신호로
 * 삼아 서버에서만 큐에 넣는다.
 *
 * 실제 발송은 Firebase 'Trigger Email from Firestore' 확장이 맡는다.
 * 이 함수는 mail 컬렉션에 문서를 하나 만들 뿐이다.
 *
 * 받는 사람은 Firestore 의 config/notify 문서에서 읽는다.
 * 코드에 적지 않는 이유는 이 저장소가 공개이기 때문이다.
 *   config/notify = { to: ["주소1", "주소2"] }
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const TYPE_LABEL = { patient: '환자·보호자', research: '연구' };

export const notifyNewSubmission = onDocumentCreated(
  { document: 'submissions/{id}', region: 'asia-northeast3' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const s = snap.data() || {};

    // 받는 사람 목록. 없으면 조용히 끝낸다 — 문의 저장을 방해하면 안 된다.
    let to = [];
    try {
      const cfg = await db.doc('config/notify').get();
      to = (cfg.exists && Array.isArray(cfg.get('to'))) ? cfg.get('to') : [];
    } catch (e) {
      logger.error('config/notify 를 읽지 못했습니다', e);
      return;
    }
    if (!to.length) {
      logger.warn('config/notify 에 받는 주소가 없어 알림을 보내지 않습니다');
      return;
    }

    const kind = TYPE_LABEL[s.type] || '문의';
    const how =
      s.prefer === 'phone' ? '전화 연락 희망'
      : s.prefer === 'email' ? '이메일 답변 희망'
      : '';
    const reach = [s.email, s.phone, s.contact].filter(Boolean).join(' · ') || '(없음)';
    const body = String(s.message || '');
    const preview = body.length > 600 ? body.slice(0, 600) + ' …(생략)' : body;

    await db.collection('mail').add({
      to,
      message: {
        subject: `[kalds.org] 새 ${kind} 문의 — ${s.name || '이름 없음'}`,
        text:
          `새 문의가 들어왔습니다.\n\n` +
          `종류   : ${kind}\n` +
          `보낸이 : ${s.name || '(없음)'}\n` +
          `연락처 : ${reach}${how ? `  [${how}]` : ''}\n\n` +
          `내용\n──────────\n${preview}\n──────────\n\n` +
          `답변은 관리자 페이지에서 하실 수 있습니다.\n` +
          `https://kalds.org/admin\n\n` +
          `이 메일에 답장하셔도 문의하신 분께 전달되지 않습니다.`,
      },
    });

    logger.info(`알림을 큐에 넣었습니다 (${snap.id}, 수신 ${to.length}명)`);
  },
);
