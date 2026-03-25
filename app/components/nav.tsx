"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useCallback, type FormEvent } from "react";
import { getQuote } from "@/lib/quotes";

interface NavLink {
  href: string;
  label: string;
  countKey: "enCours" | "enAttente" | "attribues" | "competition";
}

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

export interface NavCounts {
  enCours: number;
  enAttente: number;
  attribues: number;
  competition: number;
  lastUpdate: string | null;
}

const LINKS: NavLink[] = [
  { href: "/en-cours", label: "En cours", countKey: "enCours" },
  { href: "/expires", label: "En attente", countKey: "enAttente" },
  { href: "/attribues", label: "Attribués", countKey: "attribues" },
  { href: "/competition", label: "Compétition", countKey: "competition" },
];

function useUpdateStatus(lastUpdate: string | null) {
  return useMemo(() => {
    if (!lastUpdate) return { label: null, cls: "text-neutral-400" };
    const dt = new Date(lastUpdate);
    const hoursAgo = (Date.now() - dt.getTime()) / (1000 * 60 * 60);
    const dateStr = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const label = `MAJ ${dateStr} à ${timeStr}`;
    if (hoursAgo > 48) return { label, cls: "text-red-500" };
    if (hoursAgo > 24) return { label, cls: "text-orange-500" };
    return { label, cls: "text-neutral-400" };
  }, [lastUpdate]);
}

function SyncButton({ onSynced }: { onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult(`${data.ao_fetched ?? 0} AO`);
        onSynced();
      } else {
        setResult("Erreur");
      }
    } catch {
      setResult("Erreur");
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 3000);
    }
  }, [onSynced]);

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      title="Forcer la synchronisation BOAMP"
      className="text-[10px] px-2 py-0.5 rounded border border-neutral-200 hover:border-cf-blue hover:text-cf-blue transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
    >
      {syncing ? (
        <span className="inline-flex items-center gap-1">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Sync...
        </span>
      ) : result ? (
        result
      ) : (
        "Sync"
      )}
    </button>
  );
}

export default function Nav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const router = useRouter();
  const quote = getQuote(pathname);
  const updateStatus = useUpdateStatus(counts.lastUpdate);

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
              <div className="text-[10px] text-neutral-400">Directeur &amp; Sales Marketing Manager des Abattoirs d&apos;Anderlecht &middot; Photographe de charme</div>
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
                {l.label} <span className="text-neutral-400 font-normal">({counts[l.countKey].toLocaleString("fr-FR")})</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cf-blue rounded-t" />
                )}
              </Link>
            );
          })}
          <div className="ml-auto flex items-center gap-3">
            {updateStatus.label && (
              <span className={`text-[10px] hidden sm:block whitespace-nowrap ${updateStatus.cls}`}>
                {updateStatus.label}
              </span>
            )}
            <SyncButton onSynced={() => router.refresh()} />
            <SearchInput />
          </div>
        </div>
      </nav>
    </>
  );
}
