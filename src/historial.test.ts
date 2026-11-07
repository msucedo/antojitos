import { describe, expect, it } from 'vitest';
import { crearHistorial, formatHora, HISTORIAL_MAX } from './historial';

describe('historial de avisos', () => {
  it('guarda la más reciente primero, con su hora', () => {
    const hist = crearHistorial();
    hist.registrar('Primera', 1000);
    hist.registrar('Segunda', 2000);
    expect(hist.entradas()).toEqual([
      { hora: 2000, texto: 'Segunda' },
      { hora: 1000, texto: 'Primera' },
    ]);
  });

  it('devuelve la entrada creada y null con texto vacío o solo espacios', () => {
    const hist = crearHistorial();
    expect(hist.registrar('Hola', 5)).toEqual({ hora: 5, texto: 'Hola' });
    expect(hist.registrar('', 6)).toBeNull();
    expect(hist.registrar('   ', 7)).toBeNull();
    expect(hist.entradas()).toHaveLength(1);
  });

  it('al pasar el tope descarta la más vieja', () => {
    const hist = crearHistorial(3);
    for (let i = 1; i <= 4; i++) hist.registrar(`n${i}`, i);
    expect(hist.entradas().map((e) => e.texto)).toEqual(['n4', 'n3', 'n2']);
    expect(HISTORIAL_MAX).toBe(50);
  });

  it('formatHora da HH:MM local con dos cifras', () => {
    expect(formatHora(new Date(2026, 0, 1, 7, 5).getTime())).toBe('07:05');
    expect(formatHora(new Date(2026, 0, 1, 23, 59).getTime())).toBe('23:59');
  });
});
