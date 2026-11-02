export interface BusinessDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly baseCost: number;
  readonly growth: number;
  readonly baseRevenue: number;
  readonly cycleMs: number;
  readonly managerCost: number;
  readonly managerName: string;
}

/** Catálogo fijo. El orden es la escalera de progresión. */
export const BUSINESSES: readonly BusinessDef[] = [
  {
    id: 'elotes',
    name: 'Carrito de elotes',
    icon: '🌽',
    baseCost: 4,
    growth: 1.07,
    baseRevenue: 1,
    cycleMs: 1_000,
    managerCost: 500,
    managerName: 'Don Beto',
  },
  {
    id: 'aguas',
    name: 'Aguas frescas',
    icon: '🍉',
    baseCost: 60,
    growth: 1.15,
    baseRevenue: 60,
    cycleMs: 3_000,
    managerCost: 7_500,
    managerName: 'Lupita',
  },
  {
    id: 'tacos',
    name: 'Taquería',
    icon: '🌮',
    baseCost: 720,
    growth: 1.14,
    baseRevenue: 540,
    cycleMs: 6_000,
    managerCost: 100_000,
    managerName: 'El Güero',
  },
  {
    id: 'tortas',
    name: 'Tortería',
    icon: '🥖',
    baseCost: 8_640,
    growth: 1.13,
    baseRevenue: 4_320,
    cycleMs: 12_000,
    managerCost: 1_200_000,
    managerName: 'Doña Tere',
  },
  {
    id: 'fonda',
    name: 'Fonda',
    icon: '🍲',
    baseCost: 103_680,
    growth: 1.12,
    baseRevenue: 51_840,
    cycleMs: 24_000,
    managerCost: 15_000_000,
    managerName: 'Chuy',
  },
  {
    id: 'panaderia',
    name: 'Panadería',
    icon: '🥐',
    baseCost: 1_244_160,
    growth: 1.11,
    baseRevenue: 622_080,
    cycleMs: 48_000,
    managerCost: 180_000_000,
    managerName: 'Rosita',
  },
  {
    id: 'franquicia',
    name: 'Franquicia',
    icon: '🏪',
    baseCost: 14_929_920,
    growth: 1.1,
    baseRevenue: 7_464_960,
    cycleMs: 96_000,
    managerCost: 2_000_000_000,
    managerName: 'Licenciado Pérez',
  },
  {
    id: 'cadena',
    name: 'Cadena nacional',
    icon: '🚚',
    baseCost: 179_159_040,
    growth: 1.09,
    baseRevenue: 89_579_520,
    cycleMs: 192_000,
    managerCost: 25_000_000_000,
    managerName: 'La Jefa',
  },
];

/** Unidades en las que cada hito duplica el ingreso. */
export const MILESTONES: readonly number[] = [25, 50, 100, 200];

export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const RECIPE_BONUS = 0.02;
export const RECIPE_DIVISOR = 3e10;
