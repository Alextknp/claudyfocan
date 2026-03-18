import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, matchesMetier, parseCompanies, normalizeCompanyName, fmt, fetchAO, fetchDecpMarches, decpMatchesMetier } from "@/lib/metiers";
import type { AO, DecpMarche } from "@/lib/metiers";

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
        .filter((m) => matchesMetier(lot, m, ao.titre))
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
  searchParams: Promise<{ year?: string; metier?: string }>;
}) {
  const { entreprise } = await params;
  const { year, metier: metierParam } = await searchParams;
  const normalizedName = decodeURIComponent(entreprise);

  // Résoudre le métier sélectionné
  const activeMetier = metierParam
    ? METIERS.find((m) => m.nom === metierParam)
    : null;

  const supabase = createServerClient();
  const [ouverts, allAttribues, allDecp] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
    fetchDecpMarches(supabase),
  ]);

  const attribues = year
    ? allAttribues.filter((a) => a.date_pub.startsWith(year))
    : allAttribues;

  let wonLots = findWonLots(attribues, normalizedName);

  // Filtrer par métier si spécifié
  if (activeMetier) {
    wonLots = wonLots.filter((l) =>
      matchesMetier({ nom: l.lotNom }, activeMetier)
    );
  }

  // Find DECP marches matching this company (by SIRET or name)
  let decpFiltered = (year
    ? allDecp.filter((d) => d.date_notification?.startsWith(year))
    : allDecp
  ).filter((d) => {
    if (d.titulaire_siret && d.titulaire_siret === normalizedName) return true;
    if (d.titulaire_nom && normalizeCompanyName(d.titulaire_nom) === normalizedName) return true;
    return false;
  });

  // Filtrer DECP par métier aussi
  if (activeMetier) {
    decpFiltered = decpFiltered.filter((d) =>
      decpMatchesMetier(d.objet, activeMetier)
    );
  }

  const decpTotalMontant = decpFiltered.reduce(
    (sum, d) => sum + (d.montant ? Number(d.montant) : 0), 0
  );
  const decpAvgMontant = decpFiltered.length > 0 ? decpTotalMontant / decpFiltered.filter(d => d.montant).length : 0;

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
            Compétition {activeMetier ? `(${activeMetier.emoji} ${activeMetier.nom})` : ""}
          </Link>
          <span>/</span>
          <span className="text-neutral-600">{displayName}</span>
        </div>

        {/* Header */}
        <h1 className="text-xl font-bold text-neutral-800 mb-1">{displayName}</h1>
        <div className="flex items-center gap-3 mb-6">
          <p className="text-sm text-neutral-500">
            {wonLots.length} lot{wonLots.length > 1 ? "s" : ""} gagné{wonLots.length > 1 ? "s" : ""}
            {activeMetier ? ` (${activeMetier.emoji} ${activeMetier.nom})` : ""}
            {year ? ` en ${year}` : ""} &middot; {acheteurs.size} acheteur{acheteurs.size > 1 ? "s" : ""}
          </p>
          {activeMetier && (
            <Link
              href={`/competition/${encodeURIComponent(normalizedName)}${year ? `?year=${year}` : ""}`}
              className="text-[11px] font-medium text-cf-blue hover:underline"
            >
              Voir tous les métiers
            </Link>
          )}
        </div>

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

        {/* DECP Section */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-emerald-700 mb-1">
            Marchés DECP (montants réels)
          </h2>
          <p className="text-[11px] text-neutral-500 mb-4">
            Données essentielles de la commande publique — montants réellement attribués
          </p>

          {decpFiltered.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                <div className="text-xl font-bold text-emerald-800">{decpFiltered.length}</div>
                <div className="text-[11px] text-emerald-600">marchés DECP</div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                <div className="text-xl font-bold text-emerald-800">{decpTotalMontant > 0 ? fmt(decpTotalMontant) : "—"}</div>
                <div className="text-[11px] text-emerald-600">volume réel</div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                <div className="text-xl font-bold text-emerald-700">{decpAvgMontant > 0 ? fmt(Math.round(decpAvgMontant)) : "—"}</div>
                <div className="text-[11px] text-emerald-600">montant moyen</div>
              </div>
            </div>
          )}

          {decpFiltered.length > 0 ? (
            <div className="space-y-3">
              {decpFiltered.map((d) => {
                const metierMatch = METIERS
                  .filter((m) => decpMatchesMetier(d.objet, m))
                  .map((m) => m.emoji);
                return (
                  <div
                    key={d.id}
                    className="rounded-xl bg-white border border-emerald-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-[13px] text-neutral-800 leading-snug">
                          {d.objet ?? "Sans objet"}
                        </h3>
                        {d.acheteur_nom && (
                          <p className="text-[11px] text-neutral-400 mt-0.5">{d.acheteur_nom}</p>
                        )}
                        {d.procedure_type && (
                          <p className="text-[10px] text-neutral-400">{d.procedure_type}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {d.montant != null && (
                          <div className="text-sm font-bold text-emerald-700">
                            {fmt(Number(d.montant))}
                          </div>
                        )}
                        {d.date_notification && (
                          <div className="text-[10px] text-neutral-400">
                            {new Date(d.date_notification).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                        )}
                        {d.nb_offres != null && d.nb_offres > 0 && (
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            {d.nb_offres} offre{d.nb_offres > 1 ? "s" : ""} reçue{d.nb_offres > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    {metierMatch.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {metierMatch.map((emoji, i) => (
                          <span key={i} className="text-sm">{emoji}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-emerald-300 p-8 text-center text-xs text-neutral-400">
              Aucun marché DECP trouvé pour cette entreprise{year ? ` en ${year}` : ""}.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
