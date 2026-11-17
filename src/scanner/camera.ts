/**
 * 여러 개의 뒷면 카메라 중 큐브를 찍기에 알맞은 것을 고른다.
 * 폰은 "뒷면 카메라"를 달라고 하면 초광각(0.6배)을 줄 때가 있는데, 초광각은 왜곡이 심해 큐브를 찾기 어렵다.
 */
export interface CameraInfo {
  deviceId: string;
  label: string;
}

const FRONT = /front|user|selfie|전면/i;
const BACK = /back|rear|environment|후면/i;
/** 피해야 할 카메라: 초광각, 망원, 깊이·접사용 */
const AVOID = /ultra|wide|0\.[5-7]\s*x|tele|zoom|depth|macro|초광각|망원/i;

/** 라벨 안의 카메라 번호 (예: "camera2 0, facing back" → 0). 없으면 큰 수 */
function cameraNumber(label: string): number {
  const m = /camera\d*\s+(\d+)/i.exec(label);
  return m ? Number(m[1]) : 99;
}

/** 뒷면 카메라들을 알맞은 순서로 늘어놓는다 (첫 번째가 기본으로 쓸 카메라). */
export function rankCameras(cameras: readonly CameraInfo[]): CameraInfo[] {
  const usable = cameras.filter((c) => c.deviceId !== '');
  // 라벨로 앞뒤를 알 수 있으면 뒷면만, 알 수 없으면 전부
  const back = usable.filter((c) => BACK.test(c.label) && !FRONT.test(c.label));
  const pool = back.length > 0 ? back : usable.filter((c) => !FRONT.test(c.label));
  const score = (c: CameraInfo) => (AVOID.test(c.label) ? 1000 : 0) + cameraNumber(c.label);
  return [...(pool.length > 0 ? pool : usable)].sort((a, b) => score(a) - score(b));
}

/** 기본으로 쓸 카메라의 id. 고를 것이 없으면 null */
export function pickMainCamera(cameras: readonly CameraInfo[]): string | null {
  return rankCameras(cameras)[0]?.deviceId ?? null;
}
