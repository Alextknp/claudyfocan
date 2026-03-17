/**
 * Client BOAMP API — fetch des appels d'offres publics.
 * API gratuite, pas de clé requise.
 * Doc : https://boamp-datadila.opendatasoft.com/
 *
 * IMPORTANT : BOAMP n'utilise PAS les codes CPV ISO mais des "descripteur_code" internes.
 * Le mapping ci-dessous a été vérifié empiriquement.
 */

const BOAMP_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1";
const DATASET = "boamp";

/**
 * Codes descripteurs BOAMP par métier.
 * Ce ne sont PAS des CPV — c'est le référentiel propre au BOAMP.
 */
export const DESCRIPTEURS = {
  menuiserie: { code: "222", label: "Menuiserie" },
  cloisons_faux_plafonds: { code: "63", label: "Cloison, faux plafond" },
  platrerie: { code: "269", label: "Plâtrerie" },
  topographie: { code: "344", label: "Topographie" }, // Géomètre expert
  ingenierie: { code: "455", label: "Ingénierie" }, // AMO / MOE
  etude: { code: "118", label: "Etude" }, // Études géomètre-expert
} as const;

/** Tous les codes descripteurs qu'on surveille */
export const WATCHED_CODES = Object.values(DESCRIPTEURS).map((d) => d.code);

/** Mapping métier → descripteur codes */
export const METIER_CODES: Record<string, string[]> = {
  "Menuiserie bois": ["222"],
  "Cloisons / Plâtrerie": ["63", "269"],
  "Faux plafonds": ["63"],
  "Géomètre expert": ["344", "118"],
  AMO: ["455"],
};

export interface BoampRecord {
  id: string;
  idweb: string;
  objet: string | null;
  filename: string | null;
  famille: string | null;
  famille_libelle: string | null;
  code_departement: string[] | null;
  code_departement_prestation: string | null;
  dateparution: string;
  datefindiffusion: string | null;
  datelimitereponse: string | null;
  nomacheteur: string | null;
  nature: string | null;
  nature_libelle: string | null;
  descripteur_code: string[] | null;
  descripteur_libelle: string[] | null;
  type_marche: string[] | null;
  url_avis: string | null;
}

interface BoampApiResponse {
  total_count: number;
  results: BoampRecord[];
}

/**
 * Build le filtre WHERE pour chercher nos descripteurs.
 * BOAMP stocke descripteur_code comme array de strings.
 */
function buildDescripteurFilter(): string {
  return WATCHED_CODES.map((c) => `'${c}' IN descripteur_code`).join(" OR ");
}

/**
 * Fetch les AO publiés à une date donnée (ou aujourd'hui) pour nos métiers.
 */
export async function fetchBoampByDate(
  date?: string
): Promise<BoampRecord[]> {
  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const descFilter = buildDescripteurFilter();

  const where = `dateparution=date'${targetDate}' AND (${descFilter})`;

  const params = new URLSearchParams({
    where,
    limit: "100",
    order_by: "dateparution DESC",
  });

  const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`BOAMP API error ${res.status}: ${body}`);
  }

  const data: BoampApiResponse = await res.json();
  return data.results;
}

/**
 * Fetch les AO pour une plage de dates (batch overnight / import historique).
 */
export async function fetchBoampRange(
  from: string,
  to: string
): Promise<BoampRecord[]> {
  const descFilter = buildDescripteurFilter();
  const allRecords: BoampRecord[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const where = `dateparution>=date'${from}' AND dateparution<=date'${to}' AND (${descFilter})`;

    const params = new URLSearchParams({
      where,
      limit: String(limit),
      offset: String(offset),
      order_by: "dateparution DESC",
    });

    const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`BOAMP API error ${res.status}: ${body}`);
    }

    const data: BoampApiResponse = await res.json();
    allRecords.push(...data.results);

    if (data.results.length < limit) break;
    offset += limit;
  }

  return allRecords;
}
