/**
 * Test du fetch BOAMP API — sans base de données.
 * Usage : npx tsx scripts/test-boamp.ts [date]
 * Exemple : npx tsx scripts/test-boamp.ts 2026-03-17
 */

import { fetchBoampByDate, DESCRIPTEURS } from "../lib/boamp";

const CODE_TO_METIER: Record<string, string> = {};
for (const [, d] of Object.entries(DESCRIPTEURS)) {
  CODE_TO_METIER[d.code] = d.label;
}

async function main() {
  const date = process.argv[2];
  const label = date ?? "aujourd'hui";

  console.log(`🔍 Claudy cherche les AO pour ${label}...\n`);

  try {
    const records = await fetchBoampByDate(date);

    if (records.length === 0) {
      console.log("😴 Rien de neuf. Claudy retourne dormir.");
      return;
    }

    console.log(`📋 ${records.length} AO trouvés :\n`);

    for (const r of records) {
      const metiers = (r.descripteur_code ?? [])
        .map((c) => CODE_TO_METIER[c])
        .filter(Boolean)
        .join(", ");

      console.log(`  ${r.objet || "Sans titre"}`);
      console.log(`    📍 Dept ${r.code_departement_prestation ?? "?"} | ${metiers || (r.descripteur_libelle?.join(", ") ?? "?")}`);
      console.log(`    📅 Publié: ${r.dateparution} | Limite: ${r.datelimitereponse ?? "?"}`);
      console.log(`    🏢 ${r.nomacheteur ?? "?"}`);
      console.log(`    🔗 ${r.url_avis ?? "pas de lien"}`);
      console.log();
    }

    console.log(`« Pas de bras, pas de chocolat. »`);
  } catch (err) {
    console.error("❌ Erreur BOAMP:", err);
  }
}

main();
