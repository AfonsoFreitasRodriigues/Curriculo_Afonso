# GTA Vice City 3D — Sub-sistema: Mapa Orgânico v2

**Data:** 2026-07-15
**Contexto:** O mundo atual é feito de retângulos (`ISLANDS`/`ROADS` em City.jsx): ilhas retangulares, ruas retas em grelha, NPCs em linhas ida-e-volta, radar a preencher retângulos. Este sub-sistema substitui isso por um mapa orgânico: costa curva, ruas com curvas e diagonais, tráfego por waypoints e radar a desenhar as formas reais. Aprovado no brainstorm: "Ruas curvas a sério", mapa antes dos modelos.

## Arquitetura

**Fonte única de verdade:** novo módulo `map.js` com as formas do mundo (contornos das ilhas, polilinhas das ruas, praia, edifícios). Três consumidores leem exatamente os mesmos dados:
1. **City.jsx** — gera geometria 3D (chão das ilhas por `THREE.Shape`, ruas por malha "ribbon", colisores da costa por cadeia de segmentos)
2. **HUD.jsx (radar)** — desenha polígonos preenchidos (ilhas/praia) e polilinhas com espessura (ruas)
3. **Tráfego** — NPCCar e Pedestrian seguem as polilinhas por comprimento de arco

As curvas são autoradas como **pontos de controlo** e suavizadas uma vez no load do módulo com `THREE.CatmullRomCurve3` (`getSpacedPoints`, ~1 ponto por 8u; ilhas com `closed: true`). Tudo pré-calculado a nível de módulo — zero trabalho por frame além do que já existe.

## Convenções

- Coordenadas de mundo: plano XZ, y=0 no chão (inalterado).
- `THREE.Shape` é 2D (XY). Mapeamento: `new THREE.Vector2(x, -z)` + mesh com `rotation={[-Math.PI/2, 0, 0]}` → o ponto de shape (x, −z) cai no mundo em (x, 0, z). Este mapeamento é obrigatório para que 3D, radar e colisores coincidam.
- Estrutura geral preservada: 2 ilhas, canal em x≈±25, pontes em z≈0 e z≈−100, downtown a oeste, praia a este. Edifícios continuam caixas (o upgrade deles é o sub-projeto "Modelos procedurais v2").

## Componentes

### 1. `map.js` (novo)
Exporta:
- `ISLAND_SHAPES: [{ points: [[x,z],…] }]` — 2 contornos fechados suavizados (~40-60 pontos cada), costa irregular com baías e cabos.
- `BEACH_SHAPE: { points: [[x,z],…] }` — polígono fechado da praia (faixa em arco no lado este da ilha este).
- `ROAD_PATHS: [{ id, width, points: [[x,z],…] }]` — ~10 ruas suavizadas: boulevard costeiro curvo (oeste), avenida principal em S (oeste, N-S), uma diagonal, E-W principal e E-W norte (oeste), Ocean Drive em arco (este), E-W este, E-W norte este, 2 pontes retas, e 1 rota "travessia" que atravessa as duas ilhas pela ponte principal (para o NPC de longa distância).
- `SIDEWALK_PATHS: [{ id, points }]` — 4-6 percursos de passeio para pedestres (offsets laterais das ruas principais, pré-calculados).
- `BUILDINGS` — mudado de City.jsx para aqui, com posições ajustadas às ruas novas (mesma quantidade ±, mesmas cores/alturas).
- `BRIDGE_OPENINGS: [{ minX, maxX, minZ, maxZ }]` — 2 retângulos onde a cadeia de colisores da costa NÃO é gerada (aberturas das pontes).
- Helpers de arco: cada path ganha `lengths` acumulados pré-calculados; `pathLength(path)` e `pointAt(path, s)` → `{ x, z, yaw }` (yaw = direção do segmento, convenção `atan2(dx, dz)` — a mesma dos NPCs atuais).

### 2. City.jsx — mundo 3D
- **Remove:** planos retangulares das ilhas, ruas `Road` retangulares, faixas de espuma retas, colisores retos do canal.
- **Ilhas:** `ShapeGeometry` do contorno (chão, cores atuais por ilha) + um rebordo fino extrudado (~0.5u de altura) na linha de costa como falésia baixa.
- **Praia:** `ShapeGeometry` do `BEACH_SHAPE` (areia atual).
- **Ruas:** função `makeRibbonGeometry(points, width)` → BufferGeometry tipo triangle-strip no plano XZ (2 vértices por ponto, perpendicular = média das normais dos segmentos adjacentes). Cada rua: asfalto (y=0.03) + linha central amarela tracejada (ribbons finos em segmentos alternados, y=0.05) + 2 passeios paralelos mais claros (ribbons com offset ±(width/2+2.5), largura 4, y=0.04).
- **Colisores da costa:** para cada aresta consecutiva do contorno de cada ilha cujo ponto médio NÃO caia num `BRIDGE_OPENINGS`: `CuboidCollider` com meia-extensão `[len/2 + 0.5, 10, 0.8]`, posição no ponto médio (y=10), rotação `[0, -atan2(dz, dx), 0]`. Substitui os colisores retos do canal; os colisores exteriores do mapa (±195) mantêm-se.
- **Adereços:** palmeiras, candeeiros, néons, guarda-sóis e luzes de cruzamento reposicionados para as ruas novas (novas listas de coordenadas; contagens semelhantes às atuais).
- Pontes mantêm guardas laterais retas.

### 3. Radar (HUD.jsx)
- Ilhas: path fill do contorno (verde-escuro atual), praia: fill areia escura (`#5A4E2E`).
- Ruas: `ctx.beginPath()` + `moveTo/lineTo` de cada ponto convertido por `worldToRadar`, `stroke` com `lineWidth = width * RADAR_SCALE`, `lineCap/lineJoin: 'round'`, cor atual das ruas.
- Edifícios: continuam `fillWorldRect` (footprints retangulares) mas lendo `BUILDINGS` de `map.js`.
- Blips, N, triângulo do jogador: inalterados.

### 4. Tráfego por waypoints
- **NPCCar:** props passam de `start/end` para `pathId` + `lane` (offset lateral em u, + = direita do sentido) + `speed` + `phase`. Movimento: `s` avança `speed*delta`, ping-pong nas pontas; posição = `pointAt(s)` + offset perpendicular; `rotation.y = yaw` (invertido quando anda para trás). Registry (`entity.x/z/ry`), `posRef` do radar, estados de morte/jack: tudo inalterado.
- **Pedestrian (City.jsx):** mesmo sistema com `SIDEWALK_PATHS` (sem lane), velocidades atuais.
- **GameCanvas:** `NPC_DATA` passa a `{ pathId, lane, speed, color, phase }` — 9 carros distribuídos pelas ruas novas incluindo 1 na rota "travessia".
- Spawn do jogador: um ponto sobre a avenida principal oeste, alinhado com a rua.

## Compatibilidade
- `ISLANDS`/`ROADS` retangulares deixam de existir; HUD e City importam de `map.js`. `BUILDINGS` re-exportado de City.jsx durante a transição não é necessário — atualizar os imports.
- Combate, carjacking, radar de entidades, wanted, HUD de armas: sem alterações (dependem só de `entity.x/z/ry` e `posRef`, que mantêm o contrato).

## Tratamento de erros
- `pointAt` clampa `s` a `[0, comprimento]`.
- Paths com < 2 pontos são erro de autoria — `map.js` valida no load (`console.warn` e ignora o path).
- Ribbon com pontos coincidentes: segmentos de comprimento ~0 são saltados ao calcular perpendiculares.

## Testes
`npm run build` limpo + teste manual: conduzir pelas curvas (sem paredes invisíveis fora da costa), atravessar as 2 pontes, radar coerente com o mundo (curvas visíveis no minimapa), NPCs a acompanhar as curvas das ruas, pedestres nos passeios, praia/costa com colisão correta, combate e carjacking intactos.

## Fora de âmbito (YAGNI)
- Modelos procedurais de carros/personagens/prédios (sub-projeto seguinte), elevação de terreno, rotundas com regras, semáforos, faixas múltiplas com ultrapassagem.
