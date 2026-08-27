// lib/blocks/custom-registry.tsx
import type { ComponentType } from 'react';

/**
 * Extension point for the `custom` block.
 *
 * A block stores only a component NAME plus props — never a component itself,
 * because block data is untrusted JSON from the database. Rendering an
 * arbitrary named component would be a code-execution primitive; resolving
 * through this explicit allow-list means an author can only reach components a
 * developer has deliberately registered here.
 */
export type CustomComponent = ComponentType<Record<string, unknown>>;

const registry = new Map<string, CustomComponent>();

export function registerCustomBlock(name: string, component: CustomComponent): void {
  registry.set(name, component);
}

export function resolveCustomBlock(name: string): CustomComponent | null {
  return registry.get(name) ?? null;
}

export function registeredCustomBlocks(): string[] {
  return [...registry.keys()];
}

// ── Register project components below ────────────────────────────────────
// Example:
//   import { PriceCalculator } from '@/components/site/custom/price-calculator';
//   registerCustomBlock('price-calculator', PriceCalculator);
//
// Nothing is registered by default, so a `custom` block renders nothing until a
// developer opts a component in.
