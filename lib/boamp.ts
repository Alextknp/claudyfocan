/**
 * Client BOAMP API — fetch des appels d'offres publics.
 * API gratuite, pas de clé requise.
 * Doc : https://boamp-datadila.opendatasoft.com/
 */

const BOAMP_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1";
const DATASET = "boamp";

/** CPV codes suivis par Claudy */
export const CPV_CODES = [
  "45421000", // Menuiserie bois
  "45421100", // Portes & fenêtres
  "45410000", // Cloisons / plâtrerie
  "45451000", // Faux plafonds
  "71250000", // Géomètre expert
  "71520000", // AMO
] as const;

export type CpvCode = (typeof CPV_CODES)[number];

export interface BoampRecord {
  id: string;
  idweb: string;
  intitule: string;
  objet: string | null;
  dateparution: string;
  datefindiffusion: string | null;
  code_cpv: string | null;
  descripteur_code_cpv: string | null;
  departement_code: string | null;
  url_avis: string | null;
  nature: string | null;
  typemarche: string | null;
  famille: string | null;
}

interface BoampApiResponse {
  total_count: number;
  results: BoampRecord[];
}

/**
 * Fetch les AO publiés aujourd'hui (ou une date donnée) pour les CPV suivis.
 */
export async function fetchBoampByDate(
  date?: string
): Promise<BoampRecord[]> {
  const targetDate = date ?? new Date().toISOString().split("T")[0];

  // Build CPV filter: search for any of our CPV codes
  const cpvFilter = CPV_CODES.map((c) => `code_cpv LIKE '${c}%'`).join(" OR ");

  const params = new URLSearchParams({
    dataset: DATASET,
    where: `dateparution='${targetDate}' AND (${cpvFilter})`,
    limit: "100",
    order_by: "dateparution DESC",
  });

  const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`BOAMP API error: ${res.status} ${res.statusText}`);
  }

  const data: BoampApiResponse = await res.json();
  return data.results;
}

/**
 * Fetch les AO pour une plage de dates (batch overnight).
 */
export async function fetchBoampRange(
  from: string,
  to: string
): Promise<BoampRecord[]> {
  const cpvFilter = CPV_CODES.map((c) => `code_cpv LIKE '${c}%'`).join(" OR ");

  const allRecords: BoampRecord[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({
      dataset: DATASET,
      where: `dateparution>='${from}' AND dateparution<='${to}' AND (${cpvFilter})`,
      limit: String(limit),
      offset: String(offset),
      order_by: "dateparution DESC",
    });

    const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`BOAMP API error: ${res.status} ${res.statusText}`);
    }

    const data: BoampApiResponse = await res.json();
    allRecords.push(...data.results);

    if (data.results.length < limit) break;
    offset += limit;
  }

  return allRecords;
}
