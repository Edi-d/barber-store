---
phase: 1
slug: infrastructure-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual validation (infrastructure phase — no unit tests) |
| **Config file** | N/A |
| **Quick run command** | N/A |
| **Full suite command** | N/A |
| **Estimated runtime** | N/A (manual checks) |

---

## Sampling Rate

- **After every task commit:** Manual verification of the specific dashboard/config action
- **After every plan wave:** Verify all success criteria for completed plans
- **Before `/gsd:verify-work`:** All three success criteria confirmed manually
- **Max feedback latency:** N/A (manual phase)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INFRA-01 | manual | Subscribe to `postgres_changes` on a table, INSERT a row, verify event received | N/A | ⬜ pending |
| 01-02-01 | 02 | 1 | INFRA-03 | manual | Log into cloud.livekit.io, verify project and API keys visible | N/A | ⬜ pending |
| 01-03-01 | 03 | 1 | INFRA-02 | manual | `eas build --profile development` succeeds + app installs on device | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test framework setup needed — this is a manual infrastructure phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase Realtime fires events | INFRA-01 | Requires active Supabase Pro subscription and database publication config | 1. Open Supabase dashboard 2. Subscribe to postgres_changes on any table 3. INSERT a row 4. Verify event received in subscription |
| LiveKit Cloud project active | INFRA-03 | Requires cloud.livekit.io account creation (billing action) | 1. Log into cloud.livekit.io 2. Verify project exists 3. Verify API key and secret are available |
| Dev builds install on device | INFRA-02 | Requires physical device or simulator + EAS build pipeline | 1. Run `eas build --profile development` for both apps 2. Install resulting build on device 3. Verify app launches |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < N/A (manual phase)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
