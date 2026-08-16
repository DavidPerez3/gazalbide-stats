import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type OutboxRow = {
  id: number;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  route: string;
  tag: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  failure_count: number;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function authorizeDispatcher(
  supabase: ReturnType<typeof createClient>,
  request: Request,
) {
  const { data: currentSecret, error } = await supabase.rpc(
    "notification_push_dispatch_secret",
  );
  if (error) throw error;

  if (!currentSecret) {
    const generated = randomSecret();
    const { error: initError } = await supabase.rpc(
      "notification_initialize_dispatch_secret",
      { p_secret: generated },
    );
    if (initError) throw initError;
    return true;
  }

  return request.headers.get("x-dispatch-key") === currentSecret;
}

async function markOutbox(
  supabase: ReturnType<typeof createClient>,
  id: number,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("notification_outbox")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function ensureVapid(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.rpc("notification_push_server_secrets");
  if (error) throw error;
  if (data?.vapidPrivateKey && data?.vapidPublicKey) return data;

  const generated = webpush.generateVAPIDKeys();
  const { error: initError } = await supabase.rpc("notification_initialize_vapid", {
    p_public_key: generated.publicKey,
    p_private_key: generated.privateKey,
  });
  if (initError) throw initError;

  const { data: initialized, error: readError } = await supabase.rpc(
    "notification_push_server_secrets",
  );
  if (readError) throw readError;
  if (!initialized?.vapidPrivateKey || !initialized?.vapidPublicKey) {
    throw new Error("VAPID initialization failed");
  }
  return initialized;
}

async function sendRow(
  supabase: ReturnType<typeof createClient>,
  row: OutboxRow,
) {
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_secret,failure_count")
    .eq("user_id", row.user_id)
    .eq("active", true);
  if (error) throw error;

  const active = (subscriptions || []) as PushSubscriptionRow[];
  if (!active.length) {
    await markOutbox(supabase, row.id, {
      status: "skipped",
      last_error: "no_active_subscription",
    });
    return { sent: 0, stale: 0, failed: 0 };
  }

  const body = JSON.stringify({
    title: row.title,
    body: row.body,
    route: row.route,
    tag: row.tag || `gazalbide-${row.notification_type}`,
    payload: row.payload || {},
  });

  let sent = 0;
  let stale = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const subscription of active) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth_secret,
          },
        },
        body,
        { TTL: 600, urgency: "high" },
      );
      sent += 1;
      await supabase
        .from("push_subscriptions")
        .update({
          failure_count: 0,
          last_success_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    } catch (pushError) {
      const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0);
      const message = String((pushError as Error)?.message || pushError);
      if (statusCode === 404 || statusCode === 410) {
        stale += 1;
        await supabase
          .from("push_subscriptions")
          .update({
            active: false,
            failure_count: subscription.failure_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
      } else {
        failed += 1;
        errors.push(message.slice(0, 250));
        await supabase
          .from("push_subscriptions")
          .update({
            failure_count: subscription.failure_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
      }
    }
  }

  if (sent > 0) {
    await markOutbox(supabase, row.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: failed ? `partial_failure:${errors.join(" | ")}` : null,
    });
  } else if (failed === 0) {
    await markOutbox(supabase, row.id, {
      status: "skipped",
      last_error: "all_subscriptions_stale",
    });
  } else if (row.attempts < 4) {
    await markOutbox(supabase, row.id, {
      status: "pending",
      claimed_at: null,
      scheduled_for: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: errors.join(" | ").slice(0, 900),
    });
  } else {
    await markOutbox(supabase, row.id, {
      status: "failed",
      last_error: errors.join(" | ").slice(0, 900),
    });
  }

  return { sent, stale, failed };
}

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "server_config_missing" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      if (!(await authorizeDispatcher(supabase, req))) {
        return new Response(JSON.stringify({ error: "unauthorized_dispatch" }), {
          status: 401,
          headers: JSON_HEADERS,
        });
      }

      const vapid = await ensureVapid(supabase);
      webpush.setVapidDetails(
        vapid.vapidSubject,
        vapid.vapidPublicKey,
        vapid.vapidPrivateKey,
      );

      let requestedLimit = 100;
      try {
        const body = await req.json();
        requestedLimit = Number(body?.limit || 100);
      } catch {
        // Default batch size is fine.
      }
      const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 100, 250));

      const { data: batch, error: claimError } = await supabase.rpc(
        "claim_push_notification_batch",
        { p_limit: limit },
      );
      if (claimError) throw claimError;

      const summary = { claimed: batch?.length || 0, sent: 0, stale: 0, failed: 0 };
      for (const row of (batch || []) as OutboxRow[]) {
        const result = await sendRow(supabase, row);
        summary.sent += result.sent;
        summary.stale += result.stale;
        summary.failed += result.failed;
      }

      return new Response(JSON.stringify({ ok: true, ...summary }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    } catch (error) {
      console.error("push-dispatch failed", error);
      return new Response(
        JSON.stringify({ error: "push_dispatch_failed", detail: String((error as Error)?.message || error) }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
  },
};
