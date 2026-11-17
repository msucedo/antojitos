import { describe, expect, it } from 'vitest';
import sprite from './assets/icons.svg?raw';
import { simboloSvg } from './cara';
import { LOGROS } from './logros';

/** Símbolos del sprite que usan los logros: los que la vitrina rasteriza a textura. */
const SIMBOLOS = [...new Set(LOGROS.flatMap((l) => ('sprite' in l.icono ? [l.icono.sprite] : [])))];

/** Fuente de cada módulo (sin tests) para comprobar desde dónde se importa three. */
const FUENTES = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('cara de la vitrina', () => {
  it('cubre los símbolos de los logros', () => {
    expect(SIMBOLOS.length).toBeGreaterThan(0);
  });

  it.each(SIMBOLOS)('%s sale como SVG suelto con tamaño y sin referencias', (nombre) => {
    const svg = simboloSvg(sprite, nombre);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+" width="512" height="512">/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).not.toMatch(/<symbol|<use|href=/);
    // Fuera de la página currentColor saldría negro (DESIGN.md: nunca en lo ilustrado).
    expect(svg).not.toMatch(/currentColor/i);
  });

  it('el lado se puede cambiar', () => {
    expect(simboloSvg(sprite, 'moneda', 300)).toMatch(/width="300" height="300"/);
  });

  it('un símbolo que no existe falla', () => {
    expect(() => simboloSvg(sprite, 'no-existe')).toThrow(/no-existe/);
  });
});

describe('three solo en la vitrina perezosa', () => {
  it('solo vitrina.ts importa three', () => {
    const con = Object.entries(FUENTES)
      .filter(([, src]) => /from ['"]three['"]|import\(['"]three['"]\)/.test(src))
      .map(([f]) => f);
    expect(con).toEqual(['./vitrina.ts']);
  });

  it('vitrina.ts nunca se importa de forma estática', () => {
    for (const [f, src] of Object.entries(FUENTES)) {
      expect(src, f).not.toMatch(/from ['"]\.\/vitrina['"]/);
    }
    expect(FUENTES['./ui.ts']).toMatch(/import\('\.\/vitrina'\)/);
  });

  it('cara.ts (con el sprite ?raw) solo lo importa la vitrina', () => {
    const con = Object.entries(FUENTES)
      .filter(([, src]) => /from ['"]\.\/cara['"]/.test(src))
      .map(([f]) => f);
    expect(con).toEqual(['./vitrina.ts']);
  });
});

describe('ficha de la vitrina', () => {
  it('el frente se ve derecho: arriba de la imagen arriba, izquierda a la izquierda', async () => {
    const { fichaGeometria } = await import('./vitrina');
    const geo = fichaGeometria();
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    // Vértices de la tapa que mira a la cámara (+Z), en el borde: la UV debe seguir a la posición en pantalla
    // (u crece hacia la derecha, v hacia arriba: CanvasTexture voltea Y).
    let revisados = 0;
    for (let i = 0; i < pos.count; i++) {
      if (nor.getZ(i) < 0.99 || Math.hypot(pos.getX(i), pos.getY(i)) < 0.99) continue;
      expect(uv.getX(i) - 0.5).toBeCloseTo(pos.getX(i) / 2, 5);
      expect(uv.getY(i) - 0.5).toBeCloseTo(pos.getY(i) / 2, 5);
      revisados++;
    }
    expect(revisados).toBeGreaterThan(0);
    geo.dispose();
  });
});
