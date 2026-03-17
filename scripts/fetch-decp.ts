/**
 * Import des données DECP (Données Essentielles de la Commande Publique).
 * Source : data.economie.gouv.fr — montants réels + SIRET titulaires.
 * Usage : npx tsx scripts/fetch-decp.ts
 *
 * « Claudy a les vrais chiffres, fieu. »
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const DECP_BASE = "https://data.economie.gouv.fr/api/explore/v2.1";
const DATASET = "decp-v3-marches-valides";

// Mots-clés par métier pour chercher dans l'objet du marché
const SEARCH_TERMS = [
  "menuiserie",
  "menuiseries",
  "cloison",
  "cloisons",
  "faux plafond",
  "faux-plafond",
  "plâtrerie",
  "topographie",
  "topographique",
  "géomètre",
  "bornage",
];

interface DecpRecord {
  id: string;
  objet: string | null;
  montant: number | null;
  codecpv: string | null;
  acheteur_id: string | null;
  acheteur_nom: string | null;
  titulaire_id_1: string | null;
  titulaire_typeidentifiant_1: string | null;
  lieuexecution_code: string | null;
  lieuexecution_nom: string | null;
  datenotification: string | null;
  datepublicationdonnees: string | null;
  nature: string | null;
  procedure: string | null;
  dureemois: number | null;
  offresrecues: number | null;
  formeprix: string | null;
}

async function fetchDecp(searchTerm: string): Promise<DecpRecord[]> {
  const all: DecpRecord[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const where = `lieuexecution_code LIKE '34%' AND search(objet, '${searchTerm}')`;
    const params = new URLSearchParams({
      where,
      limit: String(limit),
      offset: String(offset),
      order_by: "datenotification DESC",
    });

    const url = `${DECP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const data = await res.json();
    all.push(...data.results);
    if (data.results.length < limit) break;
    offset += limit;
    if (offset >= 2000) break; // safety
  }

  return all;
}

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

  console.log("📥 Fetch DECP (données essentielles) pour le 34...\n");

  // Fetch par mot-clé (dédupliqué par ID)
  const allRecords = new Map<string, DecpRecord>();
  for (const term of SEARCH_TERMS) {
    const records = await fetchDecp(term);
    for (const r of records) {
      if (!allRecords.has(r.id)) allRecords.set(r.id, r);
    }
    if (records.length > 0) {
      console.log(`  "${term}": ${records.length} marchés`);
    }
  }

  console.log(`\n📦 ${allRecords.size} marchés uniques DECP.\n`);

  // Upsert dans une table dédiée ou enrichir appels_offres existants
  // On crée une table decp_marches pour stocker ces données séparément
  let inserted = 0;
  let withSiret = 0;
  let withMontant = 0;

  for (const r of allRecords.values()) {
    if (r.titulaire_id_1) withSiret++;
    if (r.montant) withMontant++;

    const row = {
      decp_id: r.id,
      objet: r.objet,
      montant: r.montant,
      cpv_code: r.codecpv,
      acheteur_siret: r.acheteur_id,
      acheteur_nom: r.acheteur_nom,
      titulaire_siret: r.titulaire_id_1,
      lieu_code: r.lieuexecution_code,
      lieu_nom: r.lieuexecution_nom,
      date_notification: r.datenotification,
      date_publication: r.datepublicationdonnees,
      nature: r.nature,
      procedure_type: r.procedure,
      duree_mois: r.dureemois,
      nb_offres: r.offresrecues ? Number(r.offresrecues) : null,
      forme_prix: r.formeprix,
    };

    const { error } = await supabase
      .from("decp_marches")
      .upsert(row, { onConflict: "decp_id" });

    if (!error) {
      inserted++;
    } else if (error.message.includes("decp_marches")) {
      // Table doesn't exist yet — create it
      console.log("⚠️  Table decp_marches n'existe pas. Création...\n");
      console.log("👉 Lance la migration 004 d'abord :");
      console.log("   supabase db push --linked\n");
      process.exit(1);
    } else {
      console.error(`  ❌ ${r.id}: ${error.message}`);
    }
  }

  console.log(`✅ ${inserted} marchés DECP importés`);
  console.log(`   SIRET titulaire: ${withSiret} (${Math.round(withSiret * 100 / allRecords.size)}%)`);
  console.log(`   Avec montant: ${withMontant} (${Math.round(withMontant * 100 / allRecords.size)}%)`);
  console.log(`\n« Claudy a les vrais chiffres, fieu. »`);
}

main();
