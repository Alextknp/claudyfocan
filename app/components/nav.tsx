"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getQuote } from "@/lib/quotes";

const LINKS = [
  { href: "/en-cours", label: "En cours" },
  { href: "/expires", label: "En attente" },
  { href: "/attribues", label: "Attribués" },
  { href: "/competition", label: "Compétition" },
];

export default function Nav({ aoCount }: { aoCount: number }) {
  const pathname = usePathname();
  const quote = getQuote(pathname);

  return (
    <>
      <header className="bg-white border-b border-neutral-200 px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/claudy.gif"
              alt="Claudy Focan"
              width={40}
              height={40}
              className="rounded-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div>
              <div className="text-lg font-black tracking-tight">Mr. Claudy Focan</div>
              <div className="text-[10px] text-neutral-400">
                Hérault (34) &middot; {aoCount} AO ouverts
              </div>
            </div>
          </Link>
          <span className="text-[11px] text-neutral-400 italic hidden sm:block max-w-xs text-right">
            &laquo; {quote} &raquo;
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
