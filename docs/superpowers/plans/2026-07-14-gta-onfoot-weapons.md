# GTA 3D — Jogador a Pé + Armas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sair/entrar do carro, carjacking de NPCs, 3 armas com mira de rato e consequências no mundo (mortes, dinheiro, estrelas).

**Architecture:** Registry mutável em módulo (`world.js`) para dados por-frame (posições/hp), React state no GameCanvas para eventos raros (modo, arma, dinheiro). Componentes novos: `OnFootPlayer`, `CombatSystem`. Sem dependências novas.

**Tech Stack:** React 19, @react-three/fiber, @react-three/rapier, three (já instalados). Sem TypeScript, sem framework de testes.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-gta-onfoot-weapons-design.md`.
- Verificação por tarefa: `npm run build` limpo (só o warning pré-existente de chunk >500 kB é aceitável).
- Dados por-frame NUNCA em React state — sempre refs/registry (padrão existente dos `posRef` do radar).
- Armas: Punhos dano 10, 1.5/s, alcance 2u, ammo ∞ · Pistola dano 25, 2.5/s, 60u, ammo 60 · Uzi dano 10, 8/s auto, 50u, ammo 240.
- Ped: 20 hp, corpo some 6s após morte, renasce aos 15s, dropa $50. Carro NPC: 100 hp, carcaça some aos 8s, renasce aos 12s, jacked renasce aos 20s.
- Cada morte/destruição = +1 estrela (máx 5); decai 1 a cada 30s sem crimes.
- Frente do carro do jogador = **-z** local; frente do carro NPC = **+z** local.
- Comentários e strings de UI em português (padrão do projeto).

---

### Task 1: Fundações — `world.js` e `weapons.js`

**Files:**
- Create: `src/components/gta/world.js`
- Create: `src/components/gta/weapons.js`

**Interfaces:**
- Produces: `peds`, `cars` (arrays mutáveis), `worldTime.now` (segundos do clock three), `ensurePed(id)`, `ensureCar(id)`, `hitTest(ox, oz, dx, dz, maxDist)` → `{ kind, entity, dist } | null`, `damage(entity, dmg, now)` → bool matou; `WEAPONS` array com `{ id, name, damage, rate, range, maxAmmo, auto }`.

- [ ] **Step 1: Criar `src/components/gta/world.js`**

```js
// Registry central de entidades — dados por-frame mutáveis, lidos pelo
// combate sem re-renders (mesmo padrão dos posRef do radar).
export const peds = [];
export const cars = [];

// Relógio do mundo (three clock) — atualizado pelo CombatSystem a cada frame
// para que código fora do Canvas (ex.: carjacking) use a mesma timeline.
export const worldTime = { now: 0 };

export function ensurePed(id) {
  let e = peds.find(p => p.id === id);
  if (!e) {
    e = { id, x: 0, z: 0, hp: 20, alive: true, deadAt: 0 };
    peds.push(e);
  }
  return e;
}

export function ensureCar(id) {
  let e = cars.find(c => c.id === id);
  if (!e) {
    e = { id, x: 0, z: 0, ry: 0, color: '#FFD700', hp: 100, alive: true, deadAt: 0, jacked: false, jackedAt: 0 };
    cars.push(e);
  }
  return e;
}

const PED_RADIUS = 0.9;
const CAR_RADIUS = 1.8;

// Raio horizontal a partir de (ox,oz) na direção normalizada (dx,dz).
// Devolve o alvo vivo mais próximo dentro do alcance, ou null.
export function hitTest(ox, oz, dx, dz, maxDist) {
  let best = null;
  const test = (list, radius, kind) => {
    for (const e of list) {
      if (!e.alive || e.jacked) continue;
      const rx = e.x - ox;
      const rz = e.z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > maxDist) continue;
      const px = rx - dx * along;
      const pz = rz - dz * along;
      if (px * px + pz * pz > radius * radius) continue;
      if (!best || along < best.dist) best = { kind, entity: e, dist: along };
    }
  };
  test(peds, PED_RADIUS, 'ped');
  test(cars, CAR_RADIUS, 'car');
  return best;
}

// Aplica dano; devolve true se este golpe matou.
export function damage(entity, dmg, now) {
  if (!entity.alive) return false;
  entity.hp -= dmg;
  if (entity.hp <= 0) {
    entity.alive = false;
    entity.deadAt = now;
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Criar `src/components/gta/weapons.js`**

```js
// Slots de arma — trocados com as teclas 1/2/3 (só a pé)
export const WEAPONS = [
  { id: 'fists',  name: 'FISTS',  damage: 10, rate: 1.5, range: 2,  maxAmmo: Infinity, auto: false },
  { id: 'pistol', name: 'PISTOL', damage: 25, rate: 2.5, range: 60, maxAmmo: 60,       auto: false },
  { id: 'uzi',    name: 'UZI',    damage: 10, rate: 8,   range: 50, maxAmmo: 240,      auto: true },
];
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: `✓ built` sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/gta/world.js src/components/gta/weapons.js
git commit -m "feat(gta): registry de entidades e dados de armas"
```

---

### Task 2: Registry + morte visual de NPCs e pedestres

**Files:**
- Modify: `src/components/gta/NPCCar.jsx` (rewrite)
- Modify: `src/components/gta/City.jsx` (componente `Pedestrian` + ids)
- Modify: `src/components/gta/GameCanvas.jsx` (passar `id` aos NPCCar)

**Interfaces:**
- Consumes: `ensureCar`, `ensurePed` de `./world`.
- Produces: entidades `cars[]`/`peds[]` com `x, z, ry, color` atualizados a cada frame; NPCCar reage a `entity.alive === false` (carbonizado + chamas, some aos 8s, renasce aos 12s) e a `entity.jacked` (invisível, renasce aos 20s); Pedestrian reage a `entity.alive === false` (cai, some aos 6s, renasce aos 15s). `posRef` do radar fica `{0,0}` quando morto/jacked (o radar já ignora 0,0).

- [ ] **Step 1: Reescrever `src/components/gta/NPCCar.jsx`**

```jsx
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
```

- [ ] **Step 2: Em `GameCanvas.jsx`, passar `id` aos NPCCar**

No `.map` dos NPCs, acrescentar `id={`npc-${i}`}`:

```jsx
{NPC_DATA.map((n, i) => (
  <NPCCar
    key={i}
    id={`npc-${i}`}
    start={n.start} end={n.end}
    speed={n.speed} color={n.color} phase={n.phase}
    posRef={npcPosArr.current[i]}
  />
))}
```

- [ ] **Step 3: Em `City.jsx`, ligar `Pedestrian` ao registry com morte**

Adicionar import no topo (junto aos outros): `import { ensurePed } from './world';`

Substituir o componente `Pedestrian` por:

```jsx
function Pedestrian({ id, start, end, speed = 1.4, color = '#FF69B4', phase = 0 }) {
  const ref = useRef();
  const t = useRef(phase);
  const dir = useRef(1);
  const entity = useMemo(() => ensurePed(id), [id]);
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const yawFwd = Math.atan2(dx, dz);
  const yawBack = yawFwd + Math.PI;

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    const now = clock.getElapsedTime();

    // Morto: cai, some aos 6s, renasce aos 15s
    if (!entity.alive) {
      const dead = now - entity.deadAt;
      if (dead >= 15) {
        entity.alive = true;
        entity.hp = 20;
        t.current = phase;
      } else {
        ref.current.visible = dead < 6;
        ref.current.rotation.x = -Math.PI / 2;
        return;
      }
    }

    ref.current.visible = true;
    ref.current.rotation.x = 0;
    t.current += dir.current * speed * delta / dist;
    if (t.current >= 1) { t.current = 1; dir.current = -1; }
    if (t.current <= 0) { t.current = 0; dir.current = 1; }
    const p = t.current;
    const x = start[0] + dx * p;
    const z = start[2] + dz * p;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = dir.current > 0 ? yawFwd : yawBack;
    entity.x = x;
    entity.z = z;
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.45, 0.9, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color="#FDBCB4" />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.5, 0.45, 0.28]} />
        <meshStandardMaterial color="#1a1a4a" />
      </mesh>
    </group>
  );
}
```

E no render da cidade, dar `id` a cada pedestre (`ped-0` … `ped-7`):

```jsx
<Pedestrian id="ped-0" start={[-73, 0, -175]} end={[-73, 0, -30]} speed={1.5} color="#FF6EC7" phase={0.0} />
<Pedestrian id="ped-1" start={[-73, 0,  30]}  end={[-73, 0, 175]} speed={1.2} color="#00FFFF" phase={0.3} />
<Pedestrian id="ped-2" start={[-87, 0, -150]} end={[-87, 0,  50]} speed={1.8} color="#FFD700" phase={0.6} />
<Pedestrian id="ped-3" start={[-87, 0,  60]}  end={[-87, 0, 150]} speed={1.3} color="#FF4500" phase={0.1} />
<Pedestrian id="ped-4" start={[68, 0, -148]}  end={[68, 0, -40]}  speed={1.4} color="#98FB98" phase={0.5} />
<Pedestrian id="ped-5" start={[68, 0,  40]}   end={[68, 0, 148]}  speed={1.6} color="#DDA0DD" phase={0.8} />
<Pedestrian id="ped-6" start={[56, 0, -130]}  end={[56, 0,  60]}  speed={1.2} color="#FFA07A" phase={0.2} />
<Pedestrian id="ped-7" start={[56, 0,  70]}   end={[56, 0, 130]}  speed={1.5} color="#87CEEB" phase={0.7} />
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: `✓ built` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/NPCCar.jsx src/components/gta/City.jsx src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): registry de peds/carros com estados de morte e jack"
```

---

### Task 3: Jogador a pé + troca de modo + câmara generalizada

**Files:**
- Create: `src/components/gta/OnFootPlayer.jsx`
- Modify: `src/components/gta/FollowCamera.jsx` (rewrite)
- Modify: `src/components/gta/PlayerCar.jsx` (props `active` e `color`)
- Modify: `src/components/gta/GameCanvas.jsx` (estado de modo + tecla F)

**Interfaces:**
- Consumes: nada de novo.
- Produces: `OnFootPlayer({ playerRef, spawn, yawRef, aimYawRef, weaponSlot })`; `FollowCamera({ targetRef, mode, yawRef })`; `PlayerCar({ carRef, active, color, onStateChange })`. `yawRef.current` = direção de movimento a pé (rad, forward = `(sin, cos)`); `aimYawRef.current` = direção de mira ou `null`.

- [ ] **Step 1: Criar `src/components/gta/OnFootPlayer.jsx`**

```jsx
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
    const down = (e) => { keys.current[e.key] = true; };
    const up = (e) => { keys.current[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
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
    _camRight.crossVectors(_camFwd, _up).negate(); // direita da câmara
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
```

- [ ] **Step 2: Reescrever `src/components/gta/FollowCamera.jsx`**

```jsx
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

  useFrame(() => {
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
    camera.position.lerp(_cameraPos, 0.08);
    _targetPos.set(pos.x, pos.y + preset.lookUp, pos.z);
    camera.lookAt(_targetPos);
  });

  return null;
}
```

- [ ] **Step 3: Em `PlayerCar.jsx`, adicionar props `active` e `color`**

Assinatura: `export default function PlayerCar({ carRef, active = true, color = '#FF6EC7', onStateChange })`.

No início do `useFrame`, logo após `if (!carRef.current) return;`, adicionar:

```jsx
    if (!active) return; // a pé: carro ignora input e fica onde está
```

No corpo principal, trocar `color="#FF6EC7"` por `color={color}`; no tejadilho, trocar `color="#FF4DB8"` por `color={color}`. (Faróis, luzes, vidros e underglow ficam como estão.)

- [ ] **Step 4: Em `GameCanvas.jsx`, estado de modo + tecla F (sair/entrar só no próprio carro; carjacking é a Task 4)**

Imports novos no topo:

```jsx
import OnFootPlayer from './OnFootPlayer';
```

Dentro de `GameCanvas()`, junto aos outros refs/estados:

```jsx
  const playerRef = useRef();
  const footYawRef = useRef(0);
  const aimYawRef = useRef(null);
  const [mode, setMode] = useState('car');
  const [footSpawn, setFootSpawn] = useState([0, 1, 0]);
  const [weaponSlot, setWeaponSlot] = useState(0);
  const lastToggle = useRef(0);
```

Handler da tecla F/Enter (useEffect no GameCanvas):

```jsx
  // Sair/entrar do carro com F ou Enter (debounce 500ms)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'f' && e.key !== 'F' && e.key !== 'Enter') return;
      const nowMs = performance.now();
      if (nowMs - lastToggle.current < 500) return;

      if (mode === 'car') {
        const car = carRef.current;
        if (!car) return;
        const p = car.translation();
        const r = car.rotation();
        const ry = Math.atan2(2 * (r.w * r.y + r.z * r.x), 1 - 2 * (r.y * r.y + r.z * r.z));
        // Jogador aparece 1.8u à esquerda do carro (frente do carro = -z local)
        setFootSpawn([p.x - Math.cos(ry) * 1.8, 1, p.z + Math.sin(ry) * 1.8]);
        car.setLinvel({ x: 0, y: 0, z: 0 }, true);
        setMode('foot');
        lastToggle.current = nowMs;
      } else {
        const player = playerRef.current;
        const car = carRef.current;
        if (!player || !car) return;
        const pp = player.translation();
        const cp = car.translation();
        if (Math.hypot(cp.x - pp.x, cp.z - pp.z) < 3.5) {
          setMode('car');
          lastToggle.current = nowMs;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // Trocar de arma com 1/2/3 (só a pé)
  useEffect(() => {
    const onKey = (e) => {
      if (mode !== 'foot') return;
      if (e.key === '1') setWeaponSlot(0);
      if (e.key === '2') setWeaponSlot(1);
      if (e.key === '3') setWeaponSlot(2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);
```

No JSX dentro de `<Physics>`, substituir as linhas do PlayerCar/FollowCamera por:

```jsx
            <PlayerCar carRef={carRef} active={mode === 'car'} onStateChange={setGameState} />
            {mode === 'foot' && (
              <OnFootPlayer
                playerRef={playerRef}
                spawn={footSpawn}
                yawRef={footYawRef}
                aimYawRef={aimYawRef}
                weaponSlot={weaponSlot}
              />
            )}
            <FollowCamera
              targetRef={mode === 'car' ? carRef : playerRef}
              mode={mode}
              yawRef={footYawRef}
            />
```

E o `MapSync` passa a seguir o corpo ativo:

```jsx
          <MapSync carRef={mode === 'car' ? carRef : playerRef} mapStateRef={mapStateRef} />
```

- [ ] **Step 5: Verificar build + teste manual**

Run: `npm run build` → `✓ built`.
Manual (`npm run dev`): F sai do carro, boneco anda com WASD relativo à câmara, pernas mexem, F perto do carro volta a entrar, câmara acompanha nos dois modos.

- [ ] **Step 6: Commit**

```bash
git add src/components/gta/OnFootPlayer.jsx src/components/gta/FollowCamera.jsx src/components/gta/PlayerCar.jsx src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): jogador a pe com troca de modo F e camara generalizada"
```

---

### Task 4: Carjacking + carros estacionados

**Files:**
- Modify: `src/components/gta/GameCanvas.jsx`

**Interfaces:**
- Consumes: `cars`, `worldTime` de `./world`; `entity.ry`/`entity.color` (Task 2).
- Produces: estado `parkedCars: [{ x, z, ry, color }]`, estado `carColor`; componente local `ParkedCar`.

- [ ] **Step 1: Em `GameCanvas.jsx`, imports + componente ParkedCar**

Imports novos:

```jsx
import { RigidBody } from '@react-three/rapier';
import { cars, worldTime } from './world';
```

Componente local (junto ao MapSync):

```jsx
// Carro antigo do jogador — fica no mundo como cenário com colisão
function ParkedCar({ x, z, ry, color }) {
  return (
    <RigidBody type="fixed" position={[x, 0.5, z]} rotation={[0, ry, 0]} colliders="cuboid">
      <mesh castShadow>
        <boxGeometry args={[2, 0.8, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.7, -0.3]} castShadow>
        <boxGeometry args={[1.8, 0.6, 2]} />
        <meshStandardMaterial color="#101820" roughness={0.15} metalness={0.7} />
      </mesh>
    </RigidBody>
  );
}
```

- [ ] **Step 2: Estados novos + lógica de carjacking no handler F**

Estados:

```jsx
  const [parkedCars, setParkedCars] = useState([]);
  const [carColor, setCarColor] = useState('#FF6EC7');
```

No handler F (ramo `mode === 'foot'`), substituir o bloco de entrada por:

```jsx
      } else {
        const player = playerRef.current;
        const car = carRef.current;
        if (!player || !car) return;
        const pp = player.translation();
        const cp = car.translation();
        const dOwn = Math.hypot(cp.x - pp.x, cp.z - pp.z);

        // Carro NPC vivo mais próximo (carjacking)
        let bestCar = null;
        let bestD = 3.5;
        for (const c of cars) {
          if (!c.alive || c.jacked) continue;
          const d = Math.hypot(c.x - pp.x, c.z - pp.z);
          if (d < bestD) { bestD = d; bestCar = c; }
        }

        if (bestCar && bestD < dOwn) {
          // Roubar: NPC some, carro do jogador teleporta para lá com a cor dele;
          // o carro antigo fica estacionado no mundo
          bestCar.jacked = true;
          bestCar.jackedAt = worldTime.now;
          const r = car.rotation();
          const carRy = Math.atan2(2 * (r.w * r.y + r.z * r.x), 1 - 2 * (r.y * r.y + r.z * r.z));
          setParkedCars(list => [...list, { x: cp.x, z: cp.z, ry: carRy, color: carColor }]);
          // Frente do NPC = +z, frente do jogador = -z → yaw do jogador = ry do NPC + π
          const yaw = bestCar.ry + Math.PI;
          car.setTranslation({ x: bestCar.x, y: 1, z: bestCar.z }, true);
          car.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
          car.setLinvel({ x: 0, y: 0, z: 0 }, true);
          car.setAngvel({ x: 0, y: 0, z: 0 }, true);
          setCarColor(bestCar.color);
          setMode('car');
          lastToggle.current = nowMs;
        } else if (dOwn < 3.5) {
          setMode('car');
          lastToggle.current = nowMs;
        }
      }
```

Dependências do useEffect passam a `[mode, carColor]`.

Nota: o import de `RigidBody` junta-se ao import existente de `@react-three/rapier` (que já traz `Physics`): `import { Physics, RigidBody } from '@react-three/rapier';`

- [ ] **Step 3: Renderizar carros estacionados + cor do carro**

No JSX, PlayerCar recebe a cor:

```jsx
            <PlayerCar carRef={carRef} active={mode === 'car'} color={carColor} onStateChange={setGameState} />
```

Dentro de `<Physics>`, após o PlayerCar:

```jsx
            {parkedCars.map((c, i) => <ParkedCar key={i} {...c} />)}
```

- [ ] **Step 4: Verificar build + teste manual**

Run: `npm run build` → `✓ built`.
Manual: sair do carro, aproximar de um NPC, F → entras no carro dele (cor muda), o teu antigo fica parado; o NPC reaparece na rota ~20s depois.

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): carjacking de NPCs e carros estacionados"
```

---

### Task 5: CombatSystem — disparo, mira, efeitos, drops, pickups, wanted

**Files:**
- Create: `src/components/gta/CombatSystem.jsx`
- Modify: `src/components/gta/GameCanvas.jsx` (montar + callbacks)

**Interfaces:**
- Consumes: `WEAPONS` de `./weapons`; `peds`, `hitTest`, `damage`, `worldTime` de `./world`; `playerRef`, `carRef`, `footYawRef`, `aimYawRef`, `weaponSlot` da Task 3.
- Produces: `CombatSystem({ mode, playerRef, carRef, footYawRef, aimYawRef, weaponSlot, wanted, onAmmo, addMoney, addWanted, decayWanted })`; chama `onAmmo([f, p, u])` quando o ammo muda.

- [ ] **Step 1: Criar `src/components/gta/CombatSystem.jsx`**

```jsx
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
      firingRef.current = true;
      mouseAimRef.current.mouse = false;
    };
    const onKeyUp = (e) => {
      if (e.key !== ' ') return;
      firingRef.current = false;
      semiHandledRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
    semiHandledRef.current = true;
    if (w.maxAmmo !== Infinity && ammoRef.current[weaponSlot] <= 0) return;

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
```

- [ ] **Step 2: Montar no `GameCanvas.jsx`**

Imports: `import CombatSystem from './CombatSystem';` e `import { increaseWanted } from './gameState';`

Estados/callbacks dentro de `GameCanvas()`:

```jsx
  const [ammoDisplay, setAmmoDisplay] = useState([Infinity, 60, 240]);

  const addMoney = (amount) => setGameState(s => ({ ...s, money: s.money + amount }));
  const addWanted = () => setGameState(s => increaseWanted(s));
  const decayWanted = () => setGameState(s => ({ ...s, wanted: Math.max(0, s.wanted - 1) }));
```

No JSX dentro do `<Suspense>` (fora de `<Physics>`, junto ao MapSync):

```jsx
          <CombatSystem
            mode={mode}
            playerRef={playerRef}
            carRef={carRef}
            footYawRef={footYawRef}
            aimYawRef={aimYawRef}
            weaponSlot={weaponSlot}
            wanted={gameState.wanted}
            onAmmo={setAmmoDisplay}
            addMoney={addMoney}
            addWanted={addWanted}
            decayWanted={decayWanted}
          />
```

- [ ] **Step 3: Verificar build + teste manual**

Run: `npm run build` → `✓ built`.
Manual: a pé, 2 seleciona pistola, clique dispara para o cursor (tracer + flash), ped morre e larga cubo verde, apanhar dá +$50 e +1 estrela; uzi (3) dispara em rajada; carro NPC explode em chamas após ~4 tiros de pistola; estrela decai após 30s; atropelar ped de carro mata-o.

- [ ] **Step 4: Commit**

```bash
git add src/components/gta/CombatSystem.jsx src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): sistema de combate com mira de rato, drops e wanted"
```

---

### Task 6: HUD (arma/ammo/crosshair) + controlos mobile

**Files:**
- Modify: `src/components/gta/HUD.jsx`
- Modify: `src/components/gta/HUD.css`
- Modify: `src/components/gta/Controls.jsx`
- Modify: `src/components/gta/GameCanvas.jsx` (props novas + cursor)

**Interfaces:**
- Consumes: `WEAPONS` de `./weapons`; `weaponSlot`, `ammoDisplay`, `mode` do GameCanvas.
- Produces: HUD com linha de arma e crosshair; botões F e FIRE no pad.

- [ ] **Step 1: Em `HUD.jsx`, arma + crosshair**

Import: `import { WEAPONS } from './weapons';`

Assinatura: `export default function HUD({ life, money, wanted, mapStateRef, npcPosArr, mode, weaponSlot, ammo })`.

Crosshair — dentro do componente, antes do return:

```jsx
  const crossRef = useRef();

  useEffect(() => {
    if (mode !== 'foot') return;
    const onMove = (e) => {
      if (!crossRef.current) return;
      crossRef.current.style.left = `${e.clientX}px`;
      crossRef.current.style.top = `${e.clientY}px`;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [mode]);
```

No JSX, dentro de `.hud-top-right` após `.hud-money`:

```jsx
        <div className={`hud-weapon${ammo[weaponSlot] === 0 ? ' empty' : ''}`}>
          {WEAPONS[weaponSlot].name}
          {ammo[weaponSlot] !== Infinity && ` ${ammo[weaponSlot]}`}
        </div>
```

E antes de fechar `.gta-hud`:

```jsx
      {mode === 'foot' && <div ref={crossRef} className="crosshair" />}
```

- [ ] **Step 2: Em `HUD.css`, estilos novos**

```css
.hud-weapon { font-size: 18px; color: #FFF; text-shadow: 0 0 8px rgba(255,255,255,0.5); letter-spacing: 1px; }
.hud-weapon.empty { color: #FF4040; text-shadow: 0 0 8px rgba(255,64,64,0.7); }

/* Mira rosa que segue o rato quando estás a pé */
.crosshair {
  position: fixed;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid #FF6EC7;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(255,110,199,0.8), inset 0 0 4px rgba(255,110,199,0.6);
  pointer-events: none;
}
.crosshair::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  background: #FF6EC7;
  border-radius: 50%;
}
```

- [ ] **Step 3: Em `Controls.jsx`, botões F e FIRE**

Substituir o componente `Controls`:

```jsx
export default function Controls() {
  return (
    <>
      <div className="ctrl-pad">
        <Btn label="▲" k={KEYS.up}    style={{ gridRow: 1, gridColumn: 2 }} />
        <Btn label="◀" k={KEYS.left}  style={{ gridRow: 2, gridColumn: 1 }} />
        <Btn label="▼" k={KEYS.down}  style={{ gridRow: 2, gridColumn: 2 }} />
        <Btn label="▶" k={KEYS.right} style={{ gridRow: 2, gridColumn: 3 }} />
      </div>
      <div className="ctrl-pad ctrl-pad-right">
        <Btn label="F"    k="f" style={{ gridRow: 1, gridColumn: 1 }} />
        <Btn label="FIRE" k=" " style={{ gridRow: 2, gridColumn: 1 }} />
      </div>
    </>
  );
}
```

Em `Controls.css` adicionar:

```css
.ctrl-pad-right {
  left: auto;
  right: 18px;
  grid-template-columns: 1fr;
}
```

(Ajustar o seletor conforme o CSS existente — o `.ctrl-pad` original posiciona à esquerda.)

- [ ] **Step 4: Em `GameCanvas.jsx`, passar props e esconder cursor a pé**

HUD:

```jsx
      <HUD
        life={gameState.life}
        money={gameState.money}
        wanted={gameState.wanted}
        mapStateRef={mapStateRef}
        npcPosArr={npcPosArr}
        mode={mode}
        weaponSlot={weaponSlot}
        ammo={ammoDisplay}
      />
```

Container principal esconde o cursor nativo a pé:

```jsx
    <div style={{ width: '100%', height: '100%', position: 'relative', cursor: mode === 'foot' ? 'none' : 'default' }}>
```

- [ ] **Step 5: Verificar build + teste manual completo**

Run: `npm run build` → `✓ built`.
Manual completo: HUD mostra `FISTS` / `PISTOL 60` / `UZI 240`; ammo desce ao disparar e fica vermelho a 0; caixa ciano enche munição; crosshair rosa segue o rato só a pé; botões F/FIRE funcionam por touch.

- [ ] **Step 6: Commit**

```bash
git add src/components/gta/HUD.jsx src/components/gta/HUD.css src/components/gta/Controls.jsx src/components/gta/Controls.css src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): HUD de armas, crosshair e controlos F/FIRE"
```
