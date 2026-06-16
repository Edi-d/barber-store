import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Permanently deletes the calling user's account.
//
// The client cannot remove its own `auth.users` row, so this runs with the
// service role. `profiles.id` references `auth.users(id) ON DELETE CASCADE` and
// every domain table cascades off `profiles`, so deleting the auth user wipes
// all of the user's data in one shot. Storage objects are NOT covered by the DB
// cascade, so we best-effort remove the user's avatar first.
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller from their JWT. The anon client scoped to the
    // incoming Authorization header resolves exactly one user — the one whose
    // account we are allowed to delete.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for the privileged deletes.
    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Best-effort avatar cleanup (settings.tsx uploads to `avatars/<id>.jpg`).
    // A failure here must not block the account deletion itself.
    try {
      await admin.storage.from("avatars").remove([`avatars/${user.id}.jpg`]);
    } catch (storageErr) {
      console.warn("[delete-account] avatar cleanup failed:", storageErr);
    }

    // Cascades through profiles to all dependent rows.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("[delete-account] deleteUser failed:", deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
