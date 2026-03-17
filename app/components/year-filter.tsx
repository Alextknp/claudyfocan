"use client";

import Link from "next/link";

export function YearFilter({
  years,
  current,
  basePath,
}: {
  years: string[];
  current: string;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={basePath}
        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
          current === "all"
            ? "bg-cf-blue text-white"
            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
        }`}
      >
        Tout
      </Link>
      {years.map((y) => (
        <Link
          key={y}
          href={`${basePath}?year=${y}`}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
            current === y
              ? "bg-cf-blue text-white"
              : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
          }`}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
