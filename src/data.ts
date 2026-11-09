import type { CharacterId } from './characters';
import type { IconName } from './icons';
import type { PlatoId } from './platos';

export type ManagerEvent = 'hire' | 'milestone' | 'upgrade' | 'estrella';
export type CheloEvent =
  | 'milestone'
  | 'upgrade'
  | 'upgradeOne'
  | 'prestige'
  | 'empleado'
  | 'logro'
  | 'racha'
  | 'rachaReceta'
  | 'recetario'
  | 'album';

/** Arte de una estampilla o cupón: un plato, un retrato o un símbolo del sprite (nada nuevo que ilustrar). */
export type Arte = { plato: PlatoId } | { retrato: CharacterId } | { sprite: IconName };

/** Frases de un gerente: una por evento, y una por hito en el orden de MILESTONES. */
export interface ManagerSays {
  readonly hire: string;
  readonly upgrade: string;
  readonly estrella: string;
  readonly milestone: readonly string[];
}

/**
 * Gerente de un negocio (en pantalla, "empleado"): nombre, costo, retrato, género y sus frases.
 * Voz: trata al jugador de "usted" y nunca usa sustantivos de género ni de rol
 * ("patrón", "jefe"); lo comprueba characters.test.ts.
 */
export interface ManagerDef {
  readonly name: string;
  readonly cost: number;
  readonly id: CharacterId;
  /** Concordancia de la etiqueta "Contratado"/"Contratada". */
  readonly genero: 'm' | 'f';
  readonly says: ManagerSays;
}

/** Frase del gerente para un evento; en un hito, la del n-ésimo alcanzado (1 = 25 unidades). */
export function fraseDe(m: ManagerDef, kind: ManagerEvent, hito = 1): string {
  if (kind !== 'milestone') return m.says[kind];
  const { milestone } = m.says;
  return milestone[Math.min(Math.max(hito, 1), milestone.length) - 1] ?? '';
}

/** Papel de la estampilla de un negocio (tokens --papel-* en style.css). */
export const PAPELES = ['crema', 'rosa', 'mostaza', 'verde'] as const;
export type Papel = (typeof PAPELES)[number];

export interface BusinessDef {
  readonly id: string;
  readonly name: string;
  readonly icon: PlatoId;
  /** Nunca del mismo matiz que el icono; cada papel dos veces, vecinos distintos (papel.test.ts). */
  readonly papel: Papel;
  readonly baseCost: number;
  readonly growth: number;
  readonly baseRevenue: number;
  readonly cycleMs: number;
  readonly manager: ManagerDef;
}

/** Catálogo fijo. El orden es la escalera de progresión. */
export const BUSINESSES: readonly BusinessDef[] = [
  {
    id: 'elotes',
    name: 'Carrito de elotes',
    icon: 'elote',
    papel: 'rosa',
    baseCost: 4,
    growth: 1.07,
    baseRevenue: 1,
    cycleMs: 1_000,
    manager: {
      name: 'Don Beto',
      cost: 500,
      id: 'beto',
      genero: 'm',
      says: {
        hire: 'Órale. Usted descanse, que el elote se vende solo.',
        milestone: [
          '¿Ya vio? Hasta la fila da vuelta a la esquina.',
          'Cincuenta carritos. Ya me saludan hasta los perros.',
          'Cien carritos y el mismo chile. Así se hace.',
          'Doscientos. Ya no sé ni dónde los estaciono.',
          'Trescientos carritos. El maíz lo traen en tráiler.',
          'Cuatrocientos. Ya hasta el mercado nos pide elote.',
          'Quinientos carritos. Despacio, pero el elote llegó lejos.',
        ],
        upgrade: 'Con eso ni el chile pica igual. Mejor, pues.',
        estrella: 'Con los años el elote sabe mejor. Usted nomás vea.',
      },
    },
  },
  {
    id: 'aguas',
    name: 'Aguas frescas',
    icon: 'agua',
    papel: 'crema',
    baseCost: 60,
    growth: 1.15,
    baseRevenue: 60,
    cycleMs: 3_000,
    manager: {
      name: 'Lupita',
      cost: 7_500,
      id: 'lupita',
      genero: 'f',
      says: {
        hire: '¡Aguas, aguas! Jamaica, horchata y limón, bien frías.',
        milestone: [
          '¡Se nos acaba el hielo de tanta gente!',
          '¡Cincuenta puestos! Ya pedí el hielo por tonelada.',
          '¡Cien puestos y la jamaica no se da abasto!',
          '¡Doscientos! Hasta la lluvia se me pone celosa.',
          '¡Trescientos puestos! Ya tengo pregón con eco.',
          '¡Cuatrocientos! Se me acaban los limones del país.',
          '¡Quinientos puestos! ¡Hasta el hielo pide descanso!',
        ],
        upgrade: 'Pruébela. Esta sí sabe a fruta de verdad.',
        estrella: '¡Ya me sé el pregón de memoria! ¡Aguas, aguas frescas!',
      },
    },
  },
  {
    id: 'tacos',
    name: 'Taquería',
    icon: 'taco',
    papel: 'verde',
    baseCost: 720,
    growth: 1.14,
    baseRevenue: 540,
    cycleMs: 6_000,
    manager: {
      name: 'El Güero',
      cost: 100_000,
      id: 'guero',
      genero: 'm',
      says: {
        hire: '¿Con todo? Con todo. Aquí nadie se va con hambre.',
        milestone: [
          '¡Trompo nuevo cada hora! Esto ya es otra liga.',
          'Cincuenta taquerías. La salsa ya la hago en tina.',
          'Cien. Ya me conocen hasta los que no comen tacos.',
          'Doscientas taquerías. Pastor para toda la ciudad.',
          'Trescientas. La piña ya viene por camión.',
          'Cuatrocientas taquerías. Con todo, siempre con todo.',
          'Quinientas taquerías. El trompo ya pidió vacaciones.',
        ],
        upgrade: 'Esa salsa ya hizo llorar a tres. Buena señal.',
        estrella: 'Ya corto el trompo con los ojos cerrados. Bueno, casi.',
      },
    },
  },
  {
    id: 'tortas',
    name: 'Tortería',
    icon: 'torta',
    papel: 'rosa',
    baseCost: 8_640,
    growth: 1.13,
    baseRevenue: 4_320,
    cycleMs: 12_000,
    manager: {
      name: 'Doña Tere',
      cost: 1_200_000,
      id: 'tere',
      genero: 'f',
      says: {
        hire: 'Aquí las tortas van bien servidas. Ya lo verá.',
        milestone: [
          'No me mire así. Le dije que iban a venir.',
          'Cincuenta torterías. Yo no presumo, pero ya ve.',
          'Cien. El bolillo lo compro por costal, ni modo.',
          'Doscientas. Hasta mis vecinas ya comen aquí.',
          'Trescientas torterías. Siga así y no se me canse.',
          'Cuatrocientas. Ya le dije: bien servidas, siempre.',
          'Quinientas torterías. Bien, pero no se me relaje.',
        ],
        upgrade: 'Ahora sí hay con qué trabajar. Siga así.',
        estrella: 'La experiencia no se improvisa. Las tortas tampoco.',
      },
    },
  },
  {
    id: 'fonda',
    name: 'Fonda',
    icon: 'olla',
    papel: 'crema',
    baseCost: 103_680,
    growth: 1.12,
    baseRevenue: 51_840,
    cycleMs: 24_000,
    manager: {
      name: 'Chuy',
      cost: 15_000_000,
      id: 'chuy',
      genero: 'm',
      says: {
        hire: 'Siéntese, que ya casi sale el guisado.',
        milestone: [
          'Tuvimos que poner mesas en la banqueta.',
          'Cincuenta fondas. El guisado ya sale en olla grande.',
          'Cien fondas y el mismo sazón. Eso cuesta, eh.',
          'Doscientas. Hasta los domingos se llenan.',
          'Trescientas fondas. Ya sale la comida más rápido.',
          'Cuatrocientas. Nadie se va con hambre, nunca.',
          'Quinientas fondas. Siéntese, que esto hay que celebrarlo.',
        ],
        upgrade: 'Con sazón nuevo hasta el arroz sabe a domingo.',
        estrella: 'Ya sé el gusto de cada cliente. Aquí nadie se va con hambre.',
      },
    },
  },
  {
    id: 'panaderia',
    name: 'Panadería',
    icon: 'concha',
    papel: 'mostaza',
    baseCost: 1_244_160,
    growth: 1.11,
    baseRevenue: 622_080,
    cycleMs: 48_000,
    manager: {
      name: 'Rosita',
      cost: 180_000_000,
      id: 'rosita',
      genero: 'f',
      says: {
        hire: 'Hoy salieron esponjaditas. Huela nomás.',
        milestone: [
          'Ya no caben las charolas en el mostrador.',
          'Cincuenta panaderías. Hoy el horno no se apaga.',
          'Cien. Ya huele a concha en toda la colonia.',
          'Doscientas panaderías. Las charolas salen volando.',
          'Trescientas. El pan sale más rápido que antes.',
          'Cuatrocientas. Ya ni el horno descansa.',
          'Quinientas panaderías. Huele a concha hasta en la luna.',
        ],
        upgrade: 'Con el horno nuevo hasta la masa está de buenas.',
        estrella: 'Ya sé cuándo sale el pan nomás por el olor.',
      },
    },
  },
  {
    id: 'franquicia',
    name: 'Franquicia',
    icon: 'tienda',
    papel: 'verde',
    baseCost: 14_929_920,
    growth: 1.1,
    baseRevenue: 7_464_960,
    cycleMs: 96_000,
    manager: {
      name: 'Licenciado Pérez',
      cost: 2_000_000_000,
      id: 'perez',
      genero: 'm',
      says: {
        hire: 'Según mis proyecciones, esto escala. Confíe en el proceso.',
        milestone: [
          'Los indicadores superan lo previsto. Lo llevo a la junta.',
          'Cincuenta sucursales. El plan se cumple al pie de la letra.',
          'Cien sucursales. Crecimiento sostenido, como proyecté.',
          'Doscientas. Abrimos oficina regional. Era inevitable.',
          'Trescientas. Los tiempos de servicio bajaron. Eficiencia.',
          'Cuatrocientas sucursales. Lo presento en la asamblea.',
          'Quinientas sucursales. Superamos la proyección a cinco años.',
        ],
        upgrade: 'Inversión alineada con la estrategia. Excelente.',
        estrella: 'Antigüedad acreditada: rendimiento al alza, sin excepción.',
      },
    },
  },
  {
    id: 'cadena',
    name: 'Cadena nacional',
    icon: 'camion',
    papel: 'mostaza',
    baseCost: 179_159_040,
    growth: 1.09,
    baseRevenue: 89_579_520,
    cycleMs: 192_000,
    manager: {
      name: 'La Jefa',
      cost: 25_000_000_000,
      id: 'jefa',
      genero: 'f',
      says: {
        hire: 'Yo me encargo. Usted no se distraiga.',
        milestone: [
          'Bien. Ahora el doble.',
          'Cincuenta. Siga.',
          'Cien. Ya me esperaba esto.',
          'Doscientas. No se detenga.',
          'Trescientas. Más rápido, como debe ser.',
          'Cuatrocientas. Ahora sí es nacional.',
          'Quinientas. Esperaba más, pero bien.',
        ],
        upgrade: 'Era lo que faltaba. Siguiente.',
        estrella: 'Experiencia. Se nota.',
      },
    },
  },
];

/** Pregunta fija del panel de Chelo: con respuesta escrita, o `ahora` (el consejo según la partida). */
export type CheloFaq = { readonly q: string; readonly a: string } | { readonly q: string; readonly id: 'ahora' };

/**
 * Guía del juego: su panel muestra el consejo según la partida, habla en los eventos sin gerente
 * y responde preguntas fijas. Las respuestas (`faq`) pueden llegar a 140 caracteres y sí dan
 * información: excepción documentada en DESIGN.md.
 */
export const CHELO = {
  name: 'Doña Chelo',
  id: 'chelo',
  says: {
    milestone: '¡Son muchos puestos, mijo! Ahora rinden el doble.',
    logro: '¡Un logro, mijo! Ya lo pegué en el álbum: todo vende más.',
    racha: '¡Volviste, mijo! Un día más y la racha crece.',
    rachaReceta: '¡Siete días seguidos, mijo! Esta receta es tuya sin heredar.',
    upgrade: 'Esa mejora le sirve a todos los negocios, mijo.',
    upgradeOne: 'Esa mejora se nota en el puesto, mijo.',
    prestige: 'Qué orgullo, mijo. Guarda las recetas o cocínalas en Herencia.',
    empleado: 'Ya te alcanza para un empleado, mijo: vende por ti aunque cierres.',
    recetario: 'Así se hace, mijo. Esa receta ya es de la casa.',
    album: '¡Lo lograste todo, mijo! El álbum quedó completo. Qué orgullo.',
  },
  /** Cuando no hay consejo pendiente. */
  idle: 'Todo en orden, mijo. Sigue vendiendo y yo te aviso.',
  faq: [
    { q: '¿Qué hago ahora?', id: 'ahora' },
    {
      q: '¿Para qué sirven las mejoras?',
      a: 'Cada mejora multiplica lo que vende un negocio, o todos. Las compras en Mejoras.',
    },
    {
      q: '¿Qué hace un empleado?',
      a: 'Vende por ti, hasta con el juego cerrado: al volver cobras hasta 8 h de ventas. Se contrata en Empleados, mijo.',
    },
    {
      q: '¿Qué es la herencia?',
      a: 'Reinicias la partida (dinero, puestos, empleados y mejoras) y cobras las recetas pendientes. Recetas y logros que ya tienes se quedan.',
    },
    {
      q: '¿Qué son las recetas?',
      a: 'Se ganan solas al vender y se cobran al heredar. Cada una da +2 % a todo; en Herencia las cocinas en el recetario de la abuela.',
    },
    {
      q: '¿Qué es el recetario?',
      a: 'Mejoras de la abuela que duran para siempre. Cocinar una receta gasta su +2 %, pero lo que compras no se pierde al heredar.',
    },
    {
      q: '¿Qué es la racha?',
      a: 'Cada día que vuelves te doy un regalo que crece; al séptimo seguido, una receta sin heredar. Si faltas un día, vuelve a empezar.',
    },
    {
      q: '¿Cómo guardo mi partida?',
      a: 'Se guarda sola en este navegador. En Ajustes copias un código por si cambias de aparato.',
    },
  ],
} as const satisfies {
  name: string;
  id: CharacterId;
  says: Readonly<Record<CheloEvent, string>>;
  idle: string;
  faq: readonly CheloFaq[];
};

/**
 * Unidades de cada hito. Los cuatro primeros parten la vuelta a la mitad; del quinto en adelante
 * la parten solo si el negocio todavía barre, si no doblan las ventas (`hitoEfecto` en game.ts).
 * El 500 solo lo alcanza elotes en la práctica (unidad 500 ≈ $1.8e15; cadena ≈ $8.5e26).
 */
export const MILESTONES: readonly number[] = [25, 50, 100, 200, 300, 400, 500];

/** Tope de ausencia que se cobra; el recetario (`olla`) lo sube (`offlineCapMs` en game.ts). */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
/** Racha diaria: el día 7 de cada semana de racha regala una receta; los demás, minutos de ventas. */
export const RACHA_SEMANA = 7;
/** Día d (1–6) de la semana de racha = d × estos minutos de ventas (sin propina). */
export const RACHA_MIN_POR_DIA = 2;
/** Ausencia desde la que se avisa lo ganado; por debajo, el tiempo cuenta como jugado. */
export const AUSENCIA_MS = 60_000;

/**
 * Propina: el negocio vende más durante PROPINA_MS y luego hay que esperar PROPINA_ESPERA_MS.
 * El recetario (`cafecito`) alarga la duración (`propinaDuracionMs` en game.ts).
 */
export const PROPINA_MS = 30_000;
export const PROPINA_ESPERA_MS = 300_000;
/** Durante la propina el negocio vende ×PROPINA_MULT; cuesta lo que vende en PROPINA_COSTO_MS. */
export const PROPINA_MULT = 1.5;
export const PROPINA_COSTO_MS = 10_000;
/** Tiempo trabajado con empleado para cada estrella de antigüedad (10 min, 1 h, 6 h). */
export const ANTIGUEDAD_MS: readonly number[] = [600_000, 3_600_000, 21_600_000];
/** Ventas extra por estrella de antigüedad. */
export const ESTRELLA_BONO = 0.1;
/** Ventas extra por receta activa (ganada y no cocinada en el recetario). */
export const RECIPE_BONUS = 0.02;
/** `recetas = floor(sqrt(ganadoTotal / RECIPE_DIVISOR))`: 5 recetas al juntar $1e12 (la primera herencia típica). */
export const RECIPE_DIVISOR = 4e10;
/** Chelo sugiere heredar (consejo y sonido `heir`) desde estas pendientes; el badge las muestra desde 1. */
export const HERENCIA_MIN = 5;
/** Ventas extra por cada logro desbloqueado (sobrevive la herencia, como las recetas). */
export const LOGRO_BONO = 0.02;

export type RecetarioEfecto =
  'arranque-elotes' | 'arranque-dinero' | 'offline-cap' | 'propina-ms' | 'antiguedad-inicial' | 'ventas';

/** Un nivel del cupón: cuesta `costo` recetas y deja el efecto en `valor` (reemplaza, no suma). */
export interface RecetarioNivel {
  readonly costo: number;
  readonly valor: number;
}

/** Cupón del recetario de la abuela: mejora permanente que se paga con recetas y sobrevive la herencia. */
export interface RecetarioDef {
  readonly id: string;
  readonly name: string;
  /** Un solo cupón por efecto: `valorRecetario` (game.ts) busca el def por efecto. */
  readonly efecto: RecetarioEfecto;
  readonly icono: Arte;
  readonly niveles: readonly RecetarioNivel[];
}

/**
 * Catálogo fijo (88 recetas en total). Cocinar una receta quita su +2 %: con 5 recetas (primera
 * herencia) se elige entre arranque y bono. Sin cupón de empleado: Guardadito 1 paga a Don Beto.
 */
export const RECETARIO: readonly RecetarioDef[] = [
  {
    id: 'canasta',
    name: 'Canasta de elotes',
    efecto: 'arranque-elotes',
    icono: { plato: 'elote' },
    niveles: [
      { costo: 1, valor: 25 },
      { costo: 2, valor: 100 },
      { costo: 3, valor: 200 },
    ],
  },
  {
    id: 'guardadito',
    name: 'Guardadito',
    efecto: 'arranque-dinero',
    icono: { sprite: 'pilas' },
    niveles: [
      { costo: 1, valor: 500 },
      { costo: 2, valor: 10_000 },
      { costo: 4, valor: 200_000 },
    ],
  },
  {
    id: 'olla',
    name: 'Olla de barro',
    efecto: 'offline-cap',
    icono: { plato: 'olla' },
    niveles: [
      { costo: 2, valor: 12 * 60 * 60 * 1000 },
      { costo: 4, valor: 24 * 60 * 60 * 1000 },
    ],
  },
  {
    id: 'cafecito',
    name: 'Cafecito',
    efecto: 'propina-ms',
    icono: { plato: 'agua' },
    niveles: [
      { costo: 1, valor: 45_000 },
      { costo: 2, valor: 60_000 },
      { costo: 4, valor: 90_000 },
    ],
  },
  {
    id: 'molcajete',
    name: 'Molcajete heredado',
    efecto: 'antiguedad-inicial',
    icono: { sprite: 'estrella' },
    niveles: [
      { costo: 2, valor: 600_000 },
      { costo: 5, valor: 3_600_000 },
    ],
  },
  {
    id: 'caldo',
    name: 'Caldo de la abuela',
    efecto: 'ventas',
    icono: { sprite: 'recipe' },
    niveles: [
      { costo: 15, valor: 2 },
      { costo: 40, valor: 4 },
    ],
  },
];

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Id de negocio, o 'all' para todos. */
  readonly target: string;
  readonly multiplier: number;
}

/**
 * Mejoras de compra única: ×3 a un negocio o ×2 a todos. Se reinician con la herencia.
 * Las diez últimas (desde $2e14) son la segunda ronda: por costo solo se ven con decenas de recetas.
 */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'chile', name: 'Chile en polvo', cost: 20_000, target: 'elotes', multiplier: 3 },
  { id: 'hielo', name: 'Hielo de garrafón', cost: 300_000, target: 'aguas', multiplier: 3 },
  { id: 'mayonesa', name: 'Mayonesa casera', cost: 1_500_000, target: 'elotes', multiplier: 3 },
  { id: 'trompo', name: 'Trompo al pastor', cost: 4_000_000, target: 'tacos', multiplier: 3 },
  { id: 'comal', name: 'Letreros nuevos', cost: 10_000_000, target: 'all', multiplier: 2 },
  { id: 'fruta', name: 'Fruta de temporada', cost: 30_000_000, target: 'aguas', multiplier: 3 },
  { id: 'bolillo', name: 'Bolillo recién horneado', cost: 50_000_000, target: 'tortas', multiplier: 3 },
  { id: 'salsa', name: 'Salsa secreta', cost: 400_000_000, target: 'tacos', multiplier: 3 },
  { id: 'sazon', name: 'Sazón de la abuela', cost: 600_000_000, target: 'fonda', multiplier: 3 },
  { id: 'tianguis', name: 'Sucursal en cada colonia', cost: 1_000_000_000, target: 'all', multiplier: 2 },
  { id: 'ahogada', name: 'Torta ahogada', cost: 5_000_000_000, target: 'tortas', multiplier: 3 },
  { id: 'horno', name: 'Horno de leña', cost: 7_000_000_000, target: 'panaderia', multiplier: 3 },
  { id: 'menu', name: 'Menú del día', cost: 60_000_000_000, target: 'fonda', multiplier: 3 },
  { id: 'uniformes', name: 'Uniformes bordados', cost: 80_000_000_000, target: 'franquicia', multiplier: 3 },
  { id: 'redes', name: 'Redes sociales', cost: 100_000_000_000, target: 'all', multiplier: 2 },
  { id: 'conchas', name: 'Conchas de vainilla', cost: 700_000_000_000, target: 'panaderia', multiplier: 3 },
  { id: 'flotilla', name: 'Flotilla nueva', cost: 1_000_000_000_000, target: 'cadena', multiplier: 3 },
  { id: 'bolsas', name: 'Logo en las bolsas', cost: 8_000_000_000_000, target: 'franquicia', multiplier: 3 },
  { id: 'fama', name: 'Fama nacional', cost: 10_000_000_000_000, target: 'all', multiplier: 2 },
  { id: 'comercial', name: 'Comercial en la tele', cost: 100_000_000_000_000, target: 'cadena', multiplier: 3 },
  { id: 'esquites', name: 'Esquites en vaso', cost: 2e14, target: 'elotes', multiplier: 3 },
  { id: 'chamoy', name: 'Chamoy de la casa', cost: 5e14, target: 'aguas', multiplier: 3 },
  { id: 'tortillas', name: 'Tortillas a mano', cost: 1e15, target: 'tacos', multiplier: 3 },
  { id: 'telera', name: 'Telera propia', cost: 3e15, target: 'tortas', multiplier: 3 },
  { id: 'menu-abuela', name: 'Receta de la abuela en el menú', cost: 6e15, target: 'all', multiplier: 2 },
  { id: 'cazuelas', name: 'Cazuelas de barro', cost: 1e16, target: 'fonda', multiplier: 3 },
  { id: 'rosca', name: 'Rosca todo el año', cost: 3e16, target: 'panaderia', multiplier: 3 },
  { id: 'app', name: 'App de pedidos', cost: 6e16, target: 'franquicia', multiplier: 3 },
  { id: 'bodega', name: 'Bodega central', cost: 1e17, target: 'cadena', multiplier: 3 },
  { id: 'guia', name: 'Estrella en la guía', cost: 3e17, target: 'all', multiplier: 2 },
];
