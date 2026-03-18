import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, aoMatchesMetier, matchesMetier, parseCompanies, fmt, fetchAO } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";
import { YearFilter } from "@/app/components/year-filter";

export default async function AttribuesPage({
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
    // Filtrage par keywords sur les lots, pas par CPV codes de l'AO
    aos: attribues.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre))
    ),
  }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={ouverts.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-neutral-700">
            Marchés attribués {year && `— ${year}`}
          </h2>
          <YearFilter years={years} current={year ?? "all"} basePath="/attribues" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col) => (
            <div key={col.metier.nom}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{col.metier.emoji}</span>
                <h2 className="font-bold text-sm text-neutral-700">{col.metier.nom}</h2>
                <span className="ml-auto rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                  {col.aos.length}
                </span>
              </div>
              <div className="space-y-3">
                {col.aos.length === 0 && (
                  <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-400">
                    Pas d&apos;attribution pour cette période
                  </div>
                )}
                {col.aos.map((ao) => (
                  <AttribueCard key={ao.id} ao={ao} metier={col.metier} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function AttribueCard({ ao, metier }: { ao: AO; metier: typeof METIERS[number] }) {
  const relevantLots = ao.lots?.filter((lot) => matchesMetier(lot, metier, ao.titre)) ?? [];
  const hiddenCount = (ao.lots?.length ?? 0) - relevantLots.length;

  return (
    <div className={`border-l-4 ${metier.accent} rounded-r-lg bg-white border border-neutral-200 p-3`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[13px] leading-snug text-neutral-700 line-clamp-2 flex-1">
          {ao.titre}
        </h3>
        <span className="shrink-0 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
          attribué
        </span>
      </div>

      {ao.acheteur && (
        <p className="mt-0.5 text-[11px] text-neutral-500">{ao.acheteur}</p>
      )}
      <p className="mt-0.5 text-[10px] text-neutral-400">
        Publié le {new Date(ao.date_pub).toLocaleDateString("fr-FR")}
      </p>

      {relevantLots.length > 0 && (
        <div className="mt-2 space-y-1">
          {relevantLots.map((lot, idx) => {
            const companies = parseCompanies(lot.nom);
            const lotLabel = lot.nom.includes("→") ? lot.nom.slice(0, lot.nom.indexOf("→")).trim() : lot.nom;
            return (
              <div key={`${lot.num}-${idx}`} className="bg-neutral-50 rounded px-2.5 py-1.5">
                <div className="text-[11px] font-medium text-neutral-700">{lotLabel}</div>
                {companies.length > 0 && (
                  <div className="text-[11px] text-purple-700 mt-0.5">
                    &rarr; {companies.join(", ")}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {lot.montant != null && (
                    <span className="text-[11px] font-semibold text-green-700">
                      {fmt(Number(lot.montant))}
                    </span>
                  )}
                  {lot.nb_offres != null && lot.nb_offres > 0 && (
                    <span className="text-[10px] text-neutral-400">
                      {lot.nb_offres} offre{lot.nb_offres > 1 ? "s" : ""} reçue{lot.nb_offres > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="mt-1.5 text-[10px] text-neutral-400 italic">
          et {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} lot{hiddenCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
