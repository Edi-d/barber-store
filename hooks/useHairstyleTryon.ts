import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_MODEL = 'gemini-3-pro-image-preview';
const COST_PER_IMAGE_USD = 0.134; // ~1K-2K resolution
const TIMEOUT_MS = 30_000;

async function logApiUsage(opts: {
  userId: string | undefined;
  status: 'success' | 'error' | 'blocked';
  errorMessage?: string;
}) {
  if (!opts.userId) return;
  try {
    await supabase.from('api_usage_logs').insert({
      user_id: opts.userId,
      model: GEMINI_MODEL,
      feature: 'hairstyle_tryon',
      image_count: 1,
      estimated_cost_usd: opts.status === 'success' ? COST_PER_IMAGE_USD : 0,
      status: opts.status,
      error_message: opts.errorMessage ?? null,
    });
  } catch {
    // Silent — logging should never break the UX
  }
}

interface UseHairstyleTryonReturn {
  selfieUri: string | null;
  resultImageUri: string | null;
  isGenerating: boolean;
  error: string | null;
  isBlocked: boolean;
  pickSelfie: () => Promise<boolean>;
  pickFromGallery: () => Promise<boolean>;
  generatePreview: (hairstyleName: string, hairstylePrompt: string) => Promise<void>;
  reset: () => void;
  retake: () => void;
}

export function useHairstyleTryon(): UseHairstyleTryonReturn {
  const { session } = useAuthStore();
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [resultImageUri, setResultImageUri] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const pickSelfie = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsBlocked(false);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setError("Permite accesul la cameră din Setări");
      return false;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return false;
    }

    const asset = result.assets[0];
    setSelfieUri(asset.uri);
    setSelfieBase64(asset.base64 ?? null);
    setResultImageUri(null);
    return true;
  }, []);

  const pickFromGallery = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsBlocked(false);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("Permite accesul la galerie din Setări");
      return false;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return false;
    }

    const asset = result.assets[0];
    setSelfieUri(asset.uri);
    setSelfieBase64(asset.base64 ?? null);
    setResultImageUri(null);
    return true;
  }, []);

  const generatePreview = useCallback(
    async (hairstyleName: string, hairstylePrompt: string): Promise<void> => {
      if (!selfieBase64) {
        setError("Fă o poză mai întâi.");
        return;
      }

      if (!GEMINI_API_KEY) {
        setError("Cheia API Gemini nu este configurată. Adaugă EXPO_PUBLIC_GEMINI_API_KEY în .env");
        return;
      }

      setIsGenerating(true);
      setError(null);
      setIsBlocked(false);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const prompt = `You are a professional hairstyle visualization tool for a barber app.
Apply a ${hairstyleName} hairstyle to this person's photo.
${hairstylePrompt}
Keep all facial features, skin tone, clothing, and background exactly the same.
Only modify the hair. The result should look photorealistic.`;

        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: selfieBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];

        if (!candidate) {
          throw new Error("Gemini nu a returnat niciun rezultat.");
        }

        if (candidate.finishReason === "SAFETY") {
          setIsBlocked(true);
          setError("Nu am putut genera previzualizarea. Încearcă altă poză.");
          logApiUsage({ userId: session?.user.id, status: 'blocked', errorMessage: 'SAFETY block' });
          return;
        }

        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> =
          candidate?.content?.parts ?? [];

        const imagePart = parts.find((p) => p.inlineData);

        if (!imagePart?.inlineData) {
          throw new Error("Gemini nu a returnat o imagine generată.");
        }

        const { mimeType, data: imgBase64 } = imagePart.inlineData;
        setResultImageUri(`data:${mimeType};base64,${imgBase64}`);
        logApiUsage({ userId: session?.user.id, status: 'success' });
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        const errMsg = err instanceof Error ? err.message : "Unknown error";
        if (err instanceof Error && err.name === "AbortError") {
          setError("Generarea a durat prea mult. Încearcă din nou.");
        } else if (err instanceof Error) {
          setError(err.message || "A apărut o eroare. Încearcă din nou.");
        } else {
          setError("A apărut o eroare. Încearcă din nou.");
        }
        logApiUsage({ userId: session?.user.id, status: 'error', errorMessage: errMsg });
      } finally {
        setIsGenerating(false);
      }
    },
    [selfieBase64]
  );

  const reset = useCallback(() => {
    setSelfieUri(null);
    setSelfieBase64(null);
    setResultImageUri(null);
    setIsGenerating(false);
    setError(null);
    setIsBlocked(false);
  }, []);

  const retake = useCallback(() => {
    setSelfieUri(null);
    setSelfieBase64(null);
    setResultImageUri(null);
    setError(null);
    setIsBlocked(false);
  }, []);

  return {
    selfieUri,
    resultImageUri,
    isGenerating,
    error,
    isBlocked,
    pickSelfie,
    pickFromGallery,
    generatePreview,
    reset,
    retake,
  };
}
