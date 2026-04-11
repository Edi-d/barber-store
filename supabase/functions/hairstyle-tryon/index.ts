import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const { imageBase64, hairstyleName, hairstylePrompt } = await req.json();

    if (!imageBase64 || !hairstyleName || !hairstylePrompt) {
      return new Response(
        JSON.stringify({
          error:
            "imageBase64, hairstyleName, and hairstylePrompt are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify Gemini API key is configured
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build prompt
    const prompt = `You are a professional hairstyle visualization tool for a barber app.
Apply a ${hairstyleName} hairstyle to this person's photo.
${hairstylePrompt}
Keep all facial features, skin tone, clothing, and background exactly the same.
Only modify the hair. The result should look photorealistic.`;

    // Detect image mime type from base64 header or default to jpeg
    let mimeType = "image/jpeg";
    if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
      }
    }

    // Strip data URI prefix if present
    const rawBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    // Call Gemini API
    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: rawBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return new Response(
        JSON.stringify({
          error: `Gemini API error: ${geminiResponse.status} ${errorText}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiResponse.json();

    // Check for safety block
    const candidate = geminiData?.candidates?.[0];
    if (!candidate) {
      return new Response(
        JSON.stringify({ error: "No response candidates returned by Gemini" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (candidate.finishReason === "SAFETY") {
      return new Response(
        JSON.stringify({
          error:
            "The request was blocked by Gemini safety filters. Please try a different image or hairstyle.",
          blocked: true,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract generated image and optional text description from parts
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> =
      candidate?.content?.parts ?? [];

    const imagePart = parts.find((p) => p.inlineData);
    const textPart = parts.find((p) => p.text);

    if (!imagePart?.inlineData) {
      return new Response(
        JSON.stringify({
          error: "Gemini did not return a generated image",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        imageBase64: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
        ...(textPart?.text ? { description: textPart.text } : {}),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
