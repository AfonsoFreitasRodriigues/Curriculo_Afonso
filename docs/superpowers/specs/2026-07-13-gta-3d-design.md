# GTA 3D Vice City — Design Spec
**Data:** 2026-07-13  
**Projeto:** Currículo Afonso (React)  
**Stack:** React Three Fiber + @react-three/rapier + @react-three/drei

---

## Visão Geral

Substituir o mini-jogo GTA 2D existente por um jogo 3D estilo Grand Theft Auto: Vice City, integrado ao site de currículo do Afonso como overlay fullscreen. O jogo abre ao clicar no botão "GTA City" existente.

O projeto é dividido em 6 sub-sistemas implementados iterativamente:

1. **Core Engine** — carro dirigível com física, câmera 3ª pessoa, cidade básica
2. **Cidade 3D completa** — prédios low-poly GLTF, ruas detalhadas, palmeiras
3. **Tráfego & NPCs** — carros com IA de tráfego, pedestres andando
4. **Sistema Policial** — estrelas de procurado, perseguição com IA
5. **Estética Vice City** — arte neon anos 80, HUD temático, loading screen
6. **Áudio** — rádio com estações, efeitos sonoros de motor/colisão/polícia

Este spec cobre o **Sub-sistema 1: Core Engine** — fundação obrigatória para todos os outros.

---

## Estrutura de Arquivos

```
src/components/gta/
├── GTAGame.jsx        ← modal wrapper (substitui componente atual)
├── GameCanvas.jsx     ← <Canvas> R3F + <Physics> Rapier
├── PlayerCar.jsx      ← veículo do jogador com física
├── City.jsx           ← geometria procedural da cidade + colisores
├── FollowCamera.jsx   ← câmera 3ª pessoa com lerp suave
└── HUD.jsx            ← overlay HTML: vida, dinheiro, estrelas, minimapa
```

O arquivo `src/components/GTAGame.jsx` e `GTAGame.css` existentes serão substituídos. O botão de abertura permanece no mesmo local no currículo.

---

## Sub-sistema 1: Core Engine

### 1.1 Dependências

```json
"@react-three/fiber": "^8.x",
"@react-three/drei": "^9.x",
"@react-three/rapier": "^1.x",
"three": "^0.x"
```

### 1.2 GTAGame.jsx — Modal Wrapper

- Mantém o mesmo `useState(open)` atual
- Quando aberto: renderiza overlay fullscreen com `<GameCanvas />`
- Botão fechar (ESC ou botão ✕) fecha o overlay
- Enquanto fechado: nenhum recurso 3D é carregado

### 1.3 GameCanvas.jsx — Canvas + Physics

```
<Canvas camera={{ fov: 75 }}>
  <Physics gravity={[0, -20, 0]}>
    <City />
    <PlayerCar />
    <FollowCamera />
  </Physics>
  <ambientLight />
  <directionalLight />
  <Sky sunPosition={[100, 20, 100]} />
</Canvas>
```

- `gravity` de -20 para manter o carro firme no chão
- `<Sky>` do Drei com pôr do sol estilo Vice City (laranja/rosa)
- Luzes: ambient + directional com sombras

### 1.4 PlayerCar.jsx — Física do Veículo

**Componentes Rapier:** `RigidBody` + `CuboidCollider`

**Física de direção:**
- Aceleração: força na direção frontal do carro (`addForce`)
- Direção: rotação no eixo Y proporcional à velocidade (sem girar parado)
- Damping lateral: `linearDamping` e `angularDamping` para sensação de peso
- Velocidade máxima: clamp na velocidade linear a 30 unidades/s

**Controles:**
| Tecla | Ação |
|-------|------|
| W / ↑ | Acelerar |
| S / ↓ | Frear / Ré |
| A / ← | Virar esquerda |
| D / → | Virar direita |

**Estado do jogo** (React state ou zustand):
- `money`: número, aumenta ao coletar pickups
- `life`: 0–100, diminui em colisões fortes
- `wanted`: 0–5 estrelas

### 1.5 City.jsx — Cidade Procedural

Fase 1 usa geometrias Three.js puras (sem GLTF):

- **Chão:** `PlaneGeometry` grande com cor #333 (asfalto)
- **Ruas:** grid de faixas com `PlaneGeometry` sobrepostas
- **Prédios:** `BoxGeometry` de alturas variadas (8–40 unidades), cores pastéis/neon
- **Palmeiras:** cilindro (tronco) + cone (copa), espalhadas nas calçadas
- **Colisores:** cada prédio tem `CuboidCollider` — carro colide e para
- **Bordas:** 4 paredes invisíveis com `CuboidCollider` nas extremidades do mapa

Dimensões do mapa: 400×400 unidades (expansível nas fases seguintes).

### 1.6 FollowCamera.jsx

Câmera 3ª pessoa implementada via `useFrame`:

```
posição alvo = posição do carro - direção frontal * 10 + vetor Y * 5
olhar para = posição do carro
lerp suave: camera.position.lerp(target, 0.08)
camera.lookAt(carPosition)
```

- Segue o carro com atraso suave (lerp factor 0.08)
- Altura fixa acima do carro
- Rotação da câmera acompanha direção do carro em curvas

### 1.7 HUD.jsx — Overlay UI

Elemento HTML posicionado sobre o Canvas (absolute, z-index alto):

```
┌─────────────────────────────────────────────┐
│  ★★★☆☆                          ♥ 100  $0  │
│                                             │
│                  [canvas 3D]                │
│                                             │
│  [minimapa 120×120px]    [RADIO: V-ROCK]   │
└─────────────────────────────────────────────┘
```

**Elementos:**
- Estrelas de procurado (1–5), ativas em cor dourada
- Barra de vida em rosa `#FF6EC7`
- Contador de dinheiro com animação ao aumentar
- Minimapa: `<canvas>` 2D, ponto branco = jogador, pontos vermelhos = polícia (fase 4)
- Nome da estação de rádio (fase 6)

**Estética:**
- Fonte: `Pricedown` (Google Fonts ou CDN) — fonte icônica do GTA
- Cores: rosa `#FF6EC7`, azul neon `#00FFFF`, fundo `rgba(0,0,0,0.6)`
- Loading screen com gradiente pôr do sol + silhueta de palmeira antes de entrar

---

## Roadmap de Sub-sistemas

| # | Sub-sistema | Depende de | Entregável |
|---|-------------|-----------|------------|
| 1 | Core Engine | — | Carro dirigível em cidade básica |
| 2 | Cidade Completa | 1 | Prédios GLTF, ruas detalhadas |
| 3 | Tráfego & NPCs | 2 | Carros e pedestres com IA |
| 4 | Sistema Policial | 1, 3 | Estrelas, perseguição |
| 5 | Estética VC | 1 | Arte neon, HUD completo, loading |
| 6 | Áudio | 1 | Rádio, efeitos sonoros |

Sub-sistemas 2–6 terão seus próprios specs quando o sub-sistema 1 estiver completo.

---

## Decisões Técnicas

- **R3F sobre Three.js puro:** integração natural com React, sintaxe declarativa, ecossistema Drei reduz código boilerplate
- **Rapier sobre Cannon-es:** mais moderno, melhor performance, suporte ativo
- **Geometria procedural na fase 1:** permite iterar rápido sem dependência de assets externos
- **Estado local React (useState):** suficiente para fase 1; avaliar zustand se estado crescer nas fases seguintes
- **Overlay HTML para HUD:** mais fácil de estilizar do que elementos 3D, sem custo de performance significativo

---

## O que está fora do escopo deste spec

- Modelos GLTF de prédios e carros (Sub-sistema 2)
- IA de tráfego e pedestres (Sub-sistema 3)
- Lógica de perseguição policial (Sub-sistema 4)
- Efeitos de partículas, explosões (Sub-sistemas futuros)
- Modo multiplayer (não planejado)
