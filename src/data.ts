import type { IconName } from './icons';

export interface BusinessDef {
  readonly id: string;
  readonly name: string;
  readonly icon: IconName;
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
    icon: 'elote',
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
    icon: 'agua',
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
    icon: 'taco',
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
    icon: 'torta',
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
    icon: 'olla',
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
    icon: 'concha',
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
    icon: 'tienda',
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
    icon: 'camion',
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
