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
