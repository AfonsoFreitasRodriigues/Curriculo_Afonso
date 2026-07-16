import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WEAPONS } from './weapons';
import { peds, hitTest, damage, worldTime } from './world';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPt = new THREE.Vector3();

// Caixas de munição fixas no mundo (enchem pistola e uzi; renascem aos 30s)
const AMMO_SPOTS = [
  { x: -80, z: -60 },
  { x: 62, z: 80 },
  { x: -150, z: 40 },
];

function Tracer({ sx, sz, ex, ez }) {
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  return (
    <mesh position={[(sx + ex) / 2, 1.1, (sz + ez) / 2]} rotation={[0, yaw, 0]}>
      <boxGeometry args={[0.04, 0.04, Math.max(len, 0.1)]} />
      <meshStandardMaterial color="#FFE060" emissive="#FFD040" emissiveIntensity={4} transparent opacity={0.9} />
    </mesh>
  );
}

function MoneyDrop({ x, z }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 3;
    ref.current.position.y = 0.6 + Math.sin(t * 4) * 0.15;
  });
  return (
    <mesh ref={ref} position={[x, 0.6, z]}>
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshStandardMaterial color="#20E060" emissive="#10C040" emissiveIntensity={2.5} />
    </mesh>
  );
}

function AmmoBox({ x, z }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 2;
    ref.current.position.y = 0.8 + Math.sin(t * 3) * 0.2;
  });
  return (
    <mesh ref={ref} position={[x, 0.8, z]}>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color="#1A2530" emissive="#00FFFF" emissiveIntensity={1.6} />
    </mesh>
  );
}

export default function CombatSystem({
  mode, playerRef, carRef, footYawRef, aimYawRef, weaponSlot,
  wanted, onAmmo, addMoney, addWanted, decayWanted,
}) {
  const { gl } = useThree();
  const ammoRef = useRef([Infinity, 60, 240]);
  const firingRef = useRef(false);
  const semiHandledRef = useRef(false);
  const mouseAimRef = useRef({ nx: 0, ny: 0, mouse: true });
  const lastShotRef = useRef(-10);
  const lastCrimeRef = useRef(-100);
  const nextIdRef = useRef(1);
  const tracersRef = useRef([]);
  const dropsRef = useRef([]);
  const ammoBoxesRef = useRef(AMMO_SPOTS.map(s => ({ ...s, taken: false, takenAt: 0 })));
  const flashRef = useRef();
  const [, bump] = useState(0);
  const rerender = () => bump(n => n + 1);

  // Rato: posição NDC + disparar com botão esquerdo; Espaço = disparar na direção do boneco
  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseAimRef.current.nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseAimRef.current.ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target !== canvas) return; // cliques na UI (botões) não disparam
      firingRef.current = true;
      mouseAimRef.current.mouse = true;
    };
    const onUp = (e) => {
      if (e.button !== 0) return;
      firingRef.current = false;
      semiHandledRef.current = false;
    };
    const onKeyDown = (e) => {
      if (e.key !== ' ') return;
      e.preventDefault();
      firingRef.current = true;
      mouseAimRef.current.mouse = false;
    };
    const onKeyUp = (e) => {
      if (e.key !== ' ') return;
      firingRef.current = false;
      semiHandledRef.current = false;
    };
    // Perder o foco (alt-tab) larga o gatilho — senão a uzi fica presa a disparar
    const onBlur = () => { firingRef.current = false; semiHandledRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  // Reset do semi-auto ao trocar de arma
  useEffect(() => { semiHandledRef.current = false; }, [weaponSlot]);

  const crime = (now) => {
    lastCrimeRef.current = now;
    addWanted();
  };

  const spawnDrop = (x, z) => {
    dropsRef.current.push({ id: nextIdRef.current++, x, z });
    rerender();
  };

  useFrame(({ clock, camera }) => {
    const now = clock.getElapsedTime();
    worldTime.now = now;

    // Decay de estrelas: 1 a cada 30s sem crimes
    if (wanted > 0 && now - lastCrimeRef.current > 30) {
      lastCrimeRef.current = now;
      decayWanted();
    }

    // Atropelamento: ped a <1.6u do carro com velocidade >8
    if (mode === 'car' && carRef.current) {
      const v = carRef.current.linvel();
      if (Math.hypot(v.x, v.z) > 8) {
        const p = carRef.current.translation();
        for (const ped of peds) {
          if (!ped.alive) continue;
          if (Math.hypot(ped.x - p.x, ped.z - p.z) < 1.6) {
            ped.hp = 0;
            ped.alive = false;
            ped.deadAt = now;
            spawnDrop(ped.x, ped.z);
            crime(now);
          }
        }
      }
    }

    // Apanhar drops de dinheiro e caixas de munição (a pé ou de carro)
    const activeBody = mode === 'car' ? carRef.current : playerRef.current;
    if (activeBody) {
      const p = activeBody.translation();
      const before = dropsRef.current.length;
      dropsRef.current = dropsRef.current.filter(d => {
        if (Math.hypot(d.x - p.x, d.z - p.z) < 1.5) {
          addMoney(50);
          return false;
        }
        return true;
      });
      if (dropsRef.current.length !== before) rerender();

      for (const box of ammoBoxesRef.current) {
        if (box.taken) {
          if (now - box.takenAt > 30) { box.taken = false; rerender(); }
          continue;
        }
        if (Math.hypot(box.x - p.x, box.z - p.z) < 1.5) {
          box.taken = true;
          box.takenAt = now;
          ammoRef.current[1] = 60;
          ammoRef.current[2] = 240;
          onAmmo([...ammoRef.current]);
          rerender();
        }
      }
    }

    // Limpar tracers antigos (>80ms)
    const liveTracers = tracersRef.current.filter(t => now - t.born < 0.08);
    if (liveTracers.length !== tracersRef.current.length) {
      tracersRef.current = liveTracers;
      rerender();
    }

    // Boneco deixa de "mirar" 1s após o último tiro
    if (aimYawRef.current !== null && now - lastShotRef.current > 1) {
      aimYawRef.current = null;
    }

    // Muzzle flash visível ~50ms após cada tiro
    if (flashRef.current) {
      const show = mode === 'foot' && weaponSlot > 0 && now - lastShotRef.current < 0.05;
      flashRef.current.visible = show;
    }

    // ── Disparo (só a pé) ──
    if (mode !== 'foot' || !firingRef.current || !playerRef.current) return;
    const w = WEAPONS[weaponSlot];
    if (now - lastShotRef.current < 1 / w.rate) return;
    if (!w.auto && semiHandledRef.current) return;
    if (w.maxAmmo !== Infinity && ammoRef.current[weaponSlot] <= 0) return;
    semiHandledRef.current = true;

    lastShotRef.current = now;
    if (w.maxAmmo !== Infinity) {
      ammoRef.current[weaponSlot] -= 1;
      onAmmo([...ammoRef.current]);
    }

    const p = playerRef.current.translation();
    let dx, dz;
    if (mouseAimRef.current.mouse) {
      // Mira de rato: raycast da câmara pelo cursor até ao plano do chão
      _ndc.set(mouseAimRef.current.nx, mouseAimRef.current.ny);
      _ray.setFromCamera(_ndc, camera);
      const pt = _ray.ray.intersectPlane(_groundPlane, _hitPt);
      if (pt) {
        dx = pt.x - p.x;
        dz = pt.z - p.z;
      } else {
        // A apontar para o céu: usa a direção horizontal do raio
        dx = _ray.ray.direction.x;
        dz = _ray.ray.direction.z;
      }
    } else {
      // Touch/Espaço: direção do boneco
      dx = Math.sin(footYawRef.current);
      dz = Math.cos(footYawRef.current);
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    aimYawRef.current = Math.atan2(dx, dz);

    const hit = hitTest(p.x, p.z, dx, dz, w.range);
    const dist = hit ? hit.dist : w.range;

    if (weaponSlot > 0) {
      tracersRef.current.push({
        id: nextIdRef.current++,
        sx: p.x + dx * 0.5, sz: p.z + dz * 0.5,
        ex: p.x + dx * dist, ez: p.z + dz * dist,
        born: now,
      });
      rerender();
      if (flashRef.current) {
        flashRef.current.position.set(p.x + dx * 0.7, 1.1, p.z + dz * 0.7);
      }
    }

    if (hit) {
      const killed = damage(hit.entity, w.damage, now);
      if (killed) {
        crime(now);
        if (hit.kind === 'ped') spawnDrop(hit.entity.x, hit.entity.z);
      }
    }
  });

  return (
    <group>
      <mesh ref={flashRef} visible={false}>
        <sphereGeometry args={[0.18, 6, 5]} />
        <meshStandardMaterial color="#FFF0A0" emissive="#FFE060" emissiveIntensity={6} toneMapped={false} />
      </mesh>
      {tracersRef.current.map(t => <Tracer key={t.id} sx={t.sx} sz={t.sz} ex={t.ex} ez={t.ez} />)}
      {dropsRef.current.map(d => <MoneyDrop key={d.id} x={d.x} z={d.z} />)}
      {ammoBoxesRef.current.map((b, i) => (b.taken ? null : <AmmoBox key={i} x={b.x} z={b.z} />))}
    </group>
  );
}
