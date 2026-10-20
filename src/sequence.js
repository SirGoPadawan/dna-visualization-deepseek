/**
 * Основания и генератор демонстрационной последовательности.
 *
 * GC-состав выбран ≈ 41 % — это близко к среднему по геному человека.
 * Последовательность детерминированная: при одном и том же seed модель
 * выглядит одинаково при каждом открытии страницы.
 */

export const BASES = Object.freeze({
  A: { name: "аденин", color: "#ff6b8b", complement: "T", purine: true },
  T: { name: "тимин", color: "#ffc857", complement: "A", purine: false },
  G: { name: "гуанин", color: "#4ade80", complement: "C", purine: true },
  C: { name: "цитозин", color: "#4cc9f0", complement: "G", purine: false },
});

/** Быстрый детерминированный PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} length число пар оснований
 * @param {number} seed
 * @returns {{ strand1: string, strand2: string, gc: number }}
 */
export function createSequence(length, seed = 0x5eed1a7) {
  const random = mulberry32(seed);
  const first = new Array(length);
  const second = new Array(length);
  let gc = 0;

  for (let i = 0; i < length; i += 1) {
    let base;
    if (random() < 0.41) {
      base = random() < 0.5 ? "G" : "C";
      gc += 1;
    } else {
      base = random() < 0.5 ? "A" : "T";
    }
    first[i] = base;
    second[i] = BASES[base].complement;
  }

  return {
    strand1: first.join(""),
    strand2: second.join(""),
    gc: gc / length,
  };
}
