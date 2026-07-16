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
