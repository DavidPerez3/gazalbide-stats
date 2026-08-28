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
    // v5 is the complete approved pose pack used by all three scatter reveals.
    polIdle: `${BASE}assets/le-gazal/characters/pol-idle-v5.webp`,
    polEntrance: `${BASE}assets/le-gazal/characters/pol-run-v5.webp`,
    polClutch: `${BASE}assets/le-gazal/characters/pol-horns-v5.webp`,
    pelosIdle: `${BASE}assets/le-gazal/characters/pelos-idle-v5.webp`,
    pelosPower: `${BASE}assets/le-gazal/characters/pelos-power-v5.webp`,
    pelosPoint: `${BASE}assets/le-gazal/characters/pelos-point-v5.webp`,
    duoClutch: `${BASE}assets/le-gazal/characters/duo-clutch-v5.webp`,
    duoMadness: `${BASE}assets/le-gazal/characters/duo-madness-v5.webp`,
  },
};

let characterPreloadPromise;

export function preloadLeGazalCharacters() {
  if (typeof Image === "undefined") return Promise.resolve();
  if (characterPreloadPromise) return characterPreloadPromise;

  const sources = [...new Set(Object.values(LE_GAZAL_ASSETS.characters))];
  characterPreloadPromise = Promise.all(
    sources.map((source) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = source;
    }))
  );

  return characterPreloadPromise;
}
