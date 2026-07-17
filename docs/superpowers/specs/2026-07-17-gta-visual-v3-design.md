# GTA Visual v3 — estradas, praias e gráficos (com orçamento de FPS)

**Data:** 2026-07-17
**Estado:** aprovado pelo utilizador (abordagem híbrida com orçamento)

## Contexto e objetivo

O mundo 3D (estilo Vice City) tem estradas planas pretas com tracejado amarelo,
praia lisa cor de areia e um visual geral "plástico". O utilizador quer melhorar
gráficos, estradas e praias — mas o jogo **já corre mal às vezes**, portanto a
regra central deste design é: **cada custo novo tem de ser pago por uma
otimização equivalente ou maior**. Resultado esperado: melhor visual E melhor FPS.

Técnica base: texturas procedurais em canvas (padrão já usado no projeto —
`makeWindowTexture`, `makeWaveTexture` em `City.jsx`), partilhadas entre meshes.

## 1. Estradas

### 1.1 Textura única de estrada (menos meshes por rua)

Uma `CanvasTexture` procedural partilhada com o corte transversal completo da
estrada embutido, mapeada nos ribbons com UVs (u = largura, v = comprimento em
unidades de mundo):

- **u** (transversal): linha branca contínua junto a cada borda (~3% da largura),
  asfalto com grão e manchas no meio, tracejado amarelo central.
- **v** (longitudinal): o tracejado amarelo repete com período fixo em unidades
  de mundo (repeat.y calculado por rua a partir de `path.total`); o grão de
  asfalto varia para não parecer um padrão.

`makeRibbonGeometry` (City.jsx:20) ganha um atributo `uv`: u ∈ {0,1} nas duas
bordas, v = distância acumulada ao longo da polilinha. Função pura, testável.

Cada rua passa de 4 meshes (asfalto + berma L + berma R + tracejado) para
**3 meshes** (estrada texturada + passeio L + passeio R). O componente
`RoadPath` perde as bermas planas e o `makeDashesGeometry` (substituídos pela
textura).

### 1.2 Cruzamentos limpos

Novo export `INTERSECTIONS` em `map.js`: lista `{ pos: [x,z], r }` derivada dos
waypoints partilhados entre ruas (ex.: extremos das pontes `[-32,0]`, `[32,0]`,
`[-32,-100]`, `[32,-100]`, e cruzamentos vespucci/mainWest, coastal/diagonal,
oceanDrive/mainEast, etc. — valores exatos calculados na fase de plano a partir
de `ROAD_PATHS`).

Em cada cruzamento:
- Um **remendo de asfalto liso** (quad com a mesma textura mas sem marcações,
  y ligeiramente acima das estradas) esconde as sobreposições de linhas.
- **Passadeiras**: quads com textura procedural de barras brancas, nas entradas
  dos 3–4 cruzamentos principais (não todos — controlar draw calls).

### 1.3 Passeios com lancil

Nova função `makeSidewalkGeometry(points, width, height)`: topo do passeio a
y = 0.14 + face vertical de lancil do lado da estrada, num único
`BufferGeometry` com UVs. Textura procedural de betão com juntas de dilatação
(linhas escuras transversais periódicas).

**Sem colisores** — visual apenas; o carro sobe o passeio como no GTA original.
Os pedestres (`SIDEWALK_PATHS`) passam a andar a y = 0.14 (offset no Pedestrian).

## 2. Praias

### 2.1 Transição em camadas (terra → mar)

Novo export `WATERLINE` em `map.js`: polilinha suavizada ao longo da borda
marítima da praia (arco exterior de `BEACH_SHAPE`, x≈138–178). A partir dela,
três ribbons (reutilizando `makeRibbonGeometry` + `offsetPolyline`):

1. **Areia molhada** — faixa deslocada ~3u para terra, tom mais escuro
   (`#C6A860`), opaca.
2. **Espuma** — faixa centrada na linha de água, textura procedural de espuma
   (ruído branco com franjas), `transparent`, animada: offset da textura desloca
   com o tempo e a opacidade/posição pulsa com seno (~0.1 Hz) para simular o
   avanço/recuo das ondas. Um único material animado no `useFrame` existente do
   `Ocean` (sem novo loop).
3. **Água rasa** — faixa deslocada ~5u para o mar, turquesa (`#2EA8A0`)
   translúcida (opacity ~0.55), a fundir com o oceano.

### 2.2 Areia com textura

Textura procedural de grão de areia (speckle fino em dois tons) aplicada ao
`shapeGeometry` da `Beach` (ShapeGeometry já gera UVs a partir das coordenadas;
ajustar `repeat` à escala do mundo).

### 2.3 Adereços de praia

~10 objetos primitivos novos, sem colisores: toalhas (quads coloridos rodados),
bolas de praia (esferas bicolores), 2–3 pranchas de surf espetadas na areia
(boxes finos inclinados). Posições fixas na areia seca, longe dos guarda-sóis
existentes.

## 3. Gráficos gerais

- **Oceano**: reflexo do sol mais vivo — afinar `roughness`/`metalness` e cor;
  manter o bumpMap animado existente.
- **Edifícios**: tirar o ar de plástico com variação subtil — textura procedural
  leve de ruído/manchas usada como `roughnessMap` partilhado em todas as
  fachadas (uma textura, custo ~zero).
- **Adereços urbanos**: 8–10 objetos leves ao longo dos passeios (hidrantes =
  cilindro+esfera, caixotes de lixo = cilindros escuros). Sem colisores.

## 4. Otimizações (pagam a conta)

| Otimização | Antes | Depois | Ganho |
|---|---|---|---|
| Palmeiras | ~33 grupos × 9 meshes ≈ 300 draw calls | 3 `InstancedMesh` (troncos, frondes, miolos) | ~-295 draw calls |
| Tracejado + bermas | 3 meshes/rua × 9 ruas | embutido na textura | ~-27 meshes |
| Shadow map | 2048² | 1024² | -75% memória/fill de sombras |
| `dpr` | [1, 1.75] | [1, 1.5] | ~-27% pixéis renderizados |

Nota: as frondes instanciadas perdem a alternância de cor por folha — usar uma
cor intermédia (`#159A2A`); perda visual negligível a distância de jogo.

## 5. Testes e verificação

- **Unit (vitest)**: UVs de `makeRibbonGeometry` (u∈{0,1}, v acumula distância
  real), `makeSidewalkGeometry` (topo a y=0.14, face de lancil presente),
  `INTERSECTIONS`/`WATERLINE` bem formados (pontos dentro dos limites do mapa).
- **Visual (browser)**: percorrer de carro a mainWest→ponte→mainEast a verificar
  marcações e cruzamentos; ir à praia a pé verificar espuma animada e camadas;
  confirmar que o FPS não piorou (contagem de draw calls antes/depois via
  `gl.info`).

## Fora de âmbito

- Colisores em passeios/lancis (jogabilidade inalterada).
- Declive 3D real da praia a entrar na água (fake por camadas é suficiente).
- Texturas externas/assets descarregados (tudo procedural).
- Alterações a físicas, armas, HUD ou tráfego.
