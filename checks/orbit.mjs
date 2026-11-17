// 큐브 보는 방향을 위아래로도 한계 없이 돌릴 수 있는지 점검한다.
// 실행: 개발 서버(npx vite --port 5179)를 켠 뒤 node checks/orbit.mjs
import puppeteer from 'puppeteer-core';

const APP = process.env.APP_URL ?? 'http://localhost:5179/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
await page.goto(APP, { waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.trim() === '자유').click());
await sleep(400);
const cam = () => page.evaluate(() => {
  const c = window.__cubeView.camera;
  return { pos: c.position.toArray(), up: c.up.toArray() };
});
const drag = async (dx, dy) => {
  await page.mouse.move(40, 380);
  await page.mouse.down();
  await page.mouse.move(40 + dx, 380 + dy, { steps: 6 });
  await page.mouse.up();
};

const start = await cam();
check('처음에는 위에서 비스듬히 내려다본다', start.pos[1] > 0 && start.up[1] > 0.8);

// 아래로 계속 끌면: 위에서 → 꼭대기를 넘어 → 뒤집혀서 → 아래에서 → 다시 처음으로 (한 바퀴 = 약 785픽셀)
const ys = [];
for (let i = 0; i < 16; i++) {
  await drag(0, 50);
  ys.push((await cam()).pos[1]);
}
const signChanges = ys.filter((y, i) => i > 0 && Math.sign(y) !== Math.sign(ys[i - 1])).length;
check('위아래로 끌면 멈추지 않고 한 바퀴 돈다', signChanges >= 2, ys.map((y) => y.toFixed(0)).join(' '));
const dist = (p) => Math.hypot(...p);
check('큐브와의 거리는 그대로다', Math.abs(dist((await cam()).pos) - dist(start.pos)) < 1e-6);

// 옆으로도 계속 돈다
const xs = [];
for (let i = 0; i < 16; i++) {
  await drag(50, 0);
  xs.push((await cam()).pos[0]);
}
check('옆으로도 계속 돈다', xs.filter((x, i) => i > 0 && Math.sign(x) !== Math.sign(xs[i - 1])).length >= 2);

// 뒤집힌 상태에서도 큐브를 밀면 손가락이 간 방향대로 돈다
await drag(0, 400);
await page.evaluate(() => [...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === '초기화').click());
const swipe = await page.evaluate(() => {
  const v = window.__cubeView;
  const rect = v.renderer.domElement.getBoundingClientRect();
  // 카메라를 향한 면의 한가운데 칸 옆 칸을 고른다: 화면 가운데에서 살짝 오른쪽
  return { x: rect.left + rect.width / 2 + 40, y: rect.top + rect.height / 2 };
});
await page.mouse.move(swipe.x, swipe.y);
await page.mouse.down();
await page.mouse.move(swipe.x, swipe.y - 50, { steps: 5 });
await page.mouse.up();
await sleep(100);
const moved = await page.$eval('.history__box', (el) => el.textContent.trim());
check('어느 방향에서 보든 큐브를 밀면 한 번 돌아간다', /^[URFDLBMES]'?$/.test(moved), moved);

await page.evaluate(() => [...document.querySelectorAll('.stage__view')][0].click());
const back = await cam();
check('시점 초기화를 누르면 처음 방향으로 돌아온다', back.pos.every((v, i) => Math.abs(v - start.pos[i]) < 1e-6) && back.up.every((v, i) => Math.abs(v - start.up[i]) < 1e-6));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
