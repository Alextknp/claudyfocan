/**
 * Corrige les statuts des AO :
 * - deadline passée → clos
 * - pas de deadline + publié > 6 mois → clos
 * - croise avec les attributions BOAMP (annonce_lie) pour marquer "attribue"
 * Usage : npx tsx scripts/fix-statuts.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

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

  const now = new Date().toISOString();
  const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000).toISOString().split("T")[0];

  // 1. Deadline passée → clos
  const { data: expired } = await supabase
    .from("appels_offres")
    .update({ statut: "clos" })
    .eq("statut", "ouvert")
    .lt("deadline", now)
    .select("id");

  console.log(`📅 ${expired?.length ?? 0} AO passés en "clos" (deadline passée)`);

  // 2. Pas de deadline + publié > 6 mois → clos
  const { data: old } = await supabase
    .from("appels_offres")
    .update({ statut: "clos" })
    .eq("statut", "ouvert")
    .is("deadline", null)
    .lt("date_pub", sixMonthsAgo)
    .select("id");

  console.log(`📦 ${old?.length ?? 0} AO passés en "clos" (anciens sans deadline)`);

  // 3. Croiser avec attributions — si un boamp_id d'AO ouvert/clos a une annonce_lie qui pointe vers une attribution
  // Les attributions BOAMP ont un champ annonce_lie dans raw_json qui référence l'AO initial
  const { data: attribues } = await supabase
    .from("appels_offres")
    .select("raw_json")
    .eq("statut", "attribue")
    .eq("departement", "34");

  if (attribues) {
    const linkedIds = new Set<string>();
    for (const ao of attribues) {
      const rj = ao.raw_json as Record<string, unknown>;
      const lies = rj?.annonce_lie as string[] | undefined;
      if (lies) {
        for (const id of lies) linkedIds.add(id);
      }
    }

    console.log(`\n🔗 ${linkedIds.size} AO référencés par des attributions`);

    // Marquer ces AO comme attribués s'ils ne le sont pas déjà
    let marked = 0;
    for (const boampId of linkedIds) {
      const { data: updated } = await supabase
        .from("appels_offres")
        .update({ statut: "attribue" })
        .eq("boamp_id", boampId)
        .neq("statut", "attribue")
        .select("id");
      if (updated?.length) marked += updated.length;
    }
    console.log(`✅ ${marked} AO marqués "attribue" (croisement avec attributions)`);
  }

  // Recount
  for (const statut of ["ouvert", "clos", "attribue"]) {
    const { data } = await supabase
      .from("appels_offres")
      .select("id")
      .eq("departement", "34")
      .eq("statut", statut);
    console.log(`  ${statut}: ${data?.length ?? "?"}`);
  }

  console.log(`\n« Claudy a fait le ménage, fieu. »`);
}

main();
