/** Répliques + gifs de Claudy Focan (Dikkenek) — un par page */

interface PageBranding {
  quote: string;
  gif: string;
}

const PAGE_BRANDING: Record<string, PageBranding> = {
  "/": {
    quote: "Moi c'est Claudy, je fais la veille.",
    gif: "/gifs/shooting.gif",
  },
  "/en-cours": {
    quote: "On est pas bien là ? Paisibles, à la fraîche...",
    gif: "/gifs/annoyed.gif",
  },
  "/expires": {
    quote: "Je suis en bout du rouleau !",
    gif: "/gifs/rouleau.gif",
  },
  "/attribues": {
    quote: "Il est tout à fait fou c'type !",
    gif: "/gifs/fou.gif",
  },
  "/competition": {
    quote: "Va te faire refaire ! Alien.",
    gif: "/gifs/alien.gif",
  },
};

const EXTRA_BRANDING: PageBranding[] = [
  { quote: "Ou tu sors ou j'te sors.", gif: "/gifs/wouhou.gif" },
  { quote: "Allo Maman ! Claudy à l'appareil...", gif: "/gifs/carjacker.gif" },
  { quote: "He tu n'me vois pas ? Tu n'me vois pas ? Wouhou !", gif: "/gifs/wouhou.gif" },
  { quote: "Quand on est bon, on est bon.", gif: "/gifs/shooting.gif" },
  { quote: "C'est ça la classe, fieu.", gif: "/gifs/annoyed.gif" },
  { quote: "Moi j'ai un QI de 146, fieu.", gif: "/gifs/carjacker.gif" },
];

export function getQuote(pathname: string): string {
  if (PAGE_BRANDING[pathname]) return PAGE_BRANDING[pathname].quote;
  let hash = 0;
  for (let i = 0; i < pathname.length; i++) {
    hash = ((hash << 5) - hash + pathname.charCodeAt(i)) | 0;
  }
  return EXTRA_BRANDING[Math.abs(hash) % EXTRA_BRANDING.length].quote;
}

export function getGif(pathname: string): string {
  if (PAGE_BRANDING[pathname]) return PAGE_BRANDING[pathname].gif;
  let hash = 0;
  for (let i = 0; i < pathname.length; i++) {
    hash = ((hash << 5) - hash + pathname.charCodeAt(i)) | 0;
  }
  return EXTRA_BRANDING[Math.abs(hash) % EXTRA_BRANDING.length].gif;
}
