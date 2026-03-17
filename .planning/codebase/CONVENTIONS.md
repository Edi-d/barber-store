# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- Component files: PascalCase (e.g., `FeedCard.tsx`, `StoriesRow.tsx`, `AuthBackground.tsx`)
- Store files: camelCase with "Store" suffix (e.g., `authStore.ts`, `cartStore.ts`)
- Library/utility files: camelCase (e.g., `supabase.ts`, `utils.ts`, `booking.ts`)
- Type definition files: database.ts for data models
- Screen/route files: either kebab-case or camelCase depending on folder structure

**Functions:**
- Async functions follow camelCase: `fetchProfile()`, `signIn()`, `updateQty()`
- Event handlers prefixed with `on`: `onPress`, `onSubmit`, `onChangeText`, `onFocus`
- Animation/state mutation functions: `triggerLikeAnimation()`, `handleSwipe()`
- Utility functions: simple lowercase camelCase like `formatPrice()`, `timeAgo()`, `getInitials()`

**Variables:**
- State variables: camelCase (e.g., `isLoading`, `isSubmitting`, `displayLikes`, `focusedField`)
- Boolean flags: prefixed with `is`, `has`, or `show` (e.g., `isLiked`, `hasStory`, `showPassword`)
- Constants (within components/stores): camelCase (e.g., `LIKE_DEBOUNCE_MS`, `SPRING_BOUNCY`)
- Shared/animated values: descriptive camelCase (e.g., `iconScale`, `particleBurst`, `countSlide`)

**Types:**
- Interface names: PascalCase (e.g., `AuthState`, `ButtonProps`, `CartState`, `StoriesRowProps`)
- Union/discriminator types: PascalCase (e.g., `UserRole`, `ContentType`, `LiveStatus`)
- Type aliases for database rows: PascalCase (e.g., `Profile`, `Content`, `Appointment`)
- Extended types with relations: PascalCase with descriptive suffix (e.g., `ContentWithAuthor`, `CartItemWithProduct`)

## Code Style

**Formatting:**
- NativeWind (Tailwind CSS for React Native) is the primary styling approach for UI components
- Inline StyleSheet.create() for component-specific styles that cannot be expressed in Tailwind
- Spaces between logical sections marked with comment dividers like `/* ── Section Name ── */`
- Two-space indentation throughout

**Linting:**
- No explicit ESLint config in root (inherits from Expo's defaults)
- TypeScript strict mode implied by project structure
- TSX/TS files exclusively used throughout codebase

## Import Organization

**Order:**
1. React Native core imports (`react`, `react-native`)
2. React hooks and Context (`useCallback`, `useState`, etc.)
3. Expo packages (`expo-router`, `expo-status-bar`, `expo-haptics`, etc.)
4. Third-party libraries (`zustand`, `@tanstack/react-query`, `react-hook-form`)
5. Internal absolute imports using `@/` alias (`@/stores`, `@/lib`, `@/types`, `@/components`, `@/constants`)
6. Internal relative imports (if needed)

**Path Aliases:**
- `@/` points to project root
- Used consistently for all internal imports: `@/stores/authStore`, `@/lib/utils`, `@/components/ui`, `@/types/database`

**Example from actual code:**
```typescript
import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { useAuthStore } from "@/stores/authStore";
import { Colors, Typography } from "@/constants/theme";
```

## Error Handling

**Patterns:**
- Try-catch blocks in async functions with final cleanup in `finally`
- Error returned in object format: `{ error: Error | null }`
- Functions catching errors and returning them rather than throwing:
  ```typescript
  try {
    const { error } = await supabase.auth.signIn(...);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
  ```
- Null checks before operations: `if (!session) return;`
- Console.error() for logging unexpected errors with context
- State updates wrapped in error handlers to ensure state cleanup:
  ```typescript
  set({ isSubmitting: true });
  try {
    // operation
  } finally {
    set({ isSubmitting: false });
  }
  ```

## Logging

**Framework:** console (native React Native logging)

**Patterns:**
- Prefixed logs with context tags for traceability: `"[AUTH] Session:"`, `"[AUTH] Profile after fetch:"`
- console.log() for informational messages (initialization, state changes)
- console.error() for exceptions and failures
- Logs placed at initialization and key state transitions
- Example from `authStore.ts`:
  ```typescript
  console.log("[AUTH] Session:", session ? `User ${session.user.id}` : "null");
  console.log("[AUTH] Profile after fetch:", get().profile?.username ?? "null");
  console.error("Auth initialization error:", error);
  ```

## Comments

**When to Comment:**
- Complex animation logic (e.g., particle trajectories, spring physics)
- Data flow and relational queries
- Non-obvious state management patterns
- Section dividers for grouped functionality

**JSDoc/TSDoc:**
- Not extensively used; inline comments preferred
- Interface/type properties documented inline where clarification needed
- Function behavior inferred from names and type signatures

**Comment Style:**
- Multi-line sections use block comment style: `/* ── Section Name ── */`
- Inline comments use single-line: `// Comment here`

## Function Design

**Size:**
- Prefer small, focused functions
- Async store actions typically 15-30 lines (fetch, update, delete operations)
- Component event handlers 5-15 lines
- Complex logic extracted into separate utility functions

**Parameters:**
- Use typed interfaces for component props rather than spreading
- Async functions accept specific parameters (not big config objects)
- Optional parameters marked with `?` in interfaces
- Default values provided in function signatures or destructuring

**Return Values:**
- Async operations return `Promise<void>` or `Promise<T>`
- Async actions return `{ error: Error | null }` for consumer handling
- Functions returning computed values are suffixed: `totalItems()`, `totalPrice()`
- No implicit undefined returns; explicit returns or void functions

**Example from stores:**
```typescript
// Action method with error handling pattern
updateProfile: async (updates: Partial<Profile>) => {
  const { session } = get();
  if (!session) return { error: new Error("Not authenticated") };

  try {
    const { error } = await supabase.from("profiles").update(updates).eq("id", session.user.id);
    if (error) throw error;
    await get().fetchProfile();
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
```

## Module Design

**Exports:**
- Named exports for components, stores, utilities
- Component files export single default component with display name set
- Stores export single create() instance as named export with `use` prefix
- Utility files export named functions
- Types exported as named exports from `types/database.ts`

**Barrel Files:**
- `components/ui/index.ts` re-exports UI components for convenience imports
- Example: `export { Button } from "./Button"; export { Input } from "./Input";`
- Reduces import path verbosity: `import { Button, Input } from "@/components/ui"`

**Component Structure:**
- Props interface defined at top
- Component declared with forwardRef if needs ref support
- Styled with forwardRef + displayName pattern
- StyleSheet.create() at bottom for inline styles
- Conditional rendering with ternary operators for variants

---

*Convention analysis: 2026-03-17*
