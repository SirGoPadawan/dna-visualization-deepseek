/**
 * Палитры для двух страниц: обычная ДНК и фанатская «SPIDER-DNA».
 *
 * Тема выбирается атрибутом data-theme на <html>, поэтому один и тот же
 * main.js обслуживает обе страницы без дублирования логики.
 */

const DNA = {
  id: "dna",
  bondLabel: "водородные связи",

  baseColors: { A: "#ff6b8b", T: "#ffc857", G: "#4ade80", C: "#4cc9f0" },

  glow: {
    bottom: "#54d8ff",
    top: "#ff7aa2",
    strandA: "#54d8ff",
    strandB: "#ff7aa2",
    strandMix: 0,
    opacity: 0.42,
  },

  bond: { color: 0x9fe8ff, opacity: 0.42 },
  haloOpacity: 0.1,

  bloom: { strength: 0.4, mobile: 0.42, radius: 0.6, threshold: 0.85 },

  sceneBg: 0x050810,
  backdrop: { top: "#071425", bottom: "#02040a", glow: "#1d5c86", aura: "#2f86b8" },
  env: null,
  lights: {
    key: 0xeaf2ff,
    fill: 0x5b8cff,
    rimA: 0x37d7ff,
    rimB: 0xff5f8f,
    rimC: 0xffc266,
  },
  dust: { a: [0.42, 0.66, 1.0], b: [0.85, 0.95, 1.0] },
};

const SPIDER = {
  id: "spider",
  bondLabel: "паутинные нити",

  // Красные пары (A–T) и синие пары (G–C) — как костюм.
  baseColors: { A: "#ff2f4f", T: "#ff7d8f", G: "#2f6bff", C: "#64d2ff" },

  glow: {
    bottom: "#ff3b4e",
    top: "#3b6dff",
    strandA: "#ff2f45",
    strandB: "#2f6bff",
    strandMix: 1,
    opacity: 0.5,
  },

  bond: { color: 0xd6ecff, opacity: 0.55 },
  haloOpacity: 0.16,

  bloom: { strength: 0.46, mobile: 0.5, radius: 0.6, threshold: 0.84 },

  sceneBg: 0x06040c,
  backdrop: { top: "#150a20", bottom: "#020208", glow: "#8a1d3f", aura: "#2f6bff" },
  env: {
    stops: [
      [0, "#1a0a14"],
      [0.42, "#2a0f22"],
      [0.62, "#101026"],
      [1, "#03030a"],
    ],
    blobs: [
      [300, 60, 250, "#ffffff", 0.9],
      [780, 120, 300, "#ff4a63", 0.6],
      [120, 300, 260, "#ff2f45", 0.5],
      [880, 350, 260, "#2f6bff", 0.6],
      [520, 470, 320, "#0a0a18", 0.85],
    ],
  },
  lights: {
    key: 0xffeef2,
    fill: 0x4b6bff,
    rimA: 0xff2f45,
    rimB: 0x2f6bff,
    rimC: 0xbfd4ff,
    hemiSky: 0xffc2cc,
    hemiGround: 0x101838,
  },
  dust: { a: [0.4, 0.55, 1.0], b: [1.0, 0.5, 0.6] },
};

export function getTheme() {
  return document.documentElement.dataset.theme === "spider" ? SPIDER : DNA;
}
