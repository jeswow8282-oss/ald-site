// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ── 배포 주소 설정 ────────────────────────────────────────────────
// 지금은 GitHub Pages 기본 주소(하위 경로)로 배포합니다.
// 도메인을 사면:  site를 그 주소로 바꾸고  base 줄을 지우면 됩니다.
const SITE = 'https://jeswow8282-oss.github.io';
const BASE = '/ald-site';
// ─────────────────────────────────────────────────────────────────

/**
 * 마크다운 본문의 루트 상대 경로(/treatment, /assets/...)에 base를 붙입니다.
 * Astro는 이걸 자동으로 해주지 않아서, 없으면 배포 후 링크가 전부 깨집니다.
 */
function rehypeBasePrefix() {
  const prefix = (v) =>
    typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith(BASE + '/')
      ? BASE + v
      : v;
  const walk = (node) => {
    if (node.type === 'element' && node.properties) {
      if (node.properties.href) node.properties.href = prefix(node.properties.href);
      if (node.properties.src) node.properties.src = prefix(node.properties.src);
    }
    (node.children || []).forEach(walk);
  };
  return (tree) => walk(tree);
}

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [rehypeBasePrefix],
    shikiConfig: { theme: 'github-light' },
  },
});
