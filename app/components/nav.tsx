"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getQuote } from "@/lib/quotes";

const LINKS = [
  { href: "/en-cours", label: "En cours" },
  { href: "/expires", label: "En attente" },
  { href: "/attribues", label: "Attribués" },
  { href: "/competition", label: "Compétition" },
];

function SearchInput() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center">
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher..."
          className="w-36 sm:w-44 pl-7 pr-2 py-1 text-[11px] rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700 placeholder-neutral-400 focus:outline-none focus:border-cf-blue focus:ring-1 focus:ring-cf-blue/30 transition-colors"
        />
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
    </form>
  );
}

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
              src="/claudy-logo.png"
              alt="Claudy Focan"
              width={44}
              height={44}
              className="rounded-full object-cover border-2 border-neutral-200"
            />
            <div>
              <div className="text-lg font-black tracking-tight">Mr. Claudy Focan</div>
              <div className="text-[10px] text-neutral-400">Architecte d&apos;int&eacute;rieur &amp; Expert en march&eacute;s publics</div>
            </div>
            <div className="hidden sm:block ml-4 text-right">
              <div className="text-sm font-bold text-neutral-800">H&eacute;rault (34)</div>
              <div className="text-xs text-cf-blue font-semibold">{aoCount} AO ouverts</div>
            </div>
          </Link>
          <span className="text-[11px] text-neutral-400 italic hidden sm:block max-w-xs text-right">
            &laquo; {quote} &raquo;
          </span>
        </div>
      </header>

      <nav className="sticky top-0 z-10 bg-white border-b border-neutral-200">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center gap-1">
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
          <div className="ml-auto">
            <SearchInput />
          </div>
        </div>
      </nav>
    </>
  );
}
