// 카메라 스캔을 실제 브라우저에서 끝까지 점검한다.
// 가짜 카메라 영상으로, 같은 큐브를 서로 반대쪽 꼭짓점에서 본 두 그림을 5초씩 번갈아 보여 준다.
// 실행: 개발 서버(npx vite --port 5179)를 켠 뒤 node checks/scan.mjs
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_URL ?? 'http://localhost:5179/';
const fixtures = fileURLToPath(new URL('../src/scanner/fixtures/', import.meta.url));
const tmp = fileURLToPath(new URL('./tmp/', import.meta.url));
mkdirSync(tmp, { recursive: true });
const CUBE = process.env.CUBE ?? 'cube1';
const truth = JSON.parse(readFileSync(`${fixtures}index.json`, 'utf8')).find((c) => c.id === CUBE).state;

// ── 가짜 카메라 영상 만들기 ──
const W = 640;
const H = 480;
const FPS = 4;
const SECONDS = 5;
async function frame(name) {
  const rgb = await sharp(`${fixtures}${name}`)
    .flatten({ background: '#8d8f96' })
    .resize(W, H, { fit: 'contain', background: '#8d8f96' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const Y = Buffer.alloc(W * H);
  const U = Buffer.alloc((W / 2) * (H / 2));
  const V = Buffer.alloc((W / 2) * (H / 2));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]];
      Y[y * W + x] = clamp(0.299 * r + 0.587 * g + 0.114 * b);
      if (x % 2 === 0 && y % 2 === 0) {
        const k = (y / 2) * (W / 2) + x / 2;
        U[k] = clamp(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
        V[k] = clamp(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
      }
    }
  }
  return Buffer.concat([Buffer.from('FRAME\n'), Y, U, V]);
}
const a = await frame(`${CUBE}-a.png`);
const b = await frame(`${CUBE}-b.png`);
const video = `${tmp}scan.y4m`;
writeFileSync(
  video,
  Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`),
    ...Array(FPS * SECONDS).fill(a),
    ...Array(FPS * SECONDS).fill(b),
  ]),
);

// ── 점검 ──
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLORS = ['#f4f4f2', '#e0312b', '#17a34a', '#ffd60a', '#ff8a00', '#1d62d8'];
const rgbText = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${video}`,
  ],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const text = (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const clickText = async (selector, label) => {
  for (const h of await page.$$(selector)) {
    if ((await h.evaluate((el) => el.textContent.trim())) === label) return h.click();
  }
  throw new Error(`버튼 없음: ${selector} "${label}"`);
};
const dotCount = () => page.$$eval('.scan__dot', (els) => els.length);

for (const size of [
  { name: 'pc', width: 1366, height: 768, dpr: 1 },
  { name: 'fold-cover', width: 360, height: 860, dpr: 3 },
  { name: 'fold-open', width: 720, height: 800, dpr: 2 },
]) {
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dpr });
  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await clickText('.tab', '경로');
  await sleep(200);
  await clickText('.route__scan', '카메라로 찍어서 입력');
  await page.waitForSelector('.scan__state--found', { timeout: 20000 });
  check(`[${size.name}] 안내선 없이 큐브를 찾아 27칸에 점을 찍는다`, (await dotCount()) === 27, await text('.scan__state'));
  check(`[${size.name}] 안내선이 없다`, (await page.$('.scan__guide, .scan__hex')) === null);
  // 점이 영상 속 큐브 위에 놓이는지: 모든 점이 카메라 영역 안에 있어야 한다
  const inside = await page.evaluate(() => {
    const box = document.querySelector('.scan__camera').getBoundingClientRect();
    return [...document.querySelectorAll('.scan__dot')].every((d) => {
      const r = d.getBoundingClientRect();
      return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
    });
  });
  check(`[${size.name}] 점이 모두 카메라 화면 안에 있다`, inside);
  await page.screenshot({ path: `${tmp}scan-${size.name}-1.png` });

  await clickText('.lesson__nav .btn', '찍기');
  await sleep(300);
  check(
    `[${size.name}] 찍은 세 면이 기록되고 남은 면을 알려 준다`,
    (await page.$$('.scan__chip--done')).length === 3 && (await text('.lesson__title'))?.startsWith('남은 면') === true,
    await text('.lesson__title'),
  );
  // 영상이 아직 같은 꼭짓점을 보여 주는 동안에는 경고가 나온다
  const warned = await page
    .waitForFunction(() => document.querySelector('.scan__warn')?.textContent.includes('이미 찍었어요'), { timeout: 4000 })
    .then(() => true, () => false);
  check(`[${size.name}] 새 면이 안 보이면 알려 준다`, warned);
  // 반대쪽 꼭짓점 그림으로 바뀔 때까지 기다린다
  await page.waitForFunction(
    () => document.querySelector('.scan__state--found') && !document.querySelector('.scan__warn'),
    { timeout: 20000 },
  );
  await sleep(300);
  await page.screenshot({ path: `${tmp}scan-${size.name}-2.png` });
  await clickText('.lesson__nav .btn', '찍기');
  await page.waitForSelector('.net__grid', { timeout: 8000 });

  const cells = await page.$$eval('.net__cell', (els) =>
    els.map((e) => ({ color: getComputedStyle(e).backgroundColor, col: Number(e.style.gridColumn), row: Number(e.style.gridRow) })),
  );
  // 전개도의 칸 순서는 면 번호 × 9 + 칸 번호
  const read = cells.map((c) => COLORS.findIndex((h) => rgbText(h) === c.color));
  const wrong = read.filter((c, i) => c !== truth[i]).length;
  check(`[${size.name}] 두 장으로 읽은 54칸이 정답과 같다`, wrong === 0, `틀린 칸 ${wrong}개`);
  check(`[${size.name}] 풀 수 있는 상태로 인정된다`, (await text('.route__check'))?.includes('✓') === true, await text('.route__check'));
  check(`[${size.name}] 카메라가 꺼졌다`, (await page.$('video')) === null);
  await page.screenshot({ path: `${tmp}scan-${size.name}-3.png` });

  if (size.name === 'pc') {
    await clickText('.lesson__nav .btn', '경로 찾기');
    await page.waitForFunction(() => [...document.querySelectorAll('.route-card h3')].some((h) => h.textContent.includes('최단')), { timeout: 60000 });
    check('읽은 큐브로 경로를 찾는다', (await page.$$('.route-card:not(.route-card--pending)')).length >= 5);
  }
}

check('브라우저 오류 없음', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
