import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';

const WALK_SPEED = 6;
const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _move = new THREE.Vector3();

export default function OnFootPlayer({ playerRef, spawn, yawRef, aimYawRef, weaponSlot = 0 }) {
  const keys = useRef({});
  const visRef = useRef();
  const legL = useRef();
  const legR = useRef();
  const walkT = useRef(0);

  useEffect(() => {
    const down = (e) => {
      if (e.key.startsWith('Arrow')) e.preventDefault();
      keys.current[e.key] = true;
    };
    const up = (e) => { keys.current[e.key] = false; };
    // Perder o foco (alt-tab) larga as teclas — senão o boneco fica preso a andar
    const onBlur = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const body = playerRef.current;
    if (!body) return;
    const k = keys.current;
    const fwd = k['ArrowUp'] || k['w'] || k['W'];
    const back = k['ArrowDown'] || k['s'] || k['S'];
    const left = k['ArrowLeft'] || k['a'] || k['A'];
    const right = k['ArrowRight'] || k['d'] || k['D'];

    // Movimento relativo à câmara
    camera.getWorldDirection(_camFwd);
    _camFwd.y = 0;
    _camFwd.normalize();
    _camRight.crossVectors(_camFwd, _up); // direita da câmara
    _move.set(0, 0, 0);
    if (fwd) _move.add(_camFwd);
    if (back) _move.sub(_camFwd);
    if (right) _move.add(_camRight);
    if (left) _move.sub(_camRight);

    const lv = body.linvel();
    const moving = _move.lengthSq() > 0;
    if (moving) {
      _move.normalize();
      body.setLinvel({ x: _move.x * WALK_SPEED, y: lv.y, z: _move.z * WALK_SPEED }, true);
      yawRef.current = Math.atan2(_move.x, _move.z);
      walkT.current += delta * 10;
    } else {
      body.setLinvel({ x: 0, y: lv.y, z: 0 }, true);
    }

    // Boneco vira para a mira se a disparar, senão para o movimento
    const facing = aimYawRef.current !== null ? aimYawRef.current : yawRef.current;
    if (visRef.current) visRef.current.rotation.y = facing;

    // Pernas alternam ao andar
    const swing = moving ? Math.sin(walkT.current) * 0.55 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
  });

  return (
    <RigidBody
      ref={playerRef}
      position={spawn}
      mass={1}
      colliders={false}
      enabledRotations={[false, false, false]}
      linearDamping={4}
    >
      <CapsuleCollider args={[0.55, 0.35]} position={[0, 0.9, 0]} />
      <group ref={visRef}>
        {/* Tronco — camisa havaiana rosa */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[0.55, 0.6, 0.32]} />
          <meshStandardMaterial color="#FF6EC7" />
        </mesh>
        {/* Cabeça */}
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.21, 8, 6]} />
          <meshStandardMaterial color="#FDBCB4" />
        </mesh>
        {/* Braços */}
        <mesh position={[0.38, 1.05, 0]}>
          <boxGeometry args={[0.16, 0.55, 0.2]} />
          <meshStandardMaterial color="#FF6EC7" />
        </mesh>
        <mesh position={[-0.38, 1.05, 0]}>
          <boxGeometry args={[0.16, 0.55, 0.2]} />
          <meshStandardMaterial color="#FF6EC7" />
        </mesh>
        {/* Arma na mão direita (visível com pistola/uzi) */}
        <mesh position={[0.38, 0.85, 0.28]} visible={weaponSlot > 0}>
          <boxGeometry args={[0.1, 0.14, 0.42]} />
          <meshStandardMaterial color="#22262E" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Pernas — calças azuis, articuladas na anca */}
        <group ref={legL} position={[-0.14, 0.75, 0]}>
          <mesh position={[0, -0.38, 0]}>
            <boxGeometry args={[0.2, 0.75, 0.24]} />
            <meshStandardMaterial color="#1a3a6a" />
          </mesh>
        </group>
        <group ref={legR} position={[0.14, 0.75, 0]}>
          <mesh position={[0, -0.38, 0]}>
            <boxGeometry args={[0.2, 0.75, 0.24]} />
            <meshStandardMaterial color="#1a3a6a" />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
