// 사이트 전체에서 가장 최근의 '최종 검토일'을 빌드 시점에 계산합니다.
//
// 손으로 적는 날짜는 반드시 낡습니다. 그래서 각 페이지 하단에 이미 적혀 있는
// 검토일을 모아 그중 가장 최근 것을 씁니다. 페이지를 고치면서 그 페이지의
// 검토일만 갱신하면 첫 화면 표기도 따라 움직입니다.

const RAW = import.meta.glob('/src/pages/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const KO_MONTH = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
const EN_MONTHS = ['january','february','march','april','may','june',
                   'july','august','september','october','november','december'];
const EN_DATE = new RegExp(`(\\d{1,2})\\s+(${EN_MONTHS.join('|')})\\s+(\\d{4})`, 'i');

/** 본문에서 검토일을 찾아 [연, 월, 일] 로 돌려줍니다. 없으면 null. */
function parseReviewDate(text) {
  const ko = text.match(/최종 검토일[:：]?\s*([^\n*]+)/);
  if (ko) {
    const m = ko[1].match(KO_MONTH);
    if (m) return [+m[1], +m[2], +m[3]];
  }
  const en = text.match(/Last reviewed[:：]?\s*([^\n*]+)/i);
  if (en) {
    const m = en[1].match(EN_DATE);
    if (m) return [+m[3], EN_MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]];
  }
  return null;
}

/**
 * @param {'ko'|'en'} locale
 * @returns {{ iso: string, label: string } | null}
 */
export function lastUpdated(locale = 'ko') {
  let best = null;
  for (const text of Object.values(RAW)) {
    const d = parseReviewDate(text);
    if (!d) continue;
    if (!best || d[0] > best[0] || (d[0] === best[0] && (d[1] > best[1] || (d[1] === best[1] && d[2] > best[2])))) {
      best = d;
    }
  }
  if (!best) return null;

  const [y, m, day] = best;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const label = locale === 'en'
    ? `${day} ${EN_MONTHS[m - 1][0].toUpperCase() + EN_MONTHS[m - 1].slice(1)} ${y}`
    : `${y}년 ${m}월 ${day}일`;

  return { iso, label };
}
