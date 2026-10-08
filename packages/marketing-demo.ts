/** Fictional, established shop used by the public counter and application captures. */
export interface DemoProduct {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly initials: string;
  readonly stock: number;
  readonly unit: 'piece' | 'coil' | 'roll';
}

export const DEMO_SHOP = {
  name: 'Mwangaza Electricals',
  cashier: 'Wanjiru',
  customer: 'Amina Hassan',
} as const;

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { id: 'bulb', name: 'LED bulb 9 W', price: 250, initials: 'LED', stock: 31, unit: 'piece' },
  {
    id: 'socket',
    name: '13 A double socket',
    price: 450,
    initials: 'SKT',
    stock: 18,
    unit: 'piece',
  },
  {
    id: 'breaker',
    name: '20 A circuit breaker',
    price: 650,
    initials: 'MCB',
    stock: 32,
    unit: 'piece',
  },
  {
    id: 'cable',
    name: 'Twin cable · 10 m coil',
    price: 1600,
    initials: 'CBL',
    stock: 24,
    unit: 'coil',
  },
  { id: 'tape', name: 'Insulation tape', price: 100, initials: 'TAP', stock: 60, unit: 'roll' },
];

export const DEMO_BASKET: ReadonlyArray<readonly [string, number]> = [
  ['bulb', 4],
  ['socket', 2],
];
