/**
 * mail 컬렉션에 문서가 생기면 실제로 메일을 보낸다.
 *
 * Firebase 'Trigger Email' 확장이 하던 일을 직접 한다.
 * 확장을 쓰지 않는 이유 — Firebase Extensions 가 2027-03-31 에 종료된다.
 * 그때 다시 갈아엎느니 처음부터 우리 코드로 둔다.
 *
 * 문서 형식 (확장과 같게 맞춰 두었다)
 *   { to: ["주소"], message: { subject, text, html? }, from? }
 *
 * 처리 결과는 같은 문서의 delivery 필드에 남긴다. 조용히 실패하지 않게.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const SMTP_PASSWORD = defineSecret('BREVO_SMTP_PASSWORD');

const SMTP_HOST = 'smtp-relay.brevo.com';
const SMTP_PORT = 587;
const SMTP_USER = 'bb7fe3001@smtp-brevo.com';

// 도메인 인증이 끝나면 config/notify 의 from 필드만 바꾸면 된다.
// 코드를 다시 배포할 필요가 없다.
const FALLBACK_FROM = '부신백질이영양증 정보 <jeswow82@gmail.com>';

const REGION = 'asia-northeast3';

async function makeTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,          // 587 은 STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD.value() },
  });
}

async function fromAddress(db) {
  try {
    const cfg = await db.doc('config/notify').get();
    const v = cfg.exists ? cfg.get('from') : null;
    return (typeof v === 'string' && v.includes('@')) ? v : FALLBACK_FROM;
  } catch {
    return FALLBACK_FROM;
  }
}

export const sendQueuedMail = onDocumentCreated(
  { document: 'mail/{id}', region: REGION, secrets: [SMTP_PASSWORD] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};

    const to = Array.isArray(d.to) ? d.to.filter(Boolean) : [];
    const subject = d.message?.subject;
    const text = d.message?.text;

    if (!to.length || !subject || !text) {
      logger.error('메일 문서 형식이 맞지 않습니다', { id: snap.id });
      await snap.ref.set({
        delivery: { state: 'ERROR', error: 'to/subject/text 가 필요합니다',
                    endTime: FieldValue.serverTimestamp() },
      }, { merge: true });
      return;
    }

    const db = getFirestore();
    try {
      const transport = await makeTransport();
      const info = await transport.sendMail({
        from: d.from || (await fromAddress(db)),
        to: to.join(', '),
        subject,
        text,
        ...(d.message.html ? { html: d.message.html } : {}),
      });
      logger.info('발송 완료', { id: snap.id, to: to.length, messageId: info.messageId });
      await snap.ref.set({
        delivery: { state: 'SUCCESS', messageId: info.messageId || null,
                    endTime: FieldValue.serverTimestamp() },
      }, { merge: true });
    } catch (e) {
      logger.error('발송 실패', { id: snap.id, err: String(e) });
      await snap.ref.set({
        delivery: { state: 'ERROR', error: String(e?.message || e),
                    endTime: FieldValue.serverTimestamp() },
      }, { merge: true });
    }
  },
);

/**
 * 월 1회 자체 점검 발송.
 *
 * Brevo SMTP 키는 90일 동안 발송이 없으면 만료된다. 문의가 뜸한 달이
 * 이어지면 키가 조용히 죽고, 정작 필요할 때 알림이 안 온다.
 * 한 달에 한 통 보내서 키를 살려두고, 발송 경로가 살아 있는지도 확인한다.
 */
export const monthlyMailHeartbeat = onSchedule(
  { schedule: '0 9 1 * *', timeZone: 'Asia/Seoul', region: REGION },
  async () => {
    const db = getFirestore();
    const cfg = await db.doc('config/notify').get();
    const to = (cfg.exists && Array.isArray(cfg.get('to'))) ? cfg.get('to') : [];
    if (!to.length) { logger.warn('수신자가 없어 점검 발송을 건너뜁니다'); return; }

    await db.collection('mail').add({
      to: [to[0]],   // 점검이므로 한 명에게만
      message: {
        subject: '[kalds.org] 월간 메일 점검',
        text:
          '메일 발송 경로가 정상입니다.\n\n' +
          '이 메일은 한 달에 한 번 자동으로 보냅니다.\n' +
          'Brevo SMTP 키가 90일 무발송으로 만료되는 것을 막고,\n' +
          '발송이 살아 있는지 확인하기 위한 것입니다.\n\n' +
          '이 메일이 오지 않는 달이 있으면 발송에 문제가 생긴 것입니다.\n' +
          'https://kalds.org/admin',
      },
    });
    logger.info('월간 점검 메일을 큐에 넣었습니다');
  },
);
