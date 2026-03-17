/**
 * Résout les SIRET des titulaires via l'API Recherche Entreprises (gouv.fr).
 * "Claudy connaît tout le monde, fieu."
 *
 * Usage : npx tsx scripts/resolve-siret.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const DELAY_MS = 200;
const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";

interface EntrepriseResult {
  nom_complet?: string;
  siren?: string;
}

interface ApiResponse {
  results?: EntrepriseResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupSiret(siret: string): Promise<string | null> {
  try {
    const url = `${API_BASE}?q=${encodeURIComponent(siret)}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} pour SIRET ${siret}`);
      return null;
    }

    const data: ApiResponse = await res.json();

    if (!data.results || data.results.length === 0) {
      console.warn(`  ⚠️  Aucun résultat pour SIRET ${siret}`);
      return null;
    }

    const nom = data.results[0].nom_complet ?? null;
    return nom;
  } catch (err) {
    console.error(`  ❌ Erreur lookup SIRET ${siret}:`, err);
    return null;
  }
}

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

  console.log("🔍 Claudy connaît tout le monde, fieu.\n");

  // 1. Récupérer tous les SIRET uniques non encore résolus
  const { data: rows, error: fetchErr } = await supabase
    .from("decp_marches")
    .select("titulaire_siret")
    .not("titulaire_siret", "is", null)
    .is("titulaire_nom", null);

  if (fetchErr) {
    console.error("❌ Erreur lecture decp_marches:", fetchErr.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✅ Aucun SIRET à résoudre (tous déjà renseignés ou table vide).");
    return;
  }

  // Dédupliquer les SIRET
  const uniqueSirets = [...new Set(rows.map((r) => r.titulaire_siret as string))];
  console.log(`📋 ${uniqueSirets.length} SIRET uniques à résoudre sur ${rows.length} lignes.\n`);

  // 2. Résoudre chaque SIRET avec délai
  const resolved = new Map<string, string>();
  let ok = 0;
  let ko = 0;

  for (let i = 0; i < uniqueSirets.length; i++) {
    const siret = uniqueSirets[i];
    const nom = await lookupSiret(siret);

    if (nom) {
      resolved.set(siret, nom);
      ok++;
      console.log(`  ✅ [${i + 1}/${uniqueSirets.length}] ${siret} → ${nom}`);
    } else {
      ko++;
      console.log(`  ⚠️  [${i + 1}/${uniqueSirets.length}] ${siret} → non trouvé`);
    }

    // Pause entre les appels pour ne pas spammer
    if (i < uniqueSirets.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n📊 Résolution terminée : ${ok} trouvés, ${ko} introuvables.\n`);

  // 3. Mettre à jour la base
  if (resolved.size === 0) {
    console.log("Rien à mettre à jour.");
    return;
  }

  console.log("💾 Mise à jour de decp_marches...");
  let updated = 0;

  for (const [siret, nom] of resolved) {
    const { error: updateErr, data: updateData } = await supabase
      .from("decp_marches")
      .update({ titulaire_nom: nom })
      .eq("titulaire_siret", siret)
      .is("titulaire_nom", null)
      .select("id");

    if (updateErr) {
      console.error(`  ❌ Erreur update SIRET ${siret}: ${updateErr.message}`);
    } else {
      const n = updateData?.length ?? 0;
      updated += n;
      if (n > 0) console.log(`  💾 ${siret} → ${n} ligne(s) mises à jour`);
    }
  }

  console.log(`\n✅ ${updated} lignes mises à jour. Claudy a tout réglé, fieu.`);
}

main();
