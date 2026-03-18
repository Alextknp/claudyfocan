import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import {
  METIERS, aoMatchesMetier, matchesMetier, parseCompanies,
  normalizeCompanyName, deadlineInfo, fmt, fetchAO, fetchDecpMarches,
  fetchEntreprisesSiret, lookupSiret,
} from "@/lib/metiers";
import type { AO, EntrepriseSiret } from "@/lib/metiers";

function topCompetitors(
  attribues: AO[],
  metier: typeof METIERS[number],
  siretMap: Map<string, EntrepriseSiret>,
  limit = 3
) {
  const stats = new Map<string, { name: string; wins: number }>();
  for (const ao of attribues) {
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      if (!matchesMetier(lot, metier, ao.titre)) continue;
      for (const c of parseCompanies(lot.nom)) {
        const normKey = normalizeCompanyName(c);
        const entry = lookupSiret(normKey, siretMap);
        const key = entry?.siret ?? normKey;
        const existing = stats.get(key);
        if (existing) {
          existing.wins++;
          if (c.length > existing.name.length) existing.name = entry?.nom ?? c;
        } else {
          stats.set(key, { name: entry?.nom ?? c, wins: 1 });
        }
      }
    }
  }
  return Array.from(stats.values()).sort((a, b) => b.wins - a.wins).slice(0, limit);
}

export default async function HomePage() {
  const supabase = createServerClient();

  const [allOuverts, attribues, decp, siretMap] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
    fetchDecpMarches(supabase),
    fetchEntreprisesSiret(supabase),
  ]);

  const now = new Date();
  const enCours = allOuverts.filter(
    (ao) => !ao.deadline || new Date(ao.deadline) >= now
  );
  const enAttente = allOuverts.filter(
    (ao) => ao.deadline && new Date(ao.deadline) < now
  );

  // Urgences : deadline dans les 7 prochains jours
  const urgences = enCours
    .filter((ao) => {
      if (!ao.deadline) return false;
      const diff = Math.ceil((new Date(ao.deadline).getTime() - now.getTime()) / 86_400_000);
      return diff >= 0 && diff <= 7;
    })
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  // Dernières attributions pertinentes (30 derniers jours, filtrées par nos segments)
  const recentDate = new Date(now.getTime() - 30 * 86_400_000).toISOString().split("T")[0];
  const recentAttrib = attribues
    .filter((ao) =>
      ao.date_pub >= recentDate &&
      ao.lots?.some((lot) => METIERS.some((m) => matchesMetier(lot, m, ao.titre)))
    )
    .slice(0, 6);

  // Stats par segment
  const segments = METIERS.map((m) => {
    const aoEnCours = enCours.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre)) || aoMatchesMetier(ao, m)
    );
    const aoAttrib = attribues.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre))
    );
    const top = topCompetitors(attribues, m, siretMap);
    return { metier: m, enCours: aoEnCours.length, attribues: aoAttrib.length, top };
  });

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={enCours.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">

        {/* Hero stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-neutral-800">{enCours.length}</div>
            <div className="text-xs text-neutral-500 mt-1">AO en cours</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-amber-600">{urgences.length}</div>
            <div className="text-xs text-neutral-500 mt-1">Ferment cette semaine</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-neutral-800">{enAttente.length}</div>
            <div className="text-xs text-neutral-500 mt-1">En attente de résultat</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-green-700">{attribues.length.toLocaleString("fr-FR")}</div>
            <div className="text-xs text-neutral-500 mt-1">Marchés attribués</div>
          </div>
        </div>

        {/* 3 segments */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {segments.map((seg) => (
            <div
              key={seg.metier.nom}
              className={`rounded-2xl bg-white border border-neutral-200 p-5 border-l-4 ${seg.metier.accent}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{seg.metier.emoji}</span>
                <h2 className="font-bold text-sm text-neutral-800">{seg.metier.nom}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-xl font-bold text-neutral-800">{seg.enCours}</div>
                  <div className="text-[10px] text-neutral-400">en cours</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-neutral-800">{seg.attribues}</div>
                  <div className="text-[10px] text-neutral-400">attribués</div>
                </div>
              </div>
              {seg.top.length > 0 && (
                <div className="border-t border-neutral-100 pt-3">
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                    Top concurrents
                  </div>
                  {seg.top.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 py-0.5">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                        i === 0 ? "bg-amber-100 text-amber-700" :
                        i === 1 ? "bg-neutral-200 text-neutral-600" :
                        "bg-neutral-100 text-neutral-500"
                      }`}>{i + 1}</span>
                      <span className="text-[11px] text-neutral-700 truncate flex-1">{c.name}</span>
                      <span className="text-[10px] text-neutral-400">{c.wins} lots</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/attribues`}
                  className="text-[10px] font-medium text-cf-blue hover:underline"
                >
                  Attribués &rarr;
                </Link>
                <Link
                  href={`/competition`}
                  className="text-[10px] font-medium text-cf-blue hover:underline"
                >
                  Compétition &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Urgences */}
        {urgences.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-red-600 mb-3">
              Ferment bientôt
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {urgences.slice(0, 6).map((ao) => {
                const dl = ao.deadline ? deadlineInfo(ao.deadline) : null;
                const badges = METIERS.filter((m) =>
                  ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre)) || aoMatchesMetier(ao, m)
                );
                return (
                  <div
                    key={ao.id}
                    className="rounded-xl bg-white border border-red-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-[13px] leading-snug text-neutral-800 line-clamp-2 flex-1">
                        {ao.titre}
                      </h3>
                      {dl && <span className={`shrink-0 text-xs ${dl.cls}`}>{dl.label}</span>}
                    </div>
                    {ao.acheteur && (
                      <Link href={`/acheteur/${encodeURIComponent(ao.acheteur)}`} className="mt-0.5 text-[11px] text-neutral-500 hover:text-cf-blue transition-colors block">{ao.acheteur}</Link>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {badges.map((b) => (
                        <span key={b.nom} className="text-sm" title={b.nom}>{b.emoji}</span>
                      ))}
                      {ao.montant_estime != null && (
                        <span className="text-[11px] font-semibold text-green-700">
                          {fmt(Number(ao.montant_estime))}
                        </span>
                      )}
                      {ao.deadline && (
                        <span className="text-[10px] text-neutral-400 ml-auto">
                          {new Date(ao.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    {(ao.url_dce || ao.url_dce_telechargement) && (
                      <div className="mt-2 flex gap-3 border-t border-neutral-100 pt-2">
                        {ao.url_dce && (
                          <a href={ao.url_dce} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-medium text-cf-blue hover:underline">
                            BOAMP &rarr;
                          </a>
                        )}
                        {ao.url_dce_telechargement && (
                          <a href={ao.url_dce_telechargement} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-medium text-cf-blue hover:underline">
                            DCE &rarr;
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dernières attributions par segment */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-700">
              Dernières attributions
            </h2>
            <Link href="/attribues" className="text-[11px] font-medium text-cf-blue hover:underline">
              Tout voir &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {METIERS.map((metier) => {
              const recentForMetier = recentAttrib
                .filter((ao) =>
                  ao.lots?.some((lot) => matchesMetier(lot, metier, ao.titre))
                )
                .slice(0, 4);
              return (
                <div key={metier.nom}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{metier.emoji}</span>
                    <h3 className="font-bold text-xs text-neutral-600">{metier.nom}</h3>
                  </div>
                  {recentForMetier.length === 0 ? (
                    <div className="text-[11px] text-neutral-400 italic py-4">
                      Pas d&apos;attribution récente
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentForMetier.map((ao) => {
                        const relevantLots = ao.lots?.filter((lot) =>
                          matchesMetier(lot, metier, ao.titre)
                        ) ?? [];
                        return (
                          <div
                            key={ao.id}
                            className={`border-l-4 ${metier.accent} rounded-r-lg bg-white border border-neutral-200 p-3`}
                          >
                            <h4 className="font-medium text-[12px] leading-snug text-neutral-700 line-clamp-2">
                              {ao.titre}
                            </h4>
                            {ao.acheteur && (
                              <p className="mt-0.5 text-[10px] text-neutral-400">{ao.acheteur}</p>
                            )}
                            {relevantLots.length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {relevantLots.slice(0, 2).map((lot, idx) => {
                                  const arrow = lot.nom.indexOf("→");
                                  const label = arrow !== -1 ? lot.nom.slice(0, arrow).trim() : lot.nom;
                                  const companies = parseCompanies(lot.nom);
                                  return (
                                    <div key={idx} className="text-[11px]">
                                      <span className="text-neutral-600">{label}</span>
                                      {companies.length > 0 && (
                                        <span className="text-purple-600"> &rarr; {companies.slice(0, 2).join(", ")}</span>
                                      )}
                                      {lot.montant != null && (
                                        <span className="font-semibold text-green-700 ml-1">{fmt(Number(lot.montant))}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="mt-1 text-[10px] text-neutral-300">
                              {new Date(ao.date_pub).toLocaleDateString("fr-FR")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DECP stats */}
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-emerald-800">Données DECP</h2>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                {decp.length} marchés avec montants réels et SIRET
              </p>
            </div>
            <Link href="/competition" className="text-[11px] font-medium text-emerald-700 hover:underline">
              Voir la compétition &rarr;
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
