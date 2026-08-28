import { SLOTS, type Slot, type Split } from './types.js';

function sortSlots(slots: readonly Slot[]): Slot[] {
  return [...slots].sort((left, right) => left - right);
}

export function canonicalizeSplit(split: Split): Split {
  const first = sortSlots(split[0]);
  const second = sortSlots(split[1]);
  return first.includes(1) ? [first, second] : [second, first];
}

export function splitKey(split: Split): string {
  const canonical = canonicalizeSplit(split);
  return `${canonical[0].join('')}-${canonical[1].join('')}`;
}

export function isValidThreeThreeSplit(split: Split): boolean {
  if (split[0].length !== 3 || split[1].length !== 3) return false;
  const values = [...split[0], ...split[1]];
  const unique = new Set(values);
  return unique.size === 6 && SLOTS.every((slot) => unique.has(slot));
}

export function enumerateThreeThreeSplits(): Split[] {
  const results: Split[] = [];
  for (let a = 1; a <= 4; a += 1) {
    for (let b = a + 1; b <= 5; b += 1) {
      for (let c = b + 1; c <= 6; c += 1) {
        const first = [a, b, c] as Slot[];
        if (!first.includes(1)) continue;
        const second = SLOTS.filter((slot) => !first.includes(slot));
        results.push([first, second]);
      }
    }
  }
  return results;
}
