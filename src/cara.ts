import sprite from './assets/icons.svg?raw';
import { PORTRAITS } from './characters';
import type { Arte } from './data';
import { RASTER } from './platos';

/**
 * Caras de la ficha de la vitrina 3D (DESIGN.md "Vitrina 3D"): canvas 2D de 512 px que vitrina.ts usa
 * como textura. Solo lo carga el chunk perezoso de la vitrina (el sprite ?raw no entra al arranque).
 */
export const LADO = 512;
/** Papel de las estampillas del Álbum (`--papel-crema`, fijo en claro y oscuro). */
export const PAPEL = '#fff6e5';
/** Tinta del contorno ilustrado (DESIGN.md: nunca currentColor). */
export const TINTA = '#1B2A3A';

/**
 * SVG suelto de un símbolo del sprite, para cargarlo como imagen. Lleva width/height: sin tamaño
 * intrínseco, Chrome lo dibuja a 300×150 y Firefox falla en drawImage.
 */
export function simboloSvg(svg: string, nombre: string, lado = LADO): string {
  const re = new RegExp(`<symbol id="${nombre}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`);
  const m = re.exec(svg);
  if (!m) throw new Error(`Símbolo inexistente: ${nombre}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]}" width="${lado}" height="${lado}">${m[2]}</svg>`;
}

async function cargar(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Disco de papel con aro de tinta y línea fina interior, como una estampilla redonda. */
function disco(ctx: CanvasRenderingContext2D): void {
  const c = LADO / 2;
  ctx.fillStyle = PAPEL;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(c, c, c - 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, c - 36, 0, Math.PI * 2);
  ctx.stroke();
}

function lienzo(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2D');
  return { canvas, ctx };
}

/** Reverso: el papel liso con su aro. */
export function reverso(): HTMLCanvasElement {
  const { canvas, ctx } = lienzo();
  disco(ctx);
  return canvas;
}

/** Frente: el disco con el arte del logro centrado. */
export async function frente(icono: Arte): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = lienzo();
  disco(ctx);
  const c = LADO / 2;
  if ('plato' in icono) {
    // Raster de 256: a 320 en la cara de 512 queda en ~250 px de pantalla (vitrina de 220 a 2×), sin ablandarse.
    const lado = 320;
    const img = await cargar(RASTER[icono.plato]);
    ctx.drawImage(img, c - lado / 2, c - lado / 2, lado, lado);
  } else if ('retrato' in icono) {
    // Busto entero dentro de la línea fina (a todo el disco se cortaban sombrero y hombros); el recorte
    // circular solo ataja lo que asome de un retrato con disco propio (Chelo).
    const img = await cargar(PORTRAITS[icono.retrato]);
    const lado = 340;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 44, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, c - lado / 2, c - lado / 2, lado, lado);
    ctx.restore();
  } else {
    const lado = 330;
    const url = URL.createObjectURL(new Blob([simboloSvg(sprite, icono.sprite, lado)], { type: 'image/svg+xml' }));
    try {
      const img = await cargar(url);
      ctx.drawImage(img, c - lado / 2, c - lado / 2, lado, lado);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return canvas;
}

/** Canto: tinta con un filete de papel al centro, para que se lea sobre el --card oscuro. */
export function canto(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2D');
  ctx.fillStyle = TINTA;
  ctx.fillRect(0, 0, 4, 64);
  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 26, 4, 12);
  return canvas;
}
