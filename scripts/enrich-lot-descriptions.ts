/**
 * Enrichit les noms de lots des attributions en fouillant dans les descriptions
 * contenues dans le champ donnees (raw_json.donnees).
 *
 * Si une description de lot mentionne un de nos mots-clés métier mais que le nom
 * du lot ne le mentionne pas, on préfixe le mot-clé au nom du lot pour qu'il
 * remonte dans les filtres.
 *
 * Usage : npx tsx scripts/enrich-lot-descriptions.ts
 *
 * « Claudy creuse les lots, fieu. »
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

// Mots-clés métier — insensible à la casse
const KEYWORDS = [
  "menuiserie",
  "cloison",
  "cloisons",
  "faux plafond",
  "faux-plafond",
  "faux plafonds",
  "faux-plafonds",
  "plâtrerie",
  "platrerie",
  "plaquiste",
  "topographie",
  "géomètre",
  "geometre",
  "amo",
  "assistance à maîtrise",
  "assistance a maitrise",
  "serrurerie",
  "agencement",
  "isolation",
  "peinture",
  "revêtement",
  "revetement",
];

// Normalise pour la comparaison (lowercase, sans accents)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const KEYWORDS_NORMALIZED = KEYWORDS.map(normalize);

// Labels canoniques pour le préfixe (on évite les doublons type "cloison" / "cloisons")
const KEYWORD_LABELS: Record<string, string> = {};
for (const kw of KEYWORDS) {
  const n = normalize(kw);
  // Garder le premier (le plus court / canonique)
  if (!KEYWORD_LABELS[n]) KEYWORD_LABELS[n] = kw;
}
// Dedup : "cloisons" -> "cloison"
KEYWORD_LABELS[normalize("cloisons")] = "cloison";
KEYWORD_LABELS[normalize("faux-plafond")] = "faux plafond";
KEYWORD_LABELS[normalize("faux plafonds")] = "faux plafond";
KEYWORD_LABELS[normalize("faux-plafonds")] = "faux plafond";
KEYWORD_LABELS[normalize("platrerie")] = "plâtrerie";
KEYWORD_LABELS[normalize("geometre")] = "géomètre";
KEYWORD_LABELS[normalize("assistance a maitrise")] = "AMO";
KEYWORD_LABELS[normalize("assistance à maîtrise")] = "AMO";
KEYWORD_LABELS[normalize("revetement")] = "revêtement";

function textOf(obj: unknown): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if ("#text" in rec) return String(rec["#text"]);
  }
  return String(obj);
}

function findAll(obj: unknown, key: string, results: unknown[] = [], depth = 0): unknown[] {
  if (depth > 20 || !obj) return results;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if (key in rec) results.push(rec[key]);
    for (const v of Object.values(rec)) findAll(v, key, results, depth + 1);
  }
  if (Array.isArray(obj)) {
    for (const v of obj) findAll(v, key, results, depth + 1);
  }
  return results;
}

function flatten<T>(arr: unknown[]): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) result.push(...(item as T[]));
    else result.push(item as T);
  }
  return result;
}

interface LotWithDesc {
  lotId: string; // LOT-0001 etc.
  description: string;
}

/**
 * Extrait les descriptions de lots depuis le champ donnees brut.
 * Stratégie 1 : eForms — cac:ProcurementProjectLot → cbc:Description
 * Stratégie 2 : Ancien BOAMP — DECISION → DESCRIPTION
 */
function extractLotDescriptions(donneesStr: string | null): LotWithDesc[] {
  if (!donneesStr) return [];
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(donneesStr);
  } catch {
    return [];
  }

  const results: LotWithDesc[] = [];

  // --- eForms : ProcurementProjectLot ---
  const lotsRaw = flatten<Record<string, unknown>>(findAll(d, "cac:ProcurementProjectLot"));
  for (const lot of lotsRaw) {
    if (!lot || typeof lot !== "object") continue;
    const lotId = textOf(findAll(lot, "cbc:ID")[0] ?? "");
    const project = (lot as Record<string, unknown>)["cac:ProcurementProject"] as Record<string, unknown> | undefined;
    if (!project) continue;
    const desc = textOf(findAll(project, "cbc:Description")[0] ?? "");
    if (lotId && desc) {
      results.push({ lotId, description: desc });
    }
  }

  // --- Ancien format : DECISION ---
  const decisions = flatten<Record<string, unknown>>(findAll(d, "DECISION"));
  for (const dec of decisions) {
    if (!dec || typeof dec !== "object") continue;
    const numLot = textOf((dec as Record<string, unknown>)["NUM_LOT"] ?? "");
    const description = textOf((dec as Record<string, unknown>)["DESCRIPTION"] ?? "");
    const intitule = textOf((dec as Record<string, unknown>)["INTITULE"] ?? "");
    // Aussi chercher dans OBJET si présent
    const objet = textOf((dec as Record<string, unknown>)["OBJET"] ?? "");
    const fullDesc = [description, intitule, objet].filter(Boolean).join(" ");
    if (numLot && fullDesc) {
      results.push({ lotId: `LOT-${numLot}`, description: fullDesc });
    }
  }

  return results;
}

/**
 * Trouve les mots-clés présents dans description mais absents du nom du lot.
 * Retourne les labels canoniques à préfixer.
 */
function findMissingKeywords(lotName: string, description: string): string[] {
  const nameNorm = normalize(lotName);
  const descNorm = normalize(description);
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const kwNorm of KEYWORDS_NORMALIZED) {
    if (descNorm.includes(kwNorm) && !nameNorm.includes(kwNorm)) {
      const label = KEYWORD_LABELS[kwNorm] ?? kwNorm;
      if (!seen.has(label)) {
        seen.add(label);
        missing.push(label);
      }
    }
  }

  return missing;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Variables Supabase manquantes.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let from = 0;
  const pageSize = 1000;
  let totalProcessed = 0;
  let totalEnriched = 0;
  let totalLotsUpdated = 0;

  console.log(`🔍 Enrichissement des lots d'attributions via descriptions...\n`);

  while (true) {
    const { data: rows, error } = await supabase
      .from("appels_offres")
      .select("id, boamp_id, lots, raw_json")
      .eq("statut", "attribue")
      .not("lots", "eq", "[]")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Erreur Supabase: ${error.message}`);
      break;
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      totalProcessed++;
      const rawJson = row.raw_json as Record<string, unknown> | null;
      const donneesStr = rawJson?.donnees as string | null ?? null;
      const lots = row.lots as Array<{ num: string; nom: string; montant: number | null; nb_offres?: number | null }>;

      if (!lots || lots.length === 0) continue;

      const lotDescs = extractLotDescriptions(donneesStr);
      if (lotDescs.length === 0) continue;

      // Build a map lotId -> description
      const descMap = new Map<string, string>();
      for (const ld of lotDescs) {
        descMap.set(ld.lotId, ld.description);
      }

      let modified = false;
      let lotsUpdatedThisRow = 0;

      for (const lot of lots) {
        const desc = descMap.get(lot.num);
        if (!desc) continue;

        const missingKw = findMissingKeywords(lot.nom, desc);
        if (missingKw.length > 0) {
          const prefix = `[${missingKw.join(", ")}]`;
          lot.nom = `${prefix} ${lot.nom}`;
          modified = true;
          lotsUpdatedThisRow++;
        }
      }

      if (modified) {
        const { error: upErr } = await supabase
          .from("appels_offres")
          .update({ lots })
          .eq("id", row.id);

        if (upErr) {
          console.error(`  ❌ ${row.boamp_id}: ${upErr.message}`);
        } else {
          totalEnriched++;
          totalLotsUpdated += lotsUpdatedThisRow;
          console.log(`  ✏️  ${row.boamp_id}: ${lotsUpdatedThisRow} lot(s) enrichi(s)`);
        }
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log(`\n✅ ${totalProcessed} AO traitées, ${totalEnriched} enrichies (${totalLotsUpdated} lots mis à jour).`);
  console.log(`\n« Claudy creuse les lots, fieu. »`);
}

main();
