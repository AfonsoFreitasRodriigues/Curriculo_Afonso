import { describe, it, expect } from 'vitest';
import { makeRibbonGeometry, offsetPolyline, SIDEWALK_H, makeSidewalkGeometry } from '../components/gta/geometry';

describe('makeRibbonGeometry', () => {
  it('gera UVs: u alterna 0/1 nas bordas, v acumula distância de mundo', () => {
    const g = makeRibbonGeometry([[0, 0], [10, 0], [30, 0]], 2);
    const uv = g.getAttribute('uv');
    expect(uv).toBeDefined();
    // 3 pontos × 2 vértices
    expect(uv.count).toBe(6);
    // u: borda esquerda 0, direita 1
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(1)).toBe(1);
    // v em unidades de mundo: 0, 0, 10, 10, 30, 30
    expect(uv.getY(0)).toBe(0);
    expect(uv.getY(2)).toBe(10);
    expect(uv.getY(4)).toBe(30);
  });

  it('mantém a posição dos vértices nas bordas da fita', () => {
    const g = makeRibbonGeometry([[0, 0], [10, 0]], 4);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(4);
    // direção +x ⇒ perpendicular (0,1): bordas em z=+2 e z=-2
    expect(pos.getZ(0)).toBeCloseTo(2);
    expect(pos.getZ(1)).toBeCloseTo(-2);
  });
});

describe('offsetPolyline', () => {
  it('desloca lateralmente segundo a perpendicular', () => {
    const out = offsetPolyline([[0, 0], [10, 0]], 3);
    expect(out[0][1]).toBeCloseTo(3);
    expect(out[1][1]).toBeCloseTo(3);
  });
});

describe('SIDEWALK_H', () => {
  it('é 0.14', () => expect(SIDEWALK_H).toBe(0.14));
});

describe('makeSidewalkGeometry', () => {
  // direção +x ⇒ perpendicular esquerda (0,1): borda 'left' em z=+2, 'right' em z=-2
  it('topo a SIDEWALK_H e base do lancil a 0', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'right');
    const pos = g.getAttribute('position');
    let maxY = -Infinity, minY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      maxY = Math.max(maxY, pos.getY(i));
      minY = Math.min(minY, pos.getY(i));
    }
    expect(maxY).toBeCloseTo(0.14);
    expect(minY).toBeCloseTo(0);
  });

  it('o lancil fica na borda pedida', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'right');
    const pos = g.getAttribute('position');
    // vértices da base (y=0) têm de estar todos na borda direita (z=-2)
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) < 1e-6) expect(pos.getZ(i)).toBeCloseTo(-2);
    }
  });

  it('2 pontos ⇒ 8 vértices (2 topo + 2 lancil por ponto)', () => {
    const g = makeSidewalkGeometry([[0, 0], [10, 0]], 4, 'left');
    expect(g.getAttribute('position').count).toBe(8);
  });
});
