import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { METIERS, aoMatchesMetier, matchesMetier, deadlineInfo, fmt, fetchAO } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";

export default async function EnCoursPage() {
  const supabase = createServerClient();
  const ouverts = await fetchAO(supabase, "ouvert");

  const now = new Date();
  const enCours = ouverts.filter(
    (ao) => !ao.deadline || new Date(ao.deadline) >= now
  );

  const columns = METIERS.map((m) => ({
    metier: m,
    aos: enCours.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m)) || aoMatchesMetier(ao, m)
    ),
  }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={enCours.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
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
                    Pas d&apos;AO en cours
                  </div>
                )}
                {col.aos.map((ao) => (
                  <EnCoursCard key={ao.id} ao={ao} metier={col.metier} />
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}

function EnCoursCard({ ao, metier }: { ao: AO; metier: typeof METIERS[number] }) {
  const dl = ao.deadline ? deadlineInfo(ao.deadline) : null;

  return (
    <div className={`border-l-4 ${metier.accent} rounded-r-lg bg-white border border-neutral-200 p-3 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[13px] leading-snug text-neutral-800 line-clamp-2 flex-1">
          {ao.titre}
        </h3>
        {dl && <span className={`shrink-0 text-xs ${dl.cls}`}>{dl.label}</span>}
      </div>

      {ao.acheteur && (
        <p className="mt-0.5 text-[11px] text-neutral-500">{ao.acheteur}</p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ao.montant_estime != null && (
          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-inset ring-green-200">
            {fmt(Number(ao.montant_estime))}
          </span>
        )}
        {ao.type_marche && (
          <span className="inline-flex items-center rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600 ring-1 ring-inset ring-neutral-200">
            {ao.type_marche}
          </span>
        )}
        {ao.deadline && (
          <span className="inline-flex items-center rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-inset ring-neutral-200">
            {new Date(ao.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {ao.resume_llm && (
        <p className="mt-2 text-[11px] text-neutral-600 leading-relaxed bg-blue-50 rounded px-2.5 py-1.5 line-clamp-3">
          {ao.resume_llm.split("\n---scores:")[0]}
        </p>
      )}

      {ao.lots?.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {ao.lots.map((lot, idx) => {
            const relevant = matchesMetier(lot, metier);
            return (
              <div key={`${lot.num}-${idx}`} className={`flex items-baseline gap-1.5 text-[11px] ${relevant ? "" : "opacity-40"}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 relative top-[2px] ${relevant ? "bg-amber-400" : "bg-neutral-300"}`} />
                <span className={`truncate min-w-0 flex-1 ${relevant ? "font-semibold text-neutral-800" : "text-neutral-500"}`}>
                  {lot.nom}
                </span>
                {lot.montant != null && (
                  <span className={`shrink-0 ${relevant ? "font-semibold text-neutral-800" : "text-neutral-400"}`}>
                    {fmt(Number(lot.montant))}
                  </span>
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
              Avis BOAMP &rarr;
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
}
