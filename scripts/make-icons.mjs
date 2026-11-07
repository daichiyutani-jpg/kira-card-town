// アプリアイコン（PNG）を生成する。夜空の背景に、2枚のカードと金の星。
// 使い方: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const star = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};
function icon(size, pad) {
  const k = 1 - pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#5b3cc4"/><stop offset=".6" stop-color="#1b1446"/><stop offset="1" stop-color="#0d0a24"/></radialGradient>
    <linearGradient id="c1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset="1" stop-color="#d6336c"/></linearGradient>
    <linearGradient id="c2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fd3ff"/><stop offset="1" stop-color="#3c5bd6"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b0"/><stop offset=".6" stop-color="#ffcc33"/><stop offset="1" stop-color="#ff9a1f"/></linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#bg)"/>
  ${star(36, 40, 5, '#fff')}${star(166, 52, 4, '#cfe6ff')}${star(150, 168, 3, '#fff')}${star(30, 160, 3, '#ffe27a')}
  <g transform="translate(100 104) scale(${k}) translate(-100 -104)">
    <g transform="rotate(-14 100 110)"><rect x="46" y="44" width="76" height="108" rx="10" fill="url(#c2)" stroke="#fff" stroke-width="5"/></g>
    <g transform="rotate(12 100 110)"><rect x="80" y="46" width="76" height="108" rx="10" fill="url(#c1)" stroke="#fff" stroke-width="5"/></g>
    ${star(104, 100, 46, '#7a3b00')}${star(102, 96, 46, 'url(#gold)')}
  </g>
</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
writeFileSync('public/icons/icon-192.png', icon(192, 0.04));
writeFileSync('public/icons/icon-512.png', icon(512, 0.04));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 0.14));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.06));
console.log('icons written');
