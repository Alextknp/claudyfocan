import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { AO_FIELDS, parseCompanies, fmt, fetchAO } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";

export default async function AcheteurPage({
  params,
}: {
  params: Promise<{ nom: string }>;
}) {
  const { nom } = await params;
  const acheteurName = decodeURIComponent(nom);
  const supabase = createServerClient();

  // Get aoCount for Nav
  const ouverts = await fetchAO(supabase, "ouvert");
  const now = new Date();
  const enCours = ouverts.filter(
    (ao) => !ao.deadline || new Date(ao.deadline) >= now
  );

  // Fetch all AO for this acheteur
  const allAO: AO[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("appels_offres")
      .select(AO_FIELDS)
      .eq("departement", "34")
      .ilike("acheteur", acheteurName)
      .order("date_pub", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    allAO.push(...(data as unknown as AO[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const aoOuverts = allAO.filter((ao) => ao.statut === "ouvert");
  const aoAttribues = allAO.filter((ao) => ao.statut === "attribue");
  const aoClos = allAO.filter((ao) => ao.statut === "clos");
  const aoAnnules = allAO.filter((ao) => ao.statut === "annule");

  // Compute segments from CPV codes
  const allCpv = new Set<string>();
  for (const ao of allAO) {
    for (const c of ao.cpv_codes ?? []) {
      allCpv.add(c);
    }
  }

  // Descripteurs uniques
  const allDescripteurs = new Set<string>();
  for (const ao of allAO) {
    for (const d of ao.descripteur_libelle ?? []) {
      allDescripteurs.add(d);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav aoCount={enCours.length} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-neutral-800 mb-1">{acheteurName}</h1>
        <p className="text-[11px] text-neutral-400 mb-6">Fiche acheteur</p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-neutral-800">{allAO.length}</div>
            <div className="text-xs text-neutral-500 mt-1">Total AO</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-blue-600">{aoOuverts.length}</div>
            <div className="text-xs text-neutral-500 mt-1">En cours</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-purple-600">{aoAttribues.length}</div>
            <div className="text-xs text-neutral-500 mt-1">Attribu&eacute;s</div>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200 p-5">
            <div className="text-3xl font-black text-neutral-400">{aoClos.length}</div>
            <div className="text-xs text-neutral-500 mt-1">Clos</div>
          </div>
        </div>

        {/* Descripteurs */}
        {allDescripteurs.size > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
              Segments concern&eacute;s
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(allDescripteurs).sort().slice(0, 20).map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-600"
                >
                  {d}
                </span>
              ))}
              {allDescripteurs.size > 20 && (
                <span className="text-[10px] text-neutral-400 self-center">
                  +{allDescripteurs.size - 20} autres
                </span>
              )}
            </div>
          </div>
        )}

        {/* En cours */}
        {aoOuverts.length > 0 && (
          <AOSection title="En cours" aos={aoOuverts} badgeCls="bg-blue-100 text-blue-700" badgeLabel="ouvert" />
        )}

        {/* Attribues */}
        {aoAttribues.length > 0 && (
          <AOSection title="Attribu&eacute;s" aos={aoAttribues} badgeCls="bg-purple-100 text-purple-700" badgeLabel="attribu&eacute;" showLots />
        )}

        {/* Clos */}
        {aoClos.length > 0 && (
          <AOSection title="Clos" aos={aoClos} badgeCls="bg-neutral-100 text-neutral-600" badgeLabel="clos" />
        )}

        {/* Annules */}
        {aoAnnules.length > 0 && (
          <AOSection title="Annul&eacute;s" aos={aoAnnules} badgeCls="bg-red-100 text-red-600" badgeLabel="annul&eacute;" />
        )}

        {allAO.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-xs text-neutral-400">
            Aucun appel d&apos;offres trouv&eacute; pour cet acheteur
          </div>
        )}
      </div>
    </main>
  );
}

function AOSection({
  title,
  aos,
  badgeCls,
  badgeLabel,
  showLots,
}: {
  title: string;
  aos: AO[];
  badgeCls: string;
  badgeLabel: string;
  showLots?: boolean;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
        {title} ({aos.length})
      </h2>
      <div className="space-y-2">
        {aos.map((ao) => (
          <div
            key={ao.id}
            className="rounded-lg bg-white border border-neutral-200 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-[13px] leading-snug text-neutral-800 line-clamp-2 flex-1">
                {ao.titre}
              </h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}
              >
                {badgeLabel}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-neutral-400">
              Publi&eacute; le {new Date(ao.date_pub).toLocaleDateString("fr-FR")}
              {ao.deadline && (
                <span>
                  {" "}&middot; Limite : {new Date(ao.deadline).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>

            {showLots && ao.lots?.length > 0 && (
              <div className="mt-2 space-y-1">
                {ao.lots.map((lot, idx) => {
                  const companies = parseCompanies(lot.nom);
                  const lotLabel = lot.nom.includes("\u2192")
                    ? lot.nom.slice(0, lot.nom.indexOf("\u2192")).trim()
                    : lot.nom;
                  return (
                    <div key={`${lot.num}-${idx}`} className="bg-neutral-50 rounded px-2.5 py-1.5">
                      <div className="text-[11px] font-medium text-neutral-700">
                        {lotLabel}
                      </div>
                      {companies.length > 0 && (
                        <div className="text-[11px] text-purple-700 mt-0.5">
                          &rarr; {companies.join(", ")}
                        </div>
                      )}
                      {lot.montant != null && (
                        <span className="text-[11px] font-semibold text-green-700">
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
                  <a
                    href={ao.url_dce}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-cf-blue hover:underline"
                  >
                    BOAMP &rarr;
                  </a>
                )}
                {ao.url_dce_telechargement && (
                  <a
                    href={ao.url_dce_telechargement}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-cf-blue hover:underline"
                  >
                    DCE &rarr;
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
