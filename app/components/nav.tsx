"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "En cours" },
  { href: "/expires", label: "En attente" },
  { href: "/attribues", label: "Attribués" },
  { href: "/competition", label: "Compétition" },
];

export default function Nav({ aoCount }: { aoCount: number }) {
  const pathname = usePathname();

  return (
    <>
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-tight">Claudy</h1>
            <span className="text-xs text-neutral-400">
              Hérault (34) &middot; {aoCount} AO ouverts
            </span>
          </div>
          <span className="text-[10px] text-neutral-300 italic hidden sm:block">
            &laquo; Moi c&apos;est Claudy, je fais la veille. &raquo;
          </span>
        </div>
      </header>

      <nav className="sticky top-0 z-10 bg-white border-b border-neutral-200">
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors relative ${
                  active ? "text-cf-blue" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {l.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cf-blue rounded-t" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
