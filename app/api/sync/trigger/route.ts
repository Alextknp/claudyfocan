import { NextResponse } from "next/server";

/**
 * POST /api/sync/trigger
 * Proxy côté serveur pour déclencher le daily-sync manuellement.
 * Pas d'auth client : le secret CRON_SECRET reste côté serveur.
 * POC usage interne (5 users).
 */
export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3002";

  const cronUrl = `${baseUrl}/api/cron/daily-sync`;

  try {
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
