import { createServerClient } from "@/lib/supabase";

const CPV_LABELS: Record<string, string> = {
  "45421000": "Menuiserie bois",
  "45421100": "Portes & Fenêtres",
  "45410000": "Cloisons / Plâtrerie",
  "45451000": "Faux plafonds",
  "71250000": "Géomètre expert",
  "71520000": "AMO",
};

export default async function AppelsPage({
  searchParams,
}: {
  searchParams: Promise<{ cpv?: string }>;
}) {
  const { cpv } = await searchParams;
  const supabase = createServerClient();

  let query = supabase
    .from("appels_offres")
    .select("*")
    .order("date_pub", { ascending: false })
    .limit(50);

  if (cpv) {
    query = query.contains("cpv_codes", [cpv]);
  }

  const { data: appels, error } = await query;

  const label = cpv ? CPV_LABELS[cpv] ?? `CPV ${cpv}` : "Tous les appels";

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-1">{label}</h1>
      <p className="text-sm text-neutral-500 mb-8">
        Derniers appels d&apos;offres publiés
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
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm leading-snug">
                    {ao.titre}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                    <span>{ao.departement}</span>
                    {ao.deadline && (
                      <span>
                        Limite :{" "}
                        {new Date(ao.deadline).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    <span>BOAMP {ao.boamp_id}</span>
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
              {ao.url_dce && (
                <a
                  href={ao.url_dce}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs font-medium text-cf-blue hover:underline"
                >
                  Voir le DCE &rarr;
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
