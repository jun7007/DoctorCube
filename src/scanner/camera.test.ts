import { describe, expect, it } from 'vitest';
import { pickMainCamera, rankCameras } from './camera';

const list = (...labels: string[]) => labels.map((label, i) => ({ deviceId: `id${i}`, label }));

describe('카메라 고르기', () => {
  it('안드로이드: 번호가 가장 작은 뒷면 카메라가 기본 카메라다', () => {
    const cameras = list('camera2 1, facing front', 'camera2 2, facing back', 'camera2 0, facing back', 'camera2 3, facing front');
    expect(pickMainCamera(cameras)).toBe('id2');
    expect(rankCameras(cameras).map((c) => c.label)).toEqual(['camera2 0, facing back', 'camera2 2, facing back']);
  });

  it('아이폰: 초광각과 망원을 피한다', () => {
    const cameras = list('Front Camera', 'Back Ultra Wide Camera', 'Back Telephoto Camera', 'Back Camera', 'Back Dual Wide Camera');
    expect(pickMainCamera(cameras)).toBe('id3');
  });

  it('라벨에 초광각이라고 적혀 있으면 번호가 작아도 뒤로 미룬다', () => {
    const cameras = list('camera 0, facing back, ultra wide', 'camera 1, facing back');
    expect(pickMainCamera(cameras)).toBe('id1');
  });

  it('PC 웹캠처럼 앞뒤를 알 수 없으면 있는 것을 쓴다', () => {
    expect(pickMainCamera(list('HD Webcam'))).toBe('id0');
    expect(pickMainCamera(list('Front Camera'))).toBe('id0');
  });

  it('권한을 주기 전이라 id가 비어 있으면 고르지 않는다', () => {
    expect(pickMainCamera([{ deviceId: '', label: '' }])).toBeNull();
    expect(pickMainCamera([])).toBeNull();
  });
});
