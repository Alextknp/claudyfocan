/**
 * Import complet de tous les AO du département 34 pour nos métiers.
 * Usage : npx tsx scripts/fetch-all-ao.ts
 *
 * « Claudy ratisse large, fieu. »
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { WATCHED_CODES, parseDonnees, type BoampRecord } from "../lib/boamp";

config();

const BOAMP_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1";
const DATASET = "boamp";

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

  const descFilter = WATCHED_CODES.map((c) => `'${c}' IN descripteur_code`).join(" OR ");

  // Fetch AO (appels d'offres) du 34
  const allRecords: BoampRecord[] = [];
  let offset = 0;
  const limit = 100;

  console.log("📥 Fetch de TOUS les AO BOAMP dept 34 pour nos métiers...\n");

  while (true) {
    const where = `code_departement='34' AND nature='APPEL_OFFRE' AND (${descFilter})`;
    const params = new URLSearchParams({
      where,
      limit: String(limit),
      offset: String(offset),
      order_by: "dateparution DESC",
    });

    const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ BOAMP API error ${res.status}`);
      break;
    }

    const data = await res.json();
    allRecords.push(...data.results);

    if (offset % 500 === 0 && offset > 0) {
      console.log(`  ... ${allRecords.length} récupérés`);
    }

    if (data.results.length < limit) break;
    offset += limit;

    // Safety: max 5000
    if (offset >= 5000) break;
  }

  console.log(`📦 ${allRecords.length} AO récupérés.\n`);

  let inserted = 0;
  let skipped = 0;

  for (const r of allRecords) {
    const donnees = parseDonnees(r.donnees);

    const row = {
      boamp_id: r.idweb || r.id,
      titre: r.objet || "Sans titre",
      objet: r.objet,
      date_pub: r.dateparution,
      deadline: r.datelimitereponse,
      cpv_codes: r.descripteur_code ?? [],
      departement: r.code_departement_prestation ?? r.code_departement?.[0] ?? "34",
      url_dce: r.url_avis,
      statut: "ouvert" as const,
      acheteur: r.nomacheteur ?? null,
      montant_estime: donnees.montant_estime,
      description_detail: donnees.description_detail,
      type_procedure: r.type_procedure ?? null,
      type_marche: r.type_marche?.join(", ") ?? null,
      descripteur_libelle: r.descripteur_libelle ?? [],
      url_dce_telechargement: donnees.url_dce_telechargement,
      lots: donnees.lots,
      raw_json: r as unknown as Record<string, unknown>,
    };

    // Upsert — ne pas écraser un AO déjà marqué "attribue"
    const { error } = await supabase
      .from("appels_offres")
      .upsert(row, {
        onConflict: "boamp_id",
        ignoreDuplicates: false,
      });

    if (!error) {
      inserted++;
    } else if (error.message.includes("duplicate")) {
      skipped++;
    } else {
      console.error(`  ❌ ${r.idweb}: ${error.message}`);
    }
  }

  console.log(`✅ ${inserted} AO importés (${skipped} skippés).`);

  // Corriger les statuts : si deadline passée → clos
  const { data: closedData } = await supabase
    .from("appels_offres")
    .update({ statut: "clos" })
    .eq("statut", "ouvert")
    .lt("deadline", new Date().toISOString())
    .select("id");

  const count = closedData?.length ?? 0;

  console.log(`📅 ${count ?? 0} AO passés en "clos" (deadline dépassée).`);
  console.log(`\n« Claudy a ratissé large, fieu. »`);
}

main();
