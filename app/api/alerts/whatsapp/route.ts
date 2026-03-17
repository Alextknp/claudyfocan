import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/alerts/whatsapp
 * Envoie les alertes WhatsApp quotidiennes à chaque utilisateur.
 * Chaque user reçoit les AO du jour qui matchent ses CPV codes.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-api-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch tous les users
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("*");

  if (usersErr || !users) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  // Fetch les AO du jour
  const { data: appels, error: aoErr } = await supabase
    .from("appels_offres")
    .select("*")
    .eq("date_pub", today);

  if (aoErr) {
    return NextResponse.json({ error: "Failed to fetch AO" }, { status: 500 });
  }

  const results: Array<{ user: string; sent: number }> = [];

  for (const user of users) {
    // Filtrer les AO qui matchent les CPV du user
    const matching = (appels ?? []).filter((ao) =>
      ao.cpv_codes?.some((cpv: string) =>
        (user.cpv_codes as string[]).some((uCpv: string) =>
          cpv.startsWith(uCpv)
        )
      )
    );

    if (matching.length === 0) {
      results.push({ user: user.nom, sent: 0 });
      continue;
    }

    // Build message
    const lines = matching.map(
      (ao, i: number) =>
        `${i + 1}. *${ao.titre}*\n   📍 ${ao.departement ?? "?"} · ⏰ ${ao.deadline ? new Date(ao.deadline).toLocaleDateString("fr-FR") : "?"}\n   ${ao.url_dce ?? ""}`
    );

    const message = [
      `🔔 *Claudy Focan — ${matching.length} AO pour toi*`,
      "",
      ...lines,
      "",
      `_"Pas de bras, pas de chocolat."_`,
    ].join("\n");

    // Send via Twilio WhatsApp
    await sendWhatsApp(user.whatsapp as string, message);
    results.push({ user: user.nom, sent: matching.length });
  }

  return NextResponse.json({ results });
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // "whatsapp:+14155238886"

  if (!accountSid || !authToken || !from) {
    console.warn("[whatsapp] Twilio not configured, skipping");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: from,
    To: `whatsapp:${to}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[whatsapp] Failed to send to ${to}:`, err);
  }
}
