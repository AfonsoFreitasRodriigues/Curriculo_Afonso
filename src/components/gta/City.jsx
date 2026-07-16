import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { ensurePed } from './world';

// ─── Dados partilhados (também usados pelo radar do HUD) ─────────────────────
export const ISLANDS = [
  { cx: -107.5, cz: 0, lx: 165, lz: 380 },  // Ilha Oeste — downtown
  { cx:  105,   cz: 0, lx: 160, lz: 320 },  // Ilha Este — Vice Beach
];

export const ROADS = [
  { cx: -80,    cz: 0,    lx: 20,  lz: 380 },  // Vespucci Blvd
  { cx: -150,   cz: 0,    lx: 16,  lz: 285 },  // Harbor Blvd
  { cx: -107.5, cz: 0,    lx: 165, lz: 20  },  // E-W principal oeste
  { cx: -107.5, cz: -100, lx: 165, lz: 16  },  // E-W norte oeste
  { cx: -107.5, cz: 100,  lx: 165, lz: 16  },  // E-W sul oeste
  { cx: 0,      cz: 0,    lx: 50,  lz: 20  },  // Ponte principal
  { cx: 0,      cz: -100, lx: 50,  lz: 16  },  // Ponte norte
  { cx: 62,     cz: 0,    lx: 16,  lz: 320 },  // Ocean Drive
  { cx: 105,    cz: 0,    lx: 160, lz: 20  },  // E-W principal este
  { cx: 80,     cz: -100, lx: 110, lz: 16  },  // E-W norte este
];

export const BUILDINGS = [
  // ── Ilha Oeste: Downtown ──
  { pos: [-100, 0, -42], w: 22, h: 50, d: 20, color: '#F2ECD8' },
  { pos: [-135, 0, -38], w: 20, h: 44, d: 18, color: '#7ECECE' },
  { pos: [-108, 0,  38], w: 22, h: 38, d: 20, color: '#D4B8E0' },
  { pos: [-92,  0,  52], w: 18, h: 46, d: 18, color: '#F0D0B8' },
  { pos: [-148, 0,  42], w: 18, h: 32, d: 16, color: '#80C4D8' },
  { pos: [-158, 0, -52], w: 24, h: 40, d: 22, color: '#EDE0C4' },
  { pos: [-175, 0,   0], w: 20, h: 24, d: 30, color: '#F2ECD8' },
  { pos: [-120, 0, -76], w: 18, h: 26, d: 18, color: '#D4B8E0' },
  { pos: [-118, 0, -128],w: 20, h: 28, d: 20, color: '#80C4D8' },
  { pos: [-118, 0,  122],w: 20, h: 24, d: 20, color: '#7ECECE' },
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
  { pos: [-170, 0,  90], w: 32, h: 12, d: 25, color: '#8A8070' },
  { pos: [-170, 0, 120], w: 28, h: 10, d: 20, color: '#7A7060' },
  { pos: [-170, 0, 152], w: 34, h:  8, d: 28, color: '#8A8070' },
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
  { pos: [112, 0, -110], w: 18, h: 12, d: 18, color: '#C8D8F0' },
];

const NEON_SIGNS = [
  // Fachadas dos hotéis viradas para Ocean Drive
  { pos: [33.8, 22, -118], size: [0.35, 3.5, 14], color: '#FF6EC7' },
  { pos: [33.8, 26, -68],  size: [0.35, 3.5, 16], color: '#00FFFF' },
  { pos: [33.8, 28, -18],  size: [0.35, 4,   16], color: '#BB44FF' },
  { pos: [33.8, 24, 32],   size: [0.35, 3.5, 14], color: '#FFD700' },
  { pos: [33.8, 26, 82],   size: [0.35, 3.5, 14], color: '#FF6EC7' },
  // Downtown virado para a rua E-W principal
  { pos: [-100, 32, -31.8], size: [18, 4, 0.35],   color: '#00FFFF' },
  { pos: [-135, 26, -28.8], size: [16, 3.5, 0.35], color: '#FF6EC7' },
  { pos: [-108, 28,  27.8], size: [18, 3.5, 0.35], color: '#BB44FF' },
  // Downtown virado para Vespucci Blvd
  { pos: [-88.8, 34, -42], size: [0.35, 4, 16],   color: '#FFD700' },
  { pos: [-82.8, 30, 52],  size: [0.35, 3.5, 14], color: '#00FFFF' },
];

const PALMS = [
  // Ocean Drive
  ...[-155, -115, -75, -35, 5, 45, 85, 125, 155].map(z => [71, 0, z]),
  // Vespucci Blvd — lado leste
  ...[-180, -140, -60, -20, 20, 60, 140, 180].map(z => [-67, 0, z]),
  // Vespucci Blvd — lado oeste
  ...[-160, -120, -40, 40, 120, 160].map(z => [-93, 0, z]),
  // Rua E-W principal oeste
  ...[-185, -130].map(x => [x, 0, -13]),
  ...[-185, -130].map(x => [x, 0, 13]),
  // Praia
  ...[-130, -90, -50, -10, 30, 70, 110, 150].map(z => [140, 0, z]),
];

const STREETLIGHTS = [
  // Vespucci Blvd
  [-70, -150], [-70, -50], [-70, 50], [-70, 150],
  [-90, -100], [-90, 100],
  // Ocean Drive
  [72, -120], [72, -40], [72, 40], [72, 120],
  // E-W principal oeste
  [-130, -11], [-160, 11],
  // Ponte principal
  [-15, 11], [15, -11],
];

// ─── Textura procedural de janelas iluminadas ────────────────────────────────
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 16 + 4;
      const y = row * 16 + 3;
      const r = Math.random();
      if (r < 0.42) {
        // Janela acesa — tons quentes variados
        const warm = ['#FFDFA8', '#FFD080', '#FFE8C0', '#E8F0FF'];
        g.fillStyle = warm[Math.floor(Math.random() * warm.length)];
        g.globalAlpha = 0.75 + Math.random() * 0.25;
        g.fillRect(x, y, 8, 10);
        g.globalAlpha = 1;
      } else if (r < 0.58) {
        // Janela apagada mas visível
        g.fillStyle = '#20242C';
        g.fillRect(x, y, 8, 10);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Textura base partilhada — cada prédio clona com repeat próprio
const WINDOW_TEX = makeWindowTexture();

// ─── Textura procedural de ondulação (bumpMap do oceano) ────────────────────
function makeWaveTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 4 + Math.random() * 14;
    const light = Math.random() > 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(200,200,200,0.5)' : 'rgba(60,60,60,0.5)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

const WAVE_TEX = makeWaveTexture();

// ─── Componentes ─────────────────────────────────────────────────────────────
function Building({ pos, w, h, d, color, idx = 0 }) {
  const winTex = useMemo(() => {
    const t = WINDOW_TEX.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 11)));
    return t;
  }, [w, h]);

  // Torre superior estilo Art Deco (só em arranha-céus)
  const hasTier = h >= 36;
  const tierW = w * 0.65;
  const tierH = h * 0.28;
  const tierD = d * 0.65;
  const tierTex = useMemo(() => {
    if (!hasTier) return null;
    const t = WINDOW_TEX.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(tierW / 9)), Math.max(1, Math.round(tierH / 11)));
    return t;
  }, [hasTier, tierW, tierH]);

  const roofY = h / 2 + 1.2;

  return (
    <RigidBody type="fixed" colliders={false} position={[pos[0], h / 2, pos[2]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={color}
          roughness={0.6}
          metalness={0.08}
          emissiveMap={winTex}
          emissive="#FFCC88"
          emissiveIntensity={1.6}
        />
      </mesh>
      {/* Parapeito Art Deco (também cobre a face superior das janelas) */}
      <mesh position={[0, h / 2 + 0.6, 0]}>
        <boxGeometry args={[w + 0.5, 1.2, d + 0.5]} />
        <meshStandardMaterial color="#8A7A6A" roughness={0.85} />
      </mesh>
      {hasTier && (
        <>
          {/* Torre recuada com janelas próprias */}
          <mesh position={[0, roofY + tierH / 2, 0]} castShadow>
            <boxGeometry args={[tierW, tierH, tierD]} />
            <meshStandardMaterial
              color={color}
              roughness={0.6}
              metalness={0.08}
              emissiveMap={tierTex}
              emissive="#FFCC88"
              emissiveIntensity={1.6}
            />
          </mesh>
          <mesh position={[0, roofY + tierH + 0.4, 0]}>
            <boxGeometry args={[tierW + 0.4, 0.8, tierD + 0.4]} />
            <meshStandardMaterial color="#8A7A6A" roughness={0.85} />
          </mesh>
          {/* Antena com luz vermelha de aviso (vai brilhar com o bloom) */}
          <mesh position={[0, roofY + tierH + 3.2, 0]}>
            <cylinderGeometry args={[0.08, 0.14, 5.5, 5]} />
            <meshStandardMaterial color="#3A3A40" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, roofY + tierH + 6, 0]}>
            <sphereGeometry args={[0.32, 8, 6]} />
            <meshStandardMaterial color="#FF2020" emissive="#FF1010" emissiveIntensity={4} />
          </mesh>
        </>
      )}
      {/* Detalhes de telhado nos prédios sem torre */}
      {!hasTier && idx % 3 === 0 && (
        <group position={[w * 0.2, roofY, -d * 0.15]}>
          {/* Depósito de água */}
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[1.3, 1.3, 2.6, 10]} />
            <meshStandardMaterial color="#6A5844" roughness={0.9} />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <coneGeometry args={[1.45, 0.9, 10]} />
            <meshStandardMaterial color="#5A4A38" roughness={0.9} />
          </mesh>
        </group>
      )}
      {!hasTier && idx % 3 === 1 && (
        <group position={[-w * 0.2, roofY, d * 0.15]}>
          {/* Unidades de AC */}
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[2.2, 1.0, 1.6]} />
            <meshStandardMaterial color="#9A9AA0" roughness={0.8} metalness={0.3} />
          </mesh>
          <mesh position={[3, 0.4, 0.8]}>
            <boxGeometry args={[1.4, 0.8, 1.2]} />
            <meshStandardMaterial color="#8A8A90" roughness={0.8} metalness={0.3} />
          </mesh>
        </group>
      )}
      <CuboidCollider args={[w / 2, h / 2, d / 2]} />
    </RigidBody>
  );
}

function Palm({ position }) {
  return (
    <group position={position}>
      {/* Tronco fino e alto, ligeiramente curvo */}
      <mesh position={[0, 5.5, 0]} rotation={[0, 0, 0.04]}>
        <cylinderGeometry args={[0.14, 0.36, 11, 7]} />
        <meshStandardMaterial color="#7A5515" roughness={0.9} />
      </mesh>
      {/* Folhas — 6 frondes a irradiar do topo, a descair */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        return (
          <group key={i} position={[0, 11.1, 0]} rotation={[0, -a, 0]}>
            <mesh position={[1.9, -0.35, 0]} rotation={[0, 0, -0.42]}>
              <boxGeometry args={[3.6, 0.07, 1.0]} />
              <meshStandardMaterial color={i % 2 ? '#1A9A30' : '#128324'} roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
      {/* Miolo central */}
      <mesh position={[0, 11.15, 0]}>
        <sphereGeometry args={[0.45, 6, 5]} />
        <meshStandardMaterial color="#6A4A10" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Streetlight({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 7, 6]} />
        <meshStandardMaterial color="#2A2A30" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Cabeça luminosa */}
      <mesh position={[0, 7.05, 0]}>
        <boxGeometry args={[0.55, 0.3, 0.55]} />
        <meshStandardMaterial color="#FFE8B0" emissive="#FFD880" emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

function BeachUmbrella({ position, color }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 5]} />
        <meshStandardMaterial color="#EEE8D8" />
      </mesh>
      <mesh position={[0, 2.15, 0]}>
        <coneGeometry args={[1.9, 0.85, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Espreguiçadeira ao lado */}
      <mesh position={[2, 0.28, 0.4]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.8, 0.18, 2]} />
        <meshStandardMaterial color="#F0F0E8" roughness={0.8} />
      </mesh>
    </group>
  );
}

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

// Oceano com ondulação animada (offset do bumpMap desloca-se a cada frame)
function Ocean() {
  const matRef = useRef();
  useFrame(({ clock }) => {
    if (!matRef.current || !matRef.current.bumpMap) return;
    const t = clock.getElapsedTime();
    matRef.current.bumpMap.offset.set(t * 0.008, t * 0.012);
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
      <CuboidCollider args={[400, 0.1, 400]} position={[0, -0.15, 0]} />
    </RigidBody>
  );
}

// Barco a navegar em linha (mesma lógica dos NPCs)
function Boat({ start, end, speed = 5, color = '#F0EAD8', phase = 0 }) {
  const ref = useRef();
  const t = useRef(phase);
  const dir = useRef(1);
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const yawFwd = Math.atan2(dx, dz);
  const yawBack = yawFwd + Math.PI;

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    t.current += dir.current * speed * delta / dist;
    if (t.current >= 1) { t.current = 1; dir.current = -1; }
    if (t.current <= 0) { t.current = 0; dir.current = 1; }
    const p = t.current;
    const bob = Math.sin(clock.getElapsedTime() * 1.4) * 0.12;
    ref.current.position.set(start[0] + dx * p, 0.15 + bob, start[2] + dz * p);
    ref.current.rotation.y = dir.current > 0 ? yawFwd : yawBack;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.1) * 0.03;
  });

  return (
    <group ref={ref}>
      {/* Casco */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2.4, 1, 7]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.7, 3.8]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[2.2, 0.9, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Cabine */}
      <mesh position={[0, 1.5, -0.8]}>
        <boxGeometry args={[1.8, 1.1, 2.6]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
      {/* Luz de navegação */}
      <mesh position={[0, 2.3, -0.8]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial color="#40FF60" emissive="#20FF40" emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

// Gaivota em voo circular com asas a bater
function Seagull({ center, radius = 20, height = 24, speed = 0.5, phase = 0 }) {
  const ref = useRef();
  const wingL = useRef();
  const wingR = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed + phase;
    const x = center[0] + Math.cos(t) * radius;
    const z = center[1] + Math.sin(t) * radius;
    ref.current.position.set(x, height + Math.sin(t * 2.3) * 2, z);
    ref.current.rotation.y = -t - Math.PI / 2;
    const flap = Math.sin(clock.getElapsedTime() * 8 + phase * 10) * 0.55;
    if (wingL.current) wingL.current.rotation.z = flap;
    if (wingR.current) wingR.current.rotation.z = -flap;
  });

  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.5, 0.18, 0.18]} />
        <meshStandardMaterial color="#F5F5F0" roughness={0.8} />
      </mesh>
      <mesh ref={wingL} position={[0, 0, 0]}>
        <boxGeometry args={[0.12, 0.04, 1.5]} />
        <meshStandardMaterial color="#EDEDEA" roughness={0.8} />
      </mesh>
      <mesh ref={wingR} position={[0, 0, 0]}>
        <boxGeometry args={[0.12, 0.04, 1.5]} />
        <meshStandardMaterial color="#EDEDEA" roughness={0.8} />
      </mesh>
    </group>
  );
}

// Silhuetas de skyline distante (desvanecem no fog)
const SKYLINE = [
  // Oeste — atrás do sol poente
  { pos: [-340, 0, -60], w: 26, h: 58, d: 20 }, { pos: [-360, 0, -20], w: 20, h: 74, d: 18 },
  { pos: [-335, 0, 20],  w: 30, h: 48, d: 22 }, { pos: [-365, 0, 70],  w: 24, h: 64, d: 20 },
  { pos: [-340, 0, 120], w: 28, h: 42, d: 24 }, { pos: [-370, 0, 170], w: 22, h: 56, d: 18 },
  { pos: [-345, 0, -130],w: 24, h: 50, d: 20 }, { pos: [-368, 0, -180],w: 26, h: 68, d: 22 },
  // Norte
  { pos: [-180, 0, -330], w: 28, h: 52, d: 24 }, { pos: [-100, 0, -350], w: 24, h: 70, d: 20 },
  { pos: [-30, 0, -335],  w: 30, h: 46, d: 26 }, { pos: [60, 0, -350],   w: 22, h: 60, d: 18 },
  { pos: [140, 0, -330],  w: 26, h: 44, d: 22 },
];

function Road({ cx, cz, lx, lz }) {
  const isNS = lz > lx;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.03, cz]}>
        <planeGeometry args={[lx, lz]} />
        <meshStandardMaterial color="#0D0D0D" roughness={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.05, cz]}>
        <planeGeometry args={isNS ? [0.45, lz] : [lx, 0.45]} />
        <meshStandardMaterial color="#FFD700" />
      </mesh>
    </>
  );
}

// ─── Cidade ──────────────────────────────────────────────────────────────────
export default function City() {
  return (
    <group>
      {/* ── SOL POENTE no horizonte oeste ── */}
      <mesh position={[-400, 42, 120]} onUpdate={m => m.lookAt(0, 20, 0)}>
        <circleGeometry args={[55, 32]} />
        <meshBasicMaterial color="#FF7A2A" fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[-398, 42, 119]} onUpdate={m => m.lookAt(0, 20, 0)}>
        <circleGeometry args={[95, 32]} />
        <meshBasicMaterial color="#FF9A50" transparent opacity={0.28} fog={false} toneMapped={false} />
      </mesh>

      {/* ── SKYLINE DISTANTE (silhuetas no fog) ── */}
      {SKYLINE.map((b, i) => (
        <mesh key={i} position={[b.pos[0], b.h / 2, b.pos[2]]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#241540" roughness={1} />
        </mesh>
      ))}

      {/* ── OCEANO com ondulação animada ── */}
      <Ocean />

      {/* Espuma nas margens do canal e da praia */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-24.3, 0.012, 0]}>
        <planeGeometry args={[1.4, 380]} />
        <meshStandardMaterial color="#BFE8F0" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[24.3, 0.012, 0]}>
        <planeGeometry args={[1.4, 320]} />
        <meshStandardMaterial color="#BFE8F0" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[184.3, 0.012, 0]}>
        <planeGeometry args={[2, 300]} />
        <meshStandardMaterial color="#CFF0F8" transparent opacity={0.5} />
      </mesh>

      {/* ── ILHA OESTE ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-107.5, 0.02, 0]} receiveShadow>
        <planeGeometry args={[165, 380]} />
        <meshStandardMaterial color="#9A8870" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-92, 0.04, 0]}>
        <planeGeometry args={[8, 380]} />
        <meshStandardMaterial color="#B8A890" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-68, 0.04, 0]}>
        <planeGeometry args={[8, 380]} />
        <meshStandardMaterial color="#B8A890" roughness={0.95} />
      </mesh>

      {/* ── ILHA ESTE ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[105, 0.02, 0]} receiveShadow>
        <planeGeometry args={[160, 320]} />
        <meshStandardMaterial color="#C8B478" roughness={1} />
      </mesh>
      {/* Praia — areia dourada */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[157.5, 0.03, 0]}>
        <planeGeometry args={[55, 295]} />
        <meshStandardMaterial color="#E2CC78" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[68, 0.04, 0]}>
        <planeGeometry args={[8, 320]} />
        <meshStandardMaterial color="#C0B090" roughness={0.95} />
      </mesh>

      {/* ── RUAS (a partir dos dados partilhados com o radar) ── */}
      {ROADS.map((r, i) => <Road key={i} {...r} />)}

      {/* ── GUARDAS DAS PONTES ── */}
      <mesh position={[0, 0.3, -10.3]}>
        <boxGeometry args={[50, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, 10.3]}>
        <boxGeometry args={[50, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -108.3]}>
        <boxGeometry args={[50, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -91.7]}>
        <boxGeometry args={[50, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>

      {/* ── EDIFÍCIOS com janelas iluminadas ── */}
      {BUILDINGS.map((b, i) => (
        <Building key={i} idx={i} pos={b.pos} w={b.w} h={b.h} d={b.d} color={b.color} />
      ))}

      {/* ── NÉONS ── */}
      {NEON_SIGNS.map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={3} />
        </mesh>
      ))}

      {/* ── CANDEEIROS DE RUA ── */}
      {STREETLIGHTS.map(([x, z], i) => <Streetlight key={i} x={x} z={z} />)}

      {/* ── LUZES DE CRUZAMENTO ── */}
      <pointLight position={[-68, 6, -12]} color="#FFE080" intensity={45} distance={28} decay={2} />
      <pointLight position={[-92, 6,  12]} color="#FFE080" intensity={45} distance={28} decay={2} />
      <pointLight position={[54, 6, -12]}  color="#FF9040" intensity={40} distance={25} decay={2} />
      <pointLight position={[70, 6,  12]}  color="#FF9040" intensity={40} distance={25} decay={2} />

      {/* ── PALMEIRAS ── */}
      {PALMS.map((pos, i) => <Palm key={i} position={pos} />)}

      {/* ── PRAIA: guarda-sóis e espreguiçadeiras ── */}
      <BeachUmbrella position={[152, 0, -90]}  color="#FF6EC7" />
      <BeachUmbrella position={[160, 0, -35]}  color="#00CED1" />
      <BeachUmbrella position={[150, 0,  15]}  color="#FFD700" />
      <BeachUmbrella position={[162, 0,  70]}  color="#FF6EC7" />
      <BeachUmbrella position={[153, 0, 125]}  color="#87CEEB" />

      {/* ── BARCOS no oceano ── */}
      <Boat start={[215, 0, -140]} end={[215, 0, 140]} speed={5} color="#F0EAD8" phase={0.2} />
      <Boat start={[240, 0, 100]}  end={[240, 0, -120]} speed={4} color="#E85A5A" phase={0.6} />
      <Boat start={[-215, 0, 120]} end={[-215, 0, -140]} speed={4.5} color="#7EC8D8" phase={0.0} />

      {/* ── GAIVOTAS sobre a praia e o porto ── */}
      <Seagull center={[150, -60]} radius={22} height={26} speed={0.45} phase={0} />
      <Seagull center={[155, 40]}  radius={18} height={22} speed={0.55} phase={2.1} />
      <Seagull center={[145, 110]} radius={25} height={30} speed={0.4}  phase={4.2} />
      <Seagull center={[-170, 110]} radius={20} height={24} speed={0.5} phase={1.5} />

      {/* ── PEDESTRES ── */}
      <Pedestrian id="ped-0" start={[-73, 0, -175]} end={[-73, 0, -30]} speed={1.5} color="#FF6EC7" phase={0.0} />
      <Pedestrian id="ped-1" start={[-73, 0,  30]}  end={[-73, 0, 175]} speed={1.2} color="#00FFFF" phase={0.3} />
      <Pedestrian id="ped-2" start={[-87, 0, -150]} end={[-87, 0,  50]} speed={1.8} color="#FFD700" phase={0.6} />
      <Pedestrian id="ped-3" start={[-87, 0,  60]}  end={[-87, 0, 150]} speed={1.3} color="#FF4500" phase={0.1} />
      <Pedestrian id="ped-4" start={[68, 0, -148]}  end={[68, 0, -40]}  speed={1.4} color="#98FB98" phase={0.5} />
      <Pedestrian id="ped-5" start={[68, 0,  40]}   end={[68, 0, 148]}  speed={1.6} color="#DDA0DD" phase={0.8} />
      <Pedestrian id="ped-6" start={[56, 0, -130]}  end={[56, 0,  60]}  speed={1.2} color="#FFA07A" phase={0.2} />
      <Pedestrian id="ped-7" start={[56, 0,  70]}   end={[56, 0, 130]}  speed={1.5} color="#87CEEB" phase={0.7} />

      {/* ── FÍSICA: limites e canal ── */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[200, 20, 1]} position={[0, 10, -195]} />
        <CuboidCollider args={[200, 20, 1]} position={[0, 10,  195]} />
        <CuboidCollider args={[1, 20, 200]} position={[-192, 10, 0]} />
        <CuboidCollider args={[1, 20, 200]} position={[ 188, 10, 0]} />
        {/* Canal esquerdo (x=-25) — aberturas nas pontes z=0 e z=-100 */}
        <CuboidCollider args={[1, 20, 42.5]} position={[-25, 10, -157.5]} />
        <CuboidCollider args={[1, 20, 35]}   position={[-25, 10,  -50]}   />
        <CuboidCollider args={[1, 20, 92.5]} position={[-25, 10,  107.5]} />
        {/* Canal direito (x=25) */}
        <CuboidCollider args={[1, 20, 42.5]} position={[25, 10, -157.5]} />
        <CuboidCollider args={[1, 20, 35]}   position={[25, 10,  -50]}   />
        <CuboidCollider args={[1, 20, 92.5]} position={[25, 10,  107.5]} />
      </RigidBody>
    </group>
  );
}
