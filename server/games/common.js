import { randomInt } from 'node:crypto';

export class GameError extends Error {
  constructor(message) { super(message); this.name = 'GameError'; }
}
export function demand(condition, message) {
  if (!condition) throw new GameError(message);
}
export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const die = () => randomInt(1, 7);
export const randomIndex = (n) => randomInt(n);
export function countBy(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.values()];
}
