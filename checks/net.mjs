// 큐브 상태 입력 화면의 전개도가 반듯한지 점검한다.
// 실행: 개발 서버(npx vite --port 5179)를 켠 뒤 node checks/net.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_URL ?? 'http://localhost:5179/';
const tmp = fileURLToPath(new URL('./tmp/', import.meta.url));
mkdirSync(tmp, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
for (const size of [
  { name: 'fold-cover', width: 360, height: 860, dpr: 3 },
  { name: 'fold-open', width: 720, height: 800, dpr: 2 },
  { name: 'pc', width: 1366, height: 768, dpr: 1 },
]) {
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dpr });
  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.trim() === '경로').click());
  await page.waitForSelector('.net__cell');
  const cells = await page.$$eval('.net__cell', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
  // 칸은 면 번호 × 9 + 칸 번호 순서. 모든 칸이 같은 크기의 정사각형이고, 줄과 열의 간격이 일정해야 한다.
  const w = cells[0].w;
  const square = cells.every((c) => Math.abs(c.w - w) < 0.6 && Math.abs(c.h - w) < 0.6);
  check(`[${size.name}] 모든 칸이 같은 크기의 정사각형`, square, `${w.toFixed(1)}px`);
  let even = true;
  let worst = 0;
  for (let face = 0; face < 6; face++) {
    const f = cells.slice(face * 9, face * 9 + 9);
    const stepY = f[3].y - f[0].y;
    const stepX = f[1].x - f[0].x;
    for (let i = 0; i < 9; i++) {
      const dy = f[i].y - (f[0].y + Math.floor(i / 3) * stepY);
      const dx = f[i].x - (f[0].x + (i % 3) * stepX);
      worst = Math.max(worst, Math.abs(dx), Math.abs(dy));
    }
    // 줄 간격과 열 간격이 같아야 한다 (칸 크기 + 틈)
    if (Math.abs(stepY - stepX) > 0.6) even = false;
  }
  check(`[${size.name}] 면 안에서 줄과 열의 간격이 같다`, even && worst < 0.6, `어긋남 ${worst.toFixed(2)}px`);
  // 윗면의 아랫줄과 앞면의 윗줄 사이도 같은 간격이어야 한다 (전개도가 이어져 보이게)
  const gapInside = cells[3].y - cells[0].y;
  const gapBetween = cells[18].y - cells[6].y;
  check(`[${size.name}] 윗면과 앞면 사이 간격도 같다`, Math.abs(gapInside - gapBetween) < 0.6, `${gapInside.toFixed(1)} / ${gapBetween.toFixed(1)}`);
  await (await page.$('.net')).screenshot({ path: `${tmp}net-${size.name}.png` });
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
