import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { ensurePed } from './world';
import { ISLAND_SHAPES, BEACH_SHAPE, WATERLINE, ROAD_PATHS, BRIDGE_OPENINGS, BUILDINGS, INTERSECTIONS, CROSSWALKS, getPath, pointAt } from './map';
import { makeRibbonGeometry, offsetPolyline, shapeFromPoints, makeSidewalkGeometry, SIDEWALK_H } from './geometry';
import { WINDOW_TEX, WAVE_TEX, ROAD_TEX, ASPHALT_TEX, CROSSWALK_TEX, CONCRETE_TEX, SAND_TEX, FOAM_TEX, ROUGH_TEX } from './textures';
function Island({ points, color }) {
  const shape = useMemo(() => shapeFromPoints(points), [points]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      {/* Falésia baixa na linha de costa — o extrude cresce no +y do mundo,
          por isso o topo tem de acabar EM y=0, abaixo do chão da ilha (0.02),
          senão a face de topo tapa as ruas todas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <extrudeGeometry args={[shape, { depth: 0.5, bevelEnabled: false }]} />
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
      <meshStandardMaterial map={SAND_TEX} roughness={1} />
    </mesh>
  );
}

function RoadPath({ path }) {
  const asphalt = useMemo(() => makeRibbonGeometry(path.points, path.width), [path]);
  // offset + ⇒ passeio à esquerda ⇒ lancil na borda direita (lado da rua), e vice-versa
  const walkL = useMemo(
    () => makeSidewalkGeometry(offsetPolyline(path.points, path.width / 2 + 2.5), 4, 'right'), [path]);
  const walkR = useMemo(
    () => makeSidewalkGeometry(offsetPolyline(path.points, -(path.width / 2 + 2.5)), 4, 'left'), [path]);
  return (
    <group>
      {/* Asfalto com marcações embutidas na textura (linhas laterais + tracejado) */}
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

const NEON_SIGNS = [
  // Fachadas oeste dos hotéis (x=40, w=18 → face em x=31; letreiro 0.2u fora)
  { pos: [30.8, 22, -118], size: [0.35, 3.5, 14], color: '#FF6EC7' },
  { pos: [30.8, 26, -68],  size: [0.35, 3.5, 16], color: '#00FFFF' },
  { pos: [30.8, 28, -18],  size: [0.35, 4,   16], color: '#BB44FF' },
  { pos: [30.8, 24, 32],   size: [0.35, 3.5, 14], color: '#FFD700' },
  { pos: [30.8, 26, 82],   size: [0.35, 3.5, 14], color: '#FF6EC7' },
  // Downtown virado para a rua E-W principal
  { pos: [-100, 32, -31.8], size: [18, 4, 0.35],   color: '#00FFFF' },
  { pos: [-135, 26, -28.8], size: [16, 3.5, 0.35], color: '#FF6EC7' },
  { pos: [-108, 28,  27.8], size: [18, 3.5, 0.35], color: '#BB44FF' },
  // Downtown virado para Vespucci Blvd (faces este em x=-97 e x=-99)
  { pos: [-96.8, 34, -42], size: [0.35, 4, 16],   color: '#FFD700' },
  { pos: [-98.8, 30, 57],  size: [0.35, 3.5, 14], color: '#00FFFF' },
];

const PALMS = [
  // Ocean Drive — lado praia
  [84, -120], [86, -80], [78, -40], [88, 0], [80, 40], [90, 85], [82, 125],
  // Ocean Drive — lado hotéis (nos intervalos entre fachadas)
  [46, -135], [42, -85], [46, -45], [50, -5], [44, 48], [52, 98], [52, 112],
  // Vespucci — lado este
  [-58, -150], [-52, -95], [-64, -40], [-55, 15], [-66, 70], [-52, 125], [-60, 165],
  // Vespucci — lado oeste
  [-88, -140], [-88, -85], [-100, -30], [-92, 25], [-104, 80], [-88, 135],
  // Praia
  [150, -110], [145, -60], [152, -10], [147, 45], [154, 95], [142, 130],
].map(([x, z]) => [x, 0, z]);

const STREETLIGHTS = [
  [-60, -120], [-60, -10], [-62, 100], [-96, -60], [-96, 55],
  [46, -100], [46, 10], [48, 110], [84, -60], [84, 60],
  [-150, -30], [-160, 80], [-14, 8], [14, -8],
];

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
          roughness={0.85}
          roughnessMap={ROUGH_TEX}
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
              roughness={0.85}
              roughnessMap={ROUGH_TEX}
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
      {/* frustumCulled off: a bounding sphere cacheia antes do useEffect preencher as matrizes */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, PALMS.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.14, 0.36, 11, 7]} />
        <meshStandardMaterial color="#7A5515" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[undefined, undefined, PALMS.length * 6]} frustumCulled={false}>
        <boxGeometry args={[3.6, 0.07, 1.0]} />
        <meshStandardMaterial color="#159A2A" roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={coreRef} args={[undefined, undefined, PALMS.length]} frustumCulled={false}>
        <sphereGeometry args={[0.45, 6, 5]} />
        <meshStandardMaterial color="#6A4A10" roughness={0.9} />
      </instancedMesh>
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
    ref.current.position.set(pt.x, SIDEWALK_H, pt.z);
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
          color="#0E5580"
          roughness={0.12}
          metalness={0.7}
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

      {/* ── ILHAS (contornos orgânicos) ── */}
      <Island points={ISLAND_SHAPES[0].points} color="#9A8870" />
      <Island points={ISLAND_SHAPES[1].points} color="#C8B478" />
      <Beach />

      {/* ── RUAS (ribbons das polilinhas) ── */}
      {ROAD_PATHS.filter(r => !r.hidden).map(r => <RoadPath key={r.id} path={r} />)}

      {/* ── CRUZAMENTOS: remendos + passadeiras ── */}
      <IntersectionPatches />

      {/* ── COLISORES DA COSTA (com aberturas nas pontes) ── */}
      <CoastColliders points={ISLAND_SHAPES[0].points} />
      <CoastColliders points={ISLAND_SHAPES[1].points} />

      {/* ── GUARDAS DAS PONTES ── */}
      <mesh position={[0, 0.3, -8.2]}>
        <boxGeometry args={[64, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, 8.2]}>
        <boxGeometry args={[64, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -108.2]}>
        <boxGeometry args={[64, 0.6, 0.6]} />
        <meshStandardMaterial color="#888898" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -91.8]}>
        <boxGeometry args={[64, 0.6, 0.6]} />
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
      <pointLight position={[-75, 6, 8]}  color="#FFE080" intensity={45} distance={28} decay={2} />
      <pointLight position={[-78, 6, -8]} color="#FFE080" intensity={45} distance={28} decay={2} />
      <pointLight position={[65, 6, 6]}   color="#FF9040" intensity={40} distance={25} decay={2} />
      <pointLight position={[60, 6, -8]}  color="#FF9040" intensity={40} distance={25} decay={2} />

      {/* ── PALMEIRAS ── */}
      <Palms />

      {/* ── PRAIA: guarda-sóis e espreguiçadeiras ── */}
      <BeachUmbrella position={[142, 0, -95]} color="#FF6EC7" />
      <BeachUmbrella position={[150, 0, -40]} color="#00CED1" />
      <BeachUmbrella position={[140, 0,  10]} color="#FFD700" />
      <BeachUmbrella position={[148, 0,  65]} color="#FF6EC7" />
      <BeachUmbrella position={[144, 0, 120]} color="#87CEEB" />
      <BeachProps />
      <UrbanProps />

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
      <Pedestrian id="ped-0" pathId="walkVespucciE" speed={1.5} color="#FF6EC7" phase={0.05} />
      <Pedestrian id="ped-1" pathId="walkVespucciE" speed={1.2} color="#00FFFF" phase={0.55} />
      <Pedestrian id="ped-2" pathId="walkVespucciW" speed={1.8} color="#FFD700" phase={0.25} />
      <Pedestrian id="ped-3" pathId="walkVespucciW" speed={1.3} color="#FF4500" phase={0.75} />
      <Pedestrian id="ped-4" pathId="walkOceanW" speed={1.4} color="#98FB98" phase={0.15} />
      <Pedestrian id="ped-5" pathId="walkOceanW" speed={1.6} color="#DDA0DD" phase={0.65} />
      <Pedestrian id="ped-6" pathId="walkOceanE" speed={1.2} color="#FFA07A" phase={0.35} />
      <Pedestrian id="ped-7" pathId="walkOceanE" speed={1.5} color="#87CEEB" phase={0.85} />

      {/* ── FÍSICA: limites do mapa ── */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[200, 20, 1]} position={[0, 10, -195]} />
        <CuboidCollider args={[200, 20, 1]} position={[0, 10,  195]} />
        <CuboidCollider args={[1, 20, 200]} position={[-192, 10, 0]} />
        <CuboidCollider args={[1, 20, 200]} position={[ 188, 10, 0]} />
      </RigidBody>
    </group>
  );
}
