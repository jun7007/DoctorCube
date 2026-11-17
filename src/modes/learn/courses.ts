/**
 * 학습 내용. 글과 예시 상태만 담고, 화면에 보여 줄 큐브와 동작은 resolve.ts가 만든다.
 */
import { F2L_CASES } from '../../algorithms/f2l';
import { OLL_CASES } from '../../algorithms/oll';
import { PLL_CASES } from '../../algorithms/pll';
import { TWO_LOOK_OLL_EDGES, TWO_LOOK_PLL_CORNERS, TWO_LOOK_PLL_EDGES } from '../../algorithms/twoLook';
import type { AlgCase } from '../../algorithms/types';
import { algToString, invertAlg, parseAlg } from '../../core/notation';
import { ALG, type StageId } from '../../solvers/beginner';
import type { CfopStageId } from '../../solvers/cfop';

export interface LessonStep {
  title: string;
  /** 문단들 */
  body: string[];
  /** 시작 모습: 완성된 큐브에 이 공식을 적용한 상태 */
  setup?: string;
  /** 강조할 조각 (focusOf 형식). 없으면 auto 단계에 맞는 기본값, 그것도 없으면 전체 */
  focus?: string;
  /** 보여 줄 동작을 직접 적는다 */
  alg?: string;
  /** 보여 줄 동작을 풀이기에서 가져온다: 그 풀이 방법의 단계 이름, 'all'은 처음부터 끝까지 */
  auto?: StageId | CfopStageId | 'all';
  /** auto에 쓸 풀이 방법 (기본은 초보자 공식) */
  method?: 'beginner' | 'cfop';
  /** auto와 함께: 매번 무작위로 섞은 큐브로 연습한다 */
  random?: boolean;
  /** 재생 버튼 없이 직접 돌려야 넘어간다 */
  selfOnly?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  steps: LessonStep[];
}

export interface Course {
  id: string;
  title: string;
  summary: string;
  /** 큐브를 잡는 방향: white = 흰색이 위(기본), yellow = 노란색이 위 */
  frame: 'white' | 'yellow';
  lessons: Lesson[];
}

const inv = (alg: string) => algToString(invertAlg(parseAlg(alg)));
const rep = (alg: string, n: number) => Array(n).fill(alg).join(' ');

const DAISY = 'F2 R2 B2 L2';
const TRY_HINT = '큐브를 직접 밀거나 아래 버튼을 눌러 보세요.';

const notation: Course = {
  id: 'notation',
  title: '표기법 익히기',
  summary: '공식에 나오는 R, U\', F2 같은 기호를 읽는 법',
  frame: 'white',
  lessons: [
    {
      id: 'notation-faces',
      title: '면의 이름',
      summary: 'U D L R F B',
      steps: [
        {
          title: '여섯 면에는 이름이 있어요',
          body: [
            '큐브 공식은 어느 면을 돌릴지 알파벳 한 글자로 적어요.',
            'U 위(Up), D 아래(Down), L 왼쪽(Left), R 오른쪽(Right), F 앞(Front), B 뒤(Back).',
            '색이 아니라 지금 큐브를 잡고 있는 방향이 기준이에요. 화면에서는 흰색 면이 U, 초록색 면이 F, 빨간색 면이 R이에요.',
          ],
        },
        {
          title: 'U: 윗면 돌리기',
          body: [
            '글자 하나는 그 면을 시계 방향으로 90도 돌리라는 뜻이에요.',
            '시계 방향은 그 면을 정면에서 바라볼 때 기준이에요. U는 위에서 내려다볼 때 시계 방향이라, 앞줄이 왼쪽으로 가요.',
            TRY_HINT,
          ],
          focus: '@U',
          alg: 'U',
          selfOnly: true,
        },
        {
          title: 'R: 오른쪽 면 돌리기',
          body: ['R은 오른쪽 면을 시계 방향으로 돌려요. 화면에서는 오른쪽 줄이 위로 올라가요.', TRY_HINT],
          focus: '@R',
          alg: 'R',
          selfOnly: true,
        },
        {
          title: 'F: 앞면 돌리기',
          body: ['F는 앞면을 시계 방향으로 돌려요.', TRY_HINT],
          focus: '@F',
          alg: 'F',
          selfOnly: true,
        },
        {
          title: 'D, L, B: 보이지 않는 쪽',
          body: [
            'D(아래), L(왼쪽), B(뒤)는 반대편이라 헷갈리기 쉬워요. 그 면을 정면에서 본다고 생각하면 돼요.',
            '그래서 L은 앞에서 볼 때 왼쪽 줄이 아래로 내려가요. R과 반대예요.',
            '재생 버튼을 눌러 하나씩 확인해 보세요. 큐브 바깥의 빈 곳을 끌면 보는 방향을 바꿀 수 있어요.',
          ],
          alg: 'L D B',
        },
      ],
    },
    {
      id: 'notation-modifiers',
      title: "반대 방향(')과 두 번(2)",
      summary: "R'  R2",
      steps: [
        {
          title: "작은따옴표(')는 반대 방향",
          body: [
            "글자 뒤에 '가 붙으면 반시계 방향으로 90도 돌려요. \"R 프라임\"이라고 읽어요.",
            "R'은 오른쪽 줄이 아래로 내려가요.",
            TRY_HINT,
          ],
          focus: '@R',
          alg: "R'",
          selfOnly: true,
        },
        {
          title: '숫자 2는 두 번',
          body: ['글자 뒤에 2가 붙으면 같은 면을 두 번(180도) 돌려요. 어느 방향으로 돌려도 결과가 같아요.', TRY_HINT],
          focus: '@U',
          alg: 'U2',
          selfOnly: true,
        },
        {
          title: '섞어서 읽기',
          body: ["왼쪽부터 차례로 돌리면 돼요. F'은 앞면을 반시계 방향으로, R2는 오른쪽 면을 두 번.", TRY_HINT],
          alg: "F' R2 U",
          selfOnly: true,
        },
      ],
    },
    {
      id: 'notation-reading',
      title: '공식 읽기',
      summary: "R U R' U'",
      steps: [
        {
          title: '가장 유명한 네 동작',
          body: [
            "R U R' U'은 초보자 공식에서 가장 많이 쓰는 묶음이에요. 손에 익을 때까지 여러 번 해 보세요.",
            '오른쪽 올리고, 윗면 돌리고, 오른쪽 내리고, 윗면 되돌리기.',
            TRY_HINT,
          ],
          alg: "R U R' U'",
          selfOnly: true,
        },
        {
          title: '여섯 번 하면 제자리',
          body: [
            "R U R' U'을 여섯 번 반복하면 큐브가 처음 모습으로 돌아와요. 실제 큐브로 손을 푸는 연습으로 좋아요.",
            '재생 버튼으로 지켜봐도 되고, 직접 돌려도 돼요.',
          ],
          alg: rep("R U R' U'", 6),
        },
      ],
    },
    {
      id: 'notation-extra',
      title: '큐브 통째로 돌리기와 중간층',
      summary: 'x y z  M E S  r',
      steps: [
        {
          title: 'x y z: 큐브를 통째로',
          body: [
            '소문자 x, y, z는 큐브 전체를 돌려 잡는 동작이에요. 조각은 섞이지 않고 보는 방향만 바뀌어요.',
            'y는 U와 같은 방향으로, x는 R과 같은 방향으로, z는 F와 같은 방향으로 통째로 돌려요.',
            '초보자 공식에서는 y를 자주 써요. "다음 자리를 앞으로 가져온다"는 뜻이에요.',
          ],
          alg: 'y x z',
        },
        {
          title: 'M E S: 가운데 줄',
          body: [
            'M은 L과 R 사이의 세로 줄(L과 같은 방향), E는 U와 D 사이의 가로 줄(D와 같은 방향), S는 F와 B 사이의 줄(F와 같은 방향)이에요.',
            '초보자 공식에는 나오지 않으니 지금은 이런 게 있다는 것만 알아 두면 돼요.',
          ],
          alg: 'M E S',
        },
        {
          title: '소문자 r: 두 줄 한꺼번에',
          body: ['소문자 r(또는 Rw)은 오른쪽 면과 가운데 줄을 함께 돌려요. u, f, l, d, b도 같아요.'],
          alg: "r r'",
        },
      ],
    },
  ],
};

const beginner: Course = {
  id: 'beginner',
  title: '초보자 공식: 한 층씩 맞추기',
  summary: '공식 7개로 큐브를 완성하는 가장 쉬운 방법',
  frame: 'yellow',
  lessons: [
    {
      id: 'lbl-intro',
      title: '시작하기 전에',
      summary: '조각의 종류와 전체 순서',
      steps: [
        {
          title: '센터: 움직이지 않는 기준',
          body: [
            '큐브는 스티커 54칸이 따로 움직이는 게 아니라, 조각 26개가 움직여요.',
            '각 면 한가운데의 센터 조각 6개는 서로 위치가 절대 바뀌지 않아요. 그래서 센터의 색이 곧 그 면이 완성될 색이에요.',
          ],
          focus: 'U R F D L B',
        },
        {
          title: '엣지: 색이 두 개인 조각',
          body: ['엣지는 12개예요. 두 면 사이 모서리에 있고 색이 두 개예요.', '엣지는 엣지 자리로만 움직여요.'],
          focus: 'UF UR UB UL DF DR DB DL FR FL BR BL',
        },
        {
          title: '코너: 색이 세 개인 조각',
          body: ['코너는 8개예요. 꼭짓점에 있고 색이 세 개예요.', '코너도 코너 자리로만 움직여요.'],
          focus: 'UFR UFL UBR UBL DFR DFL DBR DBL',
        },
        {
          title: '푸는 순서',
          body: [
            '면을 하나씩 맞추는 게 아니라, 아래층부터 한 층씩 쌓아 올려요.',
            '1층: 흰색 데이지 → 흰색 십자 → 흰색 코너. 2층: 엣지 4개. 3층: 노란 십자 → 노란 엣지 자리 → 노란 코너 자리 → 노란 코너 방향.',
            '이 과정에서는 노란색 센터를 위로, 흰색 센터를 아래로 잡아요. 아래 면은 큐브 바깥의 빈 곳을 끌어서 볼 수 있어요.',
          ],
        },
      ],
    },
    {
      id: 'lbl-daisy',
      title: '1. 흰색 데이지',
      summary: '노란 센터 둘레에 흰색 엣지 모으기',
      steps: [
        {
          title: '목표',
          body: [
            '노란 센터 둘레에 흰색 엣지 4개를 모아요. 꽃처럼 보여서 데이지라고 불러요.',
            '외울 공식은 없어요. 흰색 엣지를 하나씩 윗면으로 올리되, 흰색이 위를 보게 하면 돼요. 옆면 색은 신경 쓰지 않아요.',
            '흰색 엣지가 이미 아래 면에 있고 옆면 색까지 센터와 맞는다면, 그건 완성된 자리이니 그대로 둬요.',
          ],
          setup: DAISY,
          focus: 'U R F D L B UF UR UB UL',
        },
        {
          title: '가운데 층에 있을 때',
          body: [
            '흰색 엣지가 가운데 층에 있으면, 흰색이 붙어 있지 않은 쪽 옆면을 돌려 윗면으로 올려요.',
            '여기서는 흰색이 앞면에 보이고 엣지는 오른쪽 면에도 걸쳐 있으니, 오른쪽 면(R)을 돌려요.',
          ],
          setup: `${DAISY} R'`,
          auto: 'daisy',
        },
        {
          title: '올릴 자리에 이미 흰색이 있을 때',
          body: [
            '그대로 올리면 먼저 올려 둔 흰색 엣지가 밀려 내려와요.',
            'U를 돌려 빈자리를 올릴 곳 위에 만든 다음 올려요.',
          ],
          setup: `${DAISY} R' U'`,
          auto: 'daisy',
        },
        {
          title: '아래층에서 흰색이 아래를 볼 때',
          body: [
            '흰색 엣지가 아래층에 있고 흰색이 아래를 보고 있는데 옆면 색이 센터와 다르면, 일단 위로 올려요.',
            'U를 돌려 그 엣지 바로 위에 빈자리를 만든 뒤, 그 면을 두 번 돌려요.',
          ],
          setup: `${DAISY} U F2 D'`,
          auto: 'daisy',
        },
        {
          title: '흰색이 옆을 볼 때',
          body: [
            '윗층이나 아래층에 있는데 흰색이 옆면에 보이면, 그 면을 한 번 돌려 엣지를 가운데 층으로 보내요.',
            '그다음은 가운데 층에 있을 때와 같아요.',
          ],
          setup: `${DAISY} R' F'`,
          auto: 'daisy',
        },
        {
          title: '직접 해 보기',
          body: [
            '섞인 큐브에서 데이지를 만들어 보세요. 방법은 여러 가지라 꼭 화면의 순서대로 하지 않아도 되지만, 여기서는 안내하는 동작을 따라 해요.',
            '막히면 "한 수 ▶"를 눌러 다음 동작을 볼 수 있어요.',
          ],
          auto: 'daisy',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-cross',
      title: '2. 흰색 십자',
      summary: '데이지를 아래로 내려 십자 만들기',
      steps: [
        {
          title: '목표',
          body: [
            '흰색 엣지 4개를 아래 면으로 내려 흰색 십자를 만들어요.',
            '이때 엣지의 옆면 색이 그 면의 센터 색과 같아야 해요. 앞면 아래 가운데가 초록, 오른쪽 면 아래 가운데가 주황인 것처럼요.',
          ],
          focus: 'U R F D L B UF UR UB UL',
        },
        {
          title: '센터에 맞추고 두 번 돌리기',
          body: [
            '꽃잎(흰색 엣지)의 옆면 색을 봐요. U를 돌려 그 색이 같은 색 센터 바로 위에 오게 해요.',
            '맞았으면 그 면을 두 번 돌려요. 흰색이 아래로 내려가요. 꽃잎 네 개를 모두 이렇게 해요.',
          ],
          setup: `${DAISY} U`,
          auto: 'cross',
        },
        {
          title: '직접 해 보기',
          body: ['데이지가 된 큐브에서 흰색 십자를 만들어 보세요.'],
          auto: 'cross',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-corners',
      title: '3. 흰색 코너',
      summary: "R U R' U'",
      steps: [
        {
          title: '목표와 공식',
          body: [
            '흰색 코너 4개를 아래층에 넣어 1층을 완성해요.',
            `공식은 하나예요: ${ALG.corner}`,
            '코너가 들어갈 자리는 코너의 색으로 알 수 있어요. 흰색 말고 나머지 두 색의 센터 사이가 그 코너의 자리예요.',
          ],
          focus: 'U R F D L B UF UR UB UL UFR UFL UBR UBL',
        },
        {
          title: '자리 위에 놓고 공식',
          body: [
            '윗층에서 흰색이 있는 코너를 찾아요. U를 돌려 그 코너를 들어갈 자리 바로 위에 놓고, 그 자리가 앞-오른쪽에 오도록 큐브를 잡아요.',
            `그다음 ${ALG.corner}을 해요. 여기서는 한 번이면 들어가요.`,
          ],
          setup: inv(ALG.corner),
          auto: 'corners',
        },
        {
          title: '들어갈 때까지 반복',
          body: [
            '한 번에 안 들어가면 같은 공식을 계속 반복해요. 흰색이 어느 쪽을 보고 있었느냐에 따라 1번, 3번, 5번 중 하나예요.',
            '코너가 흰색을 아래로 하고 쏙 들어가면 멈춰요.',
          ],
          setup: inv(rep(ALG.corner, 3)),
          auto: 'corners',
        },
        {
          title: '잘못 들어가 있는 코너',
          body: [
            '흰색 코너가 아래층에 있는데 자리가 틀렸거나 돌아가 있을 수 있어요.',
            '그 코너를 앞-오른쪽 아래에 두고 공식을 한 번 하면 윗층으로 나와요. 그다음은 앞과 같아요.',
          ],
          setup: inv(rep(ALG.corner, 2)),
          auto: 'corners',
        },
        {
          title: '직접 해 보기',
          body: ['흰색 십자가 된 큐브에서 코너 4개를 넣어 보세요.'],
          auto: 'corners',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-middle',
      title: '4. 2층 엣지',
      summary: '가운데 층 엣지 4개 넣기',
      steps: [
        {
          title: '목표',
          body: [
            '가운데 층의 엣지 4개를 넣어 2층까지 완성해요.',
            '주인공은 노란색이 없는 엣지 4개예요. 노란색이 있는 엣지는 윗층 조각이라 지금은 건드리지 않아요.',
          ],
          focus: 'U R F D L B UF UR UB UL UFR UFL UBR UBL FR FL BR BL',
        },
        {
          title: '오른쪽으로 넣기',
          body: [
            '윗층에서 노란색이 없는 엣지를 찾아요. U를 돌려 엣지의 옆면 색을 같은 색 센터 위에 맞추고, 그 면을 앞에 둬요.',
            '이제 엣지의 윗면 색을 봐요. 오른쪽 센터 색과 같으면 오른쪽으로 넣어요.',
            `공식: ${ALG.edgeRight}`,
          ],
          setup: inv(ALG.edgeRight),
          auto: 'middle',
        },
        {
          title: '왼쪽으로 넣기',
          body: ['엣지의 윗면 색이 왼쪽 센터 색과 같으면 왼쪽으로 넣어요. 오른쪽 공식을 거울에 비춘 모양이에요.', `공식: ${ALG.edgeLeft}`],
          setup: inv(ALG.edgeLeft),
          auto: 'middle',
        },
        {
          title: '잘못 들어가 있는 엣지',
          body: [
            '윗층에 넣을 엣지가 없는데 2층이 완성되지 않았다면, 가운데 층에 엣지가 잘못 들어가 있는 거예요.',
            '그 엣지를 앞-오른쪽에 두고 오른쪽 공식을 한 번 하면 윗층으로 나와요. 그다음 제대로 넣어요.',
          ],
          setup: inv(`${ALG.edgeRight} U2 ${ALG.edgeRight}`),
          auto: 'middle',
        },
        {
          title: '직접 해 보기',
          body: ['1층이 완성된 큐브에서 2층 엣지 4개를 넣어 보세요.'],
          auto: 'middle',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-yellow-cross',
      title: '5. 노란 십자',
      summary: "F R U R' U' F'",
      steps: [
        {
          title: '목표와 공식',
          body: [
            '윗면에 노란 십자를 만들어요. 엣지의 옆면 색은 아직 안 맞아도 돼요.',
            `공식은 하나예요: ${ALG.yellowCross}`,
            '윗면의 노란 엣지가 만드는 모양은 점, ㄱ자, 일자, 십자 네 가지뿐이에요. 코너의 노란색은 무시하고 엣지만 봐요.',
          ],
          focus: 'U R F D L B UF UR UB UL UFR UFL UBR UBL FR FL BR BL DF DR DB DL',
        },
        {
          title: '일자 모양',
          body: ['노란 엣지 두 개가 일자로 놓여 있으면, 일자가 가로가 되게 U를 돌린 뒤 공식을 한 번 해요.'],
          setup: inv(ALG.yellowCross),
          auto: 'yellowCross',
        },
        {
          title: 'ㄱ자 모양',
          body: ['노란 엣지 두 개가 ㄱ자로 놓여 있으면, ㄱ자가 뒤-왼쪽에 오게 U를 돌린 뒤 공식을 해요. 일자가 되고, 한 번 더 하면 십자가 돼요.'],
          setup: rep(inv(ALG.yellowCross), 2),
          auto: 'yellowCross',
        },
        {
          title: '점 모양',
          body: ['노란 엣지가 하나도 위를 보지 않으면 그냥 공식을 한 번 해요. ㄱ자가 나오면 앞에서 배운 대로 이어 가요.'],
          setup: `${rep(inv(ALG.yellowCross), 2)} U2 ${inv(ALG.yellowCross)}`,
          auto: 'yellowCross',
        },
        {
          title: '직접 해 보기',
          body: ['2층까지 완성된 큐브에서 노란 십자를 만들어 보세요.'],
          auto: 'yellowCross',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-yellow-edges',
      title: '6. 노란 엣지 자리',
      summary: "R U R' U R U2 R' U",
      steps: [
        {
          title: '목표와 공식',
          body: [
            '노란 십자의 엣지 4개가 옆면 색까지 센터와 맞도록 자리를 바꿔요.',
            `공식은 하나예요: ${ALG.yellowEdges}`,
            '먼저 U를 돌려 보면서 옆면 색이 센터와 맞는 엣지가 몇 개인지 세요. 네 개가 다 맞으면 이 단계는 끝이에요.',
          ],
          focus: 'U R F D L B UF UR UB UL UFR UFL UBR UBL FR FL BR BL DF DR DB DL',
        },
        {
          title: '이웃한 두 개가 맞을 때',
          body: ['맞는 엣지 두 개가 서로 이웃해 있으면, 그 둘이 뒤와 오른쪽에 오게 큐브를 잡고 공식을 한 번 해요.'],
          setup: inv(ALG.yellowEdges),
          auto: 'yellowEdges',
        },
        {
          title: '마주 보는 두 개가 맞을 때',
          body: ['맞는 엣지 두 개가 서로 마주 보고 있으면, 공식을 한 번 해요. 그러면 이웃한 두 개가 맞는 모양으로 바뀌어요.'],
          setup: `${inv(ALG.yellowEdges)} U2 ${inv(ALG.yellowEdges)} U`,
          auto: 'yellowEdges',
        },
        {
          title: '직접 해 보기',
          body: ['노란 십자가 된 큐브에서 엣지 자리를 맞춰 보세요.'],
          auto: 'yellowEdges',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-corner-pos',
      title: '7. 노란 코너 자리',
      summary: "U R U' L' U R' U' L",
      steps: [
        {
          title: '목표와 공식',
          body: [
            '노란 코너 4개를 제자리로 보내요. 방향은 돌아가 있어도 괜찮아요.',
            '제자리란, 코너의 세 가지 색이 그 코너를 둘러싼 세 센터의 색과 같다는 뜻이에요.',
            `공식은 하나예요: ${ALG.cornerPos}`,
          ],
        },
        {
          title: '제자리 코너를 앞-오른쪽에 두고',
          body: [
            '제자리에 있는 코너를 찾아 앞-오른쪽 위에 오게 큐브를 잡고 공식을 해요. 나머지 세 코너가 자리를 바꿔요.',
            '한 번 해서 안 맞으면 그대로 한 번 더 해요.',
          ],
          setup: inv(ALG.cornerPos),
          auto: 'cornerPos',
        },
        {
          title: '제자리 코너가 없을 때',
          body: ['제자리에 있는 코너가 하나도 없으면 아무 방향에서나 공식을 한 번 해요. 그러면 하나가 제자리에 와요.'],
          setup: `${inv(ALG.cornerPos)} y ${inv(ALG.cornerPos)} y'`,
          auto: 'cornerPos',
        },
        {
          title: '직접 해 보기',
          body: ['노란 엣지까지 맞은 큐브에서 코너 자리를 맞춰 보세요.'],
          auto: 'cornerPos',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-corner-twist',
      title: '8. 노란 코너 방향',
      summary: "R' D' R D",
      steps: [
        {
          title: '목표와 공식',
          body: [
            '마지막 단계예요. 제자리에서 돌아가 있는 코너를 돌려 노란색이 위를 보게 해요.',
            `공식은 하나예요: ${ALG.cornerTwist}`,
            '주의할 점이 두 가지 있어요. 도중에 아래층이 흐트러지지만 끝까지 하면 돌아와요. 그리고 이 단계에서는 큐브를 돌려 잡지 말고 U만 돌려요.',
          ],
        },
        {
          title: '코너 하나씩 돌리기',
          body: [
            '돌아가 있는 코너를 앞-오른쪽 위에 두고, 그 코너의 노란색이 위를 볼 때까지 공식을 반복해요. 2번 또는 4번이에요.',
            '다 됐으면 U만 돌려 다음 코너를 같은 자리로 가져와 반복해요. 마지막에 U를 돌려 윗층을 맞추면 완성이에요.',
          ],
          setup: inv(`${rep(ALG.cornerTwist, 2)} U ${rep(ALG.cornerTwist, 4)} U'`),
          auto: 'cornerTwist',
        },
        {
          title: '직접 해 보기',
          body: ['마지막 단계만 남은 큐브를 완성해 보세요.'],
          auto: 'cornerTwist',
          random: true,
        },
      ],
    },
    {
      id: 'lbl-full',
      title: '처음부터 끝까지',
      summary: '섞인 큐브를 통째로 풀어 보기',
      steps: [
        {
          title: '전체 풀이 따라 하기',
          body: [
            '무작위로 섞은 큐브를 처음부터 끝까지 풀어요. 지금 어느 단계인지와 무엇을 하는지가 아래에 나와요.',
            '직접 돌려도 되고, 재생 버튼으로 지켜봐도 돼요. "새 예제"를 누르면 다른 큐브로 바뀌어요.',
          ],
          auto: 'all',
          random: true,
        },
      ],
    },
  ],
};

/** 공식 모음의 케이스 하나를 그대로 레슨 단계로 만든다. */
const caseStep = (c: AlgCase, title: string, body: string[], focus?: string): LessonStep => ({
  title,
  body: [...body, `공식: ${c.alg}`],
  setup: inv(c.alg),
  alg: c.alg,
  focus,
});

const F2L_FOCUS = 'U R F D L B UF UR UB UL UFR UFL UBR UBL FR FL BR BL';
const oll = (id: string) => OLL_CASES.find((c) => c.id === id)!;
const pll = (id: string) => PLL_CASES.find((c) => c.id === id)!;

const cfop: Course = {
  id: 'cfop',
  title: 'CFOP: 빠르게 푸는 공식',
  summary: '십자 → F2L → OLL → PLL. 스피드큐빙에서 가장 널리 쓰는 방법',
  frame: 'yellow',
  lessons: [
    {
      id: 'cfop-intro',
      title: 'CFOP란?',
      summary: '네 단계와 배우는 순서',
      steps: [
        {
          title: '네 단계',
          body: [
            'CFOP는 네 단계의 머리글자예요. Cross(십자), F2L(1·2층), OLL(윗면을 노랗게), PLL(윗층 자리 맞추기).',
            '초보자 공식과 순서는 비슷하지만 여러 단계를 하나로 합쳐요. 초보자 공식이 160회전쯤 걸린다면 CFOP는 60회전 안팎이에요.',
          ],
        },
        {
          title: '배우는 순서',
          body: [
            '공식이 많아서(F2L 41개, OLL 57개, PLL 21개) 한꺼번에 외우지 않아요.',
            '추천 순서: ① 십자를 아래에 바로 만들기 ② F2L 기본 넣기 ③ 2-Look OLL (공식 10개) ④ 2-Look PLL (공식 6개) ⑤ 나머지 공식.',
            '2-Look은 OLL과 PLL을 각각 두 번에 나눠 하는 방법이에요. 조금 느리지만 공식 16개면 CFOP로 끝까지 풀 수 있어요.',
          ],
        },
        {
          title: '전체 풀이 미리 보기',
          body: [
            '무작위로 섞은 큐브를 CFOP(2-Look)로 푸는 모습이에요. 재생 버튼으로 지켜보세요.',
            '지금은 흐름만 보면 돼요. 각 단계는 다음 레슨에서 하나씩 배워요.',
          ],
          auto: 'all',
          method: 'cfop',
          random: true,
        },
      ],
    },
    {
      id: 'cfop-cross',
      title: '1. 십자: 데이지 없이 바로',
      summary: '8수 안에 흰색 십자 만들기',
      steps: [
        {
          title: '아래에 바로 만들기',
          body: [
            '초보자 공식에서는 데이지를 거쳐 십자를 만들었어요. CFOP에서는 흰색 엣지를 아래 면의 제자리로 바로 보내요.',
            '어떤 상태에서든 8수 안에 만들 수 있고, 평균은 6수쯤이에요.',
            '외우는 공식이 아니라 연습으로 익히는 단계예요. 엣지 하나를 넣을 때 이미 넣은 엣지를 건드리지 않는 길을 찾는 게 요령이에요.',
          ],
          focus: 'U R F D L B UF UR UB UL',
        },
        {
          title: '가장 짧은 십자 따라 하기',
          body: [
            '섞인 큐브에서 가장 짧은 십자 풀이를 보여 줘요. 한 수씩 넘기면서 각 엣지가 어디로 가는지 눈으로 따라가 보세요.',
            '"새 예제"로 여러 번 보면 감이 생겨요.',
          ],
          auto: 'cross',
          method: 'cfop',
          random: true,
        },
      ],
    },
    {
      id: 'cfop-f2l',
      title: '2. F2L: 짝지어 넣기',
      summary: '코너와 엣지를 한 번에',
      steps: [
        {
          title: '코너와 엣지를 짝으로',
          body: [
            '초보자 공식은 흰색 코너 4개를 넣고, 그다음 2층 엣지 4개를 넣었어요. 모두 8번이에요.',
            'F2L은 흰색 코너와 그 옆 엣지를 윗층에서 짝지은 다음 함께 넣어요. 4번이면 1·2층이 끝나요.',
            '경우의 수는 41가지지만, 대부분은 기본 넣기 모양으로 만든 뒤 넣는 것이라 원리를 알면 외울 것이 줄어요.',
          ],
          focus: F2L_FOCUS,
        },
        ...F2L_CASES.slice(0, 4).map((c, i) =>
          caseStep(c, `기본 넣기 ${i + 1}`, [c.note ?? '가장 기본이 되는 넣기 모양이에요.'], F2L_FOCUS),
        ),
        {
          title: '직접 해 보기',
          body: [
            '십자가 된 큐브에서 짝 4개를 넣어 보세요. 어떤 공식을 쓰는지 이름이 함께 나와요.',
            '41가지 공식은 학습 목록의 "공식 모음 > F2L"에서 하나씩 볼 수 있어요.',
          ],
          auto: 'f2l',
          method: 'cfop',
          random: true,
        },
      ],
    },
    {
      id: 'cfop-2look-oll',
      title: '3. 2-Look OLL',
      summary: '공식 10개로 윗면을 노랗게',
      steps: [
        {
          title: '두 번에 나눠서',
          body: [
            'OLL은 윗면 전체를 노랗게 만드는 단계예요. 한 번에 하려면 57가지를 외워야 해요.',
            '2-Look OLL은 먼저 노란 십자를 만들고(공식 3개), 그다음 코너를 맞춰요(공식 7개).',
          ],
        },
        ...TWO_LOOK_OLL_EDGES.map((c) =>
          caseStep(c, `노란 십자 만들기: ${c.name}`, [c.note ?? '윗면의 노란 엣지 모양을 보고 고르는 공식이에요.']),
        ),
        caseStep(oll('oll-27'), `코너 맞추기: ${oll('oll-27').name}`, [
          '노란 십자가 된 뒤에는 코너 모양이 7가지뿐이에요. 그중 가장 자주 쓰는 공식이에요.',
        ]),
        caseStep(oll('oll-26'), `코너 맞추기: ${oll('oll-26').name}`, ['바로 앞 공식을 거울에 비춘 모양이에요.']),
        {
          title: '직접 해 보기',
          body: [
            '1·2층이 끝난 큐브에서 윗면을 노랗게 만들어 보세요.',
            '코너 7가지는 학습 목록의 "공식 모음 > 2-Look OLL"에서 모두 볼 수 있어요.',
          ],
          auto: 'oll',
          method: 'cfop',
          random: true,
        },
      ],
    },
    {
      id: 'cfop-2look-pll',
      title: '4. 2-Look PLL',
      summary: '공식 6개로 마무리',
      steps: [
        {
          title: '두 번에 나눠서',
          body: [
            'PLL은 노랗게 된 윗층 조각들의 자리를 맞추는 마지막 단계예요. 한 번에 하려면 21가지를 외워야 해요.',
            '2-Look PLL은 먼저 코너 4개의 자리를 맞추고(공식 2개), 그다음 엣지를 맞춰요(공식 4개).',
          ],
        },
        ...TWO_LOOK_PLL_CORNERS.map((id) =>
          caseStep(pll(id), `코너 자리 맞추기: ${pll(id).name}`, [pll(id).note ?? '코너의 옆면 색을 보고 고르는 공식이에요.']),
        ),
        ...TWO_LOOK_PLL_EDGES.map((id) =>
          caseStep(pll(id), `엣지 자리 맞추기: ${pll(id).name}`, [pll(id).note ?? '엣지의 옆면 색을 보고 고르는 공식이에요.']),
        ),
        {
          title: '직접 해 보기',
          body: ['윗면이 노랗게 된 큐브를 완성해 보세요.'],
          auto: 'pll',
          method: 'cfop',
          random: true,
        },
      ],
    },
    {
      id: 'cfop-full',
      title: '처음부터 끝까지 (CFOP)',
      summary: '섞인 큐브를 2-Look CFOP로 풀어 보기',
      steps: [
        {
          title: '전체 풀이 따라 하기',
          body: [
            '무작위로 섞은 큐브를 CFOP(2-Look)로 처음부터 끝까지 풀어요. 지금 어느 단계인지와 어떤 공식을 쓰는지가 아래에 나와요.',
            '"새 예제"를 누르면 다른 큐브로 바뀌어요.',
          ],
          auto: 'all',
          method: 'cfop',
          random: true,
        },
      ],
    },
  ],
};

export const COURSES: readonly Course[] = [notation, beginner, cfop];
