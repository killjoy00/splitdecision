export interface RandomSource {
  next(): number;
  int(maxExclusive: number): number;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed: string): RandomSource {
  let state = hashSeed(seed) || 0x9e3779b9;
  return {
    next(): number {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`maxExclusive must be a positive integer; received ${maxExclusive}`);
      }
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.int(index + 1);
    const value = result[index];
    result[index] = result[swapIndex] as T;
    result[swapIndex] = value as T;
  }
  return result;
}

export function randomItem<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new Error('Cannot choose from an empty collection');
  return items[random.int(items.length)] as T;
}
