import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const _targetPos = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

// Presets de câmara por modo
const PRESETS = {
  car:  { dist: 10, height: 5, lookUp: 1.0 },
  foot: { dist: 6,  height: 3, lookUp: 1.2 },
};

export default function FollowCamera({ targetRef, mode = 'car', yawRef = null }) {
  const { camera } = useThree();

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return;
    const pos = target.translation();
    const preset = PRESETS[mode];

    let dirX, dirZ;
    if (mode === 'foot' && yawRef) {
      // A pé: segue a direção de movimento (não a mira)
      dirX = Math.sin(yawRef.current);
      dirZ = Math.cos(yawRef.current);
    } else {
      const rot = target.rotation();
      _quat.set(rot.x, rot.y, rot.z, rot.w);
      _dir.set(0, 0, -1).applyQuaternion(_quat);
      dirX = _dir.x;
      dirZ = _dir.z;
    }

    _cameraPos.set(
      pos.x - dirX * preset.dist,
      pos.y + preset.height,
      pos.z - dirZ * preset.dist
    );
    // Damping exponencial independente do frame-rate (o lerp fixo por frame
    // deixava o carro fugir dezenas de unidades à câmara com fps baixo)
    camera.position.lerp(_cameraPos, 1 - Math.exp(-6 * delta));
    // Nunca deixar o alvo afastar-se mais de 1.6× da distância de follow
    const maxD = preset.dist * 1.6;
    _dir.copy(camera.position).sub(_cameraPos);
    if (_dir.lengthSq() > maxD * maxD) {
      _dir.setLength(maxD);
      camera.position.copy(_cameraPos).add(_dir);
    }
    _targetPos.set(pos.x, pos.y + preset.lookUp, pos.z);
    camera.lookAt(_targetPos);
  });

  return null;
}
