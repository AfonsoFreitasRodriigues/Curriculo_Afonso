# GTA 3D — Mapa Orgânico v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mundo retangular por costa curva, ruas com curvas/diagonais, tráfego por waypoints e radar que desenha as formas reais.

**Architecture:** Novo módulo `map.js` = fonte única de verdade (contornos, polilinhas de ruas com comprimento de arco, praia, edifícios). City.jsx gera geometria (Shapes + ribbons + cadeia de colisores da costa), HUD desenha os mesmos dados no radar, NPCCar/Pedestrian seguem as polilinhas.

**Tech Stack:** React 19, @react-three/fiber, @react-three/rapier, three (CatmullRomCurve3). Sem dependências novas, sem TypeScript, sem framework de testes.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-gta-organic-map-design.md`.
- Verificação por tarefa: `npm run build` limpo (warning pré-existente de chunk >500 kB aceitável).
- Mapeamento Shape→mundo OBRIGATÓRIO: `new THREE.Vector2(x, -z)` + `rotation={[-Math.PI/2, 0, 0]}` ⇒ ponto (x,z) do mundo.
- Convenção de yaw: `atan2(dx, dz)` (frente NPC = +z local; frente carro jogador = -z local).
- Canal em x≈±25, pontes em z≈0 e z≈−100 preservadas; aberturas de colisores nas pontes via `BRIDGE_OPENINGS`.
- Dados por-frame NUNCA em React state; tudo do mapa pré-calculado a nível de módulo.
- Contrato do registry inalterado: NPCCar/Pedestrian continuam a escrever `entity.x/z/ry` e `posRef` ({0,0} quando morto/jacked); estados de morte/jack/respawn mantêm os timers atuais (8/12/20s carros, 6/15s peds).
- Comentários e UI em português.
- Nota transitória aceite: após a Task 2 o tráfego ainda anda nas rotas retas antigas (desalinhado do mundo novo) — corrigido na Task 3. Não é um defeito da Task 2.

---

### Task 1: `map.js` — formas do mundo e helpers de arco

**Files:**
- Create: `src/components/gta/map.js`

**Interfaces:**
- Produces: `ISLAND_SHAPES: [{ points: [[x,z],…] }]` (2 contornos fechados suavizados; último ponto == primeiro), `BEACH_SHAPE: { points }`, `ROAD_PATHS: [{ id, width, hidden?, points, lengths, total }]`, `SIDEWALK_PATHS` (mesma estrutura, width 0), `BUILDINGS` (mesmo formato atual `{pos,w,h,d,color}`), `BRIDGE_OPENINGS: [{minX,maxX,minZ,maxZ}]`, `getPath(id)` → path (procura em ROAD_PATHS e SIDEWALK_PATHS), `pathLength(path)` → número, `pointAt(path, s)` → `{ x, z, yaw }` (s clampado a [0, total]).

- [ ] **Step 1: Criar `src/components/gta/map.js`**

```js
import * as THREE from 'three';

// ─── Fonte única de verdade do mapa ──────────────────────────────────────────
// Curvas autoradas como pontos de controlo e suavizadas UMA VEZ no load
// (Catmull-Rom, ~1 ponto por 8u). Consumidores: City (3D), HUD (radar),
// NPCCar/Pedestrian (waypoints).

const SPACING = 8;

function smooth(controlPoints, closed) {
  if (!controlPoints || controlPoints.length < 2) {
    console.warn('map.js: path com menos de 2 pontos ignorado');
    return controlPoints || [];
  }
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed, 'catmullrom', 0.5
  );
  const n = Math.max(closed ? 8 : 2, Math.round(curve.getLength() / SPACING));
  return curve.getSpacedPoints(n).map(p => [p.x, p.z]);
}

// Pré-calcula comprimentos acumulados para pointAt()
function buildPath(id, width, controlPoints, opts = {}) {
  const points = smooth(controlPoints, false);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dz = points[i][1] - points[i - 1][1];
    lengths.push(lengths[i - 1] + Math.hypot(dx, dz));
  }
  return { id, width, points, lengths, total: lengths[lengths.length - 1], ...opts };
}

export function pathLength(path) {
  return path.total;
}

// Posição + direção ao longo do path por comprimento de arco
export function pointAt(path, s) {
  const { points, lengths, total } = path;
  const t = Math.min(Math.max(s, 0), total);
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < t) i++;
  const segLen = lengths[i] - lengths[i - 1] || 1;
  const f = (t - lengths[i - 1]) / segLen;
  const [x1, z1] = points[i - 1];
  const [x2, z2] = points[i];
  return {
    x: x1 + (x2 - x1) * f,
    z: z1 + (z2 - z1) * f,
    yaw: Math.atan2(x2 - x1, z2 - z1),
  };
}

// ─── Ilhas (contornos fechados; costa irregular) ─────────────────────────────
export const ISLAND_SHAPES = [
  { // Ilha Oeste — downtown
    points: smooth([
      [-25, -160], [-20, -120], [-27, -95], [-20, -60], [-18, -10], [-22, 40],
      [-19, 90], [-26, 140], [-42, 178], [-90, 190], [-140, 184], [-175, 165],
      [-190, 115], [-183, 65], [-191, 10], [-184, -55], [-190, -115],
      [-176, -158], [-135, -186], [-85, -180], [-45, -184],
    ], true),
  },
  { // Ilha Este — Vice Beach
    points: smooth([
      [25, -145], [20, -110], [26, -70], [19, -25], [23, 25], [18, 70],
      [25, 115], [32, 148], [65, 160], [110, 163], [148, 150], [170, 122],
      [180, 82], [186, 30], [183, -25], [178, -80], [168, -122], [146, -150],
      [105, -162], [60, -166], [32, -158],
    ], true),
  },
];

// ─── Praia (faixa em arco no lado este) ──────────────────────────────────────
export const BEACH_SHAPE = {
  points: smooth([
    [138, -138], [160, -115], [172, -70], [178, -20], [175, 35], [166, 85],
    [152, 125], [136, 145], [128, 120], [132, 75], [128, 25], [131, -30],
    [127, -80], [130, -115],
  ], true),
};

// ─── Ruas (polilinhas centrais + largura) ────────────────────────────────────
export const ROAD_PATHS = [
  // Ilha Oeste
  buildPath('coastal',    13, [[-158, -162], [-172, -118], [-164, -58], [-174, 2], [-166, 62], [-176, 112], [-158, 158]]),
  buildPath('vespucci',   16, [[-78, -178], [-68, -118], [-84, -58], [-73, 2], [-86, 62], [-70, 122], [-80, 178]]),
  buildPath('diagonal',   11, [[-160, -148], [-118, -104], [-72, -54], [-38, -14], [-30, -2]]),
  buildPath('mainWest',   13, [[-162, 6], [-122, -6], [-80, 6], [-32, 0]]),
  buildPath('northWest',  11, [[-172, -92], [-128, -106], [-82, -94], [-32, -100]]),
  // Pontes (retas)
  buildPath('bridgeMain', 13, [[-32, 0], [32, 0]]),
  buildPath('bridgeNorth', 11, [[-32, -100], [32, -100]]),
  // Ilha Este
  buildPath('oceanDrive', 13, [[56, -150], [70, -98], [60, -40], [72, 18], [62, 78], [74, 128], [56, 152]]),
  buildPath('mainEast',   11, [[32, 0], [82, 10], [128, -6], [162, 4]]),
  buildPath('northEast',  11, [[32, -100], [80, -90], [124, -104]]),
  // Rota de tráfego de longa distância (não renderizada — cobre mainWest+ponte+mainEast)
  buildPath('crossing',   0,  [[-162, 6], [-122, -6], [-80, 6], [-32, 0], [32, 0], [82, 10], [128, -6], [162, 4]], { hidden: true }),
];

// ─── Passeios para pedestres (só tráfego, sem geometria própria) ─────────────
export const SIDEWALK_PATHS = [
  buildPath('walkVespucciE', 0, [[-66, -160], [-58, -110], [-72, -50], [-62, 5], [-74, 60], [-60, 120], [-68, 165]]),
  buildPath('walkVespucciW', 0, [[-90, -160], [-80, -115], [-96, -55], [-85, 5], [-98, 60], [-82, 120], [-92, 165]]),
  buildPath('walkOceanW',    0, [[46, -140], [58, -95], [50, -40], [60, 18], [52, 75], [62, 125], [46, 145]]),
  buildPath('walkOceanE',    0, [[68, -140], [80, -95], [72, -38], [82, 20], [74, 78], [85, 125], [68, 145]]),
];

const ALL_PATHS = [...ROAD_PATHS, ...SIDEWALK_PATHS];
export function getPath(id) {
  return ALL_PATHS.find(p => p.id === id);
}

// ─── Aberturas das pontes (a cadeia de colisores da costa salta estes retângulos)
export const BRIDGE_OPENINGS = [
  { minX: -34, maxX: 34, minZ: -9,   maxZ: 9 },
  { minX: -34, maxX: 34, minZ: -108, maxZ: -92 },
];

// ─── Edifícios (movidos de City.jsx; posições ajustadas às ruas novas) ───────
export const BUILDINGS = [
  // ── Ilha Oeste: Downtown ──
  { pos: [-106, 0, -42], w: 22, h: 50, d: 20, color: '#F2ECD8' },
  { pos: [-135, 0, -38], w: 20, h: 44, d: 18, color: '#7ECECE' },
  { pos: [-108, 0,  38], w: 22, h: 38, d: 20, color: '#D4B8E0' },
  { pos: [-104, 0,  54], w: 18, h: 46, d: 18, color: '#F0D0B8' },
  { pos: [-148, 0,  42], w: 18, h: 32, d: 16, color: '#80C4D8' },
  { pos: [-158, 0, -52], w: 24, h: 40, d: 22, color: '#EDE0C4' },
  { pos: [-175, 0,  28], w: 20, h: 24, d: 24, color: '#F2ECD8' },
  { pos: [-120, 0, -76], w: 18, h: 26, d: 18, color: '#D4B8E0' },
  { pos: [-118, 0, -128], w: 20, h: 28, d: 20, color: '#80C4D8' },
  { pos: [-118, 0,  122], w: 20, h: 24, d: 20, color: '#7ECECE' },
  // ── Ilha Oeste: Residencial norte ──
  { pos: [-97,  0, -148], w: 20, h: 18, d: 20, color: '#B8D898' },
  { pos: [-157, 0, -132], w: 18, h: 22, d: 18, color: '#F0C8A0' },
  { pos: [-172, 0, -158], w: 22, h: 16, d: 22, color: '#C8D8F0' },
  { pos: [-102, 0, -172], w: 18, h: 14, d: 18, color: '#EDE0C4' },
  // ── Ilha Oeste: Residencial sul ──
  { pos: [-102, 0,  148], w: 20, h: 20, d: 20, color: '#F2ECD8' },
  { pos: [-157, 0,  142], w: 18, h: 16, d: 18, color: '#B8D898' },
  { pos: [-172, 0,  160], w: 22, h: 24, d: 20, color: '#F0C8A0' },
  // ── Ilha Oeste: Porto / industrial ──
  { pos: [-150, 0,  90], w: 32, h: 12, d: 25, color: '#8A8070' },
  { pos: [-148, 0, 120], w: 28, h: 10, d: 20, color: '#7A7060' },
  { pos: [-140, 0, 165], w: 34, h:  8, d: 28, color: '#8A8070' },
  // ── Ilha Este: Hotéis Ocean Drive ──
  { pos: [44, 0, -118], w: 18, h: 28, d: 22, color: '#E8865A' },
  { pos: [44, 0,  -68], w: 20, h: 34, d: 24, color: '#D4B8E0' },
  { pos: [44, 0,  -18], w: 22, h: 38, d: 20, color: '#7ECECE' },
  { pos: [44, 0,   32], w: 20, h: 30, d: 22, color: '#F2ECD8' },
  { pos: [44, 0,   82], w: 18, h: 34, d: 22, color: '#F0D0B8' },
  { pos: [44, 0,  130], w: 22, h: 28, d: 20, color: '#80C4D8' },
  { pos: [31, 0,  -92], w: 14, h: 20, d: 16, color: '#E8865A' },
  { pos: [31, 0,   54], w: 16, h: 22, d: 16, color: '#B8D898' },
  { pos: [31, 0,  108], w: 14, h: 16, d: 14, color: '#D4B8E0' },
  // ── Ilha Este: norte ──
  { pos: [78, 0, -130],  w: 16, h: 14, d: 16, color: '#F0C8A0' },
  { pos: [112, 0, -118], w: 18, h: 12, d: 18, color: '#C8D8F0' },
];
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: `✓ built` sem erros (o módulo ainda não é importado por ninguém — isto valida só a sintaxe).

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/map.js
git commit -m "feat(gta): map.js — formas organicas do mundo e helpers de arco"
```

---

### Task 2: City.jsx (mundo 3D novo) + HUD.jsx (radar novo)

**Files:**
- Modify: `src/components/gta/City.jsx`
- Modify: `src/components/gta/HUD.jsx`

**Interfaces:**
- Consumes: `ISLAND_SHAPES`, `BEACH_SHAPE`, `ROAD_PATHS`, `SIDEWALK_PATHS`, `BUILDINGS`, `BRIDGE_OPENINGS`, `getPath`, `pointAt` de `./map`.
- Produces: City.jsx deixa de exportar `ISLANDS`/`ROADS`/`BUILDINGS`; HUD importa tudo de `./map`. Pedestrian passa a `{ id, pathId, speed, color, phase }`.

- [ ] **Step 1: Em `City.jsx` — imports e remoções**

Adicionar ao topo:
```jsx
import { ISLAND_SHAPES, BEACH_SHAPE, ROAD_PATHS, BRIDGE_OPENINGS, BUILDINGS, getPath, pointAt } from './map';
```
Remover integralmente: os exports `ISLANDS`, `ROADS` e `BUILDINGS` (dados agora em map.js), o componente `Road`, e no render: os 2 planos retangulares das ilhas + faixas centrais claras, o plano retangular da praia, as 3 faixas de espuma, o `{ROADS.map(...)}`, e os 6 `CuboidCollider` do canal (os 4 colisores exteriores do mapa em ±195 FICAM).

- [ ] **Step 2: Em `City.jsx` — geometria ribbon e offset (antes dos componentes)**

```jsx
// ─── Geometria "ribbon" ao longo de uma polilinha (para ruas/passeios) ───────
function perpAt(points, i) {
  const n = points.length;
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(n - 1, i + 1)];
  let dx = next[0] - prev[0];
  let dz = next[1] - prev[1];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  return [-dz, dx]; // perpendicular à esquerda
}

function makeRibbonGeometry(points, width) {
  const half = width / 2;
  const verts = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [px, pz] = perpAt(points, i);
    verts.push(x + px * half, 0, z + pz * half);
    verts.push(x - px * half, 0, z - pz * half);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Polilinha deslocada lateralmente (para os passeios)
function offsetPolyline(points, offset) {
  return points.map(([x, z], i) => {
    const [px, pz] = perpAt(points, i);
    return [x + px * offset, z + pz * offset];
  });
}
```

- [ ] **Step 3: Em `City.jsx` — componentes Island, Beach, RoadPath, CoastColliders**

```jsx
// Shape 2D → mundo: Vector2(x, -z) + rotation [-π/2,0,0] ⇒ ponto (x, 0, z)
function shapeFromPoints(points) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) s.moveTo(x, -z); else s.lineTo(x, -z);
  });
  s.closePath();
  return s;
}

function Island({ points, color }) {
  const shape = useMemo(() => shapeFromPoints(points), [points]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      {/* Falésia baixa na linha de costa */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <extrudeGeometry args={[shape, { depth: 0.55, bevelEnabled: false }]} />
        <meshStandardMaterial color="#6E6152" roughness={1} />
      </mesh>
    </>
  );
}

function Beach() {
  const shape = useMemo(() => shapeFromPoints(BEACH_SHAPE.points), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#E2CC78" roughness={1} />
    </mesh>
  );
}

function RoadPath({ path }) {
  const asphalt = useMemo(() => makeRibbonGeometry(path.points, path.width), [path]);
  const sideL = useMemo(
    () => makeRibbonGeometry(offsetPolyline(path.points, path.width / 2 + 2.5), 4), [path]);
  const sideR = useMemo(
    () => makeRibbonGeometry(offsetPolyline(path.points, -(path.width / 2 + 2.5)), 4), [path]);
  return (
    <group>
      <mesh geometry={asphalt} position={[0, 0.03, 0]}>
        <meshStandardMaterial color="#0D0D0D" roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sideL} position={[0, 0.045, 0]}>
        <meshStandardMaterial color="#B8A890" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sideR} position={[0, 0.045, 0]}>
        <meshStandardMaterial color="#B8A890" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Linha central amarela tracejada (segmentos alternados) */}
      {path.points.slice(0, -1).map((p, i) => {
        if (i % 2 !== 0) return null;
        const q = path.points[i + 1];
        const seg = makeRibbonGeometry([p, q], 0.45);
        return (
          <mesh key={i} geometry={seg} position={[0, 0.05, 0]}>
            <meshStandardMaterial color="#FFD700" side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

// Cadeia de colisores invisíveis ao longo da costa, com aberturas nas pontes
function CoastColliders({ points }) {
  const inOpening = (x, z) =>
    BRIDGE_OPENINGS.some(o => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ);
  return (
    <RigidBody type="fixed" colliders={false}>
      {points.slice(0, -1).map((p, i) => {
        const q = points[i + 1];
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.01) return null;
        const mx = (p[0] + q[0]) / 2;
        const mz = (p[1] + q[1]) / 2;
        if (inOpening(mx, mz)) return null;
        return (
          <CuboidCollider
            key={i}
            args={[len / 2 + 0.5, 10, 0.8]}
            position={[mx, 10, mz]}
            rotation={[0, -Math.atan2(dz, dx), 0]}
          />
        );
      })}
    </RigidBody>
  );
}
```

Nota: o tracejado cria uma geometria pequena por segmento par (~15 por rua). Se o reviewer/perf reclamar, é aceitável fundir num único BufferGeometry mais tarde — não bloquear nisso agora.

- [ ] **Step 4: Em `City.jsx` — Pedestrian por waypoints**

Substituir o componente `Pedestrian` (mantendo EXACTAMENTE a lógica de morte/respawn do registry — 6s some, 15s renasce) por:

```jsx
function Pedestrian({ id, pathId, speed = 1.4, color = '#FF69B4', phase = 0 }) {
  const ref = useRef();
  const path = useMemo(() => getPath(pathId), [pathId]);
  const s = useRef(phase * (path ? path.total : 0));
  const dir = useRef(1);
  const entity = useMemo(() => ensurePed(id), [id]);

  useFrame(({ clock }, delta) => {
    if (!ref.current || !path) return;
    const now = clock.getElapsedTime();

    // Morto: cai, some aos 6s, renasce aos 15s
    if (!entity.alive) {
      const dead = now - entity.deadAt;
      if (dead >= 15) {
        entity.alive = true;
        entity.hp = 20;
        s.current = phase * path.total;
      } else {
        ref.current.visible = dead < 6;
        ref.current.rotation.x = -Math.PI / 2;
        return;
      }
    }

    ref.current.visible = true;
    ref.current.rotation.x = 0;
    s.current += dir.current * speed * delta;
    if (s.current >= path.total) { s.current = path.total; dir.current = -1; }
    if (s.current <= 0) { s.current = 0; dir.current = 1; }
    const pt = pointAt(path, s.current);
    ref.current.position.set(pt.x, 0, pt.z);
    ref.current.rotation.y = dir.current > 0 ? pt.yaw : pt.yaw + Math.PI;
    entity.x = pt.x;
    entity.z = pt.z;
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

E as utilizações passam a:
```jsx
<Pedestrian id="ped-0" pathId="walkVespucciE" speed={1.5} color="#FF6EC7" phase={0.05} />
<Pedestrian id="ped-1" pathId="walkVespucciE" speed={1.2} color="#00FFFF" phase={0.55} />
<Pedestrian id="ped-2" pathId="walkVespucciW" speed={1.8} color="#FFD700" phase={0.25} />
<Pedestrian id="ped-3" pathId="walkVespucciW" speed={1.3} color="#FF4500" phase={0.75} />
<Pedestrian id="ped-4" pathId="walkOceanW" speed={1.4} color="#98FB98" phase={0.15} />
<Pedestrian id="ped-5" pathId="walkOceanW" speed={1.6} color="#DDA0DD" phase={0.65} />
<Pedestrian id="ped-6" pathId="walkOceanE" speed={1.2} color="#FFA07A" phase={0.35} />
<Pedestrian id="ped-7" pathId="walkOceanE" speed={1.5} color="#87CEEB" phase={0.85} />
```

- [ ] **Step 5: Em `City.jsx` — render novo e adereços reposicionados**

No lugar dos planos/ruas/colisores removidos, dentro do `<group>` principal:

```jsx
      {/* ── ILHAS (contornos orgânicos) ── */}
      <Island points={ISLAND_SHAPES[0].points} color="#9A8870" />
      <Island points={ISLAND_SHAPES[1].points} color="#C8B478" />
      <Beach />

      {/* ── RUAS (ribbons das polilinhas) ── */}
      {ROAD_PATHS.filter(r => !r.hidden).map(r => <RoadPath key={r.id} path={r} />)}

      {/* ── COLISORES DA COSTA (com aberturas nas pontes) ── */}
      <CoastColliders points={ISLAND_SHAPES[0].points} />
      <CoastColliders points={ISLAND_SHAPES[1].points} />
```

Substituir as listas de adereços por coordenadas alinhadas com as ruas novas:

```jsx
const PALMS = [
  // Ocean Drive — lado praia
  [84, -120], [86, -80], [78, -40], [88, 0], [80, 40], [90, 85], [82, 125],
  // Ocean Drive — lado hotéis
  [46, -125], [42, -85], [46, -45], [50, -5], [44, 40], [48, 90], [42, 130],
  // Vespucci — lado este
  [-58, -150], [-52, -95], [-64, -40], [-55, 15], [-66, 70], [-52, 125], [-60, 165],
  // Vespucci — lado oeste
  [-95, -140], [-88, -85], [-100, -30], [-92, 25], [-104, 80], [-88, 135],
  // Praia
  [150, -110], [145, -60], [152, -10], [147, 45], [154, 95], [142, 130],
].map(([x, z]) => [x, 0, z]);

const STREETLIGHTS = [
  [-60, -120], [-60, -10], [-62, 100], [-96, -60], [-96, 55],
  [46, -100], [46, 10], [48, 110], [84, -60], [84, 60],
  [-150, -30], [-152, 80], [-14, 8], [14, -8],
];
```

Guarda-sóis: `[[142, -95], [150, -40], [140, 10], [148, 65], [144, 120]]` (mesmo formato/cores atuais).
Guardas das pontes: 4 caixas `[64, 0.6, 0.6]` em `[0, 0.3, -8.2]`, `[0, 0.3, 8.2]`, `[0, 0.3, -108.2]`, `[0, 0.3, -91.8]`.
Luzes de cruzamento (pointLights): posições novas `[-75, 6, 8]`, `[-78, 6, -8]`, `[65, 6, 6]`, `[60, 6, -8]` (mesmas cores/intensidades atuais).
NEON_SIGNS: manter, exceto os 2 primeiros valores de posição dos letreiros de downtown virados a Vespucci: `[-94.8, 34, -42]` e `[-88.8, 30, 52]` → ajustar para `[-94.8, 34, -42]` e `[-92.8, 30, 54]` (acompanham os edifícios movidos).

`{BUILDINGS.map(...)}` continua igual (importa de `./map` agora).

- [ ] **Step 6: Em `HUD.jsx` — radar com formas reais**

Trocar o import `from './City'` por:
```jsx
import { BUILDINGS, ROAD_PATHS, ISLAND_SHAPES, BEACH_SHAPE } from './map';
```

Adicionar junto ao `fillWorldRect`:
```jsx
// Polígono fechado em coordenadas de mundo
function fillWorldPoly(ctx, toR, points) {
  ctx.beginPath();
  points.forEach(([wx, wz], i) => {
    const p = toR(wx, wz);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
}

// Polilinha com espessura (ruas)
function strokeWorldPath(ctx, toR, points, width) {
  ctx.beginPath();
  points.forEach(([wx, wz], i) => {
    const p = toR(wx, wz);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.lineWidth = Math.max(1.5, width * RADAR_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
```

Em `drawRadar`, substituir os blocos "Ilhas" e "Ruas e pontes" por:
```jsx
  // Ilhas (terra) — contornos reais
  ctx.fillStyle = '#1C261C';
  ISLAND_SHAPES.forEach(isl => fillWorldPoly(ctx, toR, isl.points));

  // Praia
  ctx.fillStyle = '#5A4E2E';
  fillWorldPoly(ctx, toR, BEACH_SHAPE.points);

  // Ruas e pontes — polilinhas com espessura
  ctx.strokeStyle = '#33475C';
  ROAD_PATHS.forEach(r => {
    if (r.hidden) return;
    strokeWorldPath(ctx, toR, r.points, r.width);
  });
```
(O bloco dos quarteirões/`BUILDINGS` com `fillWorldRect` mantém-se, agora a ler de `./map`.)

- [ ] **Step 7: Verificar build + teste manual**

Run: `npm run build` → `✓ built`. Manual (`npm run dev`): ilhas curvas com falésia, ruas com curvas/passeios/tracejado, praia em arco, radar coerente com o mundo, colisão na costa (não entras na água) mas pontes atravessáveis, pedestres nos passeios. (NPCs ainda nas rotas retas antigas — esperado até à Task 3.)

- [ ] **Step 8: Commit**

```bash
git add src/components/gta/City.jsx src/components/gta/HUD.jsx
git commit -m "feat(gta): mundo 3D organico e radar com formas reais"
```

---

### Task 3: Tráfego por waypoints (NPCCar + GameCanvas)

**Files:**
- Modify: `src/components/gta/NPCCar.jsx`
- Modify: `src/components/gta/GameCanvas.jsx`
- Modify: `src/components/gta/PlayerCar.jsx` (só a posição/rotação inicial)
- Modify: `src/components/gta/CombatSystem.jsx` (só o 3º AMMO_SPOT)

**Interfaces:**
- Consumes: `getPath(id)`, `pointAt(path, s)` de `./map`.
- Produces: `NPCCar({ id, pathId, lane = 0, speed, color, phase, posRef })`. Toda a lógica de registry/morte/jack/radar mantém o contrato atual.

- [ ] **Step 1: Em `NPCCar.jsx` — waypoints**

Substituir imports/assinatura/movimento (a lógica de jack/morte/chamas/visual do carro NÃO muda — apenas o movimento):

```jsx
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
    // (direita de forward=(sinψ,cosψ) é (-cosψ, +sinψ))
    const side = lane * dir.current;
    const x = pt.x - Math.cos(pt.yaw) * side;
    const z = pt.z + Math.sin(pt.yaw) * side;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = yaw;
    // Registry (combate) + radar
    entity.x = x;
    entity.z = z;
    entity.ry = yaw;
    if (posRef) { posRef.x = x; posRef.z = z; }
  });

  const bodyColor = burnt ? '#1A1A1A' : color;
  // ... JSX do carro: MANTER exatamente o atual (corpo, cabine, vidros, rodas,
  // faróis, luzes traseiras, chamas/fumo quando burnt)
}
```

- [ ] **Step 2: Em `GameCanvas.jsx` — NPC_DATA novo**

Substituir o array `NPC_DATA` e o `.map` de render:

```jsx
// Tráfego NPC — cada carro segue uma rua do map.js (lane = offset lateral)
const NPC_DATA = [
  { pathId: 'vespucci',   lane: 3.5, speed: 12, color: '#FFD700', phase: 0.00 },
  { pathId: 'vespucci',   lane: 3.5, speed: 10, color: '#DC143C', phase: 0.50 },
  { pathId: 'coastal',    lane: 3.0, speed:  9, color: '#8B008B', phase: 0.40 },
  { pathId: 'mainWest',   lane: 3.0, speed: 11, color: '#4169E1', phase: 0.30 },
  { pathId: 'diagonal',   lane: 2.8, speed: 10, color: '#228B22', phase: 0.70 },
  { pathId: 'oceanDrive', lane: 3.2, speed: 11, color: '#FF8C00', phase: 0.20 },
  { pathId: 'oceanDrive', lane: 3.2, speed:  8, color: '#9400D3', phase: 0.60 },
  { pathId: 'mainEast',   lane: 2.8, speed: 10, color: '#008B8B', phase: 0.10 },
  { pathId: 'crossing',   lane: 3.0, speed: 13, color: '#B8860B', phase: 0.80 },
];
```

```jsx
          {NPC_DATA.map((n, i) => (
            <NPCCar
              key={i}
              id={`npc-${i}`}
              pathId={n.pathId} lane={n.lane}
              speed={n.speed} color={n.color} phase={n.phase}
              posRef={npcPosArr.current[i]}
            />
          ))}
```

- [ ] **Step 3: Ajustes de posições de gameplay ao mapa novo**

Em `PlayerCar.jsx`, no `<RigidBody>`, alinhar o spawn com a mainWest (que passa em `[-80, 6]`), virado a este (frente do carro = -z local, logo yaw -π/2 ⇒ frente = +x):

```jsx
      position={[-80, 1, 6]}
      rotation={[0, -Math.PI / 2, 0]}
```

Em `CombatSystem.jsx`, o 3º `AMMO_SPOTS` ficava dentro do edifício novo em `[-148, 0, 42]` — mover:

```js
const AMMO_SPOTS = [
  { x: -80, z: -60 },
  { x: 62, z: 80 },
  { x: -160, z: 30 },
];
```

- [ ] **Step 4: Verificar build + teste manual completo**

Run: `npm run build` → `✓ built`. Manual: NPCs acompanham as curvas (yaw a rodar suavemente), faixas separadas nos dois sentidos (mão direita), carro `crossing` atravessa a ponte, jogador nasce sobre a mainWest virado à ponte, radar com blips coerentes, disparar num NPC em curva funciona, carjacking funciona, conduzir/atropelar intacto, 3 caixas de munição acessíveis.

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/NPCCar.jsx src/components/gta/GameCanvas.jsx src/components/gta/PlayerCar.jsx src/components/gta/CombatSystem.jsx
git commit -m "feat(gta): trafego por waypoints ao longo das ruas curvas"
```
