# GTA Visual v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estradas texturadas com marcações, praia com transição em camadas para o mar, e mais detalhe urbano — pagos por otimizações (palmeiras instanciadas, sombras/dpr afinados) para o FPS melhorar, não piorar.

**Architecture:** Texturas procedurais em canvas partilhadas (padrão já existente em `City.jsx`), num novo módulo `textures.js`; helpers de geometria puros extraídos para `geometry.js` (testáveis); dados novos do mapa (`INTERSECTIONS`, `WATERLINE`, `CROSSWALKS`) em `map.js`. `City.jsx` só compõe.

**Tech Stack:** React 19, @react-three/fiber 9, three 0.185, @react-three/rapier, vitest.

## Global Constraints

- **NUNCA importar `textures.js` ou `City.jsx` em testes** — usam `document.createElement('canvas').getContext('2d')`, que devolve `null` em jsdom sem o pacote `canvas`. Testes só importam `geometry.js` e `map.js` (puros).
- Adereços novos NÃO têm colisores nem `castShadow` (orçamento de FPS).
- Convenção UV dos ribbons: `u ∈ [0,1]` transversal, `v` = distância acumulada em **unidades de mundo**; escala do padrão controla-se com `texture.repeat.y = 1/período`.
- Camadas Y (evitar z-fighting): ilha 0.02, praia 0.035, asfalto 0.03, remendo de cruzamento 0.042, areia molhada 0.045, espuma 0.05, passadeira 0.055, água rasa 0.012, topo do passeio 0.14 (`SIDEWALK_H`).
- Comandos: `npm test` (vitest run), `npm run build`, `npm run dev`.
- Commits pequenos por task, mensagens `feat(gta):`/`refactor(gta):`/`perf(gta):`, terminadas com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Extrair `geometry.js` com UVs no ribbon

**Files:**
- Create: `src/components/gta/geometry.js`
- Modify: `src/components/gta/City.jsx:8-57` (remover helpers locais, importar)
- Test: `src/tests/geometry.test.js`

**Interfaces:**
- Produces: `perpAt(points, i) → [px, pz]`, `offsetPolyline(points, offset) → points`, `shapeFromPoints(points) → THREE.Shape`, `makeRibbonGeometry(points, width) → THREE.BufferGeometry` (agora com atributo `uv`), `export const SIDEWALK_H = 0.14`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// src/tests/geometry.test.js
import { describe, it, expect } from 'vitest';
import { makeRibbonGeometry, offsetPolyline, SIDEWALK_H } from '../components/gta/geometry';

describe('makeRibbonGeometry', () => {
  it('gera UVs: u alterna 0/1 nas bordas, v acumula distância de mundo', () => {
    const g = makeRibbonGeometry([[0, 0], [10, 0], [30, 0]], 2);
    const uv = g.getAttribute('uv');
    expect(uv).toBeDefined();
    // 3 pontos × 2 vértices
    expect(uv.count).toBe(6);
    // u: borda esquerda 0, direita 1
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(1)).toBe(1);
    // v em unidades de mundo: 0, 0, 10, 10, 30, 30
    expect(uv.getY(0)).toBe(0);
    expect(uv.getY(2)).toBe(10);
    expect(uv.getY(4)).toBe(30);
  });

  it('mantém a posição dos vértices nas bordas da fita', () => {
    const g = makeRibbonGeometry([[0, 0], [10, 0]], 4);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(4);
    // direção +x ⇒ perpendicular (0,1): bordas em z=+2 e z=-2
    expect(pos.getZ(0)).toBeCloseTo(2);
    expect(pos.getZ(1)).toBeCloseTo(-2);
  });
});

describe('offsetPolyline', () => {
  it('desloca lateralmente segundo a perpendicular', () => {
    const out = offsetPolyline([[0, 0], [10, 0]], 3);
    expect(out[0][1]).toBeCloseTo(3);
    expect(out[1][1]).toBeCloseTo(3);
  });
});

describe('SIDEWALK_H', () => {
  it('é 0.14', () => expect(SIDEWALK_H).toBe(0.14));
});
```

- [ ] **Step 2: Correr o teste e ver falhar**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../components/gta/geometry"`

- [ ] **Step 3: Criar `src/components/gta/geometry.js`**

Mover de `City.jsx` as funções `perpAt`, `makeRibbonGeometry`, `offsetPolyline`, `shapeFromPoints` (linhas 9–57) **sem alterar a lógica**, acrescentando UVs ao ribbon e a constante `SIDEWALK_H`:

```js
// src/components/gta/geometry.js
import * as THREE from 'three';

// Altura do topo dos passeios (partilhada com Pedestrian e adereços)
export const SIDEWALK_H = 0.14;

// ─── Geometria "ribbon" ao longo de uma polilinha (para ruas/passeios) ───────
export function perpAt(points, i) {
  const n = points.length;
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(n - 1, i + 1)];
  let dx = next[0] - prev[0];
  let dz = next[1] - prev[1];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  return [-dz, dx]; // perpendicular à esquerda
}

// UVs: u ∈ {0,1} nas bordas; v = distância acumulada em unidades de mundo
// (a escala do padrão faz-se com texture.repeat.y = 1/período)
export function makeRibbonGeometry(points, width) {
  const half = width / 2;
  const verts = [];
  const uvs = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      dist += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    const [x, z] = points[i];
    const [px, pz] = perpAt(points, i);
    verts.push(x + px * half, 0, z + pz * half);
    verts.push(x - px * half, 0, z - pz * half);
    uvs.push(0, dist, 1, dist);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Polilinha deslocada lateralmente (para os passeios)
export function offsetPolyline(points, offset) {
  return points.map(([x, z], i) => {
    const [px, pz] = perpAt(points, i);
    return [x + px * offset, z + pz * offset];
  });
}

// Shape 2D → mundo: Vector2(x, -z) + rotation [-π/2,0,0] ⇒ ponto (x, 0, z)
export function shapeFromPoints(points) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) s.moveTo(x, -z); else s.lineTo(x, -z);
  });
  s.closePath();
  return s;
}
```

Em `City.jsx`: apagar as definições locais de `perpAt`, `makeRibbonGeometry`, `offsetPolyline`, `shapeFromPoints` (linhas 8–57) e acrescentar ao topo:

```js
import { perpAt, makeRibbonGeometry, offsetPolyline, shapeFromPoints, SIDEWALK_H } from './geometry';
```

(`makeDashesGeometry` fica em `City.jsx` por agora — morre na Task 5.)

- [ ] **Step 4: Testes verdes + build**

Run: `npm test` → PASS (todos, incluindo os 3 novos)
Run: `npm run build` → sucesso (confirma que City.jsx compila com os imports)

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/geometry.js src/components/gta/City.jsx src/tests/geometry.test.js
git commit -m "refactor(gta): extrai geometry.js com UVs no ribbon (u transversal, v em unidades de mundo)"
```

---

### Task 2: `makeSidewalkGeometry` — passeio elevado com lancil

**Files:**
- Modify: `src/components/gta/geometry.js`
- Test: `src/tests/geometry.test.js`

**Interfaces:**
- Consumes: `perpAt`, `SIDEWALK_H` (Task 1).
- Produces: `makeSidewalkGeometry(points, width, curbSide, height = SIDEWALK_H) → THREE.BufferGeometry` — topo plano a `y=height` + face vertical de lancil na borda `curbSide` (`'left'` = borda +perpendicular, `'right'` = borda −perpendicular). UVs: topo `u ∈ [0, 0.8]`, lancil `u ∈ [0.8, 1]`, `v` em unidades de mundo.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/tests/geometry.test.js`:

```js
import { makeSidewalkGeometry } from '../components/gta/geometry';

describe('makeSidewalkGeometry', () => {
  // direção +x ⇒ perpendicular esquerda (0,1): borda 'left' em z=+2, 'right' em z=-2
  it('topo a SIDEWALK_H e base do lancil a 0', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'right');
    const pos = g.getAttribute('position');
    let maxY = -Infinity, minY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      maxY = Math.max(maxY, pos.getY(i));
      minY = Math.min(minY, pos.getY(i));
    }
    expect(maxY).toBeCloseTo(0.14);
    expect(minY).toBeCloseTo(0);
  });

  it('o lancil fica na borda pedida', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'right');
    const pos = g.getAttribute('position');
    // vértices da base (y=0) têm de estar todos na borda direita (z=-2)
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) < 1e-6) expect(pos.getZ(i)).toBeCloseTo(-2);
    }
  });

  it('2 pontos ⇒ 8 vértices (2 topo + 2 lancil por ponto)', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'left');
    expect(g.getAttribute('position').count).toBe(8);
  });
});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npm test`
Expected: FAIL — `makeSidewalkGeometry` não exportado.

- [ ] **Step 3: Implementar em `geometry.js`**

```js
// Passeio elevado: topo plano a `height` + face vertical de lancil do lado da
// rua. curbSide: 'left' = borda +perp, 'right' = borda −perp.
// UVs: topo u∈[0,0.8], lancil u∈[0.8,1], v em unidades de mundo.
export function makeSidewalkGeometry(points, width, curbSide, height = SIDEWALK_H) {
  const half = width / 2;
  const sign = curbSide === 'left' ? 1 : -1;
  const verts = [];
  const uvs = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      dist += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    const [x, z] = points[i];
    const [px, pz] = perpAt(points, i);
    // topo (bordas esquerda e direita)
    verts.push(x + px * half, height, z + pz * half);
    verts.push(x - px * half, height, z - pz * half);
    // lancil (topo e base, na borda do lado da rua)
    verts.push(x + sign * px * half, height, z + sign * pz * half);
    verts.push(x + sign * px * half, 0, z + sign * pz * half);
    uvs.push(0, dist, 0.8, dist, 0.8, dist, 1, dist);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 4, b = a + 1, c = a + 4, d = a + 5;
    idx.push(a, b, c, b, d, c);           // topo
    const e = i * 4 + 2, f = i * 4 + 3, g2 = e + 4, h = f + 4;
    idx.push(e, f, g2, f, h, g2);         // lancil
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
```

- [ ] **Step 4: Testes verdes**

Run: `npm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/geometry.js src/tests/geometry.test.js
git commit -m "feat(gta): makeSidewalkGeometry — passeio elevado com face de lancil"
```

---

### Task 3: Dados novos em `map.js` — INTERSECTIONS, WATERLINE, CROSSWALKS

**Files:**
- Modify: `src/components/gta/map.js` (acrescentar no fim, depois de `BRIDGE_OPENINGS`)
- Test: `src/tests/map.test.js` (novo)

**Interfaces:**
- Consumes: `ROAD_PATHS`, `smooth` (privado do módulo).
- Produces: `computeIntersections(paths) → [{ pos: [x,z], r }]`; `export const INTERSECTIONS` (ruas visíveis); `export const WATERLINE` (polilinha `[[x,z],…]` da borda marítima da praia); `export const CROSSWALKS = [{ pos: [x,z], yaw, w }]`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// src/tests/map.test.js
import { describe, it, expect } from 'vitest';
import { INTERSECTIONS, WATERLINE, CROSSWALKS } from '../components/gta/map';

describe('INTERSECTIONS', () => {
  it('encontra os cruzamentos das pontes', () => {
    const near = (x, z) =>
      INTERSECTIONS.some(it => Math.hypot(it.pos[0] - x, it.pos[1] - z) < 8);
    expect(near(-32, 0)).toBe(true);
    expect(near(32, 0)).toBe(true);
    expect(near(-32, -100)).toBe(true);
    expect(near(32, -100)).toBe(true);
  });

  it('todos dentro do mapa, com raio razoável, sem duplicados próximos', () => {
    expect(INTERSECTIONS.length).toBeGreaterThanOrEqual(4);
    for (const it of INTERSECTIONS) {
      expect(Math.abs(it.pos[0])).toBeLessThan(200);
      expect(Math.abs(it.pos[1])).toBeLessThan(200);
      expect(it.r).toBeGreaterThanOrEqual(5);
      expect(it.r).toBeLessThanOrEqual(15);
    }
    for (let i = 0; i < INTERSECTIONS.length; i++)
      for (let j = i + 1; j < INTERSECTIONS.length; j++) {
        const [a, b] = [INTERSECTIONS[i], INTERSECTIONS[j]];
        expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])).toBeGreaterThanOrEqual(12);
      }
  });
});

describe('WATERLINE', () => {
  it('percorre a borda marítima da praia (este, x≈127–190)', () => {
    expect(WATERLINE.length).toBeGreaterThanOrEqual(8);
    for (const [x, z] of WATERLINE) {
      expect(x).toBeGreaterThan(120);
      expect(x).toBeLessThan(190);
      expect(z).toBeGreaterThan(-150);
      expect(z).toBeLessThan(155);
    }
  });
});

describe('CROSSWALKS', () => {
  it('4 passadeiras nas pontes, dentro do asfalto reto (|x| ≤ 30)', () => {
    expect(CROSSWALKS).toHaveLength(4);
    for (const c of CROSSWALKS) {
      expect(Math.abs(c.pos[0])).toBeLessThanOrEqual(30);
      expect([0, -100]).toContain(c.pos[1]);
      expect(c.w).toBeGreaterThanOrEqual(11);
    }
  });
});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npm test`
Expected: FAIL — `INTERSECTIONS` não exportado.

- [ ] **Step 3: Implementar em `map.js`** (acrescentar depois de `BRIDGE_OPENINGS`)

```js
// ─── Interseções entre ruas (numérico, sobre as polilinhas suavizadas) ───────
function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

export function computeIntersections(paths) {
  const found = [];
  for (let a = 0; a < paths.length; a++) {
    for (let b = a + 1; b < paths.length; b++) {
      const A = paths[a], B = paths[b];
      for (let i = 0; i < A.points.length - 1; i++) {
        for (let j = 0; j < B.points.length - 1; j++) {
          const hit = segIntersect(A.points[i], A.points[i + 1], B.points[j], B.points[j + 1]);
          if (!hit) continue;
          const r = Math.min(15, Math.max(A.width, B.width) / 2 + 3);
          // junções em T/estrelas partilham ponto — funde com a mais próxima
          const near = found.find(f => Math.hypot(f.pos[0] - hit[0], f.pos[1] - hit[1]) < 12);
          if (near) near.r = Math.max(near.r, r);
          else found.push({ pos: hit, r });
        }
      }
    }
  }
  return found;
}

export const INTERSECTIONS = computeIntersections(ROAD_PATHS.filter(p => !p.hidden));

// ─── Linha de água da praia (arco exterior de BEACH_SHAPE, lado do mar) ──────
export const WATERLINE = smooth([
  [138, -138], [160, -115], [172, -70], [178, -20], [175, 35], [166, 85],
  [152, 125], [136, 145],
], false);

// ─── Passadeiras (nos troços retos das pontes; yaw alinha a largura à rua) ───
export const CROSSWALKS = [
  { pos: [-26, 0],    yaw: Math.PI / 2, w: 13 },
  { pos: [26, 0],     yaw: Math.PI / 2, w: 13 },
  { pos: [-26, -100], yaw: Math.PI / 2, w: 11 },
  { pos: [26, -100],  yaw: Math.PI / 2, w: 11 },
];
```

- [ ] **Step 4: Testes verdes**

Run: `npm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/map.js src/tests/map.test.js
git commit -m "feat(gta): map.js — intersecoes numericas, linha de agua da praia e passadeiras"
```

---

### Task 4: `textures.js` — todas as texturas procedurais

**Files:**
- Create: `src/components/gta/textures.js`
- Modify: `src/components/gta/City.jsx` (remover `makeWindowTexture`/`makeWaveTexture` locais, importar)

**Interfaces:**
- Produces (instâncias partilhadas, prontas a usar): `WINDOW_TEX`, `WAVE_TEX` (movidas de City.jsx, mesmo comportamento), `ROAD_TEX` (asfalto + linhas brancas laterais + tracejado amarelo central; `repeat.y = 1/8` ⇒ período do tracejado 8u), `ASPHALT_TEX` (asfalto liso p/ remendos, `repeat 2.5×2.5`), `CROSSWALK_TEX` (barras brancas, clamp), `CONCRETE_TEX` (betão com junta, `repeat.y = 1/4` ⇒ junta a cada 4u), `SAND_TEX` (grão de areia, `repeat 1/8`), `FOAM_TEX` (espuma, transparente), `ROUGH_TEX` (ruído p/ roughnessMap das fachadas).
- **Não importável em testes** (usa canvas 2D — ver Global Constraints).

- [ ] **Step 1: Criar `src/components/gta/textures.js`**

```js
// src/components/gta/textures.js
// Texturas procedurais partilhadas (canvas). NÃO importar em testes — jsdom
// não tem canvas 2D e getContext('2d') devolve null.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function paintAsphalt(g, w, h) {
  g.fillStyle = '#141416';
  g.fillRect(0, 0, w, h);
  // grão
  for (let i = 0; i < 1500; i++) {
    const v = 18 + Math.random() * 30;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  // manchas de desgaste/óleo
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(90,90,95,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Corte transversal completo da estrada: linhas brancas nas bordas (u≈0/1),
// asfalto no meio, tracejado amarelo central (período = metade da altura).
// uv.v está em unidades de mundo ⇒ repeat.y = 1/8 dá tracejado com período 8u.
export const ROAD_TEX = canvasTexture(256, 256, (g, w, h) => {
  paintAsphalt(g, w, h);
  g.fillStyle = 'rgba(230,228,220,0.9)';
  g.fillRect(3, 0, 5, h);
  g.fillRect(w - 8, 0, 5, h);
  g.fillStyle = '#E8C020';
  g.fillRect(w / 2 - 3, 0, 6, h / 2);
});
ROAD_TEX.repeat.set(1, 1 / 8);

// Asfalto liso para os remendos dos cruzamentos (quads ~17–22u)
export const ASPHALT_TEX = canvasTexture(128, 128, paintAsphalt);
ASPHALT_TEX.repeat.set(2.5, 2.5);

// Barras brancas de passadeira (quad esticado, sem repeat)
export const CROSSWALK_TEX = canvasTexture(128, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(235,232,225,0.85)';
  for (let x = 4; x < w; x += 16) g.fillRect(x, 4, 8, h - 8);
});
CROSSWALK_TEX.wrapS = THREE.ClampToEdgeWrapping;
CROSSWALK_TEX.wrapT = THREE.ClampToEdgeWrapping;

// Betão dos passeios com junta de dilatação transversal (junta a cada 4u)
export const CONCRETE_TEX = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#B4A88F';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v - 8},${v - 30},0.35)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = 'rgba(60,55,45,0.55)';
  g.fillRect(0, 0, w, 3);
});
CONCRETE_TEX.repeat.set(1, 1 / 4);

// Grão de areia em dois tons (UVs da ShapeGeometry em unidades de mundo)
export const SAND_TEX = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#E2CC78';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(200,170,90,0.45)' : 'rgba(245,225,160,0.45)';
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
});
SAND_TEX.repeat.set(1 / 8, 1 / 8);

// Espuma da rebentação (transparente; animada por offset + pulso de opacidade)
export const FOAM_TEX = canvasTexture(128, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * w;
    const y = h / 2 + (Math.random() - 0.5) * h * 0.8;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
});
FOAM_TEX.repeat.set(1, 1 / 6);

// Ruído para roughnessMap das fachadas (tira o ar de plástico)
export const ROUGH_TEX = canvasTexture(64, 64, (g, w, h) => {
  g.fillStyle = '#B4B4B4';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) {
    const v = 120 + Math.random() * 100;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
});
```

Depois, **mover** `makeWindowTexture` (City.jsx:205-237) e `makeWaveTexture` (City.jsx:240-264) para o fim de `textures.js` tal como estão, mudando as duas constantes para exports:

```js
export const WINDOW_TEX = makeWindowTexture();
export const WAVE_TEX = makeWaveTexture();
```

Em `City.jsx`: apagar as duas funções e as constantes locais, e importar:

```js
import { WINDOW_TEX, WAVE_TEX, ROAD_TEX, ASPHALT_TEX, CROSSWALK_TEX, CONCRETE_TEX, SAND_TEX, FOAM_TEX, ROUGH_TEX } from './textures';
```

(Os exports ainda não usados por City ficam a postos para as Tasks 5–10; se o oxlint reclamar de imports não usados, importar por agora só `WINDOW_TEX, WAVE_TEX` e alargar o import nas tasks seguintes.)

- [ ] **Step 2: Verificar**

Run: `npm test` → PASS (nenhum teste importa textures.js)
Run: `npm run build` → sucesso
Run: `npm run lint` → sem warnings novos

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/textures.js src/components/gta/City.jsx
git commit -m "feat(gta): textures.js — texturas procedurais de estrada, betao, areia e espuma"
```

---

### Task 5: RoadPath v2 — estrada texturada + cruzamentos limpos

**Files:**
- Modify: `src/components/gta/City.jsx` (`RoadPath`, remover `makeDashesGeometry`, novo `IntersectionPatches`)

**Interfaces:**
- Consumes: `makeRibbonGeometry` (Task 1), `ROAD_TEX`/`ASPHALT_TEX`/`CROSSWALK_TEX` (Task 4), `INTERSECTIONS`/`CROSSWALKS` (Task 3 — acrescentar ao import de `./map`).

- [ ] **Step 1: Substituir `RoadPath` e apagar `makeDashesGeometry`**

Apagar a função `makeDashesGeometry` inteira e substituir `RoadPath` por (os passeios continuam como estão até à Task 6 — manter `sideL`/`sideR` planos):

```jsx
function RoadPath({ path }) {
  const asphalt = useMemo(() => makeRibbonGeometry(path.points, path.width), [path]);
  const sideL = useMemo(
    () => makeRibbonGeometry(offsetPolyline(path.points, path.width / 2 + 2.5), 4), [path]);
  const sideR = useMemo(
    () => makeRibbonGeometry(offsetPolyline(path.points, -(path.width / 2 + 2.5)), 4), [path]);
  return (
    <group>
      {/* Asfalto com marcações embutidas na textura (linhas laterais + tracejado) */}
      <mesh geometry={asphalt} position={[0, 0.03, 0]}>
        <meshStandardMaterial map={ROAD_TEX} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sideL} position={[0, 0.045, 0]}>
        <meshStandardMaterial color="#B8A890" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sideR} position={[0, 0.045, 0]}>
        <meshStandardMaterial color="#B8A890" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Novo componente `IntersectionPatches`**

Adicionar a `City.jsx` (junto dos outros componentes) e importar `INTERSECTIONS, CROSSWALKS` de `./map`:

```jsx
// Remendos lisos sobre os cruzamentos (escondem marcações sobrepostas)
// + passadeiras nas entradas das pontes
function IntersectionPatches() {
  return (
    <group>
      {INTERSECTIONS.map((it, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[it.pos[0], 0.042, it.pos[1]]}>
          <circleGeometry args={[it.r, 20]} />
          <meshStandardMaterial map={ASPHALT_TEX} roughness={0.92} />
        </mesh>
      ))}
      {CROSSWALKS.map((c, i) => (
        <mesh key={`cw${i}`} position={[c.pos[0], 0.055, c.pos[1]]}
              rotation={[-Math.PI / 2, 0, c.yaw]}>
          <planeGeometry args={[c.w, 3.5]} />
          <meshStandardMaterial map={CROSSWALK_TEX} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
```

E no JSX de `City`, logo a seguir ao bloco das ruas:

```jsx
{/* ── CRUZAMENTOS: remendos + passadeiras ── */}
<IntersectionPatches />
```

- [ ] **Step 3: Verificar**

Run: `npm test` → PASS; `npm run build` → sucesso.
Run: `npm run dev` e abrir o jogo: as ruas têm grão, linhas brancas nas bordas e tracejado amarelo com período ~8u; nos cruzamentos não há tracejados sobrepostos; 4 passadeiras nas pontes com as barras ATRAVESSADAS na rua (se as barras ficarem ao comprido, trocar `c.yaw` por `c.yaw + Math.PI / 2` na rotação).

- [ ] **Step 4: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "feat(gta): estradas com textura unica (marcacoes embutidas) e cruzamentos limpos"
```

---

### Task 6: Passeios com lancil + pedestres à altura certa

**Files:**
- Modify: `src/components/gta/City.jsx` (`RoadPath` e `Pedestrian`)

**Interfaces:**
- Consumes: `makeSidewalkGeometry`, `SIDEWALK_H` (Tasks 1–2), `CONCRETE_TEX` (Task 4).

- [ ] **Step 1: Trocar as bermas planas por passeios com lancil**

Em `RoadPath`, substituir `sideL`/`sideR` e os seus meshes:

```jsx
function RoadPath({ path }) {
  const asphalt = useMemo(() => makeRibbonGeometry(path.points, path.width), [path]);
  // offset + ⇒ passeio à esquerda ⇒ lancil na borda direita (lado da rua), e vice-versa
  const walkL = useMemo(
    () => makeSidewalkGeometry(offsetPolyline(path.points, path.width / 2 + 2.5), 4, 'right'), [path]);
  const walkR = useMemo(
    () => makeSidewalkGeometry(offsetPolyline(path.points, -(path.width / 2 + 2.5)), 4, 'left'), [path]);
  return (
    <group>
      <mesh geometry={asphalt} position={[0, 0.03, 0]}>
        <meshStandardMaterial map={ROAD_TEX} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={walkL}>
        <meshStandardMaterial map={CONCRETE_TEX} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={walkR}>
        <meshStandardMaterial map={CONCRETE_TEX} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Pedestres a andar em cima do passeio**

Em `Pedestrian`, na linha `ref.current.position.set(pt.x, 0, pt.z);` trocar para:

```js
ref.current.position.set(pt.x, SIDEWALK_H, pt.z);
```

- [ ] **Step 3: Verificar**

Run: `npm test` → PASS; `npm run build` → sucesso.
No browser: passeios elevados com face de lancil visível do lado da rua; pedestres não enterram os pés; o carro consegue subir o passeio (sem colisor).

- [ ] **Step 4: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "feat(gta): passeios elevados com lancil e textura de betao"
```

---

### Task 7: Praia em camadas — areia texturada, areia molhada, espuma animada, água rasa

**Files:**
- Modify: `src/components/gta/City.jsx` (`Beach`, `Ocean`)

**Interfaces:**
- Consumes: `WATERLINE` (Task 3 — acrescentar ao import de `./map`), `SAND_TEX`/`FOAM_TEX` (Task 4), `makeRibbonGeometry`/`offsetPolyline` (Task 1).
- Convenção de lado: com a `WATERLINE` a correr de sul para norte, offset **positivo** desloca para terra (oeste), **negativo** para o mar.

- [ ] **Step 1: Areia com textura**

Substituir o material de `Beach`:

```jsx
function Beach() {
  const shape = useMemo(() => shapeFromPoints(BEACH_SHAPE.points), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial map={SAND_TEX} roughness={1} />
    </mesh>
  );
}
```

- [ ] **Step 2: Camadas da linha de água dentro de `Ocean`**

Substituir `Ocean` por:

```jsx
// Oceano + linha de costa (areia molhada, espuma animada, água rasa).
// Um único useFrame anima o bumpMap do oceano e a espuma.
function Ocean() {
  const matRef = useRef();
  const foamRef = useRef();
  const wetSand = useMemo(() => makeRibbonGeometry(offsetPolyline(WATERLINE, 1.5), 4), []);
  const foam = useMemo(() => makeRibbonGeometry(WATERLINE, 2.5), []);
  const shallow = useMemo(() => makeRibbonGeometry(offsetPolyline(WATERLINE, -3), 7), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (matRef.current && matRef.current.bumpMap) {
      matRef.current.bumpMap.offset.set(t * 0.008, t * 0.012);
    }
    if (foamRef.current) {
      // espuma desliza ao longo da costa e "respira" (avanço/recuo das ondas)
      foamRef.current.map.offset.y = t * 0.05;
      foamRef.current.opacity = 0.55 + Math.sin(t * 0.63) * 0.3;
    }
  });

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[800, 800]} />
        <meshStandardMaterial
          ref={matRef}
          color="#0E4A70"
          roughness={0.15}
          metalness={0.65}
          bumpMap={WAVE_TEX}
          bumpScale={0.6}
        />
      </mesh>
      {/* Areia molhada (lado de terra da linha de água) */}
      <mesh geometry={wetSand} position={[0, 0.045, 0]}>
        <meshStandardMaterial color="#C6A860" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Espuma da rebentação */}
      <mesh geometry={foam} position={[0, 0.05, 0]}>
        <meshStandardMaterial ref={foamRef} map={FOAM_TEX} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Água rasa turquesa (lado do mar) */}
      <mesh geometry={shallow} position={[0, 0.012, 0]}>
        <meshStandardMaterial color="#2EA8A0" transparent opacity={0.55} depthWrite={false} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <CuboidCollider args={[400, 0.1, 400]} position={[0, -0.15, 0]} />
    </RigidBody>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `npm test` → PASS; `npm run build` → sucesso.
No browser, ir à praia: sequência visível terra→mar = areia com grão → faixa escura molhada → espuma branca a pulsar → faixa turquesa → oceano. Se a areia molhada aparecer do lado do MAR, inverter os sinais dos offsets (`1.5 → -1.5`, `-3 → 3`).

- [ ] **Step 4: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "feat(gta): praia em camadas — areia texturada, areia molhada, espuma animada, agua rasa"
```

---

### Task 8: Adereços — praia e rua

**Files:**
- Modify: `src/components/gta/City.jsx` (novos `BeachProps` e `UrbanProps`)

**Interfaces:**
- Consumes: `SIDEWALK_H` (Task 1).

- [ ] **Step 1: Adicionar componentes e dados**

```jsx
// Adereços de praia: toalhas, bolas, pranchas (sem colisores nem sombras)
const TOWELS = [
  { pos: [138, -70], rot: 0.5, color: '#FF6EC7' },
  { pos: [146, -25], rot: -0.3, color: '#00CED1' },
  { pos: [136, 30], rot: 0.9, color: '#FFD700' },
  { pos: [149, 90], rot: 0.2, color: '#87CEEB' },
];
const BALLS = [[141, -52], [139, 55]];
const BOARDS = [
  { pos: [152, -78], rot: 0.4, color: '#FF4500' },
  { pos: [134, 10], rot: -0.6, color: '#00FFFF' },
  { pos: [146, 132], rot: 1.1, color: '#BB44FF' },
];

function BeachProps() {
  return (
    <group>
      {TOWELS.map((t, i) => (
        <mesh key={`t${i}`} rotation={[-Math.PI / 2, 0, t.rot]} position={[t.pos[0], 0.05, t.pos[1]]}>
          <planeGeometry args={[1.1, 2.2]} />
          <meshStandardMaterial color={t.color} roughness={0.9} />
        </mesh>
      ))}
      {BALLS.map(([x, z], i) => (
        <mesh key={`b${i}`} position={[x, 0.35, z]} rotation={[0, i * 1.7, 0.4]}>
          <sphereGeometry args={[0.35, 10, 8]} />
          <meshStandardMaterial color={i % 2 ? '#FF4040' : '#4080FF'} roughness={0.5} />
        </mesh>
      ))}
      {BOARDS.map((b, i) => (
        <mesh key={`s${i}`} position={[b.pos[0], 1.0, b.pos[1]]} rotation={[0.15, b.rot, 0]}>
          <boxGeometry args={[0.55, 2.2, 0.12]} />
          <meshStandardMaterial color={b.color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// Adereços urbanos: hidrantes e caixotes ao longo dos passeios
const HYDRANTS = [[-63, -80], [-63, 40], [51, -60], [51, 60]];
const BINS = [[-63, -30], [-63, 90], [51, -110], [51, 10], [78, 100], [78, -20]];

function UrbanProps() {
  return (
    <group>
      {HYDRANTS.map(([x, z], i) => (
        <group key={`h${i}`} position={[x, SIDEWALK_H, z]}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.16, 0.2, 0.7, 8]} />
            <meshStandardMaterial color="#CC2020" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.16, 8, 6]} />
            <meshStandardMaterial color="#CC2020" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {BINS.map(([x, z], i) => (
        <mesh key={`b${i}`} position={[x, SIDEWALK_H + 0.45, z]}>
          <cylinderGeometry args={[0.35, 0.32, 0.9, 10]} />
          <meshStandardMaterial color="#2E3438" roughness={0.85} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
```

No JSX de `City`, junto ao bloco da praia:

```jsx
<BeachProps />
<UrbanProps />
```

- [ ] **Step 2: Verificar**

Run: `npm run build` → sucesso.
No browser: toalhas/bolas/pranchas na areia SECA (não na água nem na areia molhada — ajustar coordenadas x/z se preciso); hidrantes e caixotes EM CIMA dos passeios, não dentro de fachadas nem no asfalto (ajustar se preciso).

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "feat(gta): aderecos de praia (toalhas, bolas, pranchas) e de rua (hidrantes, caixotes)"
```

---

### Task 9: Palmeiras instanciadas (perf)

**Files:**
- Modify: `src/components/gta/City.jsx` (substituir `Palm` por `Palms` instanciado)

**Interfaces:**
- Consumes: array `PALMS` existente (City.jsx:185-196, formato `[x, 0, z]`).
- Nota do spec: as frondes perdem a alternância de cor por folha — cor única `#159A2A`.

- [ ] **Step 1: Substituir o componente**

Apagar `Palm` e o `{PALMS.map(...)}` do JSX; adicionar:

```jsx
// Todas as palmeiras em 3 InstancedMesh (troncos, frondes, miolos) —
// ~8 meshes/palmeira × 33 → 3 draw calls no total
function Palms() {
  const trunkRef = useRef();
  const frondRef = useRef();
  const coreRef = useRef();

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const frondLocal = new THREE.Matrix4();
    PALMS.forEach((pos, i) => {
      dummy.position.set(pos[0], 5.5, pos[2]);
      dummy.rotation.set(0, 0, 0.04);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, dummy.matrix);

      dummy.position.set(pos[0], 11.15, pos[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      coreRef.current.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + 0.4;
        // reproduz: group(pos topo, rotY=-a) ▸ mesh(pos [1.9,-0.35,0], rotZ=-0.42)
        dummy.position.set(pos[0], 11.1, pos[2]);
        dummy.rotation.set(0, -a, 0);
        dummy.updateMatrix();
        const m = dummy.matrix.clone();
        dummy.position.set(1.9, -0.35, 0);
        dummy.rotation.set(0, 0, -0.42);
        dummy.updateMatrix();
        frondLocal.copy(dummy.matrix);
        m.multiply(frondLocal);
        frondRef.current.setMatrixAt(i * 6 + f, m);
      }
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    frondRef.current.instanceMatrix.needsUpdate = true;
    coreRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, PALMS.length]}>
        <cylinderGeometry args={[0.14, 0.36, 11, 7]} />
        <meshStandardMaterial color="#7A5515" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[undefined, undefined, PALMS.length * 6]}>
        <boxGeometry args={[3.6, 0.07, 1.0]} />
        <meshStandardMaterial color="#159A2A" roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={coreRef} args={[undefined, undefined, PALMS.length]}>
        <sphereGeometry args={[0.45, 6, 5]} />
        <meshStandardMaterial color="#6A4A10" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
```

No JSX: `<Palms />` no lugar do map antigo. Confirmar que `useEffect` está no import de React em City.jsx (`import { useRef, useMemo } from 'react'` → acrescentar `useEffect`).

- [ ] **Step 2: Verificar**

Run: `npm run build` → sucesso.
No browser: palmeiras iguais às de antes (tronco inclinado, 6 frondes a descair, miolo) nos mesmos sítios.

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "perf(gta): palmeiras em 3 InstancedMesh (~260 draw calls a menos)"
```

---

### Task 10: Fachadas sem ar de plástico, oceano afinado, dpr/sombras

**Files:**
- Modify: `src/components/gta/City.jsx` (`Building`, `Ocean`)
- Modify: `src/components/gta/GameCanvas.jsx:190,199`

**Interfaces:**
- Consumes: `ROUGH_TEX` (Task 4).

- [ ] **Step 1: roughnessMap nas fachadas**

Em `Building`, nos DOIS materiais com `emissiveMap` (corpo principal e torre), acrescentar `roughnessMap` e subir a base de roughness (o mapa multiplica: 0.85 × texel ≈ 0.4–0.75):

```jsx
<meshStandardMaterial
  color={color}
  roughness={0.85}
  roughnessMap={ROUGH_TEX}
  metalness={0.08}
  emissiveMap={winTex}
  emissive="#FFCC88"
  emissiveIntensity={1.6}
/>
```

(na torre, igual mas com `emissiveMap={tierTex}`.)

- [ ] **Step 2: Oceano com reflexo do sol mais vivo**

No material do oceano (`Ocean`): `color="#0E5580"`, `roughness={0.12}`, `metalness={0.7}` (resto igual).

- [ ] **Step 3: Orçamento de render em `GameCanvas.jsx`**

Linha 190: `dpr={[1, 1.75]}` → `dpr={[1, 1.5]}`.
Linha 199: `shadow-mapSize-width={2048} shadow-mapSize-height={2048}` → `1024`/`1024`.

- [ ] **Step 4: Verificar**

Run: `npm test` → PASS; `npm run build` → sucesso.
No browser: fachadas com variação de brilho (não uniformes), oceano com reflexo do pôr-do-sol mais marcado, sombras ainda aceitáveis (1024 chega para o estilo low-poly).

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/City.jsx src/components/gta/GameCanvas.jsx
git commit -m "feat(gta): roughnessMap nas fachadas, oceano afinado; perf: dpr 1.5 e sombras 1024"
```

---

### Task 11: Verificação final (visual + FPS)

**Files:** nenhum novo (só ajustes que a verificação pedir).

- [ ] **Step 1: Suite completa + lint + build**

Run: `npm test` → 17+ testes PASS (16 antigos + novos de geometry/map)
Run: `npm run lint` → sem warnings novos
Run: `npm run build` → sucesso

- [ ] **Step 2: Verificação visual no browser** (`npm run dev`)

Percurso de carro: coastal → mainWest → ponte → mainEast → oceanDrive. Confirmar:
- marcações contínuas nas curvas, sem buracos entre asfalto e passeio;
- cruzamentos sem tracejados sobrepostos; passadeiras corretas nas pontes;
- lancil visível; carro sobe o passeio sem ressalto físico (não há colisor).

A pé na praia: camadas terra→mar corretas, espuma a pulsar, adereços na areia seca.

- [ ] **Step 3: Contagem de draw calls**

Na consola do browser (a cena montada), correr uma medição antes/depois usando o commit anterior à Task 9 como referência se necessário — o valor "depois" deve ser **menor** que ~o valor na master anterior a este plano:

```js
// na consola: r3f expõe o renderer em window.__r3f? Não — usar o overlay:
// adicionar TEMPORARIAMENTE em GameCanvas dentro do Canvas:
//   <Perf /> de r3f-perf NÃO está instalado; usar gl.info via onCreated:
// Canvas onCreated={({ gl }) => { window.__gl = gl; }}
// e na consola: __gl.info.render
```

Adicionar temporariamente `onCreated={({ gl }) => { window.__gl = gl; }}` ao `<Canvas>`, ler `__gl.info.render.calls` na consola, registar o número, **remover a linha** antes do commit final.

- [ ] **Step 4: Commit de ajustes finais (se houver)**

```bash
git add -A
git commit -m "fix(gta): ajustes da verificacao visual do mapa v3"
```

---

## Self-Review (feita ao escrever)

- **Cobertura do spec:** §1.1 → Tasks 1, 4, 5; §1.2 → Tasks 3, 5; §1.3 → Tasks 2, 6; §2.1 → Tasks 3, 7; §2.2 → Tasks 4, 7; §2.3 → Task 8; §3 → Tasks 8, 10; §4 → Tasks 5 (menos meshes), 9, 10; §5 → Tasks 1–3 (unit) e 11 (visual). Sem lacunas.
- **Tipos/nomes consistentes:** `makeRibbonGeometry(points, width)`, `makeSidewalkGeometry(points, width, curbSide, height?)`, `SIDEWALK_H`, `INTERSECTIONS[{pos,r}]`, `WATERLINE[[x,z]]`, `CROSSWALKS[{pos,yaw,w}]` — usados igual em todas as tasks.
- **Sem placeholders:** todos os passos têm código/comandos concretos; os pontos de ajuste visual (lados dos offsets, posições de adereços) têm instrução explícita de como corrigir.
