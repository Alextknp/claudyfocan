import Link from "next/link";

const METIERS = [
  { nom: "Menuiserie bois", cpv: "45421000", emoji: "🪵" },
  { nom: "Portes & Fenêtres", cpv: "45421100", emoji: "🚪" },
  { nom: "Cloisons / Plâtrerie", cpv: "45410000", emoji: "🧱" },
  { nom: "Faux plafonds", cpv: "45451000", emoji: "⬜" },
  { nom: "Géomètre expert", cpv: "71250000", emoji: "📐" },
  { nom: "AMO", cpv: "71520000", emoji: "📋" },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-4">
        Claudy Focan
      </h1>
      <p className="text-lg text-neutral-600 text-center max-w-xl mb-12">
        Veille automatique des appels d&apos;offres publics bâtiment.
        <br />
        <span className="text-sm text-neutral-400">
          &laquo; Moi c&apos;est Claudy, je fais la veille. &raquo;
        </span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl w-full">
        {METIERS.map((m) => (
          <Link
            key={m.cpv}
            href={`/appels?cpv=${m.cpv}`}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 transition-colors hover:border-cf-blue hover:bg-blue-50"
          >
            <span className="text-2xl">{m.emoji}</span>
            <div>
              <div className="font-semibold text-sm">{m.nom}</div>
              <div className="text-xs text-neutral-400">CPV {m.cpv}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-16 text-xs text-neutral-400 text-center">
        Source : BOAMP API · Mis à jour quotidiennement
      </div>
    </main>
  );
}
