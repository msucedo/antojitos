import type { CharacterId } from './characters';
import type { PlatoId } from './platos';

export type ManagerEvent = 'hire' | 'milestone' | 'upgrade' | 'estrella';
export type CheloEvent = 'milestone' | 'upgrade' | 'upgradeOne' | 'prestige' | 'empleado';

/**
 * Gerente de un negocio (en pantalla, "empleado"): nombre, costo, retrato, género y una frase por evento.
 * Voz: trata al jugador de "usted" y nunca usa sustantivos de género ni de rol
 * ("patrón", "jefe"); lo comprueba characters.test.ts.
 */
export interface ManagerDef {
  readonly name: string;
  readonly cost: number;
  readonly id: CharacterId;
  /** Concordancia de la etiqueta "Contratado"/"Contratada". */
  readonly genero: 'm' | 'f';
  readonly says: Readonly<Record<ManagerEvent, string>>;
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
        milestone: '¿Ya vio? Hasta la fila da vuelta a la esquina.',
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
        milestone: '¡Se nos acaba el hielo de tanta gente!',
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
        milestone: '¡Trompo nuevo cada hora! Esto ya es otra liga.',
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
        milestone: 'No me mire así. Le dije que iban a venir.',
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
        milestone: 'Tuvimos que poner mesas en la banqueta.',
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
        milestone: 'Ya no caben las charolas en el mostrador.',
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
        milestone: 'Los indicadores superan lo previsto. Lo llevo a la junta.',
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
        milestone: 'Bien. Ahora el doble.',
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
    milestone: '¡Son muchos puestos, mijo! Ahora venden el doble de rápido.',
    upgrade: 'Esa mejora le sirve a todos los negocios, mijo.',
    upgradeOne: 'Esa mejora se nota en el puesto, mijo.',
    prestige: 'Qué orgullo. Con las recetas de la abuela todo vende más.',
    empleado: 'Ya te alcanza para un empleado, mijo: vende por ti aunque cierres.',
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
      a: 'Vende por ti, hasta con el juego cerrado. Se contrata en Empleados, mijo.',
    },
    {
      q: '¿Qué es la herencia?',
      a: 'Le pasas el negocio a la familia: empiezas de cero con recetas, y cada una suma 2 % a todo.',
    },
    {
      q: '¿Cómo guardo mi partida?',
      a: 'Se guarda sola en este navegador. En Respaldo copias un código por si cambias de aparato.',
    },
  ],
} as const satisfies {
  name: string;
  id: CharacterId;
  says: Readonly<Record<CheloEvent, string>>;
  idle: string;
  faq: readonly CheloFaq[];
};

/** Unidades en las que cada hito parte la vuelta a la mitad (`cicloMs` en game.ts). */
export const MILESTONES: readonly number[] = [25, 50, 100, 200];

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Propina: el negocio vende más durante PROPINA_MS y luego hay que esperar PROPINA_ESPERA_MS. */
export const PROPINA_MS = 30_000;
export const PROPINA_ESPERA_MS = 300_000;
/** Durante la propina el negocio vende ×PROPINA_MULT; cuesta lo que vende en PROPINA_COSTO_MS. */
export const PROPINA_MULT = 1.5;
export const PROPINA_COSTO_MS = 10_000;
/** Tiempo trabajado con empleado para cada estrella de antigüedad (10 min, 1 h, 6 h). */
export const ANTIGUEDAD_MS: readonly number[] = [600_000, 3_600_000, 21_600_000];
/** Ventas extra por estrella de antigüedad. */
export const ESTRELLA_BONO = 0.1;
export const RECIPE_BONUS = 0.02;
export const RECIPE_DIVISOR = 1e12;

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Id de negocio, o 'all' para todos. */
  readonly target: string;
  readonly multiplier: number;
}

/** Mejoras de compra única: ×3 a un negocio o ×2 a todos. Se reinician con la herencia. */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'chile', name: 'Chile en polvo', cost: 20_000, target: 'elotes', multiplier: 3 },
  { id: 'hielo', name: 'Hielo de garrafón', cost: 300_000, target: 'aguas', multiplier: 3 },
  { id: 'mayonesa', name: 'Mayonesa casera', cost: 1_500_000, target: 'elotes', multiplier: 3 },
  { id: 'trompo', name: 'Trompo al pastor', cost: 4_000_000, target: 'tacos', multiplier: 3 },
  { id: 'comal', name: 'Comal grande', cost: 10_000_000, target: 'all', multiplier: 2 },
  { id: 'fruta', name: 'Fruta de temporada', cost: 30_000_000, target: 'aguas', multiplier: 3 },
  { id: 'bolillo', name: 'Bolillo recién horneado', cost: 50_000_000, target: 'tortas', multiplier: 3 },
  { id: 'salsa', name: 'Salsa secreta', cost: 400_000_000, target: 'tacos', multiplier: 3 },
  { id: 'sazon', name: 'Sazón de la abuela', cost: 600_000_000, target: 'fonda', multiplier: 3 },
  { id: 'tianguis', name: 'Mercado sobre ruedas', cost: 1_000_000_000, target: 'all', multiplier: 2 },
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
];
