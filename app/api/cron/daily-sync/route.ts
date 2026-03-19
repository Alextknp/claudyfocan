import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchBoampByDate, parseDonnees, WATCHED_CODES, type BoampRecord } from "@/lib/boamp";

const BOAMP_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1";
const DATASET = "boamp";
const DEPT = "34";

/**
 * GET /api/cron/daily-sync
 * Cron Vercel — tourne tous les jours à 6h30.
 * Fait la même chose que scripts/daily-sync.ts : fetch AO, upsert, enrichissement, clôture, attributions.
 * Logge le résultat dans agent_tasks.
 *
 * « Claudy a fait sa ronde, fieu. »
 */
export async function GET(req: Request) {
  // Auth : Vercel cron envoie un header Authorization avec CRON_SECRET
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const startedAt = new Date().toISOString();
  const today = new Date().toISOString().split("T")[0];
  const logs: string[] = [];
  const log = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);

  // Créer la tâche agent en statut "running"
  const { data: task } = await supabase
    .from("agent_tasks")
    .insert({ type: "daily-sync", status: "running", started_at: startedAt, logs: [] })
    .select("id")
    .single();
  const taskId = task?.id;

  try {
    // ------------------------------------------------------------------
    // 1. Fetch AO du jour pour dept 34
    // ------------------------------------------------------------------
    log(`Fetch AO du ${today} (dept ${DEPT})`);
    const records = await fetchBoampByDate(today);
    const deptRecords = records.filter(
      (r) => r.code_departement_prestation === DEPT || r.code_departement?.includes(DEPT)
    );
    log(`${records.length} AO totaux, ${deptRecords.length} pour dept ${DEPT}`);

    // ------------------------------------------------------------------
    // 2. Upsert en base
    // ------------------------------------------------------------------
    let inserted = 0;
    for (const r of deptRecords) {
      const row = boampToRow(r);
      const { error } = await supabase.from("appels_offres").upsert(row, { onConflict: "boamp_id" });
      if (!error) inserted++;
      else log(`Erreur upsert ${r.idweb}: ${error.message}`);
    }
    log(`${inserted}/${deptRecords.length} AO insérés/mis à jour`);

    // ------------------------------------------------------------------
    // 3. Enrichissement AO sans acheteur
    // ------------------------------------------------------------------
    const { data: toEnrich } = await supabase
      .from("appels_offres")
      .select("id, raw_json")
      .is("acheteur", null);

    let enriched = 0;
    if (toEnrich && toEnrich.length > 0) {
      for (const row of toEnrich) {
        const r = row.raw_json as Record<string, unknown> | null;
        if (!r) continue;
        const donnees = parseDonnees(r.donnees as string | null);
        const { error } = await supabase
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
        if (!error) enriched++;
      }
      log(`${enriched}/${toEnrich.length} AO enrichis`);
    }

    // ------------------------------------------------------------------
    // 4a. Clôture AO deadline dépassée
    // ------------------------------------------------------------------
    const { data: expiredAo } = await supabase
      .from("appels_offres")
      .select("id")
      .eq("statut", "ouvert")
      .lt("deadline", today);

    let closed = 0;
    if (expiredAo && expiredAo.length > 0) {
      const ids = expiredAo.map((r) => r.id);
      const { count } = await supabase
        .from("appels_offres")
        .update({ statut: "clos" })
        .in("id", ids);
      closed = count ?? ids.length;
      log(`${closed} AO clôturés (deadline dépassée)`);
    }

    // ------------------------------------------------------------------
    // 4b. Attributions récentes (30 jours)
    // ------------------------------------------------------------------
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const descFilter = WATCHED_CODES.map((c) => `'${c}' IN descripteur_code`).join(" OR ");
    const attribRecords: Record<string, unknown>[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const where = `code_departement='${DEPT}' AND nature='ATTRIBUTION' AND dateparution>=date'${thirtyDaysAgo}' AND (${descFilter})`;
      const params = new URLSearchParams({ where, limit: String(limit), offset: String(offset), order_by: "dateparution DESC" });
      const url = `${BOAMP_BASE}/catalog/datasets/${DATASET}/records?${params}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      attribRecords.push(...(data.results as Record<string, unknown>[]));
      if ((data.results as unknown[]).length < limit) break;
      offset += limit;
    }

    let attribInserted = 0;
    for (const r of attribRecords) {
      const parsed = parseAttribution(r.donnees as string | null, r.titulaire as string[] | null, r.objet as string | null);
      const row = {
        boamp_id: (r.idweb || r.id) as string,
        titre: (r.objet as string) || "Sans titre",
        objet: r.objet as string | null,
        date_pub: r.dateparution as string,
        cpv_codes: (r.descripteur_code as string[]) ?? [],
        departement: DEPT,
        statut: "attribue" as const,
        acheteur: (r.nomacheteur as string) ?? null,
        montant_estime: parsed.montant_total,
        descripteur_libelle: (r.descripteur_libelle as string[]) ?? [],
        lots: parsed.lots,
        raw_json: r,
      };
      const { error } = await supabase.from("appels_offres").upsert(row, { onConflict: "boamp_id" });
      if (!error) attribInserted++;
    }
    log(`${attribInserted}/${attribRecords.length} attributions importées`);

    // ------------------------------------------------------------------
    // Résultat + log dans agent_tasks
    // ------------------------------------------------------------------
    const result = { ao_fetched: deptRecords.length, ao_inserted: inserted, ao_enriched: enriched, ao_closed: closed, attributions: attribInserted };
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    if (taskId) {
      await supabase.from("agent_tasks").update({
        status: "completed",
        completed_at: completedAt,
        duration_ms: durationMs,
        logs,
        result,
      }).eq("id", taskId);
    }

    log(`Claudy a fait sa ronde, fieu.`);
    return NextResponse.json({ ok: true, ...result, logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log(`ERREUR: ${message}`);

    if (taskId) {
      await supabase.from("agent_tasks").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message,
        logs,
      }).eq("id", taskId);
    }

    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}

// --- Helpers (repris de daily-sync.ts) ---

function boampToRow(r: BoampRecord) {
  const donnees = parseDonnees(r.donnees);
  return {
    boamp_id: r.idweb || r.id,
    titre: r.objet || "Sans titre",
    objet: r.objet,
    date_pub: r.dateparution,
    deadline: r.datelimitereponse,
    cpv_codes: r.descripteur_code ?? [],
    departement: r.code_departement_prestation ?? r.code_departement?.[0] ?? null,
    url_dce: r.url_avis,
    statut: "ouvert",
    acheteur: r.nomacheteur ?? null,
    montant_estime: donnees.montant_estime,
    description_detail: donnees.description_detail,
    type_procedure: r.type_procedure ?? null,
    type_marche: r.type_marche?.join(", ") ?? null,
    descripteur_libelle: r.descripteur_libelle ?? [],
    url_dce_telechargement: donnees.url_dce_telechargement,
    lots: donnees.lots,
    raw_json: r,
  };
}

// --- Attribution parsing ---

interface LotAttrib { num: string; nb_offres?: number | null; nom: string; montant: number | null; }

function findAll(obj: unknown, key: string, results: unknown[] = [], depth = 0): unknown[] {
  if (depth > 20 || !obj) return results;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if (key in rec) results.push(rec[key]);
    for (const v of Object.values(rec)) findAll(v, key, results, depth + 1);
  }
  if (Array.isArray(obj)) for (const v of obj) findAll(v, key, results, depth + 1);
  return results;
}

function findKey(obj: unknown, key: string, depth = 0): unknown {
  if (depth > 15 || !obj) return null;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if (key in rec) return rec[key];
    for (const v of Object.values(rec)) { const r = findKey(v, key, depth + 1); if (r) return r; }
  }
  return null;
}

function textOf(obj: unknown): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object" && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if ("#text" in rec) return String(rec["#text"]);
  }
  return String(obj);
}

function flatten<T>(arr: unknown[]): T[] {
  const result: T[] = [];
  for (const item of arr) { if (Array.isArray(item)) result.push(...(item as T[])); else result.push(item as T); }
  return result;
}

function parseAttribution(donnees: string | null, titulaires: string[] | null, objet: string | null): { lots: LotAttrib[]; montant_total: number | null } {
  const titre = objet ?? "Lot unique";
  let d: Record<string, unknown> | null = null;
  if (donnees) { try { d = JSON.parse(donnees); } catch { /* ignore */ } }

  if (d) {
    const lotsRaw = flatten<Record<string, unknown>>(findAll(d, "cac:ProcurementProjectLot"));
    const lotInfo = new Map<string, string>();
    for (const lot of lotsRaw) {
      if (!lot || typeof lot !== "object") continue;
      const lotId = textOf(findKey(lot, "cbc:ID"));
      const project = lot["cac:ProcurementProject"] as Record<string, unknown> | undefined;
      const name = project ? textOf(findKey(project, "cbc:Name")) : "";
      if (lotId && name) lotInfo.set(lotId, name);
    }

    if (lotInfo.size > 0) {
      const tendersRaw = flatten<Record<string, unknown>>(findAll(d, "efac:LotTender"));
      const lotAmounts = new Map<string, number>();
      const lotTitulaires = new Map<string, string[]>();

      const orgsRaw = flatten<Record<string, unknown>>(findAll(d, "efac:Organization"));
      const orgNames = new Map<string, string>();
      for (const org of orgsRaw) {
        if (!org || typeof org !== "object") continue;
        const company = org["efac:Company"] as Record<string, unknown> | undefined;
        if (!company) continue;
        const ids = findAll(company, "cbc:ID");
        const names = findAll(company, "cbc:Name");
        const oid = ids.length > 0 ? textOf(ids[0]) : "";
        const oname = names.length > 0 ? textOf(names[0]) : "";
        if (oid && oname) orgNames.set(oid, oname);
      }

      const tpaRaw = flatten<Record<string, unknown>>(findAll(d, "efac:TenderingParty"));
      const tpaToOrg = new Map<string, string>();
      for (const tp of tpaRaw) {
        if (!tp || typeof tp !== "object") continue;
        const tpaId = textOf(findKey(tp, "cbc:ID"));
        if (!tpaId.startsWith("TPA")) continue;
        const tenderers = findAll(tp, "efac:Tenderer");
        for (const tenderer of flatten<Record<string, unknown>>(tenderers)) {
          if (!tenderer || typeof tenderer !== "object") continue;
          const orgRef = textOf(findKey(tenderer, "cbc:ID"));
          if (orgRef?.startsWith("ORG")) { const name = orgNames.get(orgRef); if (name) tpaToOrg.set(tpaId, name); }
        }
      }

      const resultsRaw = flatten<Record<string, unknown>>(findAll(d, "efac:LotResult"));
      const winnerTids = new Set<string>();
      const lotNbOffres = new Map<string, number>();
      for (const res of resultsRaw) {
        if (!res || typeof res !== "object") continue;
        for (const lt of flatten<Record<string, unknown>>(findAll(res, "efac:LotTender"))) winnerTids.add(textOf(findKey(lt, "cbc:ID")));
        const statsNum = findKey(res, "efbc:StatisticsNumeric");
        const lotTenderRef = findKey(res, "efac:LotTender");
        if (statsNum && lotTenderRef) { const lotId = textOf(findKey(lotTenderRef, "cbc:ID")); const nb = Number(textOf(statsNum)); if (lotId && !isNaN(nb) && nb > 0) lotNbOffres.set(lotId, nb); }
      }

      for (const tender of tendersRaw) {
        if (!tender || typeof tender !== "object") continue;
        const tid = textOf(findKey(tender, "cbc:ID"));
        if (winnerTids.size > 0 && !winnerTids.has(tid)) continue;
        const lotRef = findKey(tender, "efac:TenderLot") as Record<string, unknown> | null;
        const lotId = lotRef ? textOf(findKey(lotRef, "cbc:ID")) : "";
        const amountObj = findKey(tender, "cbc:PayableAmount");
        const amount = amountObj ? Number(textOf(amountObj)) : null;
        if (lotId && amount && !lotAmounts.has(lotId)) lotAmounts.set(lotId, amount);
        const tpObj = findKey(tender, "efac:TenderingParty") as Record<string, unknown> | null;
        const tpaId = tpObj ? textOf(findKey(tpObj, "cbc:ID")) : "";
        const tName = tpaToOrg.get(tpaId);
        if (lotId && tName) { if (!lotTitulaires.has(lotId)) lotTitulaires.set(lotId, []); const arr = lotTitulaires.get(lotId)!; if (!arr.includes(tName)) arr.push(tName); }
      }

      const lots: LotAttrib[] = [];
      for (const [lotId, lotName] of lotInfo) {
        const montant = lotAmounts.get(lotId) ?? null;
        let tits = lotTitulaires.get(lotId) ?? [];
        if (tits.length === 0 && titulaires?.length) { const idx = Array.from(lotInfo.keys()).sort().indexOf(lotId); if (idx >= 0 && idx < titulaires.length) tits = [titulaires[idx]]; }
        const label = tits.length > 0 ? `${lotName} → ${tits.join(", ")}` : lotName;
        const nb_offres = lotNbOffres.get(lotId) ?? null;
        lots.push({ num: lotId, nom: label, montant, nb_offres });
      }

      const mtObj = findKey(d, "cbc:TotalAmount");
      return { lots, montant_total: mtObj ? Number(textOf(mtObj)) : null };
    }
  }

  if (d) {
    const decisions = flatten<Record<string, unknown>>(findAll(d, "DECISION"));
    const validDecisions = decisions.filter((dec) => dec && typeof dec === "object" && ("INTITULE" in dec || "TITULAIRE" in dec || "NUM_LOT" in dec));
    if (validDecisions.length > 0) {
      const lots: LotAttrib[] = [];
      let montantTotal = 0;
      for (const dec of validDecisions) {
        const intitule = textOf(dec["INTITULE"] ?? "");
        const numLot = textOf(dec["NUM_LOT"] ?? "");
        const renseignement = dec["RENSEIGNEMENT"] as Record<string, unknown> | undefined;
        const montantObj = (dec["MONTANT"] as Record<string, unknown> | string | undefined) ?? (renseignement?.["MONTANT"] as Record<string, unknown> | string | undefined);
        const montant = montantObj ? Number(textOf(montantObj)) : null;
        if (montant && montant > 0) montantTotal += montant;
        const nbOffreRaw = renseignement?.["NB_OFFRE_RECU"];
        const nb_offres = nbOffreRaw ? Number(textOf(nbOffreRaw)) : null;
        let titulaireDec = dec["TITULAIRE"];
        if (titulaireDec && !Array.isArray(titulaireDec)) titulaireDec = [titulaireDec];
        const titulaireNames = (titulaireDec as Array<Record<string, unknown>> | undefined)?.map((t) => textOf(t["DENOMINATION"] ?? "")).filter(Boolean) ?? [];
        const lotName = intitule || `Lot ${numLot}` || titre;
        const nom = titulaireNames.length > 0 ? `${lotName} → ${titulaireNames.join(", ")}` : lotName;
        lots.push({ num: `LOT-${numLot || String(lots.length + 1)}`, nom, montant, nb_offres });
      }
      if (lots.length > 0) return { lots, montant_total: montantTotal > 0 ? montantTotal : null };
    }
  }

  let montantFromDonnees: number | null = null;
  if (d) {
    const valeurs = findAll(d, "VALEUR") as Array<Record<string, string>>;
    const montants = findAll(d, "MONTANT") as Array<Record<string, string>>;
    const payable = findAll(d, "cbc:PayableAmount") as Array<Record<string, string>>;
    const totalAmt = findAll(d, "cbc:TotalAmount") as Array<Record<string, string>>;
    for (const candidates of [payable, totalAmt, valeurs, montants]) {
      if (candidates.length > 0) { const val = candidates[0]; const num = Number(typeof val === "object" ? val["#text"] ?? val : val); if (!isNaN(num) && num > 0) { montantFromDonnees = num; break; } }
    }
  }

  if (titulaires?.length) {
    return {
      lots: [{ num: "LOT-1", nom: `${titre} → ${titulaires.join(", ")}`, montant: montantFromDonnees }],
      montant_total: montantFromDonnees,
    };
  }

  return { lots: [], montant_total: montantFromDonnees };
}
