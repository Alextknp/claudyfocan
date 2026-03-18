/**
 * Extrait les SIRET des titulaires depuis les donnees BOAMP
 * et croise avec le DECP pour enrichir les entreprises sans SIRET.
 * Stocke dans une table de mapping entreprise → SIRET.
 * Usage : npx tsx scripts/extract-siret-boamp.ts
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
  if (typeof obj === "object" && "#text" in (obj as Record<string, unknown>)) {
    return String((obj as Record<string, unknown>)["#text"]);
  }
  return String(obj);
}

const PREFIXES = ["SAS ", "SARL ", "SA ", "STE ", "ETS ", "ENTREPRISE ", "SOCIETE ", "ETABLISSEMENT ", "ETABLISSEMENTS ", "EURL ", "SASU "];

function normName(name: string): string {
  let n = name.trim().toUpperCase().replace(/[.\-''`]/g, " ").replace(/\s+/g, " ");
  for (const p of PREFIXES) {
    if (n.startsWith(p)) { n = n.slice(p.length); break; }
  }
  for (const p of PREFIXES) {
    const s = " " + p.trim();
    if (n.endsWith(s)) { n = n.slice(0, -s.length); break; }
  }
  if (n.endsWith("S") && n.length > 3) n = n.slice(0, -1);
  return n.trim();
}

interface SiretMapping {
  nom: string;
  nom_normalise: string;
  siret: string;
  source: string;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceRoleKey) { console.error("❌ Missing env"); process.exit(1); }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const mappings = new Map<string, SiretMapping>(); // normName → mapping

  // 1. Extraire du DECP (100% SIRET)
  console.log("📥 Extraction SIRET depuis DECP...");
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("decp_marches")
      .select("titulaire_siret, titulaire_nom")
      .not("titulaire_siret", "is", null)
      .not("titulaire_nom", "is", null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const key = normName(r.titulaire_nom);
      if (key && r.titulaire_siret && !mappings.has(key)) {
        mappings.set(key, {
          nom: r.titulaire_nom,
          nom_normalise: key,
          siret: r.titulaire_siret,
          source: "decp",
        });
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  ${mappings.size} entreprises depuis DECP`);

  // 2. Extraire du BOAMP (CODE_IDENT_NATIONAL + CompanyID)
  console.log("📥 Extraction SIRET depuis BOAMP...");
  offset = 0;
  let boampFound = 0;
  while (true) {
    const { data } = await supabase
      .from("appels_offres")
      .select("raw_json")
      .eq("statut", "attribue")
      .eq("departement", "34")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;

    for (const ao of data) {
      const rj = ao.raw_json as Record<string, unknown>;
      const donnees = rj?.donnees as string | null;
      if (!donnees) continue;

      try {
        const d = JSON.parse(donnees);

        // Ancien format : TITULAIRE avec CODE_IDENT_NATIONAL
        const decisions = findAll(d, "DECISION");
        for (const dec of decisions) {
          if (!dec || typeof dec !== "object") continue;
          const items = Array.isArray(dec) ? dec : [dec];
          for (const item of items) {
            if (!item || typeof item !== "object") continue;
            const rec = item as Record<string, unknown>;
            let tits = rec["TITULAIRE"];
            if (tits && !Array.isArray(tits)) tits = [tits];
            if (!Array.isArray(tits)) continue;
            for (const t of tits) {
              if (!t || typeof t !== "object") continue;
              const tr = t as Record<string, unknown>;
              const nom = textOf(tr["DENOMINATION"]);
              const siret = textOf(tr["CODE_IDENT_NATIONAL"]);
              if (nom && siret && siret.length >= 9) {
                const key = normName(nom);
                if (!mappings.has(key)) {
                  mappings.set(key, { nom, nom_normalise: key, siret, source: "boamp" });
                  boampFound++;
                }
              }
            }
          }
        }

        // eForms : Organization avec CompanyID (SIRET = 14 digits)
        const orgs = findAll(d, "efac:Organization");
        for (const orgRaw of orgs) {
          const orgList = Array.isArray(orgRaw) ? orgRaw : [orgRaw];
          for (const org of orgList) {
            if (!org || typeof org !== "object") continue;
            const company = (org as Record<string, unknown>)["efac:Company"] as Record<string, unknown> | undefined;
            if (!company) continue;
            const nameObj = findAll(company, "cbc:Name")[0];
            const idObj = findAll(company, "cbc:CompanyID")[0];
            const nom = textOf(nameObj);
            const siret = textOf(idObj);
            if (nom && siret && /^\d{14}$/.test(siret)) {
              const key = normName(nom);
              if (!mappings.has(key)) {
                mappings.set(key, { nom, nom_normalise: key, siret, source: "boamp_eforms" });
                boampFound++;
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  +${boampFound} entreprises depuis BOAMP`);
  console.log(`  Total: ${mappings.size} entreprises avec SIRET\n`);

  // 3. Sauvegarder dans une table entreprises_siret
  let upserted = 0;
  for (const m of mappings.values()) {
    const { error } = await supabase
      .from("entreprises_siret")
      .upsert({
        nom_normalise: m.nom_normalise,
        nom: m.nom,
        siret: m.siret,
        source: m.source,
      }, { onConflict: "nom_normalise" });
    if (!error) upserted++;
  }

  console.log(`✅ ${upserted} entreprises sauvegardées dans entreprises_siret`);
  console.log(`\n« Claudy connaît tout le monde par leur SIRET, fieu. »`);
}

main();
