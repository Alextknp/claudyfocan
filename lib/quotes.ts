/** Répliques de Claudy Focan (Dikkenek) — une par page */

export const QUOTES: Record<string, string> = {
  "/": "Moi c'est Claudy, je fais la veille.",
  "/en-cours": "On est pas bien là ? Paisibles, à la fraîche...",
  "/expires": "La patience est la mère de toutes les vertus, fieu.",
  "/attribues": "Pas de bras, pas de chocolat.",
  "/competition": "La chance, c'est comme le Tour de France, tu l'attends longtemps et ça passe vite.",
};

/** Répliques supplémentaires pour les sous-pages */
export const EXTRA_QUOTES = [
  "Faut pas pousser mémé dans les orties.",
  "C'est pas faux.",
  "Tu vois le genre ? Le genre... focan.",
  "Moi j'ai un QI de 146, fieu.",
  "J'suis un homme de terrain, moi.",
  "Quand on est bon, on est bon.",
  "C'est ça la classe, fieu.",
  "Tout est dans le regard.",
  "Ou tu sors ou j'te sors.",
];

export function getQuote(pathname: string): string {
  if (QUOTES[pathname]) return QUOTES[pathname];
  // Pour les sous-pages (/competition/xxx), hash du pathname pour avoir toujours la même
  let hash = 0;
  for (let i = 0; i < pathname.length; i++) {
    hash = ((hash << 5) - hash + pathname.charCodeAt(i)) | 0;
  }
  return EXTRA_QUOTES[Math.abs(hash) % EXTRA_QUOTES.length];
}
