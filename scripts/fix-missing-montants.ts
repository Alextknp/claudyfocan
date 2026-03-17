/**
 * Rattrapage : récupérer les montants manquants dans les attributions.
 * Cherche MONTANT, VALEUR, TotalAmount, PayableAmount dans le raw_json.
 * Usage : npx tsx scripts/fix-missing-montants.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

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

function textOf(obj: unknown): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object" && obj !== null && "#text" in (obj as Record<string, unknown>)) {
    return String((obj as Record<string, unknown>)["#text"]);
  }
  return String(obj);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceRoleKey) { console.error("❌ Missing env"); process.exit(1); }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch all attributions
  const { data: rows, error } = await supabase
    .from("appels_offres")
    .select("id, lots, raw_json")
    .eq("statut", "attribue")
    .eq("departement", "34");

  if (error || !rows) { console.error("❌", error?.message); process.exit(1); }

  let fixed = 0;
  let fixedTit = 0;

  for (const row of rows) {
    const lots = (row.lots ?? []) as Array<{ num: string; nom: string; montant: number | null }>;
    const rj = row.raw_json as Record<string, unknown>;
    if (!lots.length) continue;

    let changed = false;
    const donnees = rj.donnees as string | null;

    // 1. Fix montants manquants
    const lotsWithoutMontant = lots.filter((l) => l.montant === null || l.montant === 0);
    if (lotsWithoutMontant.length > 0 && donnees) {
      try {
        const d = JSON.parse(donnees);
        // Chercher tous les montants disponibles
        for (const key of ["cbc:PayableAmount", "cbc:TotalAmount", "MONTANT", "VALEUR"]) {
          const found = findAll(d, key);
          if (found.length > 0) {
            // Si un seul lot sans montant et un seul montant trouvé → match direct
            if (lotsWithoutMontant.length === 1 && found.length >= 1) {
              const val = Number(textOf(found[0]));
              if (val > 0) {
                lotsWithoutMontant[0].montant = val;
                changed = true;
                break;
              }
            }
            // Si même nombre de lots sans montant que de montants trouvés
            if (lotsWithoutMontant.length === found.length) {
              for (let i = 0; i < lotsWithoutMontant.length; i++) {
                const val = Number(textOf(found[i]));
                if (val > 0) {
                  lotsWithoutMontant[i].montant = val;
                  changed = true;
                }
              }
              break;
            }
            // Sinon, prendre le premier montant pour le lot unique
            if (lots.length === 1) {
              const val = Number(textOf(found[0]));
              if (val > 0) {
                lots[0].montant = val;
                changed = true;
                break;
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 2. Fix titulaires manquants — si on a des titulaires top-level non encore mappés
    const lotsWithoutTit = lots.filter((l) => !l.nom.includes("→"));
    const topTitulaires = rj.titulaire as string[] | null;
    if (lotsWithoutTit.length > 0 && topTitulaires?.length) {
      // Lot unique sans titulaire + titulaires top-level
      if (lots.length === 1 && lotsWithoutTit.length === 1) {
        lots[0].nom = `${lots[0].nom} → ${topTitulaires.join(", ")}`;
        changed = true;
        fixedTit++;
      }
      // Multi-lots : mapper par position les lots sans titulaire
      else if (lotsWithoutTit.length <= topTitulaires.length) {
        // Trouver les titulaires pas déjà utilisés
        const usedTits = new Set<string>();
        for (const l of lots) {
          if (l.nom.includes("→")) {
            const after = l.nom.split("→")[1].trim();
            for (const t of after.split(",").map((s) => s.trim())) {
              usedTits.add(t.toLowerCase());
            }
          }
        }
        const unusedTits = topTitulaires.filter((t) => !usedTits.has(t.toLowerCase()));
        for (let i = 0; i < Math.min(lotsWithoutTit.length, unusedTits.length); i++) {
          lotsWithoutTit[i].nom = `${lotsWithoutTit[i].nom} → ${unusedTits[i]}`;
          changed = true;
          fixedTit++;
        }
      }
    }

    if (changed) {
      const { error: updateErr } = await supabase
        .from("appels_offres")
        .update({ lots })
        .eq("id", row.id);
      if (!updateErr) fixed++;
    }
  }

  console.log(`✅ ${fixed} AO corrigés (${fixedTit} titulaires ajoutés).`);

  // Recount
  let totalLots = 0, withTit = 0, withMontant = 0;
  for (const row of rows) {
    for (const lot of (row.lots ?? []) as Array<{ nom: string; montant: number | null }>) {
      totalLots++;
      if (lot.nom.includes("→")) withTit++;
      if (lot.montant) withMontant++;
    }
  }
  console.log(`\nBilan final: ${totalLots} lots`);
  console.log(`  Avec titulaire: ${withTit} (${Math.round(withTit * 100 / totalLots)}%)`);
  console.log(`  Avec montant: ${withMontant} (${Math.round(withMontant * 100 / totalLots)}%)`);
}

main();
