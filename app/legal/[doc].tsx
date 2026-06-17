import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Bubble } from "@/constants/theme";

/**
 * Embedded viewer for the legal/policy pages published on barber-store.ro.
 * Each entry maps a stable slug (used in the route, e.g. /legal/terms) to the
 * canonical URL + a Romanian title shown in the header. URLs are stored
 * percent-encoded so non-ASCII paths (e.g. "politică-de-service") load as-is.
 */
const DOCS = {
  terms: {
    title: "Termeni și condiții",
    url: "https://barber-store.ro/termeni-si-conditii",
  },
  privacy: {
    title: "Politica de confidențialitate",
    url: "https://barber-store.ro/politica-confidentialitate",
  },
  returns: {
    title: "Retur produse",
    url: "https://barber-store.ro/retur-produse",
  },
  service: {
    title: "Politică de service",
    url: "https://barber-store.ro/politic%C4%83-de-service",
  },
  shipping: {
    title: "Livrare și plată",
    url: "https://barber-store.ro/livrare-si-plata",
  },
} as const;

export type LegalDoc = keyof typeof DOCS;

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const entry = useMemo(() => DOCS[doc as LegalDoc], [doc]);

  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const title = entry?.title ?? "Document";

  return (
    <SafeAreaView style={s.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      {/* Body */}
      <View style={s.body}>
        {!entry ? (
          <ErrorState
            message="Documentul nu a putut fi găsit."
            onRetry={() => router.back()}
            retryLabel="Înapoi"
          />
        ) : errored ? (
          <ErrorState
            message="Nu am putut încărca pagina. Verifică conexiunea la internet."
            onRetry={() => {
              setErrored(false);
              setLoading(true);
              webRef.current?.reload();
            }}
            retryLabel="Reîncearcă"
            onOpenExternal={() => Linking.openURL(entry.url)}
          />
        ) : (
          <>
            <WebView
              ref={webRef}
              source={{ uri: entry.url }}
              originWhitelist={["https://*"]}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setErrored(true);
              }}
              onHttpError={({ nativeEvent }) => {
                // Only fail on the main document — Android also reports failed
                // subresources (analytics, fonts) here, which we must ignore.
                if (nativeEvent.url === entry.url && nativeEvent.statusCode >= 400) {
                  setLoading(false);
                  setErrored(true);
                }
              }}
              startInLoadingState={false}
              style={s.webview}
            />
            {loading && (
              <View style={s.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function ErrorState({
  message,
  onRetry,
  retryLabel,
  onOpenExternal,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  onOpenExternal?: () => void;
}) {
  return (
    <View style={s.errorWrap}>
      <Ionicons name="cloud-offline-outline" size={48} color={Colors.textTertiary} />
      <Text style={s.errorText}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.8 }]}
      >
        <Text style={s.retryLabel}>{retryLabel}</Text>
      </Pressable>
      {onOpenExternal && (
        <Pressable
          onPress={onOpenExternal}
          style={({ pressed }) => [s.externalBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.externalLabel}>Deschide în browser</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(10,102,194,0.18)",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "EuclidCircularA-Bold",
    fontSize: 20,
    color: "#1E293B",
    textAlign: "center",
    marginHorizontal: 8,
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    fontFamily: "EuclidCircularA-Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
    borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
    borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
    borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
  },
  retryLabel: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 15,
    color: Colors.white,
  },
  externalBtn: {
    paddingVertical: 6,
  },
  externalLabel: {
    fontFamily: "EuclidCircularA-Medium",
    fontSize: 14,
    color: Colors.primaryLight,
  },
});
