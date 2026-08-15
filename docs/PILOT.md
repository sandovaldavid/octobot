# 🧪 OctoBot V1 - Pilot Onboarding & Verification Guide

This document outlines the step-by-step procedure for conducting a limited **V1 Pilot** with 1–2 real engineering repositories before wider production rollout.

---

## 🎯 1. Pilot Objectives

1. Validate real-world end-to-end integration between GitHub Webhooks, OctoBot runtime, and Discord channels.
2. Confirm noise reduction policies (e.g. `synchronize` suppression, repeated CI failure suppression).
3. Validate idempotency and replay protection against real GitHub redeliveries.
4. Establish baseline operational confidence in deployment readiness.

---

## 📋 2. Pilot Onboarding Checklist

### Phase 1: Preflight & Environment

- [ ] Production environment variables configured per [DEPLOYMENT.md](DEPLOYMENT.md).
- [ ] Public HTTPS endpoint active with valid SSL/TLS certificate.
- [ ] Discord Bot invited to the pilot Discord server with `Send Messages`, `Embed Links`, and `Use Slash Commands` permissions.
- [ ] OctoBot container deployed (1 replica).
- [ ] Confirm `/health` returns `200 OK` (`status: "OK"`).
- [ ] Confirm `/ready` returns `200 OK` (`status: "READY"`).

### Phase 2: Channel Setup & Repository Watch

1. Create dedicated pilot channels in Discord (e.g. `#octobot-pilot-alerts` or `#backend-feed`).
2. Run the watch slash command as an Administrator:
    ```text
    /github repo watch name:owner/pilot-repo
    ```
3. Verify response:
    ```text
    ✅ Now watching `owner/pilot-repo` for updates in #octobot-pilot-alerts
    ```
4. Verify remote webhook configuration in GitHub:
    ```text
    /github repo check-webhook name:owner/pilot-repo
    ```

---

## 🧪 3. Smoke Test Verification Matrix

Execute and observe each scenario in the pilot repository:

| #      | Action / Event             | Trigger in GitHub                                              | Expected Discord Outcome                                                         |
| :----- | :------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **1**  | **PR Opened**              | Open a new draft or regular Pull Request.                      | 📬 Notification embed with branch details, author, and `+add / -del` diff stats. |
| **2**  | **PR Ready for Review**    | Convert draft PR to "Ready for Review".                        | 🟣 Embed with `🟣 PR #X Ready for Review`.                                       |
| **3**  | **PR Review (Approved)**   | Submit review with "Approve".                                  | 🟢 Embed with `✅ PR #X Approved (Ready for merge)`.                             |
| **4**  | **PR Review (Changes)**    | Submit review with "Request Changes".                          | 🔴 Embed with `🔴 Changes Requested on PR #X`.                                   |
| **5**  | **PR Synchronize (Noise)** | Push new commit to an existing open PR.                        | 🔕 **NO notification** (suppressed by policy).                                   |
| **6**  | **PR Merged**              | Merge the Pull Request.                                        | 🟢 Embed with `🟢 PR #X Merged into <base>`.                                     |
| **7**  | **CI Failure**             | Push a commit that fails GitHub Actions CI.                    | 🔴 Embed with `🔴 CI Failed — <workflow name>`.                                  |
| **8**  | **CI Repeated Failure**    | Push another failing commit while still failing.               | 🔕 **NO notification** (suppressed by policy).                                   |
| **9**  | **CI Recovery**            | Fix the build and let CI pass.                                 | 🟢 Embed with `🟢 CI Recovered — <workflow name>`.                               |
| **10** | **Issue Opened / Closed**  | Open and close a test issue.                                   | 📬 Embeds with issue details and state updates.                                  |
| **11** | **Release Published**      | Publish a new release or tag.                                  | 🚀 Release notification embed with release notes link.                           |
| **12** | **Idempotency Replay**     | In GitHub Webhooks tab, click **Redeliver** on any past event. | 🛡️ **NO duplicate Discord message** (HTTP 200 `ignored_duplicate`).              |

---

## 📊 4. Go / No-Go Evaluation Criteria

After 48–72 hours of pilot observation:

- **Pass (Go):**
    - All 12 smoke tests verified with zero duplicated Discord alerts.
    - Zero unhandled crash loops or disconnects in logs.
    - `/ready` endpoint remained healthy throughout the pilot period.
- **Fail (No-Go):**
    - Duplicate notifications sent on replayed deliveries.
    - Silent drop of actionable events (`opened`, `ready_for_review`, `merged`, `approved`).
    - Discord Gateway disconnection without automatic recovery.
