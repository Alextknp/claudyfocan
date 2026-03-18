"use client";

import { usePathname } from "next/navigation";
import { getGif, getQuote } from "@/lib/quotes";

export default function Footer() {
  const pathname = usePathname();
  const gif = getGif(pathname);
  const quote = getQuote(pathname);

  return (
    <footer className="mt-12 border-t border-neutral-200 bg-white">
      <div className="max-w-[1400px] mx-auto px-6 py-8 flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gif}
          alt="Claudy Focan"
          className="rounded-xl shadow-lg max-h-48 object-contain"
        />
        <p className="text-sm text-neutral-500 italic text-center">
          &laquo; {quote} &raquo;
        </p>
        <div className="text-[10px] text-neutral-300 text-center">
          Source : BOAMP + DECP &middot; Hérault (34) &middot; Mr. Claudy Focan
        </div>
      </div>
    </footer>
  );
}
