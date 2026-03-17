import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { fetchBoampByDate, parseDonnees, type BoampRecord } from "@/lib/boamp";

/**
 * POST /api/boamp/fetch
 * Fetch les AO du jour (ou d'une date donnée) depuis BOAMP et les upsert en base.
 * Body optionnel : { date: "2026-03-17" }
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-api-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const date = (body as { date?: string }).date;

    const records = await fetchBoampByDate(date);

    if (records.length === 0) {
      return NextResponse.json({
        message: "Claudy a fait sa ronde. Rien de neuf aujourd'hui.",
        inserted: 0,
      });
    }

    const supabase = createServerClient();
    let inserted = 0;

    for (const r of records) {
      const row = boampToRow(r);
      const { error } = await supabase
        .from("appels_offres")
        .upsert(row, { onConflict: "boamp_id" });

      if (!error) inserted++;
    }

    return NextResponse.json({
      message: `Claudy a trouvé ${records.length} AO, ${inserted} insérés.`,
      total: records.length,
      inserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
