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
