const BASE = import.meta.env.BASE_URL;

export const LE_GAZAL_ASSETS = {
  titleLogo: `${BASE}assets/LeGazal.png`,
  ten: `${BASE}assets/10.png`,
  j: `${BASE}assets/J.png`,
  q: `${BASE}assets/Q.png`,
  k: `${BASE}assets/K.png`,
  a: `${BASE}assets/A.png`,
  ball: `${BASE}assets/Balon.png`,
  bonus: `${BASE}assets/Bonus.png`,
  jersey: `${BASE}assets/Camiseta.png`,
  hoop: `${BASE}assets/Canasta.png`,
  shield: `${BASE}assets/Escudo.png`,
  mascot: `${BASE}assets/Mapache.png`,
  whistle: `${BASE}assets/Silbato.png`,
  trophy: `${BASE}assets/Trofeo.png`,
  promo: `${BASE}assets/le-gazal-promo.png`,
  characters: {
    // HQ v3 assets come from the approved full-resolution Pol/Pelos illustrations.
    // New filenames also guarantee that the PWA cannot reuse the broken/low-res v1/v2 cache.
    polIdle: `${BASE}assets/le-gazal/characters/pol-hq-v3.webp`,
    polClutch: `${BASE}assets/le-gazal/characters/pol-hq-v3.webp`,
    polEntrance: `${BASE}assets/le-gazal/characters/pol-hq-v3.webp`,
    pelosIdle: `${BASE}assets/le-gazal/characters/pelos-hq-v3.webp`,
  },
};
