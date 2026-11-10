import { describe, expect, it } from 'vitest';
import { APODO_MAX, APODO_MIN, normalizarApodo } from './apodo';

describe('normalizarApodo', () => {
  it('recorta espacios de los bordes y junta los repetidos', () => {
    expect(normalizarApodo('  Don   Beto  ')).toBe('Don Beto');
  });

  it('acepta letras con acentos y eñe, dígitos y espacio', () => {
    expect(normalizarApodo('Ñoño 42')).toBe('Ñoño 42');
    expect(normalizarApodo('José María')).toBe('José María');
  });

  it('rechaza corto, largo y caracteres fuera del alfabeto', () => {
    expect(APODO_MIN).toBe(3);
    expect(APODO_MAX).toBe(16);
    expect(normalizarApodo('Al')).toBeNull();
    expect(normalizarApodo('a'.repeat(17))).toBeNull();
    expect(normalizarApodo('a'.repeat(16))).toBe('a'.repeat(16));
    expect(normalizarApodo('Beto<script>')).toBeNull();
    expect(normalizarApodo('Beto_1')).toBeNull();
    expect(normalizarApodo('Beto​')).toBeNull();
  });

  it('rechaza lo que no es string', () => {
    expect(normalizarApodo(42)).toBeNull();
    expect(normalizarApodo(null)).toBeNull();
  });

  it('rechaza palabras bloqueadas como palabra entera, con o sin acentos y mayúsculas', () => {
    expect(normalizarApodo('La Puta Madre')).toBeNull();
    expect(normalizarApodo('PENDEJO 7')).toBeNull();
    expect(normalizarApodo('El Puñal')).toBeNull();
    // Dentro de otra palabra no cuenta: "diputado" no es insulto.
    expect(normalizarApodo('Diputado')).toBe('Diputado');
  });
});
