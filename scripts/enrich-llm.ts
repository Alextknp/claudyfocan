/**
 * Enrichissement LLM — résumé + scoring par métier via Claude Haiku.
 * Usage : npx tsx scripts/enrich-llm.ts
 *
 * « Claudy fait son analyse, fieu. »
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const METIERS = [
  "Menuiserie bois",
  "Cloisons / Plâtrerie",
  "Faux plafonds",
  "Géomètre expert",
  "AMO",
];

const SYSTEM_PROMPT = `Tu es Claudy, un assistant spécialisé dans l'analyse d'appels d'offres publics bâtiment en France.
Tu analyses des AO pour 5 artisans : ${METIERS.join(", ")}.

Pour chaque AO, tu dois produire un JSON (et RIEN d'autre) avec cette structure :
{
  "resume": "Résumé en 2-3 phrases : nature des travaux, lieu, acheteur, lots principaux.",
  "scores": {
    "Menuiserie bois": 0-10,
    "Cloisons / Plâtrerie": 0-10,
    "Faux plafonds": 0-10,
    "Géomètre expert": 0-10,
    "AMO": 0-10
  }
}

Règles de scoring :
- 0 = aucun rapport avec le métier
- 1-3 = vaguement lié, peu probable qu'il y ait un lot pour ce métier
- 4-6 = possiblement un lot, à vérifier dans le DCE
- 7-9 = très probablement un lot pour ce métier
- 10 = explicitement mentionné

Réponds UNIQUEMENT avec le JSON, sans markdown, sans explication.`;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Variables Supabase manquantes.");
    process.exit(1);
  }
  if (!anthropicKey) {
    console.error("❌ ANTHROPIC_API_KEY manquante dans .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Fetch les AO du 34 pas encore analysés
  const { data: rows, error } = await supabase
    .from("appels_offres")
    .select("id, titre, objet, acheteur, montant_estime, type_marche, description_detail, descripteur_libelle")
    .eq("departement", "34")
    .is("resume_llm", null)
    .order("date_pub", { ascending: false });

  if (error) {
    console.error("❌", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✅ Tous les AO du 34 sont déjà analysés.");
    return;
  }

  console.log(`🤖 Analyse de ${rows.length} AO avec Claude Haiku...\n`);

  let done = 0;
  let errors = 0;

  for (const ao of rows) {
    const prompt = [
      `Titre : ${ao.titre}`,
      ao.objet ? `Objet : ${ao.objet}` : null,
      ao.acheteur ? `Acheteur : ${ao.acheteur}` : null,
      ao.montant_estime ? `Montant estimé : ${Number(ao.montant_estime).toLocaleString("fr-FR")} €` : null,
      ao.type_marche ? `Type : ${ao.type_marche}` : null,
      ao.descripteur_libelle?.length ? `Descripteurs : ${ao.descripteur_libelle.join(", ")}` : null,
      ao.description_detail ? `Description : ${ao.description_detail.slice(0, 1500)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      const { error: updateError } = await supabase
        .from("appels_offres")
        .update({
          resume_llm: `${parsed.resume}\n\n---scores:${JSON.stringify(parsed.scores)}`,
        })
        .eq("id", ao.id);

      if (!updateError) {
        done++;
        const topMetier = Object.entries(parsed.scores as Record<string, number>)
          .sort(([, a], [, b]) => b - a)[0];
        console.log(`  ✅ ${ao.titre.slice(0, 60)}...`);
        console.log(`     → ${parsed.resume.slice(0, 100)}...`);
        console.log(`     🎯 Top: ${topMetier[0]} (${topMetier[1]}/10)\n`);
      } else {
        errors++;
        console.error(`  ❌ Update failed: ${updateError.message}`);
      }
    } catch (err) {
      errors++;
      console.error(`  ❌ ${ao.titre.slice(0, 50)}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n🏁 Terminé : ${done} analysés, ${errors} erreurs.`);
  console.log(`« Claudy a tout lu, c'est du béton. »`);
}

main();
