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
  type_procedure: string | null;
  donnees: string | null;
  url_avis: string | null;
}

/**
 * Extraire montant, description et URL DCE depuis le champ `donnees` (JSON eForms).
 * Structure profondément imbriquée — on cherche récursivement.
 *
 * Pour le montant : on cherche TOUTES les occurrences de EstimatedOverallContractAmount.
 * Le premier est souvent le montant global (accord-cadre tous lots + reconductions).
 * On prend le plus petit montant > 0 comme estimation plus réaliste d'un lot.
 */
export interface LotInfo {
  num: string;
  nom: string;
  montant: number | null;
}

export function parseDonnees(raw: string | null | undefined): {
  montant_estime: number | null;
  description_detail: string | null;
  url_dce_telechargement: string | null;
  lots: LotInfo[];
} {
  const empty = { montant_estime: null, description_detail: null, url_dce_telechargement: null, lots: [] as LotInfo[] };
  if (!raw) return empty;

  try {
    const d = JSON.parse(raw);

    // Recherche récursive — retourne la PREMIÈRE occurrence
    function findKey(obj: unknown, key: string, depth = 0): unknown {
      if (depth > 15 || !obj) return null;
      if (typeof obj === "object" && obj !== null) {
        if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
        for (const v of Object.values(obj as Record<string, unknown>)) {
          const r = findKey(v, key, depth + 1);
          if (r) return r;
        }
      }
      if (Array.isArray(obj)) {
        for (const v of obj) {
          const r = findKey(v, key, depth + 1);
          if (r) return r;
        }
      }
      return null;
    }

    // Recherche récursive — retourne TOUTES les occurrences
    function findAllKeys(obj: unknown, key: string, results: unknown[] = [], depth = 0): unknown[] {
      if (depth > 20 || !obj) return results;
      if (typeof obj === "object" && obj !== null) {
        if (key in (obj as Record<string, unknown>)) {
          results.push((obj as Record<string, unknown>)[key]);
        }
        for (const v of Object.values(obj as Record<string, unknown>)) {
          findAllKeys(v, key, results, depth + 1);
        }
      }
      if (Array.isArray(obj)) {
        for (const v of obj) {
          findAllKeys(v, key, results, depth + 1);
        }
      }
      return results;
    }

    // Montant : récupérer toutes les occurrences et prendre le min (= lot le plus petit, plus réaliste)
    const allAmounts = findAllKeys(d, "cbc:EstimatedOverallContractAmount") as Array<Record<string, string>>;
    const amounts = allAmounts
      .map((a) => Number(a?.["#text"]))
      .filter((n) => n > 0);
    // S'il n'y a qu'un seul montant, c'est le montant global — on le prend tel quel
    // S'il y en a plusieurs, le 1er est le global, les suivants sont les lots — on prend le médian des lots
    let montant: number | null = null;
    if (amounts.length === 1) {
      montant = amounts[0];
    } else if (amounts.length > 1) {
      const lotAmounts = amounts.slice(1).sort((a, b) => a - b);
      montant = lotAmounts[Math.floor(lotAmounts.length / 2)]; // médian des lots
    }

    const descObj = findKey(d, "cbc:Description") as Record<string, string> | null;
    const uriVal = findKey(d, "cbc:URI") as string | null;

    // Extraction des lots depuis cac:ProcurementProjectLot
    const lots: LotInfo[] = [];
    const lotsRaw = findAllKeys(d, "cac:ProcurementProjectLot");
    const lotArray = lotsRaw.length === 1 && !Array.isArray(lotsRaw[0])
      ? [lotsRaw[0]]
      : Array.isArray(lotsRaw[0]) ? (lotsRaw[0] as unknown[]) : lotsRaw;

    for (const lot of lotArray) {
      if (!lot || typeof lot !== "object") continue;
      const rec = lot as Record<string, unknown>;
      const project = rec["cac:ProcurementProject"] as Record<string, unknown> | undefined;
      if (!project) continue;

      const lotIdObj = findKey(rec, "cbc:ID");
      const lotNameObj = findKey(project, "cbc:Name");
      const lotAmountObj = findKey(project, "cbc:EstimatedOverallContractAmount") as Record<string, string> | null;

      const num = typeof lotIdObj === "object" && lotIdObj
        ? (lotIdObj as Record<string, string>)["#text"] ?? String(lotIdObj)
        : String(lotIdObj ?? "");
      const nom = typeof lotNameObj === "object" && lotNameObj
        ? (lotNameObj as Record<string, string>)["#text"] ?? ""
        : String(lotNameObj ?? "");
      const lotMontant = lotAmountObj?.["#text"] ? Number(lotAmountObj["#text"]) : null;

      if (nom) lots.push({ num, nom, montant: lotMontant });
    }

    return {
      montant_estime: montant,
      description_detail: descObj?.["#text"] ?? (typeof descObj === "string" ? descObj : null),
      url_dce_telechargement: uriVal ? uriVal.replace(/&amp;/g, "&") : null,
      lots,
    };
  } catch {
    return empty;
  }
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
