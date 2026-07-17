// src/tests/map.test.js
import { describe, it, expect } from 'vitest';
import { INTERSECTIONS, WATERLINE, CROSSWALKS } from '../components/gta/map';

describe('INTERSECTIONS', () => {
  it('encontra os cruzamentos das pontes', () => {
    const near = (x, z) =>
      INTERSECTIONS.some(it => Math.hypot(it.pos[0] - x, it.pos[1] - z) < 8);
    expect(near(-32, 0)).toBe(true);
    expect(near(32, 0)).toBe(true);
    expect(near(-32, -100)).toBe(true);
    expect(near(32, -100)).toBe(true);
  });

  it('todos dentro do mapa, com raio razoável, sem duplicados próximos', () => {
    expect(INTERSECTIONS.length).toBeGreaterThanOrEqual(4);
    for (const it of INTERSECTIONS) {
      expect(Math.abs(it.pos[0])).toBeLessThan(200);
      expect(Math.abs(it.pos[1])).toBeLessThan(200);
      expect(it.r).toBeGreaterThanOrEqual(5);
      expect(it.r).toBeLessThanOrEqual(15);
    }
    for (let i = 0; i < INTERSECTIONS.length; i++)
      for (let j = i + 1; j < INTERSECTIONS.length; j++) {
        const [a, b] = [INTERSECTIONS[i], INTERSECTIONS[j]];
        expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])).toBeGreaterThanOrEqual(12);
      }
  });
});

describe('WATERLINE', () => {
  it('percorre a borda marítima da praia (este, x≈127–190)', () => {
    expect(WATERLINE.length).toBeGreaterThanOrEqual(8);
    for (const [x, z] of WATERLINE) {
      expect(x).toBeGreaterThan(120);
      expect(x).toBeLessThan(190);
      expect(z).toBeGreaterThan(-150);
      expect(z).toBeLessThan(155);
    }
  });
});

describe('CROSSWALKS', () => {
  it('4 passadeiras nas pontes, dentro do asfalto reto (|x| ≤ 30)', () => {
    expect(CROSSWALKS).toHaveLength(4);
    for (const c of CROSSWALKS) {
      expect(Math.abs(c.pos[0])).toBeLessThanOrEqual(30);
      expect([0, -100]).toContain(c.pos[1]);
      expect(c.w).toBeGreaterThanOrEqual(11);
    }
  });
});
