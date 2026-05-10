// Force light mode only — no dark mode support in barber-store.
// Matches Tapzi's hooks/use-color-scheme.ts so ported components resolve
// the import without change.
export function useColorScheme() {
  return 'light' as const;
}
