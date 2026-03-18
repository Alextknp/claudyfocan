import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import Nav from "@/app/components/nav";
import { AO_FIELDS, normalizeCompanyName, parseCompanies, fetchAO, fetchNavCounts } from "@/lib/metiers";
import type { AO } from "@/lib/metiers";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = createServerClient();

  const navCounts = await fetchNavCounts(supabase);

  if (!query) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Nav counts={navCounts} />
        <div className="max-w-[1400px] mx-auto px-4 py-12 text-center">
          <h1 className="text-lg font-bold text-neutral-700 mb-2">Recherche</h1>
          <p className="text-sm text-neutral-500">Entrez un terme pour rechercher des appels d&apos;offres ou acheteurs.</p>
        </div>
      </main>
    );
  }

  // Search AO by titre, acheteur, and lot names using ilike
  const pattern = `%${query}%`;
  const results: AO[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("appels_offres")
      .select(AO_FIELDS)
      .eq("departement", "34")
      .or(`titre.ilike.${pattern},acheteur.ilike.${pattern}`)
      .order("date_pub", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    results.push(...(data as unknown as AO[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Deduplicate by id (in case of overlap)
  const seen = new Set<string>();
  const aoResults: AO[] = [];
  for (const ao of results) {
    if (!seen.has(ao.id)) {
      seen.add(ao.id);
      aoResults.push(ao);
    }
  }

  // Extract unique acheteurs matching the query
  const acheteurSet = new Map<string, string>(); // lowercase -> original
  for (const ao of aoResults) {
    if (ao.acheteur && ao.acheteur.toLowerCase().includes(query.toLowerCase())) {
      const key = ao.acheteur.toLowerCase();
      if (!acheteurSet.has(key)) {
        acheteurSet.set(key, ao.acheteur);
      }
    }
  }
  // Also search all AO acheteurs for matches (not just the already-returned ones)
  const { data: acheteurData } = await supabase
    .from("appels_offres")
    .select("acheteur")
    .eq("departement", "34")
    .ilike("acheteur", pattern)
    .limit(200);
  if (acheteurData) {
    for (const row of acheteurData) {
      const a = (row as { acheteur: string | null }).acheteur;
      if (a) {
        const key = a.toLowerCase();
        if (!acheteurSet.has(key)) {
          acheteurSet.set(key, a);
        }
      }
    }
  }
  const acheteurs = Array.from(acheteurSet.values()).sort();

  // Extract entreprises from lot names matching query
  const entrepriseSet = new Map<string, { name: string; normalized: string }>();
  // Search in attribues for company names
  const { data: attribData } = await supabase
    .from("appels_offres")
    .select(AO_FIELDS)
    .eq("departement", "34")
    .eq("statut", "attribue")
    .order("date_pub", { ascending: false })
    .limit(2000);
  if (attribData) {
    for (const ao of attribData as unknown as AO[]) {
      if (!ao.lots) continue;
      for (const lot of ao.lots) {
        const companies = parseCompanies(lot.nom);
        for (const c of companies) {
          if (c.toLowerCase().includes(query.toLowerCase())) {
            const norm = normalizeCompanyName(c);
            if (!entrepriseSet.has(norm)) {
              entrepriseSet.set(norm, { name: c, normalized: norm });
            }
          }
        }
      }
    }
  }
  const entreprises = Array.from(entrepriseSet.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const statusBadge = (statut: string) => {
    switch (statut) {
      case "ouvert":
        return "bg-blue-100 text-blue-700";
      case "attribue":
        return "bg-purple-100 text-purple-700";
      case "clos":
        return "bg-neutral-100 text-neutral-600";
      case "annule":
        return "bg-red-100 text-red-600";
      default:
        return "bg-neutral-100 text-neutral-600";
    }
  };

  const statusLabel = (statut: string) => {
    switch (statut) {
      case "ouvert": return "ouvert";
      case "attribue": return "attribu\u00e9";
      case "clos": return "clos";
      case "annule": return "annul\u00e9";
      default: return statut;
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <Nav counts={navCounts} />

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <h1 className="text-sm font-bold text-neutral-700 mb-1">
          Recherche : &laquo; {query} &raquo;
        </h1>
        <p className="text-[11px] text-neutral-400 mb-6">
          {aoResults.length} AO, {acheteurs.length} acheteur{acheteurs.length > 1 ? "s" : ""}, {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""}
        </p>

        {/* Acheteurs section */}
        {acheteurs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
              Acheteurs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {acheteurs.map((a) => (
                <Link
                  key={a}
                  href={`/acheteur/${encodeURIComponent(a)}`}
                  className="rounded-lg bg-white border border-neutral-200 px-4 py-2.5 text-[13px] text-neutral-700 hover:border-cf-blue hover:text-cf-blue transition-colors truncate"
                >
                  {a}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Entreprises section */}
        {entreprises.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
              Entreprises
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {entreprises.map((e) => (
                <Link
                  key={e.normalized}
                  href={`/competition/${encodeURIComponent(e.normalized)}`}
                  className="rounded-lg bg-white border border-neutral-200 px-4 py-2.5 text-[13px] text-neutral-700 hover:border-purple-400 hover:text-purple-700 transition-colors truncate"
                >
                  {e.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AO results */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">
            Appels d&apos;offres ({aoResults.length})
          </h2>
          {aoResults.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-xs text-neutral-400">
              Aucun appel d&apos;offres trouv&eacute;
            </div>
          ) : (
            <div className="space-y-2">
              {aoResults.slice(0, 50).map((ao) => (
                <div
                  key={ao.id}
                  className="rounded-lg bg-white border border-neutral-200 p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-[13px] leading-snug text-neutral-800 line-clamp-2 flex-1">
                      {ao.titre}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(ao.statut)}`}
                    >
                      {statusLabel(ao.statut)}
                    </span>
                  </div>
                  {ao.acheteur && (
                    <Link
                      href={`/acheteur/${encodeURIComponent(ao.acheteur)}`}
                      className="mt-0.5 text-[11px] text-neutral-500 hover:text-cf-blue transition-colors block"
                    >
                      {ao.acheteur}
                    </Link>
                  )}
                  <div className="mt-1 text-[10px] text-neutral-400">
                    {new Date(ao.date_pub).toLocaleDateString("fr-FR")}
                    {ao.deadline && (
                      <span>
                        {" "}&middot; Limite : {new Date(ao.deadline).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {aoResults.length > 50 && (
                <p className="text-[11px] text-neutral-400 italic text-center py-2">
                  et {aoResults.length - 50} autres r&eacute;sultats...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
