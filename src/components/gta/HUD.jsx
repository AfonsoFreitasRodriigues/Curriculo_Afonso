import { useRef, useEffect, useState } from 'react';
import { BUILDINGS, ROAD_PATHS, ISLAND_SHAPES, BEACH_SHAPE } from './map';
import { WEAPONS } from './weapons';
import './HUD.css';

const RADAR_SCALE = 0.38; // unidades do mundo por pixel (±200 mundo ≈ ±76px no radar)

// Converte coordenadas mundo (wx, wz) para canvas, rotacionado para que o jogador
// aponte sempre para cima (frente do carro = topo do radar, estilo Vice City)
function worldToRadar(wx, wz, px, pz, ry, cx, cy) {
  const dx = wx - px;
  const dz = wz - pz;
  return {
    x: cx + (dx * Math.cos(ry) - dz * Math.sin(ry)) * RADAR_SCALE,
    y: cy + (dx * Math.sin(ry) + dz * Math.cos(ry)) * RADAR_SCALE,
  };
}

// Preenche um retângulo em coordenadas de mundo (rotacionado no radar)
function fillWorldRect(ctx, toR, cx, cz, lx, lz) {
  const hw = lx / 2; const hd = lz / 2;
  const pts = [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
  ctx.beginPath();
  pts.forEach(([wx, wz], i) => {
    const p = toR(wx, wz);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
}

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

function drawRadar(canvas, mapState, npcPosArr) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const { x: px, z: pz, ry } = mapState;

  const toR = (wx, wz) => worldToRadar(wx, wz, px, pz, ry, cx, cy);

  // Fundo = água (azul escuro)
  ctx.fillStyle = '#06121F';
  ctx.fillRect(0, 0, W, H);

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

  // Quarteirões (footprints dos prédios)
  ctx.fillStyle = '#0C141C';
  BUILDINGS.forEach(b => {
    fillWorldRect(ctx, toR, b.pos[0], b.pos[2], b.w, b.d);
  });

  // Blips dos NPCs (amarelo)
  ctx.fillStyle = '#FFCC00';
  npcPosArr.current.forEach(pos => {
    if (!pos.x && !pos.z) return;
    const cp = toR(pos.x, pos.z);
    if (cp.x < -5 || cp.x > W + 5 || cp.y < -5 || cp.y > H + 5) return;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Blip do jogador — triângulo branco apontado para cima (frente do carro)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 7);       // ponta da frente
  ctx.lineTo(cx - 4.5, cy + 4); // traseira esquerda
  ctx.lineTo(cx + 4.5, cy + 4); // traseira direita
  ctx.closePath();
  ctx.fill();

  // Halo suave à volta do blip do jogador
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  // Indicador de Norte — direção -z do mundo rotacionada com o radar
  const nx = Math.sin(ry);
  const ny = -Math.cos(ry);
  const NR = 63;
  ctx.fillStyle = '#FFCC00';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx + nx * NR, cy + ny * NR);
}

export default function HUD({ life, money, wanted, mapStateRef, npcPosArr, mode, weaponSlot, ammo }) {
  const canvasRef = useRef();
  const crossRef = useRef();
  // Relógio do jogo: começa às 18:00, avança 1 minuto de jogo por segundo real
  const [gameMinutes, setGameMinutes] = useState(18 * 60);

  useEffect(() => {
    const id = setInterval(() => setGameMinutes(m => (m + 1) % 1440), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapStateRef || !npcPosArr) return;
    let rafId;
    const loop = () => {
      drawRadar(canvas, mapStateRef.current, npcPosArr);
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [mapStateRef, npcPosArr]);

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

  return (
    <div className="gta-hud">
      <div className="hud-top-right">
        <div className="hud-clock">
          {String(Math.floor(gameMinutes / 60)).padStart(2, '0')}:{String(gameMinutes % 60).padStart(2, '0')}
        </div>
        <div className="hud-wanted">
          {[1, 2, 3, 4, 5].map(s => (
            <span key={s} className={s <= wanted ? 'star active' : 'star'}>★</span>
          ))}
        </div>
        <div className="hud-life">♥ {life}</div>
        <div className="hud-money">${money.toLocaleString('en-US')}</div>
        <div className={`hud-weapon${ammo[weaponSlot] === 0 ? ' empty' : ''}`}>
          {WEAPONS[weaponSlot].name}
          {ammo[weaponSlot] !== Infinity && ` ${ammo[weaponSlot]}`}
        </div>
      </div>
      <div className="hud-bottom-left">
        <canvas ref={canvasRef} className="minimap" width={150} height={150} />
        <div className="radio-label">V-ROCK</div>
      </div>
      {mode === 'foot' && <div ref={crossRef} className="crosshair" />}
    </div>
  );
}
