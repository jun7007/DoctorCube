// 테스트 → 빌드 → dist 폴더를 gh-pages 브랜치로 올린다. 실행: npm run deploy
// GitHub Pages는 저장소 Settings → Pages에서 "Deploy from a branch / gh-pages / (root)"로 설정한다.
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const read = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();

const remote = read('git remote get-url origin');
const name = read('git config user.name');
const email = read('git config user.email');
const source = read('git rev-parse --short HEAD');

run('npm test');
run('npm run build');

// Jekyll 처리를 끄고(밑줄로 시작하는 파일 보존), dist만 담은 일회용 저장소를 만들어 올린다.
writeFileSync(`${dist}.nojekyll`, '');
rmSync(`${dist}.git`, { recursive: true, force: true });
run('git init -q -b gh-pages', dist);
run('git add -A', dist);
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "배포: ${source}"`, dist);
run(`git push -f "${remote}" gh-pages`, dist);
rmSync(`${dist}.git`, { recursive: true, force: true });
console.log('\n배포 완료. 반영까지 1~2분 걸릴 수 있어요.');
