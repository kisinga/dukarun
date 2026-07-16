import { Injectable } from '@angular/core';

export interface PriceModificationResult {
  newPrice: number;
  reason: string;
}

const MAX_STACK_SIZE = 10;
const INCREASE_FACTOR = 1.03;
const DECREASE_FACTOR = 0.97;

/**
 * Compute next increased price (3% up, rounded). Input and output in cents.
 */
export function computeNextIncrease(current: number): number {
  return Math.round(current * INCREASE_FACTOR);
}

/**
 * Compute next decreased price (3% down, rounded), floored at floorCents. Input and output in cents.
 */
export function computeNextDecrease(current: number, floorCents: number): number {
  const next = Math.round(current * DECREASE_FACTOR);
  return next < floorCents ? floorCents : next;
}

/**
 * Service for managing price modifications with a single LIFO stack.
 *
 * Invariant: stack[0] is always the reference/base value. Direction (above/below base)
 * is inferred from latest vs base. UP/DOWN map to extend (push) or backtrack (pop).
 *
 * - At base (len === 1): UP extends with +3%, DOWN extends with -3% (floored at wholesale)
 * - Above base (latest > base): UP extends, DOWN backtracks (pop)
 * - Below base (latest < base): UP backtracks (pop), DOWN extends (with floor)
 *
 * Context types:
 * - 'unit': For unit price modifications (modal), quantity = 1
 * - 'line': For line price modifications (cart), floor = wholesale * quantity
 */
@Injectable({
  providedIn: 'root',
})
export class PriceModificationService {
  private readonly stacks = new Map<string, number[]>();

  private getStackKey(variantId: string, context: 'unit' | 'line' = 'line'): string {
    return `${variantId}:${context}`;
  }

  private getOrInitStack(stackKey: string, currentPriceCents: number): number[] {
    let stack = this.stacks.get(stackKey);
    if (!stack) {
      stack = [currentPriceCents];
      this.stacks.set(stackKey, stack);
    }
    return stack;
  }

  increasePrice(
    variantId: string,
    currentPriceCents: number,
    context: 'unit' | 'line' = 'line',
  ): PriceModificationResult | null {
    const stackKey = this.getStackKey(variantId, context);
    const stack = this.getOrInitStack(stackKey, currentPriceCents);

    const base = stack[0];
    const latest = stack[stack.length - 1];
    const atBase = stack.length === 1;
    const aboveBase = latest > base;

    if (atBase || aboveBase) {
      if (stack.length >= MAX_STACK_SIZE) return null;
      const next = computeNextIncrease(latest);
      stack.push(next);
      return { newPrice: next, reason: '3% increase' };
    } else {
      stack.pop();
      const newTop = stack[stack.length - 1];
      return { newPrice: newTop, reason: 'Price restored' };
    }
  }

  /**
   * Current displayed price for a variant/context. Returns stack top if stack exists, else basePriceCents.
   */
  getCurrentPrice(
    variantId: string,
    context: 'unit' | 'line' = 'line',
    basePriceCents: number,
  ): number {
    const stack = this.stacks.get(this.getStackKey(variantId, context));
    if (!stack || stack.length === 0) return basePriceCents;
    return stack[stack.length - 1];
  }

  decreasePrice(
    variantId: string,
    currentPriceCents: number,
    quantity: number,
    wholesalePriceCents?: number,
    context: 'unit' | 'line' = 'line',
  ): PriceModificationResult | null {
    const stackKey = this.getStackKey(variantId, context);
    const stack = this.getOrInitStack(stackKey, currentPriceCents);

    const base = stack[0];
    const latest = stack[stack.length - 1];
    const atBase = stack.length === 1;
    const aboveBase = latest > base;

    const floor = wholesalePriceCents != null ? wholesalePriceCents * quantity : -Infinity;

    if (atBase || !aboveBase) {
      if (latest <= floor) return null;
      if (stack.length >= MAX_STACK_SIZE) return null;
      const next = computeNextDecrease(latest, floor);
      stack.push(next);
      return { newPrice: next, reason: '3% decrease' };
    } else {
      stack.pop();
      const newTop = stack[stack.length - 1];
      return { newPrice: newTop, reason: 'Price restored' };
    }
  }

  clearStacks(variantId: string): void {
    this.stacks.delete(this.getStackKey(variantId, 'unit'));
    this.stacks.delete(this.getStackKey(variantId, 'line'));
  }

  /**
   * Set a custom price (e.g. from direct user input). Replaces the stack with [base, custom]
   * so getCurrentPrice returns the custom value and up/down continue from it.
   */
  setCustomPrice(
    variantId: string,
    context: 'unit' | 'line',
    basePriceCents: number,
    customPriceCents: number,
  ): void {
    const cents = Math.max(1, Math.round(customPriceCents));
    const stackKey = this.getStackKey(variantId, context);
    this.stacks.set(stackKey, [basePriceCents, cents]);
  }

  isAtLowestPrice(
    currentPriceCents: number,
    quantity: number,
    wholesalePriceCents?: number,
  ): boolean {
    if (wholesalePriceCents == null) return false;
    const pricePerItem = currentPriceCents / quantity;
    return pricePerItem <= wholesalePriceCents;
  }

  getUndoStackLength(variantId: string, context: 'unit' | 'line' = 'line'): number {
    const stack = this.stacks.get(this.getStackKey(variantId, context));
    if (!stack || stack.length <= 1) return 0;
    return stack.length - 1;
  }
}

export interface PriceOverrideData {
  variantId: string;
  customLinePrice?: number;
  reason?: string;
}
