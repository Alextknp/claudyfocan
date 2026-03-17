/**
 * Import des avis d'attribution BOAMP pour le département 34 (nos métiers).
 * Usage : npx tsx scripts/fetch-attributions.ts [--all]
 *
 * « Claudy sait qui a gagné, fieu. »
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { WATCHED_CODES } from "../lib/boamp";

config();

const BOAMP_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1";
const DATASET = "boamp";

interface LotAttrib {
  num: string;
  nb_offres?: number | null;
  nom: string;
  montant: number | null;
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

function findKey(obj: unknown, key: string, depth = 0): unknown {
  if (depth > 15 || !obj) return null;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if (key in rec) return rec[key];
    for (const v of Object.values(rec)) {
      const r = findKey(v, key, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function textOf(obj: unknown): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if ("#text" in rec) return String(rec["#text"]);
  }
  return String(obj);
}

function flatten<T>(arr: unknown[]): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) result.push(...(item as T[]));
    else result.push(item as T);
  }
  return result;
}

function parseAttribution(
  donnees: string | null,
  titulaires: string[] | null,
  objet: string | null
): {
  lots: LotAttrib[];
  montant_total: number | null;
} {
  const titre = objet ?? "Lot unique";

  // Essayer de parser le JSON eForms
  let d: Record<string, unknown> | null = null;
  if (donnees) {
    try { d = JSON.parse(donnees); } catch { /* ignore */ }
  }

  // --- Stratégie 1 : eForms structuré (ProcurementProjectLot + SettledContract) ---
  if (d) {
    const lotsRaw = flatten<Record<string, unknown>>(findAll(d, "cac:ProcurementProjectLot"));
    const lotInfo = new Map<string, string>();
    for (const lot of lotsRaw) {
      if (!lot || typeof lot !== "object") continue;
      const lotId = textOf(findKey(lot, "cbc:ID"));
      const project = lot["cac:ProcurementProject"] as Record<string, unknown> | undefined;
      const name = project ? textOf(findKey(project, "cbc:Name")) : "";
      if (lotId && name) lotInfo.set(lotId, name);
    }

    if (lotInfo.size > 0) {
      // On a des lots structurés — parser les tenders
      const tendersRaw = flatten<Record<string, unknown>>(findAll(d, "efac:LotTender"));
      const lotAmounts = new Map<string, number>();
      const lotTitulaires = new Map<string, string[]>();

      // Orgs
      const orgsRaw = flatten<Record<string, unknown>>(findAll(d, "efac:Organization"));
      const orgNames = new Map<string, string>();
      for (const org of orgsRaw) {
        if (!org || typeof org !== "object") continue;
        const company = org["efac:Company"] as Record<string, unknown> | undefined;
        if (!company) continue;
        const ids = findAll(company, "cbc:ID");
        const names = findAll(company, "cbc:Name");
        const oid = ids.length > 0 ? textOf(ids[0]) : "";
        const oname = names.length > 0 ? textOf(names[0]) : "";
        if (oid && oname) orgNames.set(oid, oname);
      }

      // TPA → org
      const tpaRaw = flatten<Record<string, unknown>>(findAll(d, "efac:TenderingParty"));
      const tpaToOrg = new Map<string, string>();
      for (const tp of tpaRaw) {
        if (!tp || typeof tp !== "object") continue;
        const tpaId = textOf(findKey(tp, "cbc:ID"));
        if (!tpaId.startsWith("TPA")) continue;
        const tenderers = findAll(tp, "efac:Tenderer");
        for (const tenderer of flatten<Record<string, unknown>>(tenderers)) {
          if (!tenderer || typeof tenderer !== "object") continue;
          const orgRef = textOf(findKey(tenderer, "cbc:ID"));
          if (orgRef?.startsWith("ORG")) {
            const name = orgNames.get(orgRef);
            if (name) tpaToOrg.set(tpaId, name);
          }
        }
      }

      // Winners + nb offres par lot
      const resultsRaw = flatten<Record<string, unknown>>(findAll(d, "efac:LotResult"));
      const winnerTids = new Set<string>();
      const lotNbOffres = new Map<string, number>(); // LOT-0001 -> nb offres
      for (const res of resultsRaw) {
        if (!res || typeof res !== "object") continue;
        for (const lt of flatten<Record<string, unknown>>(findAll(res, "efac:LotTender"))) {
          winnerTids.add(textOf(findKey(lt, "cbc:ID")));
        }
        // Nb offres from ReceivedSubmissionsStatistics
        const statsNum = findKey(res, "efbc:StatisticsNumeric");
        const lotTenderRef = findKey(res, "efac:LotTender");
        if (statsNum && lotTenderRef) {
          const lotId = textOf(findKey(lotTenderRef, "cbc:ID"));
          const nb = Number(textOf(statsNum));
          if (lotId && !isNaN(nb) && nb > 0) lotNbOffres.set(lotId, nb);
        }
      }

      for (const tender of tendersRaw) {
        if (!tender || typeof tender !== "object") continue;
        const tid = textOf(findKey(tender, "cbc:ID"));
        if (winnerTids.size > 0 && !winnerTids.has(tid)) continue;

        const lotRef = findKey(tender, "efac:TenderLot") as Record<string, unknown> | null;
        const lotId = lotRef ? textOf(findKey(lotRef, "cbc:ID")) : "";

        const amountObj = findKey(tender, "cbc:PayableAmount");
        const amount = amountObj ? Number(textOf(amountObj)) : null;
        if (lotId && amount && !lotAmounts.has(lotId)) lotAmounts.set(lotId, amount);

        const tpObj = findKey(tender, "efac:TenderingParty") as Record<string, unknown> | null;
        const tpaId = tpObj ? textOf(findKey(tpObj, "cbc:ID")) : "";
        const tName = tpaToOrg.get(tpaId);
        if (lotId && tName) {
          if (!lotTitulaires.has(lotId)) lotTitulaires.set(lotId, []);
          const arr = lotTitulaires.get(lotId)!;
          if (!arr.includes(tName)) arr.push(tName);
        }
      }

      // Build lots
      const lots: LotAttrib[] = [];
      for (const [lotId, lotName] of lotInfo) {
        const montant = lotAmounts.get(lotId) ?? null;
        let tits = lotTitulaires.get(lotId) ?? [];
        // Fallback: si pas de titulaire eForms, essayer le top-level par position
        if (tits.length === 0 && titulaires?.length) {
          const idx = Array.from(lotInfo.keys()).sort().indexOf(lotId);
          if (idx >= 0 && idx < titulaires.length) {
            tits = [titulaires[idx]];
          }
        }
        const label = tits.length > 0 ? `${lotName} → ${tits.join(", ")}` : lotName;
        const nb_offres = lotNbOffres.get(lotId) ?? null;
        lots.push({ num: lotId, nom: label, montant, nb_offres });
      }

      const mtObj = findKey(d, "cbc:TotalAmount");
      return {
        lots,
        montant_total: mtObj ? Number(textOf(mtObj)) : null,
      };
    }
  }

  // --- Stratégie 2 : Ancien format BOAMP (ATTRIBUTION.DECISION) ---
  if (d) {
    const decisions = flatten<Record<string, unknown>>(findAll(d, "DECISION"));
    // Filtrer les vrais objets DECISION avec INTITULE ou TITULAIRE
    const validDecisions = decisions.filter(
      (dec) => dec && typeof dec === "object" && ("INTITULE" in dec || "TITULAIRE" in dec || "NUM_LOT" in dec)
    );

    if (validDecisions.length > 0) {
      const lots: LotAttrib[] = [];
      let montantTotal = 0;

      for (const dec of validDecisions) {
        const intitule = textOf(dec["INTITULE"] ?? "");
        const numLot = textOf(dec["NUM_LOT"] ?? "");

        // Montant + nb offres dans DECISION.RENSEIGNEMENT
        const renseignement = dec["RENSEIGNEMENT"] as Record<string, unknown> | undefined;
        const montantObj =
          (dec["MONTANT"] as Record<string, unknown> | string | undefined) ??
          (renseignement?.["MONTANT"] as Record<string, unknown> | string | undefined);
        const montant = montantObj ? Number(textOf(montantObj)) : null;
        if (montant && montant > 0) montantTotal += montant;

        const nbOffreRaw = renseignement?.["NB_OFFRE_RECU"];
        const nb_offres = nbOffreRaw ? Number(textOf(nbOffreRaw)) : null;

        // Titulaire(s)
        let titulaireDec = dec["TITULAIRE"];
        if (titulaireDec && !Array.isArray(titulaireDec)) titulaireDec = [titulaireDec];
        const titulaireNames = (titulaireDec as Array<Record<string, unknown>> | undefined)
          ?.map((t) => textOf(t["DENOMINATION"] ?? ""))
          .filter(Boolean) ?? [];

        const lotName = intitule || `Lot ${numLot}` || titre;
        const nom = titulaireNames.length > 0
          ? `${lotName} → ${titulaireNames.join(", ")}`
          : lotName;

        lots.push({ num: `LOT-${numLot || String(lots.length + 1)}`, nom, montant, nb_offres });
      }

      if (lots.length > 0) {
        return { lots, montant_total: montantTotal > 0 ? montantTotal : null };
      }
    }
  }

  // --- Stratégie 3 : eForms non structuré — chercher MONTANT/VALEUR ---
  let montantFromDonnees: number | null = null;
  if (d) {
    const valeurs = findAll(d, "VALEUR") as Array<Record<string, string>>;
    const montants = findAll(d, "MONTANT") as Array<Record<string, string>>;
    const payable = findAll(d, "cbc:PayableAmount") as Array<Record<string, string>>;
    const totalAmt = findAll(d, "cbc:TotalAmount") as Array<Record<string, string>>;

    for (const candidates of [payable, totalAmt, valeurs, montants]) {
      if (candidates.length > 0) {
        const val = candidates[0];
        const num = Number(typeof val === "object" ? val["#text"] ?? val : val);
        if (!isNaN(num) && num > 0) {
          montantFromDonnees = num;
          break;
        }
      }
    }
  }

  // --- Stratégie 3 : Fallback sur titulaires top-level ---
  if (titulaires?.length) {
    // Un seul titulaire = lot unique avec le titre de l'AO
    if (titulaires.length === 1) {
      return {
        lots: [{ num: "LOT-1", nom: `${titre} → ${titulaires[0]}`, montant: montantFromDonnees }],
        montant_total: montantFromDonnees,
      };
    }
    // Plusieurs titulaires = soit co-titulaires d'un lot unique, soit multi-lots
    // On ne peut pas distinguer sans info lot → on fait un lot avec tous les titulaires
    return {
      lots: [{
        num: "LOT-1",
        nom: `${titre} → ${titulaires.join(", ")}`,
        montant: montantFromDonnees,
      }],
      montant_total: montantFromDonnees,
    };
  }

  return { lots: [], montant_total: montantFromDonnees };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Variables Supabase manquantes.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fetchAllFlag = process.argv.includes("--all");
  const descFilter = WATCHED_CODES.map((c) => `'${c}' IN descripteur_code`).join(" OR ");
  const allRecords: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 100;
  const maxRecords = fetchAllFlag ? 5000 : 200;

  console.log(`📥 Fetch des attributions BOAMP dept 34...\n`);

  while (offset < maxRecords) {
    const where = `code_departement='34' AND nature='ATTRIBUTION' AND (${descFilter})`;
    const params = new URLSearchParams({
      where,
      limit: String(limit),
      offset: String(offset),
      order_by: "dateparution DESC",
    });

    const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const data = await res.json();
    allRecords.push(...data.results);
    if (data.results.length < limit) break;
    offset += limit;
  }

  console.log(`📦 ${allRecords.length} attributions récupérées.\n`);

  let inserted = 0;

  for (const r of allRecords) {
    const parsed = parseAttribution(
      r.donnees as string | null,
      r.titulaire as string[] | null,
      r.objet as string | null
    );

    const row = {
      boamp_id: (r.idweb || r.id) as string,
      titre: (r.objet as string) || "Sans titre",
      objet: r.objet as string | null,
      date_pub: r.dateparution as string,
      cpv_codes: (r.descripteur_code as string[]) ?? [],
      departement: "34",
      statut: "attribue" as const,
      acheteur: (r.nomacheteur as string) ?? null,
      montant_estime: parsed.montant_total,
      descripteur_libelle: (r.descripteur_libelle as string[]) ?? [],
      lots: parsed.lots,
      raw_json: r,
    };

    const { error } = await supabase
      .from("appels_offres")
      .upsert(row, { onConflict: "boamp_id" });

    if (!error) {
      inserted++;
    } else {
      console.error(`  ❌ ${r.idweb}: ${error.message}`);
    }
  }

  console.log(`✅ ${inserted} attributions importées.`);
  console.log(`\n« Claudy sait qui a gagné, fieu. »`);
}

main();
