// Registry central de entidades — dados por-frame mutáveis, lidos pelo
// combate sem re-renders (mesmo padrão dos posRef do radar).
export const peds = [];
export const cars = [];

// Relógio do mundo (three clock) — atualizado pelo CombatSystem a cada frame
// para que código fora do Canvas (ex.: carjacking) use a mesma timeline.
export const worldTime = { now: 0 };

export function ensurePed(id) {
  let e = peds.find(p => p.id === id);
  if (!e) {
    e = { id, x: 0, z: 0, hp: 20, alive: true, deadAt: 0 };
    peds.push(e);
  }
  return e;
}

export function ensureCar(id) {
  let e = cars.find(c => c.id === id);
  if (!e) {
    e = { id, x: 0, z: 0, ry: 0, color: '#FFD700', hp: 100, alive: true, deadAt: 0, jacked: false, jackedAt: 0 };
    cars.push(e);
  }
  return e;
}

const PED_RADIUS = 0.9;
const CAR_RADIUS = 1.8;

// Raio horizontal a partir de (ox,oz) na direção normalizada (dx,dz).
// Devolve o alvo vivo mais próximo dentro do alcance, ou null.
export function hitTest(ox, oz, dx, dz, maxDist) {
  let best = null;
  const test = (list, radius, kind) => {
    for (const e of list) {
      if (!e.alive || e.jacked) continue;
      const rx = e.x - ox;
      const rz = e.z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > maxDist) continue;
      const px = rx - dx * along;
      const pz = rz - dz * along;
      if (px * px + pz * pz > radius * radius) continue;
      if (!best || along < best.dist) best = { kind, entity: e, dist: along };
    }
  };
  test(peds, PED_RADIUS, 'ped');
  test(cars, CAR_RADIUS, 'car');
  return best;
}

// Aplica dano; devolve true se este golpe matou.
export function damage(entity, dmg, now) {
  if (!entity.alive) return false;
  entity.hp -= dmg;
  if (entity.hp <= 0) {
    entity.alive = false;
    entity.deadAt = now;
    return true;
  }
  return false;
}

// Repõe o estado vivo de todas as entidades — chamado quando o jogo (re)abre,
// porque o relógio do Canvas recomeça em 0 e timestamps antigos ficariam inválidos.
// Repõe campos in-place (não esvazia os arrays): os componentes guardam
// referências às entidades via useMemo e em StrictMode remontam.
export function resetWorld() {
  for (const p of peds) {
    p.hp = 20; p.alive = true; p.deadAt = 0;
  }
  for (const c of cars) {
    c.hp = 100; c.alive = true; c.deadAt = 0; c.jacked = false; c.jackedAt = 0;
  }
  worldTime.now = 0;
}
