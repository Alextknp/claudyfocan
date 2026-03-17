/**
 * Seed les 5 utilisateurs artisans.
 * Usage : npx tsx scripts/seed-users.ts
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config(); // charge .env

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Variables Supabase manquantes. Vérifie ton .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    nom: "Menuisier 1",
    metier: "Menuiserie bois",
    cpv_codes: ["45421000", "45421100"],
    departements: ["75", "92", "93", "94"],
    whatsapp: "+33600000001",
  },
  {
    nom: "Cloisonneur 1",
    metier: "Cloisons / Plâtrerie",
    cpv_codes: ["45410000"],
    departements: ["75", "92", "93", "94"],
    whatsapp: "+33600000002",
  },
  {
    nom: "Plafondier 1",
    metier: "Faux plafonds",
    cpv_codes: ["45451000"],
    departements: ["75", "92", "93", "94"],
    whatsapp: "+33600000003",
  },
  {
    nom: "Géomètre 1",
    metier: "Géomètre expert",
    cpv_codes: ["71250000"],
    departements: ["75", "92", "93", "94", "78", "91", "95", "77"],
    whatsapp: "+33600000004",
  },
  {
    nom: "AMO 1",
    metier: "AMO",
    cpv_codes: ["71520000"],
    departements: ["75", "92", "93", "94", "78", "91", "95", "77"],
    whatsapp: "+33600000005",
  },
];

async function main() {
  console.log("🚀 Seed des 5 utilisateurs Claudy Focan...\n");

  for (const user of USERS) {
    const { data, error } = await supabase
      .from("users")
      .upsert(user, { onConflict: "whatsapp" })
      .select()
      .single();

    if (error) {
      console.error(`❌ ${user.nom}: ${error.message}`);
    } else {
      console.log(`✅ ${data.nom} (${data.metier}) — ${data.departements.length} départements`);
    }
  }

  console.log("\n« Moi c'est Claudy, je fais la veille. »");
}

main();
