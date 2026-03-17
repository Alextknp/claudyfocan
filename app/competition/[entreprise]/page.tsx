import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, matchesMetier, parseCompanies, normalizeCompanyName, fmt, fetchAO } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";

interface WonLot {
  aoTitre: string;
  aoAcheteur: string | null;
  aoDatePub: string;
  aoUrlDce: string | null;
  lotNom: string;
  lotMontant: number | null;
  nbOffres: number | null;
  coTitulaires: string[];
  metierMatch: string[];
}

function findWonLots(attribues: AO[], normalizedName: string): WonLot[] {
  const results: WonLot[] = [];

  for (const ao of attribues) {
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      const companies = parseCompanies(lot.nom);
      const matchingCompany = companies.some(
        (c) => normalizeCompanyName(c) === normalizedName
      );
      if (!matchingCompany) continue;

      const arrow = lot.nom.indexOf("→");
      const lotLabel = arrow !== -1 ? lot.nom.slice(0, arrow).trim() : lot.nom;
      const coTitulaires = companies.filter(
        (c) => normalizeCompanyName(c) !== normalizedName
      );

      const metierMatch = METIERS
        .filter((m) => matchesMetier(lot, m))
        .map((m) => m.emoji);

      results.push({
        aoTitre: ao.titre,
        aoAcheteur: ao.acheteur,
        aoDatePub: ao.date_pub,
        aoUrlDce: ao.url_dce,
        lotNom: lotLabel,
        lotMontant: lot.montant,
        nbOffres: lot.nb_offres ?? null,
        coTitulaires,
        metierMatch,
      });
    }
  }

  results.sort((a, b) => b.aoDatePub.localeCompare(a.aoDatePub));
  return results;
}

export default async function EntreprisePage({
  params,
  searchParams,
}: {
  params: Promise<{ entreprise: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { entreprise } = await params;
  const { year } = await searchParams;
  const normalizedName = decodeURIComponent(entreprise);

  const supabase = createServerClient();
  const [ouverts, allAttribues] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
  ]);

  const attribues = year
    ? allAttribues.filter((a) => a.date_pub.startsWith(year))
    : allAttribues;

  const wonLots = findWonLots(attribues, normalizedName);

  // Stats
  const totalMontant = wonLots.reduce(
    (sum, l) => sum + (l.lotMontant ? Number(l.lotMontant) / (l.coTitulaires.length + 1) : 0),
    0
  );
  const lotsAvecMontant = wonLots.filter((l) => l.lotMontant).length;
  const avgMontant = lotsAvecMontant > 0 ? totalMontant / lotsAvecMontant : 0;
  const acheteurs = new Set(wonLots.map((l) => l.aoAcheteur).filter(Boolean));

  // Trouver le vrai nom (pas normalisé) depuis les données
  let displayName = normalizedName;
  for (const ao of attribues) {
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      for (const c of parseCompanies(lot.nom)) {
        if (normalizeCompanyName(c) === normalizedName) {
          if (c.length > displayName.length) displayName = c;
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={ouverts.length} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
          <Link href={`/competition${year ? `?year=${year}` : ""}`} className="hover:text-cf-blue">
            Compétition
          </Link>
          <span>/</span>
          <span className="text-neutral-600">{displayName}</span>
        </div>

        {/* Header */}
        <h1 className="text-xl font-bold text-neutral-800 mb-1">{displayName}</h1>
        <p className="text-sm text-neutral-500 mb-6">
          {wonLots.length} lot{wonLots.length > 1 ? "s" : ""} gagné{wonLots.length > 1 ? "s" : ""}
          {year ? ` en ${year}` : ""} &middot; {acheteurs.size} acheteur{acheteurs.size > 1 ? "s" : ""}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3 text-center">
            <div className="text-xl font-bold text-neutral-800">{wonLots.length}</div>
            <div className="text-[11px] text-neutral-500">lots gagnés</div>
          </div>
          <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3 text-center">
            <div className="text-xl font-bold text-green-700">{totalMontant > 0 ? fmt(totalMontant) : "—"}</div>
            <div className="text-[11px] text-neutral-500">volume total</div>
          </div>
          <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3 text-center">
            <div className="text-xl font-bold text-neutral-700">{avgMontant > 0 ? fmt(Math.round(avgMontant)) : "—"}</div>
            <div className="text-[11px] text-neutral-500">montant moyen</div>
          </div>
        </div>

        {/* Liste des lots gagnés */}
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Détail des marchés</h2>
        <div className="space-y-3">
          {wonLots.map((lot, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-white border border-neutral-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-[13px] text-neutral-800 leading-snug">
                    {lot.lotNom}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{lot.aoTitre}</p>
                  {lot.aoAcheteur && (
                    <p className="text-[11px] text-neutral-400">{lot.aoAcheteur}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {lot.lotMontant && (
                    <div className="text-sm font-bold text-green-700">
                      {fmt(Number(lot.lotMontant))}
                    </div>
                  )}
                  <div className="text-[10px] text-neutral-400">
                    {new Date(lot.aoDatePub).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  {lot.nbOffres != null && lot.nbOffres > 0 && (
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      {lot.nbOffres} offre{lot.nbOffres > 1 ? "s" : ""} reçue{lot.nbOffres > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>

              {/* Co-titulaires */}
              {lot.coTitulaires.length > 0 && (
                <div className="mt-2 text-[10px] text-neutral-500">
                  Co-titulaires : {lot.coTitulaires.join(", ")}
                </div>
              )}

              {/* Métier badges + lien */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-1">
                  {lot.metierMatch.map((emoji, i) => (
                    <span key={i} className="text-sm">{emoji}</span>
                  ))}
                </div>
                {lot.aoUrlDce && (
                  <a
                    href={lot.aoUrlDce}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-cf-blue hover:underline"
                  >
                    Voir sur BOAMP &rarr;
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {wonLots.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-xs text-neutral-400">
            Aucun lot trouvé pour cette entreprise{year ? ` en ${year}` : ""}.
          </div>
        )}
      </div>
    </main>
  );
}
