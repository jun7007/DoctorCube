// 스캔 인식 시험용 그림을 만든다: 앱의 3D 큐브를 원근이 있는 여러 각도에서 렌더링해 PNG와 정답(54칸)을 저장한다.
// 큐브마다 서로 반대쪽 꼭짓점에서 본 두 장, 그리고 한 면씩 본 여섯 장.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 실행: 개발 서버(npx vite --port 5179)를 켠 뒤 node checks/gen-scan-fixtures.mjs
const APP = process.env.APP_URL ?? 'http://localhost:5179/';
const OUT = fileURLToPath(new URL('../src/scanner/fixtures/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
await page.goto(APP, { waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((t) => t.textContent.trim() === '자유').click());
await sleep(500);

let seed = 20261118;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const shoot = (azimuth, elevation, fov) =>
  page.evaluate(
    ([az, el, f]) => {
      const v = window.__cubeView;
      v.camera.fov = f;
      v.camera.updateProjectionMatrix();
      // 큐브가 화면에 넉넉히 들어오게
      v.distance = (2.9 / Math.sin(((f * Math.PI) / 180) / 2)) * (v.camera.aspect < 1 ? 1 / v.camera.aspect : 1);
      v.setAngles(az, el);
      v.renderer.render(v.scene, v.camera);
      return v.renderer.domElement.toDataURL('image/png');
    },
    [azimuth, elevation, fov],
  );
const save = (name, dataUrl) => writeFileSync(OUT + name, Buffer.from(dataUrl.split(',')[1], 'base64'));

const index = [];
const CUBES = 6;
for (let n = 0; n < CUBES; n++) {
  // 새로 섞고 애니메이션이 끝나기를 기다린다
  await page.evaluate(() => [...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === '섞기').click());
  await page.waitForSelector('.stage__scramble', { timeout: 10000 });
  await page.waitForFunction(() => window.__cubeView.queue.length === 0 && window.__cubeView.anim === null, { timeout: 30000 });
  await sleep(100);
  const state = await page.evaluate(() => [...window.__cubeView.displayed]);

  // 원근: 화각이 클수록(가까이서 찍을수록) 세다
  const fov = [28, 40, 52, 62, 46, 34][n];
  // 세 면이 모두 넉넉히 보이는 범위에서 각도를 흔든다 (정확히 꼭짓점 방향에서 ±9°, ±7° 정도).
  const az = Math.PI / 4 + (rand() - 0.5) * 0.3;
  const el = 0.615 + (rand() - 0.5) * 0.24;
  // 큐브의 어느 꼭짓점을 볼지: 방위각을 90°씩 돌리면 다른 꼭짓점이 된다
  const turn = (n % 4) * (Math.PI / 2);
  save(`cube${n}-a.png`, await shoot(az + turn, el, fov));
  save(`cube${n}-b.png`, await shoot(az + turn + Math.PI + (rand() - 0.5) * 0.2, -el + (rand() - 0.5) * 0.12, fov));

  // 한 면씩: 정면에서 조금 비껴 본 모습. 순서는 앞(F), 오른쪽(R), 뒤(B), 왼쪽(L), 위(U), 아래(D)
  const faces = [
    ['F', 0, 0],
    ['R', Math.PI / 2, 0],
    ['B', Math.PI, 0],
    ['L', -Math.PI / 2, 0],
    ['U', 0, 1.42],
    ['D', 0, -1.42],
  ];
  if (n < 2) {
    for (const [name, a, e] of faces) {
      const tilt = e === 0 ? (rand() - 0.5) * 0.24 : 0;
      save(`cube${n}-face-${name}.png`, await shoot(a + (rand() - 0.5) * 0.24, e + tilt, 40));
    }
  }
  index.push({ id: `cube${n}`, state, fov, faces: n < 2 });
  console.log(`cube${n}`, 'fov', fov);
}
writeFileSync(OUT + 'index.json', JSON.stringify(index));
await browser.close();
console.log('done');
