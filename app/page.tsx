import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import {
  METIERS, aoMatchesMetier, matchesMetier, parseCompanies,
  normalizeCompanyName, deadlineInfo, fmt, fetchAO,
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

  const [allOuverts, attribues, siretMap] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
    fetchEntreprisesSiret(supabase),
  ]);

  const now = new Date();
  const enCours = allOuverts.filter(
    (ao) => !ao.deadline || new Date(ao.deadline) >= now
  );
  const enAttente = allOuverts.filter(
    (ao) => ao.deadline && new Date(ao.deadline) < now
  );

  // AO en cours par segment
  const segmentAOs = METIERS.map((m) => ({
    metier: m,
    aos: enCours
      .filter((ao) =>
        ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre)) || aoMatchesMetier(ao, m)
      )
      .sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }),
    attribCount: attribues.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre))
    ).length,
    top: topCompetitors(attribues, m, siretMap),
  }));

  // Dernières attributions pertinentes
  const recentDate = new Date(now.getTime() - 60 * 86_400_000).toISOString().split("T")[0];
  const recentAttrib = attribues
    .filter((ao) =>
      ao.date_pub >= recentDate &&
      ao.lots?.some((lot) => METIERS.some((m) => matchesMetier(lot, m, ao.titre)))
    )
    .slice(0, 9);

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={enCours.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">

        {/* Stats rapides */}
        <div className="flex flex-wrap gap-6 mb-6 text-sm">
          <Link href="/en-cours" className="hover:text-cf-blue transition-colors">
            <span className="text-2xl font-black text-neutral-800">{enCours.length}</span>
            <span className="text-neutral-400 ml-1.5">en cours</span>
          </Link>
          <Link href="/expires" className="hover:text-cf-blue transition-colors">
            <span className="text-2xl font-black text-amber-600">{enAttente.length}</span>
            <span className="text-neutral-400 ml-1.5">en attente</span>
          </Link>
          <Link href="/attribues" className="hover:text-cf-blue transition-colors">
            <span className="text-2xl font-black text-green-700">{attribues.length.toLocaleString("fr-FR")}</span>
            <span className="text-neutral-400 ml-1.5">attribués</span>
          </Link>
        </div>

        {/* AO en cours par segment — le coeur de la home */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {segmentAOs.map((seg) => (
            <div key={seg.metier.nom}>
              {/* Header segment */}
              <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${seg.metier.accent.replace("border-l-", "border-b-")}`}>
                <span className="text-xl">{seg.metier.emoji}</span>
                <h2 className="font-bold text-sm text-neutral-800 flex-1">{seg.metier.nom}</h2>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
                  {seg.aos.length}
                </span>
              </div>

              {/* AO cards */}
              {seg.aos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-400">
                  Pas d&apos;AO en cours
                </div>
              ) : (
                <div className="space-y-2">
                  {seg.aos.map((ao) => {
                    const dl = ao.deadline ? deadlineInfo(ao.deadline) : null;
                    const relevantLots = ao.lots?.filter((lot) =>
                      matchesMetier(lot, seg.metier, ao.titre)
                    ) ?? [];
                    return (
                      <div
                        key={ao.id}
                        className={`border-l-4 ${seg.metier.accent} rounded-r-lg bg-white border border-neutral-200 p-3 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-[13px] leading-snug text-neutral-800 line-clamp-2 flex-1">
                            {ao.titre}
                          </h3>
                          {dl && <span className={`shrink-0 text-xs ${dl.cls}`}>{dl.label}</span>}
                        </div>
                        {ao.acheteur && (
                          <Link href={`/acheteur/${encodeURIComponent(ao.acheteur)}`}
                            className="mt-0.5 text-[11px] text-neutral-500 hover:text-cf-blue transition-colors block">
                            {ao.acheteur}
                          </Link>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {ao.montant_estime != null && (
                            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-inset ring-green-200">
                              {fmt(Number(ao.montant_estime))}
                            </span>
                          )}
                          {ao.deadline && (
                            <span className="inline-flex items-center rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-inset ring-neutral-200">
                              {new Date(ao.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        {/* Lots pertinents */}
                        {relevantLots.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {relevantLots.slice(0, 3).map((lot, idx) => {
                              const arrow = lot.nom.indexOf("→");
                              const label = arrow !== -1 ? lot.nom.slice(0, arrow).trim() : lot.nom;
                              return (
                                <div key={idx} className="flex items-baseline gap-1.5 text-[11px]">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 relative top-[2px] bg-amber-400`} />
                                  <span className="text-neutral-700 truncate flex-1">{label}</span>
                                  {lot.montant != null && (
                                    <span className="shrink-0 font-semibold text-neutral-600">{fmt(Number(lot.montant))}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
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
              )}

              {/* Mini compétition */}
              {seg.top.length > 0 && (
                <div className="mt-4 rounded-lg bg-neutral-50 border border-neutral-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                      Top concurrents
                    </span>
                    <Link href="/competition" className="text-[10px] text-cf-blue hover:underline">
                      Voir tout &rarr;
                    </Link>
                  </div>
                  {seg.top.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 py-0.5">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                        i === 0 ? "bg-amber-100 text-amber-700" :
                        i === 1 ? "bg-neutral-200 text-neutral-600" :
                        "bg-neutral-100 text-neutral-500"
                      }`}>{i + 1}</span>
                      <span className="text-[11px] text-neutral-700 truncate flex-1">{c.name}</span>
                      <span className="text-[10px] text-neutral-400">{c.wins}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dernières attributions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-700">Dernières attributions</h2>
            <Link href="/attribues" className="text-[11px] font-medium text-cf-blue hover:underline">
              Tout voir &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentAttrib.slice(0, 9).map((ao) => {
              const relevantLots = ao.lots?.filter((lot) =>
                METIERS.some((m) => matchesMetier(lot, m, ao.titre))
              ) ?? [];
              const badge = METIERS.find((m) =>
                ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre))
              );
              return (
                <div key={ao.id} className={`rounded-lg bg-white border border-neutral-200 p-3 ${badge ? `border-l-4 ${badge.accent}` : ""}`}>
                  <h4 className="font-medium text-[12px] leading-snug text-neutral-700 line-clamp-1">
                    {ao.titre}
                  </h4>
                  {ao.acheteur && (
                    <p className="text-[10px] text-neutral-400 truncate">{ao.acheteur}</p>
                  )}
                  {relevantLots.length > 0 && (
                    <div className="mt-1.5">
                      {relevantLots.slice(0, 2).map((lot, idx) => {
                        const arrow = lot.nom.indexOf("→");
                        const label = arrow !== -1 ? lot.nom.slice(0, arrow).trim() : lot.nom;
                        const companies = parseCompanies(lot.nom);
                        return (
                          <div key={idx} className="text-[10px] truncate">
                            <span className="text-neutral-500">{label}</span>
                            {companies.length > 0 && (
                              <span className="text-purple-600"> &rarr; {companies[0]}</span>
                            )}
                            {lot.montant != null && (
                              <span className="font-semibold text-green-700 ml-1">{fmt(Number(lot.montant))}</span>
                            )}
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

      </div>
    </main>
  );
}
