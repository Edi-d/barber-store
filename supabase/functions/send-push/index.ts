import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// send-push — delivers a notification_log row to the user's devices via the
// Expo Push API (https://exp.host/--/api/v2/push/send).
//
// Invoked two ways:
//   1. DB webhook (migration 105 trigger `notification_log_send_push`): fires
//      on every INSERT into notification_log with body
//        { type, table, schema, record: <notification_log row> }
//      authenticated with the service-role key as a Bearer token.
//   2. Direct invocation (campaigns / manual test): POST a body shaped like
//        { user_id, type?, title?, body?, data?, deep_link?, notification_id? }
//      — also requires the service-role Bearer token.
//
// Gating: skips delivery when the user disabled push (user_notification_prefs
// .push_enabled = false) or muted the notification's category. The DB triggers
// do NOT re-check prefs — that contract lives here (see migration 105 header).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─── Notification copy (Romanian — the app's primary locale) ────────────────
// The DB triggers insert i18n keys + params but leave title/body NULL, so the
// human-readable text is rendered here at send time (Expo needs literal
// title/body strings). Unknown types fall back to record.title/body, then to a
// humanized type label — so a new trigger never produces a blank push.

type Params = Record<string, unknown>;

function p(params: Params, key: string, fallback = ""): string {
  const v = params?.[key];
  return v === undefined || v === null ? fallback : String(v);
}

const TEMPLATES: Record<
  string,
  (params: Params) => { title: string; body: string }
> = {
  booking_confirmed: (x) => ({
    title: "Programare confirmată",
    body: `${p(x, "serviceTitle")} la ${p(x, "salonName")} — ${p(x, "time")}.`,
  }),
  booking_received: (x) => ({
    title: "Programare nouă",
    body: `${p(x, "clientName", "Un client")} a rezervat ${p(x, "serviceTitle")} — ${p(x, "time")}.`,
  }),
  booking_cancelled: (x) => ({
    title: "Programare anulată",
    body: `${p(x, "serviceTitle")} la ${p(x, "salonName")} (${p(x, "time")}) a fost anulată.`,
  }),
  package_cancelled: (x) => {
    const n = Number(p(x, "count", "0")) || 0;
    const noun = n === 1 ? "O programare" : `${n} programări`;
    const verb = n === 1 ? "a fost anulată" : "au fost anulate";
    const salon = p(x, "salonName");
    return {
      title: "Pachet anulat",
      body: salon
        ? `${noun} viitoare de la ${salon} ${verb}.`
        : `${noun} viitoare din pachetul tău ${verb}.`,
    };
  },
  booking_rescheduled: (x) => ({
    title: "Programare reprogramată",
    body: `${p(x, "serviceTitle")} la ${p(x, "salonName")} a fost mutată la ${p(x, "newTime")}.`,
  }),
  booking_reminder_24h: (x) => ({
    title: "Mâine ai programare",
    body: `${p(x, "serviceTitle")} la ${p(x, "salonName")}, ${p(x, "time")}.`,
  }),
  booking_reminder_1h: (x) => ({
    title: "Programarea ta începe curând",
    body: `${p(x, "serviceTitle")} la ${p(x, "salonName")} la ${p(x, "time")}.`,
  }),
  live_starting: (x) => ({
    title: `${p(x, "hostName", "Cineva")} e live acum`,
    body: p(x, "liveTitle", "Intră să vezi transmisiunea."),
  }),
  new_follower: (x) => ({
    title: "Ai un urmăritor nou",
    body: `${p(x, "followerName", "Cineva")} te urmărește acum.`,
  }),
  review_received: (x) => ({
    title: "Recenzie nouă",
    body: `${p(x, "clientName", "Un client")} ți-a lăsat ${p(x, "rating", "o")} ★.`,
  }),
  loyalty_reward: (x) => ({
    title: "Recompensă disponibilă",
    body: `${p(x, "rewardName", "O recompensă")} la ${p(x, "salonName")}.`,
  }),
  loyalty_tier_up: (x) => ({
    title: "Felicitări! Ai urcat de nivel",
    body: `Ai ajuns la ${p(x, "tierName", "un nou nivel")}.`,
  }),
  loyalty_xp_earned: (x) => {
    // The trigger (migration 112) emits `points` + `total`; earlier callers
    // used `xp`. Accept both so the DB and this function never have to be
    // redeployed in lockstep. Every fragment is optional — a missing param
    // drops its clause instead of rendering an empty gap ("+ XP la .").
    const xp = p(x, "points") || p(x, "xp");
    const salon = p(x, "salonName");
    const total = p(x, "total");

    return {
      title: "Ai câștigat XP",
      body:
        (xp ? `+${xp} XP` : "Ai primit XP") +
        (salon ? ` la ${salon}` : "") +
        "." +
        (total ? ` Total: ${total} XP.` : ""),
    };
  },
};

function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderContent(record: {
  type?: string;
  title?: string | null;
  body?: string | null;
  params?: Params | null;
}): { title: string; body: string } {
  const type = record.type ?? "";
  const tpl = TEMPLATES[type];
  if (tpl) {
    const rendered = tpl(record.params ?? {});
    // Trigger-provided title/body (if any) still win, so campaigns can override.
    return {
      title: record.title || rendered.title,
      body: record.body || rendered.body,
    };
  }
  return {
    title: record.title || humanizeType(type) || "Tapzi",
    body: record.body || "",
  };
}

// ─── Preference gating ──────────────────────────────────────────────────────
// Maps a notification type to the user_notification_prefs column that mutes it.
// Types absent from this map are transactional (booking lifecycle, reviews,
// orders) and are gated only by the master push_enabled switch.

const CATEGORY_COLUMN: Record<string, string> = {
  booking_reminder_24h: "visit_reminders",
  booking_reminder_1h: "visit_reminders",
  loyalty_reward: "reward_alerts",
  loyalty_tier_up: "reward_alerts",
  loyalty_xp_earned: "reward_alerts",
  loyalty_voucher_generated: "reward_alerts",
  loyalty_voucher_redeemed_at_salon: "reward_alerts",
  salon_voucher_redeemed: "reward_alerts",
  marketplace_credit_earned: "reward_alerts",
  new_follower: "promotional",
  live_starting: "promotional",
};

type Prefs = Record<string, unknown> | null;

// Returns true when this type may be delivered for the given prefs row.
function isAllowed(type: string, prefs: Prefs): boolean {
  // No prefs row yet → table defaults are permissive, so allow.
  if (!prefs) return true;
  if (prefs.push_enabled === false) return false;
  const col = CATEGORY_COLUMN[type];
  if (col && prefs[col] === false) return false;
  return true;
}

// Expo accepts max 100 messages per request.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isExpoToken(token: string): boolean {
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Only the DB trigger / privileged callers may invoke this — a normal user's
    // JWT must not be able to fan out pushes — so we check the bearer explicitly.
    // Accept a dedicated shared secret (SEND_PUSH_SECRET) so auth doesn't depend
    // on the runtime's injected service-role key matching the legacy key (they
    // diverge after JWT-secret rotation / the new API-key migration). The
    // service-role key is still accepted as a fallback when they do match.
    const sharedSecret = Deno.env.get("SEND_PUSH_SECRET");
    const auth = req.headers.get("Authorization") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const headerSecret = req.headers.get("x-send-push-secret")?.trim();
    const authorized =
      (!!sharedSecret && (bearer === sharedSecret || headerSecret === sharedSecret)) ||
      (!!serviceKey && bearer === serviceKey);
    if (!authorized) {
      return json(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    // Webhook shape ({ record }) or direct shape (flat fields).
    const record = payload?.record ?? payload;

    const userId: string | undefined = record?.user_id;
    if (!userId) return json(400, { error: "Missing user_id" });

    // Only push-channel rows are delivered here.
    if (record?.channel && record.channel !== "push") {
      return json(200, { skipped: "non-push channel" });
    }

    const type: string = record?.type ?? "";

    // ── Preference gating ──────────────────────────────────────────────────
    const { data: prefs } = await admin
      .from("user_notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!isAllowed(type, prefs)) {
      return json(200, { skipped: "muted by user prefs" });
    }

    // ── Resolve active device tokens ────────────────────────────────────────
    const { data: tokenRows, error: tokenErr } = await admin
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("active", true);

    if (tokenErr) return json(500, { error: tokenErr.message });

    const tokens = (tokenRows ?? [])
      .map((r: { token: string }) => r.token)
      .filter(isExpoToken);

    if (tokens.length === 0) {
      return json(200, { skipped: "no active tokens" });
    }

    // ── Build messages ──────────────────────────────────────────────────────
    // Some triggers record the salon on the row (notification_log.salon_id)
    // rather than in params — the XP trigger does. Backfill `salonName` from
    // the row so any template that wants it can use it, whichever trigger
    // produced the notification. Failure is non-fatal: the templates all
    // degrade to a salon-less phrasing.
    const params: Params = { ...((record?.params as Params) ?? {}) };
    if (!params.salonName && record?.salon_id) {
      const { data: salon } = await admin
        .from("salons")
        .select("name")
        .eq("id", record.salon_id)
        .maybeSingle();
      if (salon?.name) params.salonName = salon.name;
    }

    const { title, body } = renderContent({ ...record, params });

    const data: Params = {
      ...(record?.data ?? {}),
      type,
      notification_id: record?.id ?? payload?.notification_id ?? null,
      deep_link: record?.deep_link ?? payload?.deep_link ?? null,
    };

    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      data,
      sound: "default",
      priority: (record?.priority ?? 0) >= 2 ? "high" : "default",
      channelId: "default",
    }));

    // ── Send (chunked at 100) + collect tickets ─────────────────────────────
    // When "Enhanced Security for Push Notifications" is enabled on the Expo
    // project, the Push API requires an access token as a Bearer credential.
    // Set it as a function secret: `supabase secrets set EXPO_ACCESS_TOKEN=...`.
    // Omitted/empty → no header (fine when push security is off).
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    const expoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    };
    if (expoAccessToken) {
      expoHeaders.Authorization = `Bearer ${expoAccessToken}`;
    }

    const tickets: any[] = [];
    for (const batch of chunk(messages, 100)) {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: expoHeaders,
        body: JSON.stringify(batch),
      });
      const result = await resp.json().catch(() => null);
      if (result?.data) tickets.push(...result.data);
      else console.error("[send-push] Expo error response:", result);
    }

    // ── Prune dead tokens (DeviceNotRegistered) ──────────────────────────────
    // Expo returns one ticket per message, in order. Map error tickets back to
    // the token that produced them and deactivate the unregistered ones.
    const deadTokens: string[] = [];
    tickets.forEach((ticket, i) => {
      if (
        ticket?.status === "error" &&
        ticket?.details?.error === "DeviceNotRegistered" &&
        tokens[i]
      ) {
        deadTokens.push(tokens[i]);
      }
    });

    if (deadTokens.length > 0) {
      await admin
        .from("push_tokens")
        .update({ active: false })
        .in("token", deadTokens);
    }

    return json(200, {
      sent: messages.length,
      tickets: tickets.length,
      deactivated: deadTokens.length,
    });
  } catch (err) {
    console.error("[send-push] unhandled error:", err);
    return json(500, { error: (err as Error).message });
  }
});
