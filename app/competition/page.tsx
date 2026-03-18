import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, aoMatchesMetier, matchesMetier, parseCompanies, normalizeCompanyName, fmt, fetchAO, fetchDecpMarches, decpMatchesMetier, fetchEntreprisesSiret, lookupSiret, fetchNavCounts } from "@/lib/metiers";
import type { AO, DecpMarche, EntrepriseSiret } from "@/lib/metiers";
import { YearFilter } from "@/app/components/year-filter";

interface CompanyStats {
  name: string;
  siret: string | null;
  wins: number;
  totalMontant: number;
  count: number;
}

// Au-delà de ce seuil par lot, c'est une enveloppe accord-cadre pluriannuelle, pas un montant réel
const MONTANT_MAX_LOT = 5_000_000;

function buildLeaderboard(attribues: AO[], metier: typeof METIERS[number], siretMap?: Map<string, EntrepriseSiret>) {
  const stats = new Map<string, CompanyStats>();
  let totalLots = 0;
  let totalVolume = 0;
  const aoIds = new Set<string>();

  for (const ao of attribues) {
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      if (!matchesMetier(lot, metier, ao.titre)) continue;
      const companies = parseCompanies(lot.nom);
      if (companies.length === 0) continue;
      totalLots++;
      aoIds.add(ao.id);
      const share = companies.length;
      const rawMontant = lot.montant ? Number(lot.montant) : 0;
      const lotMontant = Math.min(rawMontant, MONTANT_MAX_LOT);
      totalVolume += lotMontant;

      for (const company of companies) {
        const normKey = normalizeCompanyName(company);
        const siretEntry = siretMap ? lookupSiret(normKey, siretMap) : undefined;
        const key = siretEntry?.siret ?? normKey;
        const existing = stats.get(key);
        const montant = lotMontant / share;
        if (existing) {
          existing.wins += 1;
          existing.totalMontant += montant;
          existing.count += montant > 0 ? 1 : 0;
          if (company.length > existing.name.length) existing.name = siretEntry?.nom ?? company;
        } else {
          stats.set(key, {
            name: siretEntry?.nom ?? company,
            siret: siretEntry?.siret ?? null,
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

function buildGlobalLeaderboard(attribues: AO[], siretMap?: Map<string, EntrepriseSiret>) {
  const stats = new Map<string, CompanyStats>();
  let totalLots = 0;
  let totalVolume = 0;
  const aoIds = new Set<string>();

  for (const ao of attribues) {
    if (!ao.lots) continue;
    for (const lot of ao.lots) {
      const matchedMetier = METIERS.some((m) => matchesMetier(lot, m, ao.titre));
      if (!matchedMetier) continue;
      const companies = parseCompanies(lot.nom);
      if (companies.length === 0) continue;
      totalLots++;
      aoIds.add(ao.id);
      const share = companies.length;
      const lotMontant = lot.montant ? Number(lot.montant) : 0;
      totalVolume += lotMontant;

      for (const company of companies) {
        const normKey = normalizeCompanyName(company);
        const siretEntry = siretMap ? lookupSiret(normKey, siretMap) : undefined;
        const key = siretEntry?.siret ?? normKey;
        const existing = stats.get(key);
        const montant = lotMontant / share;
        if (existing) {
          existing.wins += 1;
          existing.totalMontant += montant;
          existing.count += montant > 0 ? 1 : 0;
          if (company.length > existing.name.length) existing.name = siretEntry?.nom ?? company;
        } else {
          stats.set(key, {
            name: siretEntry?.nom ?? company,
            siret: siretEntry?.siret ?? null,
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

interface DecpCompanyStats {
  name: string;
  siret: string | null;
  totalMontant: number;
  count: number;
}

function buildDecpLeaderboard(marches: DecpMarche[], metier: typeof METIERS[number]) {
  const stats = new Map<string, DecpCompanyStats>();
  let totalMarches = 0;
  let totalVolume = 0;

  for (const m of marches) {
    if (!decpMatchesMetier(m.objet, metier)) continue;
    totalMarches++;
    const montant = m.montant ? Number(m.montant) : 0;
    totalVolume += montant;

    const key = m.titulaire_siret ?? m.titulaire_nom ?? "inconnu";
    const displayName = m.titulaire_nom ?? m.titulaire_siret ?? "Inconnu";
    const existing = stats.get(key);
    if (existing) {
      existing.totalMontant += montant;
      existing.count += 1;
      if (m.titulaire_nom && (!existing.name || existing.name === existing.siret)) {
        existing.name = m.titulaire_nom;
      }
    } else {
      stats.set(key, {
        name: displayName,
        siret: m.titulaire_siret ?? null,
        totalMontant: montant,
        count: 1,
      });
    }
  }

  const leaderboard = Array.from(stats.values()).sort(
    (a, b) => b.totalMontant - a.totalMontant || b.count - a.count
  );

  return { leaderboard, totalMarches, totalVolume };
}

export default async function CompetitionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const supabase = createServerClient();

  const [ouverts, allAttribues, allDecp, siretMap, navCounts] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchAO(supabase, "attribue"),
    fetchDecpMarches(supabase),
    fetchEntreprisesSiret(supabase),
    fetchNavCounts(supabase),
  ]);

  const boampYears = allAttribues.map((a) => a.date_pub.slice(0, 4));
  const decpYears = allDecp
    .filter((d) => d.date_notification)
    .map((d) => d.date_notification!.slice(0, 4));
  const years = Array.from(new Set([...boampYears, ...decpYears])).sort(
    (a, b) => b.localeCompare(a)
  );

  const attribues = year
    ? allAttribues.filter((a) => a.date_pub.startsWith(year))
    : allAttribues;

  const decpFiltered = year
    ? allDecp.filter((d) => d.date_notification?.startsWith(year))
    : allDecp;

  // Stats globales
  const totalAttribues = attribues.length;
  const totalLots = attribues.reduce((sum, ao) => sum + (ao.lots?.length ?? 0), 0);
  const totalLotsAvecTitulaire = attribues.reduce(
    (sum, ao) => sum + (ao.lots?.filter((l) => l.nom.includes("→")).length ?? 0), 0
  );

  const columns = METIERS.map((m) => ({
    metier: m,
    ...buildLeaderboard(attribues, m, siretMap),
  }));

  const segmentMarches = columns.reduce((s, c) => s + c.marchesCount, 0);
  const segmentLots = columns.reduce((s, c) => s + c.totalLots, 0);
  const segmentVolume = columns.reduce((s, c) => s + c.totalVolume, 0);

  const decpColumns = METIERS.map((m) => ({
    metier: m,
    ...buildDecpLeaderboard(decpFiltered, m),
  }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav counts={navCounts} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-neutral-700">
            Compétition {year && `— ${year}`}
          </h2>
          <YearFilter years={years} current={year ?? "all"} basePath="/competition" />
        </div>

        {/* Stats globales */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-neutral-800">{totalAttribues}</div>
              <div className="text-[10px] text-neutral-500">marchés attribués</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-neutral-800">{totalLots}</div>
              <div className="text-[10px] text-neutral-500">lots total</div>
            </div>
            <div className="text-center border-l border-neutral-200">
              <div className="text-lg font-bold text-cf-blue">{segmentMarches}</div>
              <div className="text-[10px] text-neutral-500">nos segments</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-cf-blue">{segmentLots}</div>
              <div className="text-[10px] text-neutral-500">lots pertinents</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-700">{fmt(segmentVolume)}</div>
              <div className="text-[10px] text-neutral-500">volume segments</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-neutral-400">{Math.round(segmentMarches * 100 / Math.max(totalAttribues, 1))}%</div>
              <div className="text-[10px] text-neutral-500">de couverture</div>
            </div>
          </div>
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
                        href={`/competition/${encodeURIComponent(normalizeCompanyName(entry.name))}?metier=${encodeURIComponent(col.metier.nom)}${year ? `&year=${year}` : ""}`}
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
                          {entry.siret && (
                            <div className="text-[9px] text-neutral-300 font-mono">{entry.siret}</div>
                          )}
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

        {/* DECP Section */}
        <div className="mt-12 mb-6">
          <h2 className="text-sm font-semibold text-emerald-700 mb-1">
            Données DECP (montants réels) {year && `— ${year}`}
          </h2>
          <p className="text-[11px] text-neutral-500 mb-4">
            Marchés attribués avec montants réels issus des données essentielles de la commande publique
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {decpColumns.map((col) => (
            <div key={`decp-${col.metier.nom}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{col.metier.emoji}</span>
                <h2 className="font-bold text-sm text-emerald-700">{col.metier.nom}</h2>
              </div>

              {/* Totaux DECP */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                  <div className="text-sm font-bold text-emerald-800">{col.totalMarches}</div>
                  <div className="text-[10px] text-emerald-600">marchés DECP</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                  <div className="text-sm font-bold text-emerald-800">{fmt(col.totalVolume)}</div>
                  <div className="text-[10px] text-emerald-600">volume réel</div>
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 mb-2">
                {col.leaderboard.length} entreprises
              </div>

              {col.leaderboard.length === 0 ? (
                <div className="rounded-lg border border-dashed border-emerald-300 p-6 text-center text-xs text-neutral-400">
                  Pas encore de données DECP
                </div>
              ) : (
                <div className="space-y-1">
                  {col.leaderboard.map((entry, idx) => {
                    const avg = entry.count > 0 ? entry.totalMontant / entry.count : 0;
                    return (
                      <div
                        key={entry.siret ?? entry.name}
                        className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          idx === 0 ? "bg-emerald-100 text-emerald-700" :
                          idx === 1 ? "bg-emerald-50 text-emerald-600" :
                          idx === 2 ? "bg-green-50 text-green-600" :
                          "bg-neutral-100 text-neutral-500"
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-neutral-800 truncate">{entry.name}</div>
                          {entry.siret && entry.name !== entry.siret && (
                            <div className="text-[10px] text-neutral-400 truncate">SIRET {entry.siret}</div>
                          )}
                          <div className="text-[10px] text-neutral-500">
                            {entry.count} marché{entry.count > 1 ? "s" : ""}
                            {entry.totalMontant > 0 && (
                              <span> &middot; {fmt(entry.totalMontant)}</span>
                            )}
                            {avg > 0 && (
                              <span> &middot; moy. {fmt(Math.round(avg))}</span>
                            )}
                          </div>
                        </div>
                      </div>
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
