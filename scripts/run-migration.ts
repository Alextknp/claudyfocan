/**
 * Exécute la migration SQL via le client Supabase (service role).
 * Usage : npx tsx scripts/run-migration.ts
 */

import { readFileSync } from "fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sql = readFileSync("supabase/migrations/001_initial_schema.sql", "utf-8");

  console.log("📦 Exécution de la migration...\n");

  const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });

  if (error) {
    // rpc exec_sql n'existe peut-être pas, on essaie via REST SQL directement
    console.log("⚠️  rpc exec_sql non disponible, tentative directe via REST...\n");

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql_query: sql }),
    });

    if (!res.ok) {
      // Dernière tentative : exécuter statement par statement via le SQL Editor endpoint
      console.log("⚠️  REST RPC non disponible. Exécution via pg directement...\n");
      console.log("👉 Copie le SQL ci-dessous dans le SQL Editor de Supabase Dashboard :");
      console.log("   https://supabase.com/dashboard/project/sfguebsvsqgcungnvzhw/sql\n");
      console.log("------- SQL START -------");
      console.log(sql);
      console.log("------- SQL END -------\n");
      console.log("Ou installe supabase CLI et fais : supabase db push");
      process.exit(1);
    }

    const result = await res.json();
    console.log("✅ Migration exécutée !", JSON.stringify(result, null, 2));
    return;
  }

  console.log("✅ Migration exécutée avec succès !");
  if (data) console.log(JSON.stringify(data, null, 2));
}

main();
