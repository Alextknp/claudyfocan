import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";

export const dynamic = "force-dynamic";
import { METIERS, aoMatchesMetier, matchesMetier, fmt, fetchAO, fetchNavCounts } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";

export default async function ExpiresPage() {
  const supabase = createServerClient();
  const [ouverts, navCounts] = await Promise.all([
    fetchAO(supabase, "ouvert"),
    fetchNavCounts(supabase),
  ]);

  const now = new Date();
  const enCours = ouverts.filter(
    (ao) => !ao.deadline || new Date(ao.deadline) >= now
  );
  const expires = ouverts.filter(
    (ao) => ao.deadline && new Date(ao.deadline) < now
  );

  const columns = METIERS.map((m) => ({
    metier: m,
    aos: expires.filter((ao) =>
      ao.lots?.some((lot) => matchesMetier(lot, m, ao.titre)) || aoMatchesMetier(ao, m)
    ),
  }));

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav counts={navCounts} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-700">
            En attente de résultat ({expires.length})
          </h2>
          <p className="text-[11px] text-neutral-400">
            Appels d&apos;offres dont la deadline est passée, en attente d&apos;attribution
          </p>
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
              <div className="space-y-2">
                {col.aos.length === 0 && (
                  <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-400">
                    Aucun AO en attente
                  </div>
                )}
                {col.aos.map((ao) => (
                  <ExpiresCard key={ao.id} ao={ao} metier={col.metier} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function ExpiresCard({ ao, metier }: { ao: AO; metier: typeof METIERS[number] }) {
  const daysAgo = ao.deadline
    ? Math.ceil((Date.now() - new Date(ao.deadline).getTime()) / 86_400_000)
    : null;

  return (
    <div className={`border-l-4 ${metier.accent} rounded-r-lg bg-white border border-neutral-200 p-3 opacity-80`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[13px] leading-snug text-neutral-700 line-clamp-2 flex-1">
          {ao.titre}
        </h3>
        <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-medium">
          en attente
        </span>
      </div>

      {ao.acheteur && (
        <p className="mt-0.5 text-[11px] text-neutral-500">{ao.acheteur}</p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ao.deadline && (
          <span className="inline-flex items-center rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-inset ring-neutral-200">
            Clos le {new Date(ao.deadline).toLocaleDateString("fr-FR")}
            {daysAgo != null && ` (il y a ${daysAgo}j)`}
          </span>
        )}
        {ao.montant_estime != null && (
          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-inset ring-green-200">
            {fmt(Number(ao.montant_estime))}
          </span>
        )}
      </div>

      {(ao.url_dce || ao.url_dce_telechargement) && (
        <div className="mt-2 flex gap-3 border-t border-neutral-100 pt-2">
          {ao.url_dce && (
            <a href={ao.url_dce} target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-medium text-cf-blue hover:underline">
              Avis BOAMP &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  );
}
