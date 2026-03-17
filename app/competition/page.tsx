import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, aoMatchesMetier, matchesMetier, parseCompanies, normalizeCompanyName, fmt, fetchAO } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";
import { YearFilter } from "@/app/components/year-filter";

interface CompanyStats {
  name: string;
  wins: number;
  totalMontant: number;
  count: number;
}

function buildLeaderboard(attribues: AO[], metier: typeof METIERS[number]) {
  const stats = new Map<string, CompanyStats>();
  let totalLots = 0;
  let totalVolume = 0;
  const aoIds = new Set<string>();

  for (const ao of attribues) {
    if (!aoMatchesMetier(ao, metier)) continue;
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      if (!matchesMetier(lot, metier)) continue;
      const companies = parseCompanies(lot.nom);
      if (companies.length === 0) continue;
      totalLots++;
      aoIds.add(ao.id);
      const share = companies.length;
      const lotMontant = lot.montant ? Number(lot.montant) : 0;
      totalVolume += lotMontant;

      for (const company of companies) {
        const key = normalizeCompanyName(company);
        const existing = stats.get(key);
        const montant = lotMontant / share;
        if (existing) {
          existing.wins += 1;
          existing.totalMontant += montant;
          existing.count += montant > 0 ? 1 : 0;
          if (company.length > existing.name.length) existing.name = company;
        } else {
          stats.set(key, {
            name: company,
            wins: 1,
            totalMontant: montant,
            count: montant > 0 ? 1 : 0,
          });
        }
      }
    }
  }

  const leaderboard = Array.from(stats.values()).sort(
    (a, b) => b.wins - a.wins || b.totalMontant - a.totalMontant
  );

  return { leaderboard, totalLots, totalVolume, marchesCount: aoIds.size };
}

export default async function CompetitionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const supabase = createServerClient();

  const [ouverts, allAttribues] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
  ]);

  const years = Array.from(
    new Set(allAttribues.map((a) => a.date_pub.slice(0, 4)))
  ).sort((a, b) => b.localeCompare(a));

  const attribues = year
    ? allAttribues.filter((a) => a.date_pub.startsWith(year))
    : allAttribues;

  const columns = METIERS.map((m) => ({
    metier: m,
    ...buildLeaderboard(attribues, m),
  }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={ouverts.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-neutral-700">
            Compétition {year && `— ${year}`}
          </h2>
          <YearFilter years={years} current={year ?? "all"} basePath="/competition" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col) => (
            <div key={col.metier.nom}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{col.metier.emoji}</span>
                <h2 className="font-bold text-sm text-neutral-700">{col.metier.nom}</h2>
              </div>

              {/* Totaux */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-center">
                  <div className="text-sm font-bold text-neutral-800">{col.marchesCount}</div>
                  <div className="text-[10px] text-neutral-500">marchés</div>
                </div>
                <div className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-center">
                  <div className="text-sm font-bold text-neutral-800">{col.totalLots}</div>
                  <div className="text-[10px] text-neutral-500">lots</div>
                </div>
                <div className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-center">
                  <div className="text-sm font-bold text-green-700">{fmt(col.totalVolume)}</div>
                  <div className="text-[10px] text-neutral-500">volume</div>
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 mb-2">
                {col.leaderboard.length} entreprises
              </div>

              {col.leaderboard.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-400">
                  Pas encore de données
                </div>
              ) : (
                <div className="space-y-1">
                  {col.leaderboard.map((entry, idx) => {
                    const avg = entry.count > 0 ? entry.totalMontant / entry.count : 0;
                    return (
                      <Link
                        key={entry.name}
                        href={`/competition/${encodeURIComponent(normalizeCompanyName(entry.name))}${year ? `?year=${year}` : ""}`}
                        className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 hover:shadow-md hover:border-cf-blue transition-all"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          idx === 0 ? "bg-amber-100 text-amber-700" :
                          idx === 1 ? "bg-neutral-200 text-neutral-600" :
                          idx === 2 ? "bg-orange-100 text-orange-600" :
                          "bg-neutral-100 text-neutral-500"
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-neutral-800 truncate">{entry.name}</div>
                          <div className="text-[10px] text-neutral-500">
                            {entry.wins} lot{entry.wins > 1 ? "s" : ""} gagné{entry.wins > 1 ? "s" : ""}
                            {entry.totalMontant > 0 && (
                              <span> &middot; {fmt(entry.totalMontant)}</span>
                            )}
                            {avg > 0 && (
                              <span> &middot; moy. {fmt(Math.round(avg))}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-neutral-300 text-xs">&rarr;</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
