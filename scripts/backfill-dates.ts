/**
 * Backfill sync pour des dates manquées.
 * Usage : npx tsx scripts/backfill-dates.ts 2026-03-19 2026-03-20
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fetchBoampByDate, parseDonnees } from "../lib/boamp";
import type { BoampRecord } from "../lib/boamp";

config();

const DEPT = "34";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function boampToRow(r: BoampRecord) {
  const donnees = parseDonnees(r.donnees);
  return {
    boamp_id: r.idweb || r.id,
    titre: r.objet || "Sans titre",
    objet: r.objet,
    date_pub: r.dateparution,
    deadline: r.datelimitereponse,
    cpv_codes: r.descripteur_code ?? [],
    departement: r.code_departement_prestation ?? r.code_departement?.[0] ?? null,
    url_dce: r.url_avis,
    statut: "ouvert",
    acheteur: r.nomacheteur ?? null,
    montant_estime: donnees.montant_estime,
    description_detail: donnees.description_detail,
    type_procedure: r.type_procedure ?? null,
    type_marche: r.type_marche?.join(", ") ?? null,
    descripteur_libelle: r.descripteur_libelle ?? [],
    url_dce_telechargement: donnees.url_dce_telechargement,
    lots: donnees.lots,
    raw_json: r,
  };
}

async function main() {
  const dates = process.argv.slice(2);
  if (dates.length === 0) {
    console.error("Usage: npx tsx scripts/backfill-dates.ts YYYY-MM-DD [YYYY-MM-DD ...]");
    process.exit(1);
  }

  for (const date of dates) {
    console.log(`\n=== Backfill ${date} ===`);
    const records = await fetchBoampByDate(date);
    const deptRecords = records.filter(
      (r) => r.code_departement_prestation === DEPT || r.code_departement?.includes(DEPT)
    );
    console.log(`  ${records.length} AO totaux, ${deptRecords.length} pour dept ${DEPT}`);

    let inserted = 0;
    for (const r of deptRecords) {
      const row = boampToRow(r);
      const { error } = await supabase.from("appels_offres").upsert(row, { onConflict: "boamp_id" });
      if (!error) inserted++;
      else console.log(`  Erreur upsert ${r.idweb}: ${error.message}`);
    }
    console.log(`  ${inserted}/${deptRecords.length} AO insérés/mis à jour`);
  }

  console.log("\nBackfill terminé.");
}

main();
