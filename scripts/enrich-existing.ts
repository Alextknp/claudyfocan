/**
 * Re-parse raw_json pour enrichir les AO existants.
 * Usage : npx tsx scripts/enrich-existing.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { parseDonnees } from "../lib/boamp";

config();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Variables Supabase manquantes.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Re-parse tous les AO (force refresh pour corriger les montants)
  const force = process.argv.includes("--force");
  let query = supabase.from("appels_offres").select("id, raw_json");
  if (!force) query = query.is("acheteur", null);
  const { data: rows, error } = await query;

  if (error) {
    console.error("❌", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✅ Rien à enrichir, tout est déjà à jour.");
    return;
  }

  console.log(`🔧 Enrichissement de ${rows.length} AO...\n`);
  let updated = 0;
  let withAmount = 0;

  for (const row of rows) {
    const r = row.raw_json as Record<string, unknown> | null;
    if (!r) continue;

    const donnees = parseDonnees(r.donnees as string | null);
    if (donnees.montant_estime) withAmount++;

    const { error: updateError } = await supabase
      .from("appels_offres")
      .update({
        acheteur: (r.nomacheteur as string) ?? null,
        montant_estime: donnees.montant_estime,
        description_detail: donnees.description_detail,
        type_procedure: (r.type_procedure as string) ?? null,
        type_marche: Array.isArray(r.type_marche) ? (r.type_marche as string[]).join(", ") : null,
        descripteur_libelle: (r.descripteur_libelle as string[]) ?? [],
        url_dce_telechargement: donnees.url_dce_telechargement,
        lots: donnees.lots,
      })
      .eq("id", row.id);

    if (!updateError) {
      updated++;
    } else {
      console.error(`  ❌ ${row.id}: ${updateError.message}`);
    }
  }

  console.log(`✅ ${updated}/${rows.length} AO enrichis`);
  console.log(`   💰 ${withAmount} avec montant estimé`);
  console.log(`\n« Claudy a fait le boulot, fieu. »`);
}

main();
