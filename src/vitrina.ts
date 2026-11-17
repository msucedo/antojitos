import {
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { canto, frente, reverso } from './cara';
import type { Arte } from './data';
import { reducedMotion } from './fx';

/**
 * Vitrina 3D del Álbum (DESIGN.md "Vitrina 3D"): una ficha con canto que gira con el arte del logro.
 * Único módulo que importa three; ui.ts lo carga con import() al abrir la vitrina.
 */
export interface Vitrina {
  destroy(): void;
}

/** Una vuelta cada 4 s. */
const VELOCIDAD = (Math.PI * 2) / 4000;
/** Radianes por píxel arrastrado. */
const ARRASTRE = 0.012;
/** Fracción de la inercia que queda por milisegundo. */
const FRENO = 0.994;

/**
 * Ficha de frente a la cámara (+Z). El cilindro mira a +Y: girado 90° en X sus tapas quedan de frente y de
 * espaldas, pero la UV de la tapa queda con lo de arriba de la imagen a la derecha; 90° en Z la endereza.
 */
export function fichaGeometria(): CylinderGeometry {
  return new CylinderGeometry(1, 1, 0.16, 96).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
}

function textura(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Pinta la ficha en `canvas`, cuyo contexto `gl` ya creó el llamador (si no hay WebGL2 no se llega aquí
 * y three no ensucia la consola). `vivo()` falso tras un await significa que el diálogo ya se cerró.
 */
export async function montarVitrina(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  icono: Arte,
  vivo: () => boolean,
  primerFrame: () => void,
): Promise<Vitrina | null> {
  const cara = await frente(icono);
  if (!vivo()) return null;

  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.z = 4.4;

  const geo = fichaGeometria();
  const texturas = [textura(canto()), textura(cara), textura(reverso())];
  // Grupos de CylinderGeometry: [lado, tapa superior, tapa inferior].
  const materiales = texturas.map((map) => new MeshBasicMaterial({ map }));
  const ficha = new Mesh(geo, materiales);
  scene.add(ficha);

  const quieta = reducedMotion();
  let angulo = 0;
  let inercia = 0; // rad/ms
  let arrastrando = false;
  let ultimoX = 0;
  let ultimoT = 0;
  let antes = 0;
  let sucio = true;

  const abajo = (e: PointerEvent): void => {
    arrastrando = true;
    ultimoX = e.clientX;
    ultimoT = e.timeStamp;
    inercia = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const mueve = (e: PointerEvent): void => {
    if (!arrastrando) return;
    const d = (e.clientX - ultimoX) * ARRASTRE;
    const dt = Math.max(1, e.timeStamp - ultimoT);
    angulo += d;
    if (!quieta) inercia = d / dt;
    ultimoX = e.clientX;
    ultimoT = e.timeStamp;
    sucio = true;
  };
  const arriba = (): void => {
    arrastrando = false;
  };
  canvas.addEventListener('pointerdown', abajo);
  canvas.addEventListener('pointermove', mueve);
  canvas.addEventListener('pointerup', arriba);
  canvas.addEventListener('pointercancel', arriba);

  let primero = true;
  renderer.setAnimationLoop((t: number) => {
    const dt = antes ? Math.min(t - antes, 100) : 0;
    antes = t;
    if (!arrastrando) {
      if (Math.abs(inercia) > 1e-5) {
        angulo += inercia * dt;
        inercia *= FRENO ** dt;
        sucio = true;
      } else if (!quieta) {
        angulo += VELOCIDAD * dt;
        sucio = true;
      }
    }
    // Con reduced motion y sin arrastre no se repinta: la ficha queda quieta y la GPU descansa.
    if (!sucio) return;
    sucio = false;
    ficha.rotation.y = angulo;
    renderer.render(scene, camera);
    if (primero) {
      primero = false;
      primerFrame();
    }
  });

  return {
    destroy() {
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('pointerdown', abajo);
      canvas.removeEventListener('pointermove', mueve);
      canvas.removeEventListener('pointerup', arriba);
      canvas.removeEventListener('pointercancel', arriba);
      geo.dispose();
      for (const m of materiales) m.dispose();
      for (const t of texturas) t.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
