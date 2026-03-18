export interface Metier {
  nom: string;
  codes: string[];
  keywords: string[];
  accent: string;
  emoji: string;
}

// Codes élargis : nos codes directs + codes bâtiment qui contiennent souvent nos lots
const CODES_BATIMENT = ["345", "172", "346", "293", "287", "75", "190", "321", "3"];

export const METIERS: Metier[] = [
  { nom: "AK Menuiserie", codes: ["222", ...CODES_BATIMENT], keywords: [
    "menuiserie", "menuisier", "agencement", "ébénisterie", "huisserie",
    "fermeture", "serrurerie", "métallerie", "miroiterie", "vitrerie",
    "vitrage", "châssis", "volet", "store", "fenêtre", "fenetre",
  ], accent: "border-l-amber-400", emoji: "🪵" },
  { nom: "Kortina", codes: ["63", "269", ...CODES_BATIMENT], keywords: [
    "cloison", "cloisonnement", "plâtrerie", "platrerie",
    "faux plafond", "faux-plafond", "plafond suspendu",
    "doublage", "placo", "plaque de plâtre", "ossature métallique",
    "isolation intérieure", "isolation thermique intérieure",
  ], accent: "border-l-orange-400", emoji: "🧱" },
  { nom: "AK Maître-Géomètre", codes: ["344", "118"], keywords: [
    "topographie", "topographique", "géomètre", "bornage",
    "géoréférencement", "levé topograph", "cadastr", "relevé",
    "foncier", "géotech", "géodési", "implantation",
    "nivellement", "altimétrique", "planimétrique", "recolement",
  ], accent: "border-l-emerald-400", emoji: "📐" },
];

export interface AO {
  id: string;
  titre: string;
  acheteur: string | null;
  montant_estime: number | null;
  deadline: string | null;
  date_pub: string;
  cpv_codes: string[];
  type_marche: string | null;
  statut: string;
  url_dce: string | null;
  url_dce_telechargement: string | null;
  lots: Array<{ num: string; nom: string; montant: number | null; nb_offres?: number | null }>;
  resume_llm: string | null;
  descripteur_libelle: string[];
}

export const AO_FIELDS = "id, titre, acheteur, montant_estime, deadline, date_pub, cpv_codes, type_marche, statut, url_dce, url_dce_telechargement, lots, resume_llm, descripteur_libelle";

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M€`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k€`;
  return `${n}€`;
}

export function matchesMetier(lot: { nom: string }, metier: Metier, aoTitre?: string): boolean {
  const arrow = lot.nom.indexOf("→");
  const lotName = (arrow === -1 ? lot.nom : lot.nom.slice(0, arrow)).toLowerCase();

  // 1. Chercher dans le nom du lot (avant →)
  if (metier.keywords.some((kw) => lotName.includes(kw))) return true;

  // 2. Pour les lots génériques ("Lot 1", "Lot unique"), chercher dans le titre de l'AO
  const isGeneric = /^lot\s*\d*\s*$/i.test(lotName.trim()) || lotName.trim() === "lot unique";
  if (isGeneric && aoTitre) {
    const titre = aoTitre.toLowerCase();
    if (metier.keywords.some((kw) => titre.includes(kw))) return true;
  }

  // 3. Chercher dans le nom de l'entreprise (après →) — "MENUISERIE POUJOL" matche menuiserie
  if (arrow !== -1) {
    const companyPart = lot.nom.slice(arrow + 1).toLowerCase();
    if (metier.keywords.some((kw) => companyPart.includes(kw))) return true;
  }

  return false;
}

export function aoMatchesMetier(ao: AO, metier: Metier): boolean {
  return (ao.cpv_codes ?? []).some((c) => metier.codes.includes(c));
}

export function parseCompanies(lotNom: string): string[] {
  const arrow = lotNom.indexOf("→");
  if (arrow === -1) return [];
  const after = lotNom.slice(arrow + 1).trim();
  if (!after) return [];

  // Splitter par virgule d'abord
  let parts = after.split(",").map((s) => s.trim()).filter(Boolean);

  // Éclater les groupements : "Groupement MIRAS/JPB/CARDONNET" → ["MIRAS", "JPB", "CARDONNET"]
  const expanded: string[] = [];
  for (const part of parts) {
    if ((part.toLowerCase().startsWith("groupement") || part.toLowerCase().startsWith("grpt")) && part.includes("/")) {
      // Retirer le préfixe "Groupement" et splitter sur /
      const clean = part.replace(/^(groupement|grpt)\s*/i, "");
      const members = clean.split("/").map((s) => s.trim()).filter(Boolean);
      expanded.push(...members);
    } else if (part.includes("/") && !part.includes("http")) {
      // Aussi splitter les "A/B/C" sans préfixe groupement
      const members = part.split("/").map((s) => s.trim()).filter(Boolean);
      // Seulement si chaque partie ressemble à un nom d'entreprise (> 2 chars)
      if (members.every((m) => m.length > 2)) {
        expanded.push(...members);
      } else {
        expanded.push(part);
      }
    } else {
      expanded.push(part);
    }
  }

  // Retirer les mentions "(mandataire)", "(cotraitant)"
  return expanded
    .map((s) => s.replace(/\s*\(mandataire\)\s*/gi, "").replace(/\s*\(cotraitant\)\s*/gi, "").trim())
    .filter((s) => s.length > 1);
}

const FORMES_JURIDIQUES = ["SAS", "SARL", "SA", "STE", "ETS", "ENTREPRISE", "SOCIETE", "ETABLISSEMENT", "ETABLISSEMENTS", "S A R L", "S.A.R.L", "S.A.S", "EURL", "SASU"];

export function normalizeCompanyName(name: string): string {
  let n = name.trim().toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[''`]/g, "'")
    .replace(/[.]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

  // Retirer TOUTES les formes juridiques (début et fin, en boucle)
  let changed = true;
  while (changed) {
    changed = false;
    for (const fj of FORMES_JURIDIQUES) {
      if (n.startsWith(fj + " ")) { n = n.slice(fj.length + 1); changed = true; }
      if (n.endsWith(" " + fj)) { n = n.slice(0, -(fj.length + 1)); changed = true; }
    }
  }

  // Retirer "S" final (pluriel)
  n = n.trim();
  if (n.endsWith("S") && n.length > 3) {
    n = n.slice(0, -1);
  }

  return n.trim();
}

export function deadlineInfo(d: string): { label: string; cls: string } {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return { label: "Expiré", cls: "text-neutral-400 line-through" };
  if (diff === 0) return { label: "Aujourd'hui", cls: "text-red-600 font-bold" };
  if (diff <= 5) return { label: `J-${diff}`, cls: "text-red-600 font-semibold" };
  if (diff <= 14) return { label: `J-${diff}`, cls: "text-orange-500 font-medium" };
  return { label: `J-${diff}`, cls: "text-neutral-500" };
}

export interface DecpMarche {
  id: string;
  decp_id: string;
  objet: string | null;
  montant: number | null;
  titulaire_siret: string | null;
  titulaire_nom: string | null;
  acheteur_nom: string | null;
  date_notification: string | null;
  nb_offres: number | null;
  procedure_type: string | null;
}

export function decpMatchesMetier(objet: string | null, metier: Metier): boolean {
  if (!objet) return false;
  const lower = objet.toLowerCase();
  return metier.keywords.some((kw) => lower.includes(kw));
}

export interface EntrepriseSiret {
  nom_normalise: string;
  nom: string;
  siret: string;
}

/** Cherche un SIRET par clé exacte, puis par inclusion si pas trouvé */
export function lookupSiret(
  normKey: string,
  siretMap: Map<string, EntrepriseSiret>
): EntrepriseSiret | undefined {
  // 1. Match exact
  const exact = siretMap.get(normKey);
  if (exact) return exact;

  // 2. Chercher si normKey est contenu dans une clé connue ou vice-versa (pour "CORTINA" → "JF CORTINA")
  if (normKey.length >= 4) {
    for (const [key, entry] of siretMap) {
      if (key.includes(normKey) || normKey.includes(key)) {
        return entry;
      }
    }
  }

  return undefined;
}

export async function fetchEntreprisesSiret(
  supabase: ReturnType<typeof import("@/lib/supabase").createServerClient>
): Promise<Map<string, EntrepriseSiret>> {
  const map = new Map<string, EntrepriseSiret>();
  const bySiret = new Map<string, EntrepriseSiret>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("entreprises_siret")
      .select("nom_normalise, nom, siret")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const entry = r as EntrepriseSiret;
      map.set(r.nom_normalise, entry);
      // Aussi indexer par SIRET pour fusionner les variantes
      if (!bySiret.has(r.siret) || r.nom.length > (bySiret.get(r.siret)?.nom.length ?? 0)) {
        bySiret.set(r.siret, entry);
      }
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  // Pour chaque SIRET, tous les nom_normalise pointent vers la même entrée (le nom le plus long)
  for (const [, bestEntry] of bySiret) {
    for (const [normKey, entry] of map) {
      if (entry.siret === bestEntry.siret && entry !== bestEntry) {
        map.set(normKey, bestEntry);
      }
    }
  }
  return map;
}

export async function fetchDecpMarches(
  supabase: ReturnType<typeof import("@/lib/supabase").createServerClient>
): Promise<DecpMarche[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("decp_marches")
      .select("id, decp_id, objet, montant, titulaire_siret, titulaire_nom, acheteur_nom, date_notification, nb_offres, procedure_type")
      .order("date_notification", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all as unknown as DecpMarche[];
}

export async function fetchAO(
  supabase: ReturnType<typeof import("@/lib/supabase").createServerClient>,
  statut: string
): Promise<AO[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("appels_offres")
      .select(AO_FIELDS)
      .eq("departement", "34")
      .eq("statut", statut)
      .order(statut === "ouvert" ? "deadline" : "date_pub", { ascending: statut === "ouvert" })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all as unknown as AO[];
}
