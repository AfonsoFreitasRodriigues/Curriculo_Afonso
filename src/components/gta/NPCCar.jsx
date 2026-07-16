import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ensureCar } from './world';

const HIDE_AFTER = 8;     // s: carcaça desaparece
const RESPAWN_AFTER = 12; // s: renasce na rota
const JACK_RESPAWN = 20;  // s: renasce depois de roubado

export default function NPCCar({ id, start, end, speed = 10, color = '#FFD700', phase = 0, posRef = null }) {
  const ref = useRef();
  const flamesRef = useRef();
  const t = useRef(phase);
  const dir = useRef(1);
  const [burnt, setBurnt] = useState(false);

  const entity = useMemo(() => {
    const e = ensureCar(id);
    e.color = color;
    return e;
  }, [id, color]);

  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const yawFwd = Math.atan2(dx, dz);
  const yawBack = yawFwd + Math.PI;

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    const now = clock.getElapsedTime();

    // Roubado pelo jogador: escondido até renascer
    if (entity.jacked) {
      if (now - entity.jackedAt >= JACK_RESPAWN) {
        entity.jacked = false;
        entity.alive = true;
        entity.hp = 100;
        t.current = phase;
      } else {
        ref.current.visible = false;
        if (posRef) { posRef.x = 0; posRef.z = 0; }
        return;
      }
    }

    // Destruído: carbonizado com chamas, depois some, depois renasce
    if (!entity.alive) {
      if (!burnt) setBurnt(true);
      const dead = now - entity.deadAt;
      if (dead >= RESPAWN_AFTER) {
        entity.alive = true;
        entity.hp = 100;
        t.current = phase;
      } else {
        ref.current.visible = dead < HIDE_AFTER;
        if (posRef) { posRef.x = 0; posRef.z = 0; }
        if (flamesRef.current) {
          flamesRef.current.children.forEach((f, i) => {
            f.scale.setScalar(0.75 + Math.sin(now * 12 + i * 2.1) * 0.3);
          });
        }
        return;
      }
    }
    if (burnt && entity.alive) setBurnt(false);

    ref.current.visible = true;
    t.current += dir.current * speed * delta / dist;
    if (t.current >= 1) { t.current = 1; dir.current = -1; }
    if (t.current <= 0) { t.current = 0; dir.current = 1; }
    const p = t.current;
    const x = start[0] + dx * p;
    const z = start[2] + dz * p;
    const ry = dir.current > 0 ? yawFwd : yawBack;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = ry;
    // Registry (combate) + radar
    entity.x = x;
    entity.z = z;
    entity.ry = ry;
    if (posRef) { posRef.x = x; posRef.z = z; }
  });

  const bodyColor = burnt ? '#1A1A1A' : color;

  return (
    <group ref={ref} position={start}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[1.8, 0.7, 3.5]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 1.0, -0.1]} castShadow>
        <boxGeometry args={[1.6, 0.5, 1.8]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      {/* Vidros escuros */}
      <mesh position={[0, 1.0, -0.1]}>
        <boxGeometry args={[1.65, 0.35, 1.85]} />
        <meshStandardMaterial color="#101820" roughness={0.15} metalness={0.7} />
      </mesh>
      {[[-0.9, 0, 1.2], [0.9, 0, 1.2], [-0.9, 0, -1.2], [0.9, 0, -1.2]].map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 10]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      {/* Faróis (frente = +z, direção do movimento) */}
      <mesh position={[-0.55, 0.4, 1.76]}>
        <boxGeometry args={[0.35, 0.2, 0.05]} />
        <meshStandardMaterial color="#FFF4C0" emissive="#FFEE99" emissiveIntensity={burnt ? 0 : 2.5} />
      </mesh>
      <mesh position={[0.55, 0.4, 1.76]}>
        <boxGeometry args={[0.35, 0.2, 0.05]} />
        <meshStandardMaterial color="#FFF4C0" emissive="#FFEE99" emissiveIntensity={burnt ? 0 : 2.5} />
      </mesh>
      {/* Luzes traseiras */}
      <mesh position={[-0.55, 0.4, -1.76]}>
        <boxGeometry args={[0.35, 0.18, 0.05]} />
        <meshStandardMaterial color="#FF3020" emissive="#FF2010" emissiveIntensity={burnt ? 0 : 2} />
      </mesh>
      <mesh position={[0.55, 0.4, -1.76]}>
        <boxGeometry args={[0.35, 0.18, 0.05]} />
        <meshStandardMaterial color="#FF3020" emissive="#FF2010" emissiveIntensity={burnt ? 0 : 2} />
      </mesh>
      {/* Chamas + fumo quando destruído */}
      {burnt && (
        <group ref={flamesRef}>
          <mesh position={[0, 1.5, 0.5]}>
            <coneGeometry args={[0.35, 1.1, 6]} />
            <meshStandardMaterial color="#FF6010" emissive="#FF4000" emissiveIntensity={4} />
          </mesh>
          <mesh position={[0.3, 1.4, -0.6]}>
            <coneGeometry args={[0.28, 0.9, 6]} />
            <meshStandardMaterial color="#FF9020" emissive="#FF7000" emissiveIntensity={4} />
          </mesh>
          <mesh position={[-0.25, 1.45, 0]}>
            <coneGeometry args={[0.22, 0.7, 6]} />
            <meshStandardMaterial color="#FFC040" emissive="#FFA000" emissiveIntensity={4} />
          </mesh>
          <mesh position={[0, 2.4, 0]}>
            <sphereGeometry args={[0.5, 6, 5]} />
            <meshStandardMaterial color="#333" transparent opacity={0.55} />
          </mesh>
          <mesh position={[0.2, 3.1, -0.2]}>
            <sphereGeometry args={[0.65, 6, 5]} />
            <meshStandardMaterial color="#444" transparent opacity={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}
