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
    // Versioned filenames prevent the PWA/browser from reusing the broken v1-v3 files.
    polIdle: `${BASE}assets/le-gazal/characters/pol-clutch-v4.webp`,
    polClutch: `${BASE}assets/le-gazal/characters/pol-clutch-v4.webp`,
    polEntrance: `${BASE}assets/le-gazal/characters/pol-clutch-v4.webp`,
    pelosIdle: `${BASE}assets/le-gazal/characters/pelos-idle-v4.webp`,
  },
};
