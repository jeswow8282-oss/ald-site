// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ⚠️ 도메인을 사면 아래 site 값을 실제 주소로 바꾸세요.
//    (예: 'https://ald.kr')  sitemap.xml과 canonical 주소가 여기서 만들어집니다.
//    도메인 연결 전에는 GitHub Pages 기본 주소를 씁니다:
//    'https://<계정명>.github.io/<저장소명>'  ← 이 경우 base도 함께 지정해야 합니다.
export default defineConfig({
  site: 'https://example.org',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
