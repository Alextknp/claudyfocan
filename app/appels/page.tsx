import { createServerClient } from "@/lib/supabase";

export default async function AppelsPage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string; metier?: string; dept?: string }>;
}) {
  const { codes, metier, dept } = await searchParams;
  const supabase = createServerClient();

  let query = supabase
    .from("appels_offres")
    .select("*")
    .order("date_pub", { ascending: false })
    .limit(50);

  if (codes) {
    const codeList = codes.split(",");
    query = query.overlaps("cpv_codes", codeList);
  }

  // POC : filtre département 34 par défaut
  query = query.eq("departement", dept ?? "34");

  const { data: appels, error } = await query;

  const label = metier ?? "Tous les appels";

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-1">{label}</h1>
      <p className="text-sm text-neutral-500 mb-8">
        Derniers appels d&apos;offres publiés — Hérault (34)
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-6">
          Erreur : {error.message}
        </div>
      )}

      {!error && (!appels || appels.length === 0) && (
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-8 text-center text-neutral-500">
          Aucun appel d&apos;offres pour le moment.
          <br />
          <span className="text-xs">Claudy est en train de faire sa ronde...</span>
        </div>
      )}

      {appels && appels.length > 0 && (
        <div className="space-y-3">
          {appels.map((ao) => (
            <div
              key={ao.id}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-sm leading-snug">
                    {ao.titre}
                  </h2>
                  {ao.acheteur && (
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {ao.acheteur}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                    {ao.deadline && (
                      <span>
                        Limite :{" "}
                        {new Date(ao.deadline).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    {ao.montant_estime && (
                      <span className="font-medium text-neutral-700">
                        {Number(ao.montant_estime).toLocaleString("fr-FR")} &euro;
                      </span>
                    )}
                    {ao.type_marche && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {ao.type_marche}
                      </span>
                    )}
                    {ao.type_procedure && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                        {ao.type_procedure}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ao.statut === "ouvert"
                      ? "bg-green-100 text-green-700"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {ao.statut}
                </span>
              </div>
              {/* Lots */}
              {ao.lots?.length > 0 && (
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                    {ao.lots.length} lot{ao.lots.length > 1 ? "s" : ""}
                  </div>
                  <div className="space-y-1">
                    {ao.lots.map((lot: { num: string; nom: string; montant: number | null }) => (
                      <div
                        key={lot.num}
                        className="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="text-neutral-600 min-w-0 truncate">
                          {lot.nom}
                        </span>
                        {lot.montant && (
                          <span className="shrink-0 font-medium text-neutral-700">
                            {Number(lot.montant).toLocaleString("fr-FR")} &euro;
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-3">
                {ao.url_dce && (
                  <a
                    href={ao.url_dce}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-cf-blue hover:underline"
                  >
                    Avis BOAMP &rarr;
                  </a>
                )}
                {ao.url_dce_telechargement && (
                  <a
                    href={ao.url_dce_telechargement}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-cf-blue hover:underline"
                  >
                    DCE &rarr;
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
