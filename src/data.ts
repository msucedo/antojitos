import type { IconName } from './icons';

export type ManagerEvent = 'hire' | 'milestone' | 'upgrade';
export type CheloEvent = 'milestone' | 'upgrade' | 'upgradeOne' | 'prestige';

/**
 * Gerente de un negocio: nombre, costo, avatar y una frase por evento.
 * Voz: trata al jugador de "usted" y nunca usa sustantivos de género ni de rol
 * ("patrón", "jefe"); lo comprueba characters.test.ts.
 */
export interface ManagerDef {
  readonly name: string;
  readonly cost: number;
  readonly icon: IconName;
  readonly says: Readonly<Record<ManagerEvent, string>>;
}

export interface BusinessDef {
  readonly id: string;
  readonly name: string;
  readonly icon: IconName;
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
    baseCost: 4,
    growth: 1.07,
    baseRevenue: 1,
    cycleMs: 1_000,
    manager: {
      name: 'Don Beto',
      cost: 500,
      icon: 'beto',
      says: {
        hire: 'Órale. Usted descanse, que el elote se vende solo.',
        milestone: '¿Ya vio? Hasta la fila da vuelta a la esquina.',
        upgrade: 'Con eso ni el chile pica igual. Mejor, pues.',
      },
    },
  },
  {
    id: 'aguas',
    name: 'Aguas frescas',
    icon: 'agua',
    baseCost: 60,
    growth: 1.15,
    baseRevenue: 60,
    cycleMs: 3_000,
    manager: {
      name: 'Lupita',
      cost: 7_500,
      icon: 'lupita',
      says: {
        hire: '¡Aguas, aguas! Jamaica, horchata y limón, bien frías.',
        milestone: '¡Se nos acaba el hielo de tanta gente!',
        upgrade: 'Pruébela. Esta sí sabe a fruta de verdad.',
      },
    },
  },
  {
    id: 'tacos',
    name: 'Taquería',
    icon: 'taco',
    baseCost: 720,
    growth: 1.14,
    baseRevenue: 540,
    cycleMs: 6_000,
    manager: {
      name: 'El Güero',
      cost: 100_000,
      icon: 'guero',
      says: {
        hire: '¿Con todo? Con todo. Aquí nadie se va con hambre.',
        milestone: '¡Trompo nuevo cada hora! Esto ya es otra liga.',
        upgrade: 'Esa salsa ya hizo llorar a tres. Buena señal.',
      },
    },
  },
  {
    id: 'tortas',
    name: 'Tortería',
    icon: 'torta',
    baseCost: 8_640,
    growth: 1.13,
    baseRevenue: 4_320,
    cycleMs: 12_000,
    manager: {
      name: 'Doña Tere',
      cost: 1_200_000,
      icon: 'tere',
      says: {
        hire: 'Aquí las tortas van bien servidas. Ya lo verá.',
        milestone: 'No me mire así. Le dije que iban a venir.',
        upgrade: 'Ahora sí hay con qué trabajar. Siga así.',
      },
    },
  },
  {
    id: 'fonda',
    name: 'Fonda',
    icon: 'olla',
    baseCost: 103_680,
    growth: 1.12,
    baseRevenue: 51_840,
    cycleMs: 24_000,
    manager: {
      name: 'Chuy',
      cost: 15_000_000,
      icon: 'chuy',
      says: {
        hire: 'Siéntese, que ya casi sale el guisado.',
        milestone: 'Tuvimos que poner mesas en la banqueta.',
        upgrade: 'Con sazón nuevo hasta el arroz sabe a domingo.',
      },
    },
  },
  {
    id: 'panaderia',
    name: 'Panadería',
    icon: 'concha',
    baseCost: 1_244_160,
    growth: 1.11,
    baseRevenue: 622_080,
    cycleMs: 48_000,
    manager: {
      name: 'Rosita',
      cost: 180_000_000,
      icon: 'rosita',
      says: {
        hire: 'Hoy salieron esponjaditas. Huela nomás.',
        milestone: 'Ya no caben las charolas en el mostrador.',
        upgrade: 'Con el horno nuevo hasta la masa está de buenas.',
      },
    },
  },
  {
    id: 'franquicia',
    name: 'Franquicia',
    icon: 'tienda',
    baseCost: 14_929_920,
    growth: 1.1,
    baseRevenue: 7_464_960,
    cycleMs: 96_000,
    manager: {
      name: 'Licenciado Pérez',
      cost: 2_000_000_000,
      icon: 'perez',
      says: {
        hire: 'Según mis proyecciones, esto escala. Confíe en el proceso.',
        milestone: 'Los indicadores superan lo previsto. Lo llevo a la junta.',
        upgrade: 'Inversión alineada con la estrategia. Excelente.',
      },
    },
  },
  {
    id: 'cadena',
    name: 'Cadena nacional',
    icon: 'camion',
    baseCost: 179_159_040,
    growth: 1.09,
    baseRevenue: 89_579_520,
    cycleMs: 192_000,
    manager: {
      name: 'La Jefa',
      cost: 25_000_000_000,
      icon: 'jefa',
      says: {
        hire: 'Yo me encargo. Usted no se distraiga.',
        milestone: 'Bien. Ahora el doble.',
        upgrade: 'Era lo que faltaba. Siguiente.',
      },
    },
  },
];

/** Guía del juego: da tips al inicio y habla en los eventos sin gerente. */
export const CHELO = {
  name: 'Doña Chelo',
  icon: 'chelo',
  says: {
    milestone: '¡Son muchos puestos, mijo! Ahora venden mucho más.',
    upgrade: 'Esa mejora le sirve a todos los negocios, mijo.',
    upgradeOne: 'Esa mejora se nota en el puesto, mijo.',
    prestige: 'Qué orgullo. Con las recetas de la abuela todo vende más.',
  },
} as const satisfies { name: string; icon: IconName; says: Readonly<Record<CheloEvent, string>> };

/** Unidades en las que cada hito duplica el ingreso. */
export const MILESTONES: readonly number[] = [25, 50, 100, 200];

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
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
