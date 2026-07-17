import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ensureCar } from './world';
import { getPath, pointAt } from './map';

const HIDE_AFTER = 8;     // s: carcaça desaparece
const RESPAWN_AFTER = 12; // s: renasce na rota
const JACK_RESPAWN = 20;  // s: renasce depois de roubado

export default function NPCCar({ id, pathId, lane = 0, speed = 10, color = '#FFD700', phase = 0, posRef = null }) {
  const ref = useRef();
  const flamesRef = useRef();
  const path = useMemo(() => getPath(pathId), [pathId]);
  const s = useRef(phase * (path ? path.total : 0));
  const dir = useRef(1);
  const side = useRef(lane); // offset lateral atual (suavizado, evita teleporte ao inverter)
  const [burnt, setBurnt] = useState(false);

  const entity = useMemo(() => {
    const e = ensureCar(id);
    e.color = color;
    return e;
  }, [id, color]);

  useFrame(({ clock }, delta) => {
    if (!ref.current || !path) return;
    const now = clock.getElapsedTime();

    // Roubado pelo jogador: escondido até renascer
    if (entity.jacked) {
      if (now - entity.jackedAt >= JACK_RESPAWN) {
        entity.jacked = false;
        entity.alive = true;
        entity.hp = 100;
        s.current = phase * path.total;
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
        s.current = phase * path.total;
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
    // Avança por comprimento de arco; ping-pong nas pontas
    s.current += dir.current * speed * delta;
    if (s.current >= path.total) { s.current = path.total; dir.current = -1; }
    if (s.current <= 0) { s.current = 0; dir.current = 1; }
    const pt = pointAt(path, s.current);
    const yaw = dir.current > 0 ? pt.yaw : pt.yaw + Math.PI;
    // Faixa: offset perpendicular à direita do sentido de marcha
    // (direita de forward=(sinψ,cosψ) é (-cosψ, +sinψ)).
    // O offset aproxima-se do alvo a poucas u/s para o carro não "teleportar"
    // de faixa quando o ping-pong inverte o sentido nas pontas.
    const target = lane * dir.current;
    const diff = target - side.current;
    side.current += Math.sign(diff) * Math.min(Math.abs(diff), 4 * delta);
    const x = pt.x - Math.cos(pt.yaw) * side.current;
    const z = pt.z + Math.sin(pt.yaw) * side.current;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = yaw;
    // Registry (combate) + radar
    entity.x = x;
    entity.z = z;
    entity.ry = yaw;
    if (posRef) { posRef.x = x; posRef.z = z; }
  });

  const bodyColor = burnt ? '#1A1A1A' : color;

  return (
    <group ref={ref}>
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
