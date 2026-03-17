# Phase 1: Infrastructure Setup - Research

**Researched:** 2026-03-17
**Domain:** Supabase Pro, LiveKit Cloud, EAS Dev Builds
**Confidence:** HIGH

## Summary

Phase 1 is a pure setup phase -- no feature code. Three independent infrastructure tasks must complete: (1) Supabase Pro upgrade with Realtime validation, (2) LiveKit Cloud account creation with credential storage, and (3) EAS development build configuration for both `barber-store` and `tapzi-barber`. All three are independent and can run in parallel.

The existing codebase is well-positioned. Both apps already share the same Supabase project (`iaqztbhkukgghomwnict`). `barber-store` already has an `eas.json` with a `development` profile (with `developmentClient: true`). `tapzi-barber` also has a complete `eas.json` with development, preview, and production profiles. Neither app has `expo-dev-client` installed yet, which is required for LiveKit native modules in later phases. The Supabase client is already configured in both apps.

**Primary recommendation:** Execute all three plans in parallel since they have zero dependencies on each other. The user must manually perform the Supabase Pro upgrade and LiveKit Cloud signup -- these are dashboard/billing actions that cannot be automated by code agents.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Provider: LiveKit Cloud (not Agora)
- Both apps need dev builds (barber-store + tapzi-barber)
- Supabase Pro is required for Realtime
- API keys stored server-side only (Edge Functions for secrets)
- EXPO_PUBLIC_ prefix for client-safe env vars

### Claude's Discretion
- LiveKit Cloud region selection (closest to target users)
- LiveKit project naming convention
- EAS build profile configuration (development, preview, production)
- Supabase Pro validation approach (test subscription on any table)
- LiveKit validation approach (test room creation via API)
- Dev build testing strategy (simulator vs device)
- Environment variable naming and storage (.env files)
- Order of operations (Supabase first vs LiveKit first)

### Execution Pattern: Volt Subagents
ALL implementation work MUST use volt specialized subagents (voltagent-core-dev). GSD orchestrates, volt agents implement:
- `voltagent-core-dev:mobile-developer` -- Expo/EAS config, native module setup, dev build configuration
- `voltagent-core-dev:backend-developer` -- Edge Functions, DB migrations, Supabase server-side
- `voltagent-core-dev:fullstack-developer` -- Features spanning both DB and app config
- Use parallel volt agents when tasks are independent

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Supabase Pro upgrade activat (prerequisite pentru Realtime) | Supabase Pro upgrade is a dashboard action ($25/mo). Realtime validation via postgres_changes subscription test on any existing table. Must ensure table is in `supabase_realtime` publication. |
| INFRA-02 | Expo dev build setup cu EAS pe ambele app-uri (necesar pentru LiveKit native modules) | Both apps need `expo-dev-client` installed. barber-store already has eas.json with dev profile. tapzi-barber already has complete eas.json. LiveKit plugins must be added to app.json. Dev builds via `eas build --profile development`. |
| INFRA-03 | LiveKit Cloud account setup cu API keys | Sign up at cloud.livekit.io. Create project. Get API key + secret from Settings > Keys. Store EXPO_PUBLIC_LIVEKIT_URL in .env (both apps), LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Supabase Edge Function secrets (server-side only). |
</phase_requirements>

## Standard Stack

### Core (Existing -- No Changes)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | 2.95.3 | Supabase client with Realtime | Already installed in both apps |
| `expo` | ~54.0.33 | Framework | Already installed |
| `eas-cli` | 16.28.0 | EAS build tooling | Already installed globally |

### New Additions (Phase 1 Only)
| Library | Version | Purpose | Install In |
|---------|---------|---------|------------|
| `expo-dev-client` | latest (Expo 54 compatible) | Development build support | Both apps |
| `@livekit/react-native` | 2.9.6 | LiveKit React Native SDK | Both apps |
| `@livekit/react-native-webrtc` | latest (peer dep) | WebRTC native layer | Both apps |
| `livekit-client` | latest (peer dep) | Core LiveKit JS client | Both apps |
| `@livekit/react-native-expo-plugin` | latest | Expo config plugin for LiveKit | Both apps |
| `@config-plugins/react-native-webrtc` | latest | WebRTC permissions config plugin | Both apps |

### Alternatives Considered
None -- all choices are locked decisions from prior research.

**Installation (both apps):**
```bash
npx expo install expo-dev-client
npm install @livekit/react-native @livekit/react-native-webrtc livekit-client @livekit/react-native-expo-plugin @config-plugins/react-native-webrtc
```

## Architecture Patterns

### Pattern 1: Manual User Actions (Dashboard Tasks)

Two of the three plans require manual user action that cannot be automated:

**Supabase Pro Upgrade:**
1. Go to Supabase Dashboard > Project Settings > Billing
2. Upgrade to Pro plan ($25/month)
3. Wait for plan change to propagate (usually instant)
4. Verify Realtime is active by testing a subscription

**LiveKit Cloud Account:**
1. Sign up at https://cloud.livekit.io/
2. Create a new project (name suggestion: `tapzi` or `tapzi-live`)
3. Go to Settings > Keys to get API key and secret
4. The project URL format is: `wss://<project-name>.livekit.cloud`

### Pattern 2: Environment Variable Layout

```
# .env (both apps) -- client-safe
EXPO_PUBLIC_SUPABASE_URL=https://iaqztbhkukgghomwnict.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<existing>
EXPO_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud

# Supabase Edge Function secrets (server-side only, via CLI or dashboard)
LIVEKIT_API_KEY=<from LiveKit dashboard>
LIVEKIT_API_SECRET=<from LiveKit dashboard>
```

Client apps only see `EXPO_PUBLIC_` prefixed vars. LiveKit API key and secret NEVER go in the app bundle.

### Pattern 3: EAS Dev Build Profile

Both apps need `developmentClient: true` in their eas.json development profile. Current state:

**barber-store eas.json:** Already has development profile with `developmentClient: true` and `distribution: internal`. Has `ios.simulator: false` (builds for physical device). Ready to use.

**tapzi-barber eas.json:** Already has development profile with `developmentClient: true` and `distribution: internal`. Also has env vars configured per profile. Ready to use.

### Pattern 4: LiveKit Expo Plugins in app.json

After installing LiveKit packages, add to plugins array in `app.json`:

```json
{
  "plugins": [
    "@livekit/react-native-expo-plugin",
    "@config-plugins/react-native-webrtc"
  ]
}
```

This goes in BOTH apps' app.json files. The plugins handle native iOS/Android permission wiring automatically.

**barber-store app.json** currently has: `expo-router`, `expo-secure-store`, `expo-font`, `expo-image-picker`, `expo-location`
**tapzi-barber app.json** currently has: `expo-camera`, `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-video`

### Pattern 5: Supabase Realtime Validation

To validate Realtime is working after Pro upgrade:

```typescript
// Quick test: subscribe to postgres_changes on any existing table
const channel = supabase
  .channel('test-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'profiles'  // or any existing table
  }, (payload) => {
    console.log('Realtime event received:', payload)
  })
  .subscribe((status) => {
    console.log('Subscription status:', status)
    // Should log: SUBSCRIBED
  })
```

**Important:** The table must be added to the `supabase_realtime` publication first:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

Validation criteria: subscription status reaches `SUBSCRIBED`, and an INSERT/UPDATE on the table fires the event handler.

### Anti-Patterns to Avoid
- **Putting LiveKit secrets in .env:** Never add `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` to the app's `.env` file. These go in Supabase Edge Function secrets only.
- **Building with Expo Go after adding LiveKit plugins:** Once LiveKit plugins are in `app.json`, you MUST use a dev build. Expo Go will crash.
- **Skipping `expo-dev-client` install:** The dev build won't work without this package. It must be installed before running `eas build`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LiveKit token generation | Custom JWT signing in-app | Supabase Edge Function with `livekit-server-sdk` | Secret must stay server-side |
| WebRTC native permissions | Manual native code edits | `@livekit/react-native-expo-plugin` + `@config-plugins/react-native-webrtc` | Expo config plugins handle iOS/Android automatically |
| Dev build configuration | Manual prebuild + Xcode/Gradle config | `eas build --profile development` | EAS handles signing, provisioning, native compilation |

## Common Pitfalls

### Pitfall 1: Supabase Realtime Table Not in Publication
**What goes wrong:** Subscription connects but no events fire.
**Why it happens:** Supabase Realtime only replicates tables that are in the `supabase_realtime` publication. New tables and even some existing tables may not be added.
**How to avoid:** Run `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;` for every table you want to listen to.
**Warning signs:** Subscription status shows `SUBSCRIBED` but no events come through when data changes.

### Pitfall 2: EAS Build Requires Apple Developer Account for iOS Devices
**What goes wrong:** `eas build --platform ios --profile development` fails or the resulting build cannot install on a physical device.
**Why it happens:** iOS device builds require a paid Apple Developer Program membership ($99/year) for provisioning profiles and code signing. Simulator builds work without it.
**How to avoid:** For initial validation, use iOS Simulator builds by setting `ios.simulator: true` in the development profile. For physical device testing, ensure Apple Developer enrollment is active. barber-store currently has `ios.simulator: false` -- this means it targets physical devices and requires active enrollment.
**Warning signs:** EAS build fails with signing/provisioning errors.

### Pitfall 3: LiveKit Cloud Free Tier Limits
**What goes wrong:** During development, free tier is exceeded.
**Why it happens:** LiveKit Cloud free tier provides ~10,000 participant-minutes/month. For development and testing this is more than sufficient.
**How to avoid:** No action needed for Phase 1. Just be aware of the limit for production.

### Pitfall 4: Both Apps Share Same Supabase Project
**What goes wrong:** Env vars or configurations get out of sync between barber-store and tapzi-barber.
**Why it happens:** Both apps use `iaqztbhkukgghomwnict.supabase.co` (verified from both .env files). Changes to one affect the other.
**How to avoid:** The Supabase Pro upgrade is a one-time project-level action that benefits both apps. LiveKit URL should be the same in both apps' .env files.

## Code Examples

### Supabase Realtime Subscription Test (validation script)
```typescript
// Source: Supabase official docs
import { supabase } from '@/lib/supabase'

// Step 1: Ensure table is in publication (run in SQL editor)
// ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

// Step 2: Subscribe and test
const channel = supabase
  .channel('infra-validation')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'profiles'
  }, (payload) => {
    console.log('SUCCESS: Realtime event received', payload)
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('SUCCESS: Realtime subscription active')
    } else if (status === 'CHANNEL_ERROR') {
      console.error('FAILED: Realtime subscription error')
    }
  })

// Cleanup
// supabase.removeChannel(channel)
```

### EAS Dev Build Commands
```bash
# barber-store
cd ~/Desktop/barber-store
npx expo install expo-dev-client
eas build --platform ios --profile development
eas build --platform android --profile development

# tapzi-barber
cd ~/Desktop/tapzi-barber
npx expo install expo-dev-client
eas build --platform ios --profile development
eas build --platform android --profile development
```

### LiveKit Plugin Addition to app.json
```json
{
  "expo": {
    "plugins": [
      "@livekit/react-native-expo-plugin",
      "@config-plugins/react-native-webrtc",
      "expo-router",
      "expo-secure-store"
    ]
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Expo Go for all development | Dev builds (expo-dev-client) for native modules | Expo SDK 49+ (2023) | Required for LiveKit, cannot use Expo Go |
| Manual native code for WebRTC permissions | Config plugins handle it automatically | LiveKit Expo plugin 2024 | No Xcode/Gradle edits needed |
| Supabase free tier for Realtime | Supabase Pro recommended for Realtime | Always (free tier pauses after 1 week inactivity) | Pro prevents project pausing |

## Existing Infrastructure Inventory

### barber-store (client app)
| Asset | Status | Notes |
|-------|--------|-------|
| `eas.json` | EXISTS with dev profile | `developmentClient: true`, `distribution: internal`, `ios.simulator: false` |
| `app.json` | EXISTS | Has EAS projectId `736a549c-35cd-4d81-8644-72075004b1d0`, plugins array ready |
| `.env` | EXISTS | Has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `expo-dev-client` | NOT INSTALLED | Must be added |
| LiveKit packages | NOT INSTALLED | Must be added |
| `lib/supabase.ts` | EXISTS | Supabase client configured, works for Realtime |

### tapzi-barber (barber app)
| Asset | Status | Notes |
|-------|--------|-------|
| `eas.json` | EXISTS with dev profile | `developmentClient: true`, `distribution: internal`, has env vars per profile |
| `app.json` | EXISTS | Has EAS projectId `b45813cf-3cf3-469c-9ed7-3993133091c0`, camera/audio perms, plugins array ready |
| `.env` | EXISTS | Same Supabase URL and anon key |
| `expo-dev-client` | NOT INSTALLED | Must be added |
| LiveKit packages | NOT INSTALLED | Must be added |

## Open Questions

1. **LiveKit Cloud Region**
   - What we know: LiveKit Cloud has an `eu-central` region. Users are in Romania.
   - What's unclear: Full list of European regions not accessible from docs scrape. `eu-central` is likely Frankfurt (closest major EU data center to Romania).
   - Recommendation: Select `eu-central` region when creating the LiveKit Cloud project. The exact region options will be visible in the LiveKit dashboard during signup.

2. **Apple Developer Account Status**
   - What we know: barber-store eas.json has `ios.simulator: false` (targets physical device).
   - What's unclear: Whether user has active Apple Developer Program membership.
   - Recommendation: If no Apple Developer account, set `ios.simulator: true` for initial validation. Physical device testing can be added later.

3. **Supabase Edge Function Secrets Storage**
   - What we know: LiveKit API key and secret must be stored server-side in Supabase Edge Function secrets.
   - What's unclear: Supabase CLI is not installed locally (`supabase` command not found). No `supabase/` directory exists in either project.
   - Recommendation: Store secrets via Supabase Dashboard > Edge Functions > Secrets for now. CLI setup can happen when Edge Functions are implemented in Phase 4.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual validation (infrastructure phase -- no unit tests) |
| Config file | N/A |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements > Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Supabase Realtime subscription fires events | manual | Subscribe to `postgres_changes` on a table, INSERT a row, verify event received | N/A |
| INFRA-02 | Dev build installs and runs on device/simulator | manual | `eas build --profile development` succeeds + app installs | N/A |
| INFRA-03 | LiveKit Cloud dashboard shows active project with API key | manual | Log into cloud.livekit.io, verify project and keys visible | N/A |

### Sampling Rate
- **Per task:** Manual verification after each dashboard/config action
- **Phase gate:** All three success criteria met before moving to Phase 2

### Wave 0 Gaps
None -- this is an infrastructure phase with no code tests. Validation is manual verification of external service setup and build pipeline.

## Sources

### Primary (HIGH confidence)
- [Supabase Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) -- subscription setup and publication requirement
- [Supabase Pricing](https://supabase.com/pricing) -- Pro plan at $25/month
- [LiveKit Expo Quickstart](https://docs.livekit.io/home/quickstarts/expo/) -- package installation, app.json plugins, registerGlobals
- [Expo EAS Build docs](https://docs.expo.dev/develop/development-builds/create-a-build/) -- dev build creation steps
- [EAS eas.json Configuration](https://docs.expo.dev/build/eas-json/) -- profile structure

### Secondary (MEDIUM confidence)
- [LiveKit Tokens & Grants](https://docs.livekit.io/frontends/authentication/tokens/) -- JWT token generation pattern
- [LiveKit Cloud Regions](https://docs.livekit.io/deploy/admin/regions/) -- eu-central region reference
- [LiveKit Cloud Dashboard](https://cloud.livekit.io/) -- project creation and API key management

### Tertiary (LOW confidence)
- LiveKit Cloud full region list -- could not be scraped from docs, must verify in dashboard during signup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified from existing research and official docs
- Architecture: HIGH -- existing eas.json and app.json files inspected, patterns are straightforward
- Pitfalls: HIGH -- well-documented in official sources and prior project research

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable infrastructure, unlikely to change)
