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
  buildPath('walkVespucciW', 0, [[-90, -160], [-80, -115], [-96, -55], [-85, 5], [-96, 60], [-82, 120], [-92, 165]]),
  // Reautorado para passar no corredor entre as fachadas este dos hotéis (x=49) e o asfalto da Ocean Drive
  buildPath('walkOceanW',    0, [[50, -140], [58, -95], [52, -40], [60, 18], [54, 75], [62, 125], [50, 145]]),
  buildPath('walkOceanE',    0, [[68, -140], [80, -95], [72, -38], [82, 20], [74, 78], [85, 125], [68, 145]]),
];

const ALL_PATHS = [...ROAD_PATHS, ...SIDEWALK_PATHS];
export function getPath(id) {
  return ALL_PATHS.find(p => p.id === id);
}

// ─── Aberturas das pontes (a cadeia de colisores da costa salta estes retângulos)
// Alargadas para que nenhum segmento mantido (com sobreposição de len/2+0.5 e
// meia-espessura 0.8) alcance o asfalto das pontes (meia-largura + 1u de folga)
export const BRIDGE_OPENINGS = [
  { minX: -34, maxX: 34, minZ: -13,  maxZ: 13 },
  { minX: -34, maxX: 34, minZ: -112, maxZ: -88 },
];

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
  // Coleciona todos os pontos de colisão sem fusão (descoberta bruta)
  for (let a = 0; a < paths.length; a++) {
    for (let b = a + 1; b < paths.length; b++) {
      const A = paths[a], B = paths[b];
      for (let i = 0; i < A.points.length - 1; i++) {
        for (let j = 0; j < B.points.length - 1; j++) {
          const hit = segIntersect(A.points[i], A.points[i + 1], B.points[j], B.points[j + 1]);
          if (!hit) continue;
          const r = Math.min(15, Math.max(A.width, B.width) / 2 + 3);
          found.push({ pos: hit, r });
        }
      }
    }
  }

  // Clustering estável: fusão iterativa até convergência
  // Elimina dependência da ordem de descoberta. Enquanto existirem dois pontos
  // a < 12u, substituir pelo ponto médio com raio = max(r1, r2).
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < found.length && !changed; i++) {
      for (let j = i + 1; j < found.length && !changed; j++) {
        const dist = Math.hypot(found[i].pos[0] - found[j].pos[0], found[i].pos[1] - found[j].pos[1]);
        if (dist < 12) {
          // Fusão: ponto médio, raio máximo
          const merged = {
            pos: [(found[i].pos[0] + found[j].pos[0]) / 2, (found[i].pos[1] + found[j].pos[1]) / 2],
            r: Math.max(found[i].r, found[j].r)
          };
          found.splice(j, 1);
          found[i] = merged;
          changed = true;
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

// ─── Edifícios (movidos de City.jsx; posições ajustadas às ruas novas) ───────
// Todos os volumes ficam a ≥ meia-largura + 1u do eixo SUAVIZADO de cada rua
// (verificado numericamente pelo mapcheck do review).
export const BUILDINGS = [
  // ── Ilha Oeste: Downtown ──
  { pos: [-108, 0, -42], w: 22, h: 50, d: 20, color: '#F2ECD8' },
  { pos: [-135, 0, -38], w: 20, h: 44, d: 18, color: '#7ECECE' },
  { pos: [-108, 0,  38], w: 22, h: 38, d: 20, color: '#D4B8E0' },
  { pos: [-108, 0,  57], w: 18, h: 46, d: 18, color: '#F0D0B8' },
  { pos: [-148, 0,  42], w: 18, h: 32, d: 16, color: '#80C4D8' },
  { pos: [-144, 0, -60], w: 22, h: 40, d: 20, color: '#EDE0C4' },
  { pos: [-148, 0,  24], w: 18, h: 24, d: 18, color: '#F2ECD8' },
  { pos: [-124, 0, -74], w: 18, h: 26, d: 18, color: '#D4B8E0' },
  { pos: [-107, 0, -128], w: 18, h: 28, d: 18, color: '#80C4D8' },
  { pos: [-118, 0,  122], w: 20, h: 24, d: 20, color: '#7ECECE' },
  // ── Ilha Oeste: Residencial norte ──
  { pos: [-101, 0, -148], w: 20, h: 18, d: 20, color: '#B8D898' },
  { pos: [-126, 0, -147], w: 18, h: 22, d: 18, color: '#F0C8A0' },
  { pos: [-133, 0, -165], w: 22, h: 16, d: 20, color: '#C8D8F0' },
  { pos: [-102, 0, -169], w: 18, h: 14, d: 18, color: '#EDE0C4' },
  // ── Ilha Oeste: Residencial sul ──
  { pos: [-102, 0,  148], w: 20, h: 20, d: 20, color: '#F2ECD8' },
  { pos: [-139, 0,  140], w: 18, h: 16, d: 18, color: '#B8D898' },
  { pos: [-50,  0,  150], w: 20, h: 24, d: 18, color: '#F0C8A0' },
  // ── Ilha Oeste: Porto / industrial ──
  { pos: [-145, 0,  90], w: 26, h: 12, d: 25, color: '#8A8070' },
  { pos: [-144, 0, 120], w: 28, h: 10, d: 20, color: '#7A7060' },
  { pos: [-134, 0, 166], w: 32, h:  8, d: 20, color: '#8A8070' },
  // ── Ilha Este: Hotéis Ocean Drive (coluna recuada para x=40, w=18,
  //    para abrir corredor de passeio entre a fachada este x=49 e o asfalto) ──
  { pos: [40, 0, -118], w: 18, h: 28, d: 22, color: '#E8865A' },
  { pos: [40, 0,  -68], w: 18, h: 34, d: 24, color: '#D4B8E0' },
  { pos: [40, 0,  -18], w: 18, h: 38, d: 20, color: '#7ECECE' },
  { pos: [40, 0,   32], w: 18, h: 30, d: 22, color: '#F2ECD8' },
  { pos: [40, 0,   82], w: 18, h: 34, d: 22, color: '#F0D0B8' },
  { pos: [40, 0,  130], w: 18, h: 28, d: 20, color: '#80C4D8' },
  { pos: [31, 0,   54], w: 16, h: 22, d: 16, color: '#B8D898' },
  { pos: [34, 0,  108], w: 14, h: 16, d: 14, color: '#D4B8E0' },
  // ── Ilha Este: norte ──
  // (o antigo [31,-92] tapava a chegada da ponte norte — recolocado aqui)
  { pos: [92, 0, -112],  w: 14, h: 20, d: 16, color: '#E8865A' },
  { pos: [84, 0, -132],  w: 16, h: 14, d: 16, color: '#F0C8A0' },
  { pos: [110, 0, -122], w: 18, h: 12, d: 18, color: '#C8D8F0' },
];
