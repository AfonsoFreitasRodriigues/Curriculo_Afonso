# GTA Vice City 3D — Sub-sistema: Jogador a Pé + Armas

**Data:** 2026-07-14
**Contexto:** Jogo 3D estilo Vice City em `src/components/gta/` (React Three Fiber + rapier). Já existem: carro do jogador com física, tráfego NPC, pedestres, radar, HUD, bloom. Este sub-sistema adiciona sair/entrar do carro, carjacking, armas com mira de rato e consequências no mundo (mortes, dinheiro, estrelas de procurado).

## Arquitetura

**Padrão escolhido:** registry em módulo + estado React no GameCanvas (opção A do brainstorm).
- Dados por-frame (posições, hp, vivos/mortos) em **refs mutáveis** num módulo `world.js` — zero re-renders, mesmo padrão dos `posRef` do radar.
- Eventos raros (trocar arma, entrar/sair do carro, atualizar dinheiro/estrelas) em **React state** no GameCanvas.
- Sem dependências novas.

## Componentes

### 1. `world.js` — registry central (novo)
Módulo com estado mutável partilhado:
```js
export const peds = [];   // { id, pos: {x,z}, hp, alive, deadAt, respawnAt }
export const cars = [];   // { id, pos: {x,z}, hp, alive, deadAt, respawnAt, jacked }
```
- `Pedestrian` e `NPCCar` registam-se ao montar e atualizam `pos` a cada frame.
- O sistema de combate lê o registry para hit-tests; escreve `hp`/`alive`.
- Funções utilitárias: `hitTest(origin, dir, maxDist, radius)` → alvo mais próximo no raio; `damagePed(id, dmg)`, `damageCar(id, dmg)` → devolvem `true` se matou.

### 2. Modos e entrar/sair (GameCanvas)
- `mode: 'car' | 'foot'` (React state). Tecla **F** ou **Enter** alterna.
- **Sair:** carro fica parado onde está (RigidBody permanece), jogador aparece 1.8u ao lado esquerdo do carro.
- **Entrar:** a menos de 3.5u do carro do jogador → entra. A menos de 3.5u de um carro NPC vivo → **carjacking**: o NPC é marcado `jacked` (deixa de ser renderizado no tráfego), o RigidBody do jogador teleporta para a posição/yaw dele, o carro do jogador adota a cor do roubado. O carro anterior fica no mundo como **carro estacionado** (mesh estático + CuboidCollider fixo), acumulando numa lista `parkedCars`.
- NPC jacked renasce na rota após 20s.

### 3. `OnFootPlayer.jsx` (novo)
- RigidBody dinâmico (colisor cápsula ~0.4×1.6), `enabledRotations` tudo false, `linearDamping` alto.
- WASD/setas relativo à câmara, velocidade 6 u/s; o boneco roda para a direção do movimento; ao disparar roda para a direção da mira.
- Visual: boneco blocky — camisa havaiana rosa `#FF6EC7`, calças azuis `#1a3a6a`, cabeça `#FDBCB4`; braço direito estica ao segurar pistola/uzi; pernas alternam (sin) ao andar.
- Expõe `playerRef` para a câmara e para a origem dos tiros.

### 4. FollowCamera generalizada
- Passa a receber `targetRef` + preset: carro = offset atual; a pé = mais perto e mais baixo (ex.: 6u atrás, 3u acima).

### 5. Armas (`weapons.js` dados + lógica no `CombatSystem`)
| Slot | Arma | Dano | Cadência | Alcance | Ammo inicial |
|---|---|---|---|---|---|
| 1 | Punhos | 10 | 1.5/s | 2u | ∞ |
| 2 | Pistola | 25 | 2.5/s | 60u | 60 |
| 3 | Uzi | 10 | 8/s (auto) | 50u | 240 |

- Troca com teclas **1/2/3** (só a pé). HUD mostra nome + ammo.
- **Disparo:** botão esquerdo do rato. Pistola/punhos: por clique. Uzi: automática enquanto seguras.
- **Mira de rato:** raycast da câmara através do cursor (NDC) contra o plano do chão → ponto-alvo no mundo; direção do tiro = jogador → ponto-alvo (horizontal). Em touch (botão FIRE): direção = frente do boneco.
- **Hit test analítico:** para cada ped/carro vivo no registry, distância perpendicular ao raio < raio de acerto (ped 0.9u, carro 1.8u) e à frente do jogador dentro do alcance → acerta no mais próximo.
- **Efeitos:** muzzle flash (mesh emissivo ~50ms, brilha com bloom), tracer amarelo (linha fina origem→impacto, ~60ms). Som fica para o sub-sistema de áudio.

### 6. Consequências
- **Pedestre** 20 hp. Morte: cai (rotação 90°, para de andar), **larga pickup de $50** (cubo verde emissivo a rodar; apanha-se por proximidade <1.5u, a pé ou de carro), corpo some após 6s, renasce no ponto inicial após 15s. **+1 estrela**.
- **Carro NPC** 100 hp. Morte: para, fica carbonizado (`#1A1A1A`), chamas (2-3 cones emissivos laranja animados) + fumo (esferas cinza a subir/expandir), some após 8s, renasce na rota após 12s. **+1 estrela**. Carro morto não pode ser jacked.
- **Atropelamento:** ped a <1.6u do carro do jogador com velocidade >8 u/s morre (mesmas consequências).
- **Estrelas de procurado:** máx 5; decaem 1 a cada 30s sem novos crimes. Guardadas no gameState existente (`wanted`). A polícia em si é o próximo sub-sistema.
- **Pickups de ammo:** 3 caixas fixas no mundo (a rodar/flutuar, emissivas): enchem pistola para 60 e uzi para 240. Reaparecem após 30s.

### 7. HUD e controlos
- HUD: por baixo do dinheiro, nome da arma + ammo (`PISTOL 45` / `FISTS`); ammo a vermelho quando 0.
- **Crosshair** rosa (div HTML) que segue o rato quando `mode === 'foot'`; cursor nativo escondido sobre o canvas nesse modo.
- Controls.jsx (mobile): botão **F** (entrar/sair) e botão **FIRE**; FIRE dispara na direção do boneco.

## Fluxo de dados
- Input (teclado/rato/touch) → refs de input.
- `CombatSystem` (componente com useFrame dentro do Canvas): lê input + registry, aplica danos, gere cooldowns/efeitos/pickups/decay de estrelas; comunica eventos raros ao React via callbacks (`onMoney`, `onWanted`, `onAmmo`).
- Radar continua a ler `posRef`s — peds mortos/carros jacked deixam de emitir blip.

## Tratamento de erros
- Trocar de modo é ignorado durante 0.5s após a última troca (debounce).
- Se o raycast do rato não intersectar o chão (a apontar para o céu), o tiro sai na horizontal na direção do cursor.
- `carRef`/`playerRef` nulos em qualquer frame → skip silencioso (padrão existente).

## Testes
- Sem framework de testes no projeto; verificação: `npm run build` limpo + teste manual no browser (sair/entrar, jack, disparar cada arma, matar ped, apanhar $, destruir carro, decay de estrelas).

## Fora de âmbito (YAGNI)
- Polícia a perseguir/prender, dano e morte do jogador, mais armas, sangue, animações esqueléticas, som.
