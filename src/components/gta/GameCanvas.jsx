import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { Physics, RigidBody } from '@react-three/rapier';
import { Sky } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import City from './City';
import NPCCar from './NPCCar';
import PlayerCar from './PlayerCar';
import OnFootPlayer from './OnFootPlayer';
import FollowCamera from './FollowCamera';
import HUD from './HUD';
import Controls from './Controls';
import CombatSystem from './CombatSystem';
import { INITIAL_STATE, increaseWanted } from './gameState';
import { cars, worldTime, resetWorld } from './world';
import './GTAGame.css';

// Actualiza mapStateRef com posição e rotação do corpo ativo a cada frame (dentro do Canvas)
function MapSync({ carRef, mapStateRef, mode, footYawRef }) {
  useFrame(() => {
    if (!carRef.current) return;
    const t = carRef.current.translation();
    mapStateRef.current.x = t.x;
    mapStateRef.current.z = t.z;
    if (mode === 'foot') {
      // A pé o corpo físico não roda — usa a direção de movimento.
      // Frente a pé = (sin, cos); frente do carro = -z ⇒ equivalência ry = yaw + π
      mapStateRef.current.ry = footYawRef.current + Math.PI;
    } else {
      const q = carRef.current.rotation();
      // Extrair ângulo Y do quaternião sem importar THREE
      mapStateRef.current.ry = Math.atan2(2 * (q.w * q.y + q.z * q.x), 1 - 2 * (q.y * q.y + q.z * q.z));
    }
  });
  return null;
}

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

function LoadingScreen() {
  return (
    <div className="gta-loading">
      <div className="loading-content">
        <div className="loading-title">VICE CITY</div>
        <div className="loading-sub">A carregar cidade...</div>
      </div>
    </div>
  );
}

function SceneReady({ onReady }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

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

export default function GameCanvas() {
  const carRef = useRef();
  const [gameState, setGameState] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(true);

  // Estado do radar: posição + rotação do jogador, e posições dos NPCs
  const mapStateRef = useRef({ x: 0, z: 0, ry: 0 });
  const npcPosArr = useRef(NPC_DATA.map(() => ({ x: 0, z: 0 })));

  const playerRef = useRef();
  const footYawRef = useRef(0);
  const aimYawRef = useRef(null);
  const [mode, setMode] = useState('car');
  const [footSpawn, setFootSpawn] = useState([0, 1, 0]);
  const [weaponSlot, setWeaponSlot] = useState(0);
  const [parkedCars, setParkedCars] = useState([]);
  const [carColor, setCarColor] = useState('#FF6EC7');
  const [ammoDisplay, setAmmoDisplay] = useState([Infinity, 60, 240]);
  const lastToggle = useRef(0);

  // Reabertura do modal: limpa estados de morte/jack com timestamps antigos
  useEffect(() => { resetWorld(); }, []);

  const addMoney = (amount) => setGameState(s => ({ ...s, money: s.money + amount }));
  const addWanted = () => setGameState(s => increaseWanted(s));
  const decayWanted = () => setGameState(s => ({ ...s, wanted: Math.max(0, s.wanted - 1) }));

  // Sair/entrar do carro com F ou Enter (debounce 500ms)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'f' && e.key !== 'F' && e.key !== 'Enter') return;
      e.preventDefault();
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
        car.setAngvel({ x: 0, y: 0, z: 0 }, true);
        setMode('foot');
        lastToggle.current = nowMs;
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, carColor]);

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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', cursor: mode === 'foot' ? 'none' : 'default' }}>
      {loading && <LoadingScreen />}
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 75, near: 0.1, far: 800 }} onCreated={({ gl }) => { window.__gl = gl; }}>
        <Suspense fallback={null}>
          {/* Fog atmosférico roxo-escuro — combina com céu de pôr-do-sol */}
          <fog attach="fog" args={['#180830', 150, 450]} />
          {/* Luz ambiente quente (laranja pôr-do-sol) */}
          <ambientLight intensity={0.5} color="#FF9955" />
          {/* Sol a oeste — dourado intenso */}
          <directionalLight
            position={[-80, 35, -60]} intensity={1.8} color="#FFB060" castShadow
            shadow-mapSize-width={1024} shadow-mapSize-height={1024}
            shadow-camera-near={0.5} shadow-camera-far={600}
            shadow-camera-left={-200} shadow-camera-right={200}
            shadow-camera-top={200} shadow-camera-bottom={-200}
          />
          {/* Luz de preenchimento — roxo para simular céu noturno no lado oposto */}
          <directionalLight position={[60, 20, 80]} intensity={0.35} color="#8844CC" />
          {/* Céu pôr-do-sol estilo Vice City */}
          <Sky
            distance={450000}
            sunPosition={[-1, 0.1, 0.3]}
            turbidity={12}
            rayleigh={0.8}
            mieCoefficient={0.08}
            mieDirectionalG={0.88}
          />
          <Physics gravity={[0, -20, 0]}>
            <City />
            <PlayerCar carRef={carRef} active={mode === 'car'} color={carColor} onStateChange={setGameState} />
            {parkedCars.map((c, i) => <ParkedCar key={i} {...c} />)}
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
          </Physics>
          {/* Tráfego — fora de Physics (sem colisões, só visual) */}
          {NPC_DATA.map((n, i) => (
            <NPCCar
              key={i}
              id={`npc-${i}`}
              pathId={n.pathId} lane={n.lane}
              speed={n.speed} color={n.color} phase={n.phase}
              posRef={npcPosArr.current[i]}
            />
          ))}
          {/* Sincroniza posição do carro com o radar */}
          <MapSync carRef={mode === 'car' ? carRef : playerRef} mapStateRef={mapStateRef} mode={mode} footYawRef={footYawRef} />
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
          {/* Pós-processamento — bloom néon + vinheta, o look VHS do Vice City */}
          <EffectComposer>
            <Bloom luminanceThreshold={1} mipmapBlur intensity={1.2} />
            <Vignette offset={0.25} darkness={0.55} />
          </EffectComposer>
          <SceneReady onReady={() => setLoading(false)} />
        </Suspense>
      </Canvas>
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
      {!loading && <Controls />}
    </div>
  );
}
