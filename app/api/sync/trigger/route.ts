import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * POST /api/sync/trigger
 * Proxy côté serveur pour déclencher le daily-sync manuellement.
 * Construit l'URL à partir du host de la requête entrante.
 */
export async function POST() {
  try {
    const h = await headers();
    const host = h.get("host") || "localhost:3002";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const cronUrl = `${protocol}://${host}/api/cron/daily-sync`;

    const res = await fetch(cronUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error || "Sync failed" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
