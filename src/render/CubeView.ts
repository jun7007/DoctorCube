import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { homeOf } from '../core/pieces';
import {
  FACELETS,
  SOLVED,
  applyMove,
  moveTurn,
  turnToMove,
  type Axis,
  type CubeState,
  type Move,
} from '../core/cube';

/** 색 번호(U R F D L B) → 스티커 색: 흰색, 빨강, 초록, 노랑, 주황, 파랑 */
export const STICKER_COLORS = ['#f4f4f2', '#e0312b', '#17a34a', '#ffd60a', '#ff8a00', '#1d62d8'] as const;

const AXIS_NAME = ['x', 'y', 'z'] as const;
const DEFAULT_AZIMUTH = 0.62;
const DEFAULT_ELEVATION = 0.5;
const MAX_ELEVATION = 1.45;
const FOV = 32;
/** 큐브를 감싸는 구의 반지름 (화면 맞춤용) */
const FIT_RADIUS = 2.75;
const SWIPE_THRESHOLD = 14;
const ORBIT_SPEED = 0.008;
const HALF = 1.5;
const DIM_COLOR = '#3b3f4f';
/** 입력이 밀렸을 때 회전 한 번의 최소 시간(ms) */
const MIN_DURATION = 50;

interface Hit {
  point: THREE.Vector3;
  normalAxis: Axis;
  normalSign: 1 | -1;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  hit: Hit | null;
  fired: boolean;
}

interface Animation {
  move: Move;
  axis: Axis;
  angle: number;
  start: number;
  duration: number;
  cubies: THREE.Group[];
}

export interface CubeViewOptions {
  /** 사용자가 큐브 면을 스와이프해서 돌렸을 때 */
  onTurn?: (move: Move) => void;
}

/**
 * three.js 큐브 화면.
 * 조각은 항상 제자리에 있고, 회전이 끝날 때마다 스티커 색만 논리 상태에 맞춰 다시 칠한다.
 * 그래서 화면은 "54칸 상태"만으로 결정되고, 임의의 상태를 바로 보여 줄 수 있다.
 */
export class CubeView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly cubies: THREE.Group[] = [];
  private readonly stickers: THREE.Mesh[] = [];
  private readonly stickerMaterials: THREE.MeshStandardMaterial[];
  /** 강조하지 않는 조각에 쓰는 흐린 색 */
  private readonly dimMaterials: THREE.MeshStandardMaterial[];
  private focus: ReadonlySet<number> | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly box = new THREE.Box3(
    new THREE.Vector3(-HALF, -HALF, -HALF),
    new THREE.Vector3(HALF, HALF, HALF),
  );
  private readonly resizeObserver: ResizeObserver;

  private displayed: CubeState = SOLVED;
  private queue: { move: Move; duration: number | null }[] = [];
  private anim: Animation | null = null;
  private duration = 220;
  private azimuth = DEFAULT_AZIMUTH;
  private elevation = DEFAULT_ELEVATION;
  private distance = 10;
  private width = 1;
  private height = 1;
  private pointer: PointerState | null = null;
  private dirty = true;
  private raf = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: CubeViewOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.stickerMaterials = STICKER_COLORS.map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }),
    );
    const gray = new THREE.Color(DIM_COLOR);
    this.dimMaterials = STICKER_COLORS.map(
      (color) =>
        new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(gray, 0.84), roughness: 0.7, metalness: 0 }),
    );
    this.disposables.push(...this.stickerMaterials, ...this.dimMaterials);
    this.buildCube();

    // 조명은 카메라에 붙여서 어느 방향에서 봐도 밝기가 같게 한다.
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-3, 5, 6);
    this.camera.add(key);
    this.scene.add(this.camera, this.root, this.pivot);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerEnd);
    el.addEventListener('pointercancel', this.onPointerEnd);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  // ───────────── 외부에서 쓰는 기능 ─────────────

  /** 애니메이션 없이 이 상태를 바로 보여 준다. 대기 중인 회전은 버린다. */
  setState(state: CubeState): void {
    this.queue = [];
    if (this.anim) this.releaseAnimation();
    this.displayed = state;
    this.paint();
  }

  /**
   * 회전을 대기열에 넣는다. duration(ms)을 주면 그 회전은 정확히 그 속도로 돈다.
   * 주지 않으면 기본 속도로 돌되, 입력이 밀려 있으면 따라잡도록 빨라진다.
   */
  enqueue(move: Move, duration?: number): void {
    this.queue.push({ move, duration: duration ?? null });
  }

  /**
   * 강조할 조각을 정한다 (완성 상태 기준 칸 번호 집합, focusOf 참고). 나머지는 흐리게 보인다.
   * null이면 모두 원래 색.
   */
  setFocus(focus: ReadonlySet<number> | null): void {
    this.focus = focus;
    this.paint();
  }

  setDuration(ms: number): void {
    this.duration = ms;
  }

  resetView(): void {
    this.azimuth = DEFAULT_AZIMUTH;
    this.elevation = DEFAULT_ELEVATION;
    this.updateCamera();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerEnd);
    el.removeEventListener('pointercancel', this.onPointerEnd);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ───────────── 큐브 만들기 ─────────────

  private buildCube(): void {
    const bodyGeometry = new RoundedBoxGeometry(0.98, 0.98, 0.98, 3, 0.09);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#15161c', roughness: 0.6 });
    const stickerGeometry = new THREE.ShapeGeometry(roundedSquare(0.84, 0.12), 6);
    this.disposables.push(bodyGeometry, bodyMaterial, stickerGeometry);

    const byCoord = new Map<string, THREE.Group>();
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const cubie = new THREE.Group();
          cubie.position.set(x, y, z);
          cubie.userData.coord = [x, y, z];
          cubie.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
          byCoord.set(`${x},${y},${z}`, cubie);
          this.cubies.push(cubie);
          this.root.add(cubie);
        }
      }
    }

    const forward = new THREE.Vector3(0, 0, 1);
    FACELETS.forEach((facelet, i) => {
      const normal = new THREE.Vector3(...facelet.normal);
      const sticker = new THREE.Mesh(stickerGeometry, this.stickerMaterials[this.displayed[i]]);
      sticker.position.copy(normal).multiplyScalar(0.493);
      sticker.quaternion.setFromUnitVectors(forward, normal);
      byCoord.get(facelet.pos.join(','))!.add(sticker);
      this.stickers.push(sticker);
    });
  }

  private paint(): void {
    const focus = this.focus;
    const home = focus ? homeOf(this.displayed) : null;
    this.stickers.forEach((sticker, i) => {
      const dim = focus !== null && home !== null && !focus.has(home[i]);
      sticker.material = (dim ? this.dimMaterials : this.stickerMaterials)[this.displayed[i]];
    });
    this.dirty = true;
  }

  // ───────────── 애니메이션 ─────────────

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    this.stepAnimation(now);
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };

  private stepAnimation(now: number): void {
    if (!this.anim) {
      const next = this.queue.shift();
      if (!next) return;
      const { axis, layers, quarterTurns } = moveTurn(next.move);
      const cubies = this.cubies.filter((c) => layers.includes(c.userData.coord[axis]));
      for (const c of cubies) this.pivot.add(c);
      this.anim = {
        move: next.move,
        axis,
        angle: (quarterTurns * Math.PI) / 2,
        start: now,
        // 180° 회전은 조금 더 길게
        duration: this.durationFor(next.duration) * (Math.abs(quarterTurns) === 2 ? 1.4 : 1),
        cubies,
      };
    }

    const a = this.anim;
    const t = a.duration <= 0 ? 1 : Math.min(1, (now - a.start) / a.duration);
    this.pivot.rotation[AXIS_NAME[a.axis]] = a.angle * easeInOut(t);
    this.dirty = true;
    if (t >= 1) {
      const move = a.move;
      this.releaseAnimation();
      this.displayed = applyMove(this.displayed, move);
      this.paint();
    }
  }

  /** 속도를 지정하지 않은 회전은, 뒤에 밀린 입력이 많을수록 빨리 돌린다. */
  private durationFor(fixed: number | null): number {
    if (fixed !== null) return fixed;
    return Math.max(MIN_DURATION, this.duration / (1 + this.queue.length * 0.6));
  }

  /** 돌리던 조각을 제자리로 돌려놓는다 (색은 호출한 쪽에서 다시 칠한다). */
  private releaseAnimation(): void {
    if (!this.anim) return;
    for (const c of this.anim.cubies) this.root.add(c);
    this.pivot.rotation.set(0, 0, 0);
    this.anim = null;
    this.dirty = true;
  }

  // ───────────── 카메라 / 크기 ─────────────

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // 가로·세로 중 좁은 쪽에 큐브가 꽉 차도록 거리를 정한다.
    const vFov = THREE.MathUtils.degToRad(FOV);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    this.distance = FIT_RADIUS / Math.sin(Math.min(vFov, hFov) / 2);
    this.updateCamera();
    // 크기가 바뀐 직후 빈 화면이 보이지 않게 바로 그린다.
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(): void {
    const ce = Math.cos(this.elevation);
    this.camera.position.set(
      this.distance * ce * Math.sin(this.azimuth),
      this.distance * Math.sin(this.elevation),
      this.distance * ce * Math.cos(this.azimuth),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.dirty = true;
  }

  // ───────────── 입력 ─────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pointer) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, hit: this.pick(e), fired: false };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;

    if (!p.hit) {
      // 큐브 바깥에서 시작한 드래그: 시점 돌리기
      this.azimuth -= dx * ORBIT_SPEED;
      this.elevation = THREE.MathUtils.clamp(this.elevation + dy * ORBIT_SPEED, -MAX_ELEVATION, MAX_ELEVATION);
      p.x = e.clientX;
      p.y = e.clientY;
      this.updateCamera();
      return;
    }

    // 큐브 위에서 시작한 드래그: 한 번 스와이프에 한 번 회전
    if (p.fired || Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;
    p.fired = true;
    const move = this.swipeToMove(p.hit, dx, dy);
    if (move) this.options.onTurn?.(move);
  };

  private onPointerEnd = (e: PointerEvent): void => {
    if (this.pointer?.id !== e.pointerId) return;
    this.pointer = null;
  };

  /**
   * 화면 좌표가 큐브의 어느 면 어느 지점인지 찾는다.
   * 회전 중인 조각과 무관하게 3×3×3 상자와 수학적으로 교차시키므로 애니메이션 중에도 정확하다.
   */
  private pick(e: PointerEvent): Hit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const point = this.raycaster.ray.intersectBox(this.box, new THREE.Vector3());
    if (!point) return null;
    const coords = point.toArray();
    let normalAxis: Axis = 0;
    for (const ax of [1, 2] as const) {
      if (Math.abs(coords[ax]) > Math.abs(coords[normalAxis])) normalAxis = ax;
    }
    return { point, normalAxis, normalSign: coords[normalAxis] > 0 ? 1 : -1 };
  }

  /** 스와이프 방향을 가장 가까운 층 회전으로 해석한다. */
  private swipeToMove(hit: Hit, dx: number, dy: number): Move | null {
    const origin = this.toScreen(hit.point);
    let best: { axis: Axis; dot: number } | null = null;
    for (const ax of [0, 1, 2] as const) {
      if (ax === hit.normalAxis) continue;
      const step = hit.point.clone();
      step.setComponent(ax, step.getComponent(ax) + 0.5);
      const s = this.toScreen(step);
      const sx = s.x - origin.x;
      const sy = s.y - origin.y;
      const len = Math.hypot(sx, sy);
      if (len < 1e-6) continue;
      const dot = (dx * sx + dy * sy) / len;
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { axis: ax, dot };
    }
    if (!best || best.dot === 0) return null;

    // 면의 법선 n, 손가락이 움직인 방향 t → 회전축은 n × t
    const n = new THREE.Vector3().setComponent(hit.normalAxis, hit.normalSign);
    const t = new THREE.Vector3().setComponent(best.axis, Math.sign(best.dot));
    const rotation = n.cross(t).toArray();
    const axis = rotation.findIndex((v) => Math.abs(v) > 0.5) as Axis;
    const layer = THREE.MathUtils.clamp(Math.round(hit.point.getComponent(axis)), -1, 1);
    return turnToMove(axis, layer, rotation[axis] > 0 ? 1 : -1);
  }

  private toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function roundedSquare(size: number, radius: number): THREE.Shape {
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return shape;
}
