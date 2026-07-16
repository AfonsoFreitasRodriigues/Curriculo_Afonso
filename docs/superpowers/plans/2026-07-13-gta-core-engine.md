# GTA 3D Vice City — Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mini-jogo GTA 2D por um jogo 3D top-down estilo Vice City com carro dirigível com física, câmera 3ª pessoa e cidade procedural, integrado no currículo React existente.

**Architecture:** Um modal fullscreen contém um Canvas do React Three Fiber com mundo físico Rapier. O carro do jogador tem física real (impulso, damping, velocidade máxima). A câmera segue o carro com lerp suave. O HUD é HTML puro sobreposto ao canvas. A lógica de estado do jogo fica em funções puras testáveis.

**Tech Stack:** React 19, Vite 8, @react-three/fiber, @react-three/drei, @react-three/rapier, three, vitest, @testing-library/react

## Global Constraints

- React versão 19.x (já instalado)
- Vite versão 8.x (já instalado)
- Pasta do jogo: `src/components/gta/`
- O import em `src/components/Header.jsx` muda de `./GTAGame` para `./gta/GTAGame`
- Sem CSS modules — usar ficheiros `.css` normais como o resto do projeto
- Sem TypeScript — JS puro como o resto do projeto
- Botão de abertura mantém texto `🚓 GTA City`
- Velocidade máxima do carro: 30 unidades/s
- Lerp da câmera: factor 0.08
- Mapa: 400×400 unidades

---

## Ficheiros criados/modificados

| Acção | Ficheiro | Responsabilidade |
|-------|----------|-----------------|
| Criar | `src/components/gta/gameState.js` | Funções puras de estado do jogo |
| Criar | `src/components/gta/HUD.jsx` | Overlay HTML (vida, dinheiro, estrelas, minimapa) |
| Criar | `src/components/gta/HUD.css` | Estilos do HUD estilo Vice City |
| Criar | `src/components/gta/City.jsx` | Cidade procedural com colisores Rapier |
| Criar | `src/components/gta/FollowCamera.jsx` | Câmera 3ª pessoa com lerp |
| Criar | `src/components/gta/PlayerCar.jsx` | Carro do jogador com física Rapier |
| Criar | `src/components/gta/GameCanvas.jsx` | Canvas R3F + Physics + loading screen |
| Criar | `src/components/gta/GTAGame.jsx` | Modal wrapper (substitui o antigo) |
| Criar | `src/components/gta/GTAGame.css` | Estilos do modal e botão |
| Criar | `src/tests/gameState.test.js` | Testes das funções puras |
| Criar | `src/tests/HUD.test.jsx` | Testes de render do HUD |
| Modificar | `vite.config.js` | Adicionar config de testes vitest |
| Modificar | `package.json` | Adicionar deps de 3D e de teste |
| Eliminar | `src/components/GTAGame.jsx` | Substituído pela nova versão |
| Eliminar | `src/components/GTAGame.css` | Substituído pela nova versão |
| Modificar | `src/components/Header.jsx` | Actualizar import do GTAGame |

---

## Task 1: Instalar dependências e configurar testes

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/tests/` (pasta)

**Interfaces:**
- Produces: comando `npm test` funcional; `npm run dev` continua a funcionar

- [ ] **Step 1: Instalar dependências 3D e de teste**

```bash
npm install three @react-three/fiber @react-three/drei @react-three/rapier
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Actualizar vite.config.js com config de teste**

Substituir conteúdo de `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
  },
})
```

- [ ] **Step 3: Criar ficheiro de setup dos testes**

Criar `src/tests/setup.js`:

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Adicionar script de teste ao package.json**

Em `package.json`, adicionar à secção `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

O bloco `scripts` fica:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "oxlint",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Verificar que o servidor de dev ainda arranca**

```bash
npm run dev
```

Resultado esperado: servidor inicia em `http://localhost:5173` sem erros.

- [ ] **Step 6: Commit**

```bash
git add vite.config.js package.json package-lock.json src/tests/setup.js
git commit -m "chore: install R3F, Rapier, Drei and vitest"
```

---

## Task 2: Estado do jogo — funções puras

**Files:**
- Create: `src/components/gta/gameState.js`
- Create: `src/tests/gameState.test.js`

**Interfaces:**
- Produces:
  - `INITIAL_STATE` — `{ money: number, life: number, wanted: number }`
  - `collectMoney(state, amount?)` → novo state com `money` aumentado
  - `takeDamage(state, amount)` → novo state com `life` reduzida (mínimo 0)
  - `increaseWanted(state)` → novo state com `wanted` aumentado (máximo 5)
  - `resetWanted(state)` → novo state com `wanted = 0`
  - `isDead(state)` → `boolean`

- [ ] **Step 1: Escrever os testes**

Criar `src/tests/gameState.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  INITIAL_STATE,
  collectMoney,
  takeDamage,
  increaseWanted,
  resetWanted,
  isDead,
} from '../components/gta/gameState';

describe('INITIAL_STATE', () => {
  it('tem money 0, life 100, wanted 0', () => {
    expect(INITIAL_STATE).toEqual({ money: 0, life: 100, wanted: 0 });
  });
});

describe('collectMoney', () => {
  it('adiciona 500 por defeito', () => {
    const result = collectMoney(INITIAL_STATE);
    expect(result.money).toBe(500);
  });

  it('adiciona o valor especificado', () => {
    const result = collectMoney(INITIAL_STATE, 1000);
    expect(result.money).toBe(1000);
  });

  it('não muta o state original', () => {
    collectMoney(INITIAL_STATE, 100);
    expect(INITIAL_STATE.money).toBe(0);
  });
});

describe('takeDamage', () => {
  it('reduz a vida', () => {
    const result = takeDamage(INITIAL_STATE, 30);
    expect(result.life).toBe(70);
  });

  it('não desce abaixo de 0', () => {
    const result = takeDamage(INITIAL_STATE, 200);
    expect(result.life).toBe(0);
  });

  it('não muta o state original', () => {
    takeDamage(INITIAL_STATE, 50);
    expect(INITIAL_STATE.life).toBe(100);
  });
});

describe('increaseWanted', () => {
  it('aumenta o nível de procurado', () => {
    const result = increaseWanted(INITIAL_STATE);
    expect(result.wanted).toBe(1);
  });

  it('não ultrapassa 5', () => {
    const state = { ...INITIAL_STATE, wanted: 5 };
    const result = increaseWanted(state);
    expect(result.wanted).toBe(5);
  });
});

describe('resetWanted', () => {
  it('repõe wanted a 0', () => {
    const state = { ...INITIAL_STATE, wanted: 4 };
    const result = resetWanted(state);
    expect(result.wanted).toBe(0);
  });
});

describe('isDead', () => {
  it('retorna false quando life > 0', () => {
    expect(isDead(INITIAL_STATE)).toBe(false);
  });

  it('retorna true quando life = 0', () => {
    expect(isDead({ ...INITIAL_STATE, life: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Correr testes e confirmar que falham**

```bash
npm test
```

Resultado esperado: FAIL — "Cannot find module '../components/gta/gameState'"

- [ ] **Step 3: Implementar gameState.js**

Criar `src/components/gta/gameState.js`:

```js
export const INITIAL_STATE = {
  money: 0,
  life: 100,
  wanted: 0,
};

export function collectMoney(state, amount = 500) {
  return { ...state, money: state.money + amount };
}

export function takeDamage(state, amount) {
  return { ...state, life: Math.max(0, state.life - amount) };
}

export function increaseWanted(state) {
  return { ...state, wanted: Math.min(5, state.wanted + 1) };
}

export function resetWanted(state) {
  return { ...state, wanted: 0 };
}

export function isDead(state) {
  return state.life <= 0;
}
```

- [ ] **Step 4: Correr testes e confirmar que passam**

```bash
npm test
```

Resultado esperado: PASS — 9 testes passam

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/gameState.js src/tests/gameState.test.js
git commit -m "feat: add pure game state functions with tests"
```

---

## Task 3: HUD Component

**Files:**
- Create: `src/components/gta/HUD.jsx`
- Create: `src/components/gta/HUD.css`
- Create: `src/tests/HUD.test.jsx`

**Interfaces:**
- Consumes: `{ life: number, money: number, wanted: number }` props
- Produces: componente `<HUD>` que renderiza overlay HTML sobre o canvas

- [ ] **Step 1: Escrever testes do HUD**

Criar `src/tests/HUD.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HUD from '../components/gta/HUD';

describe('HUD', () => {
  it('mostra a vida correctamente', () => {
    render(<HUD life={75} money={0} wanted={0} />);
    expect(screen.getByText('♥ 75')).toBeInTheDocument();
  });

  it('mostra o dinheiro formatado', () => {
    render(<HUD life={100} money={1500} wanted={0} />);
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('activa o número correcto de estrelas', () => {
    render(<HUD life={100} money={0} wanted={3} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(3);
  });

  it('mostra 0 estrelas activas quando wanted = 0', () => {
    render(<HUD life={100} money={0} wanted={0} />);
    const activeStars = document.querySelectorAll('.star.active');
    expect(activeStars).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr testes e confirmar que falham**

```bash
npm test
```

Resultado esperado: FAIL — "Cannot find module '../components/gta/HUD'"

- [ ] **Step 3: Criar HUD.jsx**

Criar `src/components/gta/HUD.jsx`:

```jsx
import './HUD.css';

export default function HUD({ life, money, wanted }) {
  return (
    <div className="gta-hud">
      <div className="hud-top-right">
        <div className="hud-wanted">
          {[1, 2, 3, 4, 5].map(s => (
            <span key={s} className={s <= wanted ? 'star active' : 'star'}>★</span>
          ))}
        </div>
        <div className="hud-life">♥ {life}</div>
        <div className="hud-money">${money.toLocaleString()}</div>
      </div>
      <div className="hud-bottom-left">
        <canvas className="minimap" width={120} height={120} />
        <div className="radio-label">V-ROCK</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar HUD.css**

Criar `src/components/gta/HUD.css`:

```css
.gta-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'Pricedown', 'Arial Black', sans-serif;
  color: #fff;
  z-index: 10;
}

.hud-top-right {
  position: absolute;
  top: 16px;
  right: 16px;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hud-wanted .star { color: #444; font-size: 24px; }
.hud-wanted .star.active { color: #FFD700; }

.hud-life { font-size: 22px; color: #FF6EC7; }
.hud-money { font-size: 22px; color: #00FFFF; }

.hud-bottom-left {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.minimap {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
}

.radio-label {
  font-size: 14px;
  color: #00FFFF;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 8px;
  border-radius: 4px;
}
```

- [ ] **Step 5: Correr testes e confirmar que passam**

```bash
npm test
```

Resultado esperado: PASS — todos os testes passam (gameState + HUD)

- [ ] **Step 6: Commit**

```bash
git add src/components/gta/HUD.jsx src/components/gta/HUD.css src/tests/HUD.test.jsx
git commit -m "feat: add HUD overlay component with Vice City styling"
```

---

## Task 4: City Component

**Files:**
- Create: `src/components/gta/City.jsx`

**Interfaces:**
- Consumes: nada (componente autónomo com geometrias e colisores)
- Produces: componente `<City />` — renderiza chão, ruas, prédios, palmeiras e paredes invisíveis

**Nota:** componente 3D, testado manualmente no browser.

- [ ] **Step 1: Criar City.jsx**

Criar `src/components/gta/City.jsx`:

```jsx
import { RigidBody } from '@react-three/rapier';

const BUILDINGS = [
  { pos: [-80, 10, -80],  size: [20, 20, 20] },
  { pos: [80,  15, -80],  size: [25, 30, 20] },
  { pos: [-80,  8,  80],  size: [18, 16, 18] },
  { pos: [80,  12,  80],  size: [22, 24, 22] },
  { pos: [0,   20, -120], size: [30, 40, 25] },
  { pos: [-120, 10,   0], size: [20, 20, 20] },
  { pos: [120,  14,   0], size: [24, 28, 20] },
  { pos: [0,    8,  120], size: [28, 16, 28] },
];

const BUILDING_COLORS = ['#c8a96e', '#b8845a', '#d4b896', '#8b6b3e', '#c9956e'];

const PALM_POSITIONS = [
  [-40, 0, -40], [40, 0, -40], [-40, 0, 40], [40, 0, 40],
  [-60, 0,   0], [60, 0,   0], [  0, 0, -60], [0, 0, 60],
];

const BOUNDARY_WALLS = [
  { pos: [0, 10, -200],  size: [400, 20, 1] },
  { pos: [0, 10,  200],  size: [400, 20, 1] },
  { pos: [-200, 10, 0],  size: [1, 20, 400] },
  { pos: [ 200, 10, 0],  size: [1, 20, 400] },
];

function Palm({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[0.3, 0.5, 8, 8]} />
        <meshStandardMaterial color="#8B5E3C" />
      </mesh>
      <mesh position={[0, 8.5, 0]}>
        <coneGeometry args={[3, 3, 8]} />
        <meshStandardMaterial color="#2D8B00" />
      </mesh>
    </group>
  );
}

export default function City() {
  return (
    <group>
      {/* Chão */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      </RigidBody>

      {/* Ruas (visuais) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[20, 400]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[400, 20]} />
        <meshStandardMaterial color="#444" />
      </mesh>

      {/* Prédios */}
      {BUILDINGS.map((b, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={b.pos} castShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={BUILDING_COLORS[i % BUILDING_COLORS.length]} />
          </mesh>
        </RigidBody>
      ))}

      {/* Palmeiras */}
      {PALM_POSITIONS.map((pos, i) => (
        <Palm key={i} position={pos} />
      ))}

      {/* Paredes de limite (invisíveis) */}
      {BOUNDARY_WALLS.map((w, i) => (
        <RigidBody key={`wall-${i}`} type="fixed" colliders="cuboid">
          <mesh position={w.pos} visible={false}>
            <boxGeometry args={w.size} />
            <meshStandardMaterial />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Verificar no browser que testes ainda passam**

```bash
npm test
```

Resultado esperado: todos os testes continuam a passar.

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/City.jsx
git commit -m "feat: add procedural 3D city with Rapier colliders"
```

---

## Task 5: FollowCamera Component

**Files:**
- Create: `src/components/gta/FollowCamera.jsx`

**Interfaces:**
- Consumes: `carRef` — React ref apontando para o `RigidBody` do Rapier do carro (`carRef.current.translation()`, `carRef.current.rotation()`)
- Produces: componente `<FollowCamera carRef={carRef} />` — sem JSX visível, manipula `camera` via `useFrame`

**Nota:** componente 3D, testado manualmente no browser.

- [ ] **Step 1: Criar FollowCamera.jsx**

Criar `src/components/gta/FollowCamera.jsx`:

```jsx
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const _targetPos = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _carDir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export default function FollowCamera({ carRef }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!carRef.current) return;

    const carPos = carRef.current.translation();
    const carRot = carRef.current.rotation();

    _quat.set(carRot.x, carRot.y, carRot.z, carRot.w);
    _carDir.set(0, 0, -1).applyQuaternion(_quat);

    _cameraPos.set(
      carPos.x - _carDir.x * 10,
      carPos.y + 5,
      carPos.z - _carDir.z * 10
    );

    camera.position.lerp(_cameraPos, 0.08);

    _targetPos.set(carPos.x, carPos.y + 1, carPos.z);
    camera.lookAt(_targetPos);
  });

  return null;
}
```

- [ ] **Step 2: Confirmar que testes passam**

```bash
npm test
```

Resultado esperado: todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/FollowCamera.jsx
git commit -m "feat: add third-person follow camera with lerp"
```

---

## Task 6: PlayerCar Component

**Files:**
- Create: `src/components/gta/PlayerCar.jsx`

**Interfaces:**
- Consumes:
  - `carRef` — React ref que será atribuído ao `RigidBody` Rapier
  - `onStateChange(fn)` — callback chamado com `(prevState) => newState` quando o estado do jogo muda
- Produces: componente `<PlayerCar carRef={carRef} onStateChange={fn} />` — carro rosa com física

**Nota:** componente 3D, testado manualmente no browser.

- [ ] **Step 1: Criar PlayerCar.jsx**

Criar `src/components/gta/PlayerCar.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const MAX_SPEED = 30;
const ACCELERATION = 18;
const TURN_SPEED = 1.8;
const BRAKE_FORCE = 25;

const _vel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export default function PlayerCar({ carRef, onStateChange }) {
  const keys = useRef({});

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

  useFrame((_, delta) => {
    if (!carRef.current) return;

    const body = carRef.current;
    const linvel = body.linvel();
    const rot = body.rotation();

    _vel.set(linvel.x, linvel.y, linvel.z);
    const speed = new THREE.Vector3(linvel.x, 0, linvel.z).length();

    _quat.set(rot.x, rot.y, rot.z, rot.w);
    _forward.set(0, 0, -1).applyQuaternion(_quat);

    const k = keys.current;
    const accel = k['ArrowUp']   || k['w'] || k['W'];
    const brake = k['ArrowDown'] || k['s'] || k['S'];
    const left  = k['ArrowLeft'] || k['a'] || k['A'];
    const right = k['ArrowRight']|| k['d'] || k['D'];

    if (accel && speed < MAX_SPEED) {
      body.applyImpulse({
        x: _forward.x * ACCELERATION * delta,
        y: 0,
        z: _forward.z * ACCELERATION * delta,
      }, true);
    }

    if (brake) {
      body.applyImpulse({
        x: -_forward.x * BRAKE_FORCE * delta,
        y: 0,
        z: -_forward.z * BRAKE_FORCE * delta,
      }, true);
    }

    if ((left || right) && speed > 0.5) {
      const dir = left ? 1 : -1;
      const torque = dir * TURN_SPEED * delta * Math.min(speed / 5, 1);
      body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
    }

    if (speed > MAX_SPEED) {
      const factor = MAX_SPEED / speed;
      body.setLinvel({ x: linvel.x * factor, y: linvel.y, z: linvel.z * factor }, true);
    }
  });

  return (
    <RigidBody
      ref={carRef}
      position={[0, 1, 0]}
      mass={800}
      linearDamping={0.5}
      angularDamping={5}
      colliders="cuboid"
      enabledRotations={[false, true, false]}
    >
      {/* Corpo principal */}
      <mesh castShadow>
        <boxGeometry args={[2, 0.8, 4]} />
        <meshStandardMaterial color="#FF6EC7" />
      </mesh>
      {/* Tejadilho */}
      <mesh position={[0, 0.7, -0.3]} castShadow>
        <boxGeometry args={[1.8, 0.6, 2]} />
        <meshStandardMaterial color="#FF4DB8" />
      </mesh>
      {/* Rodas */}
      {[[-1, -0.4, 1.3], [1, -0.4, 1.3], [-1, -0.4, -1.3], [1, -0.4, -1.3]].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </RigidBody>
  );
}
```

- [ ] **Step 2: Confirmar que testes passam**

```bash
npm test
```

Resultado esperado: todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add src/components/gta/PlayerCar.jsx
git commit -m "feat: add player car with Rapier physics and keyboard controls"
```

---

## Task 7: GameCanvas + GTAGame (integração)

**Files:**
- Create: `src/components/gta/GameCanvas.jsx`
- Create: `src/components/gta/GTAGame.jsx`
- Create: `src/components/gta/GTAGame.css`

**Interfaces:**
- Consumes: todos os componentes das tasks anteriores
- Produces:
  - `<GameCanvas />` — canvas completo com cena 3D + HUD
  - `<GTAGame />` — botão + modal fullscreen (interface pública, usada pelo Header)

**Nota:** integração 3D, testada manualmente no browser.

- [ ] **Step 1: Criar GameCanvas.jsx**

Criar `src/components/gta/GameCanvas.jsx`:

```jsx
import { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Sky, Stars } from '@react-three/drei';
import City from './City';
import PlayerCar from './PlayerCar';
import FollowCamera from './FollowCamera';
import HUD from './HUD';
import { INITIAL_STATE } from './gameState';

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

export default function GameCanvas() {
  const carRef = useRef();
  const [gameState, setGameState] = useState(INITIAL_STATE);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Suspense fallback={<LoadingScreen />}>
        <Canvas shadows camera={{ fov: 75, near: 0.1, far: 1000 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 80, 50]} intensity={1} castShadow />
          <Sky sunPosition={[100, 15, 100]} turbidity={0.5} rayleigh={0.5} />
          <Stars radius={200} depth={50} count={3000} />
          <Physics gravity={[0, -20, 0]}>
            <City />
            <PlayerCar carRef={carRef} onStateChange={setGameState} />
          </Physics>
          <FollowCamera carRef={carRef} />
        </Canvas>
      </Suspense>
      <HUD life={gameState.life} money={gameState.money} wanted={gameState.wanted} />
    </div>
  );
}
```

- [ ] **Step 2: Criar GTAGame.jsx**

Criar `src/components/gta/GTAGame.jsx`:

```jsx
import { useState } from 'react';
import GameCanvas from './GameCanvas';
import './GTAGame.css';

export default function GTAGame() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="gta-btn" onClick={() => setOpen(true)}>🚓 GTA City</button>
      {open && (
        <div className="gta-modal">
          <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
          <GameCanvas />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Criar GTAGame.css**

Criar `src/components/gta/GTAGame.css`:

```css
.gta-btn {
  margin-top: 12px;
  padding: 12px 18px;
  border: 1px solid #444;
  background: #111;
  color: #fff;
  border-radius: 14px;
  cursor: pointer;
  font-size: 14px;
}

.gta-btn:hover {
  background: #222;
}

.gta-modal {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 1000;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid #555;
  color: #fff;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.gta-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(to bottom, #FF6EC7 0%, #FF4500 40%, #1a1a2e 100%);
}

.loading-content {
  text-align: center;
  color: #fff;
  font-family: 'Pricedown', 'Arial Black', sans-serif;
}

.loading-title {
  font-size: 72px;
  letter-spacing: 8px;
  color: #00FFFF;
  text-shadow: 4px 4px 0 #FF6EC7;
  margin-bottom: 16px;
}

.loading-sub {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
}
```

- [ ] **Step 4: Confirmar que testes passam**

```bash
npm test
```

Resultado esperado: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/components/gta/GameCanvas.jsx src/components/gta/GTAGame.jsx src/components/gta/GTAGame.css
git commit -m "feat: add GameCanvas and GTAGame modal wrapper"
```

---

## Task 8: Substituir componente antigo e ligar ao Header

**Files:**
- Modify: `src/components/Header.jsx`
- Delete: `src/components/GTAGame.jsx`
- Delete: `src/components/GTAGame.css`

**Interfaces:**
- Consumes: `<GTAGame />` de `./gta/GTAGame`
- Produces: currículo com jogo 3D funcionando no browser

- [ ] **Step 1: Actualizar import no Header.jsx**

Em `src/components/Header.jsx`, linha 4, mudar:

```jsx
import GTAGame from './GTAGame';
```

para:

```jsx
import GTAGame from './gta/GTAGame';
```

- [ ] **Step 2: Eliminar os ficheiros antigos**

```bash
rm src/components/GTAGame.jsx
rm src/components/GTAGame.css
```

- [ ] **Step 3: Arrancar o servidor de dev e testar manualmente**

```bash
npm run dev
```

Verificações manuais:
1. O currículo carrega sem erros na consola
2. O botão "🚓 GTA City" está visível no Header
3. Clicar no botão abre o modal fullscreen preto
4. A loading screen "VICE CITY" aparece durante o carregamento
5. A cidade 3D fica visível com chão escuro, ruas e prédios
6. As teclas W/A/S/D ou setas movem o carro rosa
7. A câmera segue o carro com suavidade
8. O HUD mostra ♥ 100 / $0 / 0 estrelas no canto superior direito
9. O minimapa e "V-ROCK" aparecem no canto inferior esquerdo
10. Botão ✕ fecha o modal
11. O carro colide com os prédios e não os atravessa
12. O carro não sai dos limites do mapa

- [ ] **Step 4: Confirmar que testes passam**

```bash
npm test
```

Resultado esperado: todos os testes passam.

- [ ] **Step 5: Commit final**

```bash
git add src/components/Header.jsx
git commit -m "feat: wire GTA 3D game into curriculum, replace 2D version"
```

---

## Resumo de verificação manual (pós-implementação)

| Verificação | Como testar |
|-------------|-------------|
| Carro acelera | W ou ↑ |
| Carro trava/ré | S ou ↓ |
| Carro vira | A/D ou ←/→ (só funciona em movimento) |
| Câmera segue o carro | Conduzir em qualquer direcção |
| Colisão com prédios | Conduzir directo para um prédio |
| Colisão com limites | Conduzir até ao extremo do mapa |
| HUD actualiza | (em fases futuras — pickups) |
| Loading screen | Fechar e reabrir o modal |
