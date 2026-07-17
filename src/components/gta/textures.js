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

// Textura base partilhada — cada prédio clona com repeat próprio
export const WINDOW_TEX = makeWindowTexture();

// Textura base partilhada — bumpMap do oceano
export const WAVE_TEX = makeWaveTexture();
