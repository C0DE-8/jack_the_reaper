# God's Eye Monitoring Plan

## Goal

Create a consent-based admin activity page and Telegram alert system for safe operational information about public site visits.

## Information to record

- Event ID and server time
- Anonymous session ID
- Page visited
- Direct visit or referral-link ID
- Coarse country/region
- Device, browser, and operating-system category
- Consent state and Telegram delivery status

Use the visitor's IP only server-side for coarse location and abuse prevention. Do not send raw IP addresses to Telegram or retain them permanently. Do not collect passwords, one-time codes, authentication tokens, wallet recovery/seed phrases, private keys, cookies, precise locations, or other account-access secrets.

Exclude known bots, health checks, static assets, and admin-page activity. Group or rate-limit repeated page views so Telegram is not flooded.

## Telegram routing

- Level 1 receives all permitted public-visit alerts.
- Level 2 receives an alert only when the visit came through a referral link assigned to that operator.
- Direct visits and visits from unassigned links go only to Level 1.

Example alert:

```text
New site visit
Visit ID: evt_1234
Referral: Habibi Campaign (oxeyeh), or Direct
Country: NG
Device: Mobile
Browser: Chrome
Time: 2026-09-06 18:42 UTC
Open: https://example.com/admin/activity/evt_1234
```

Alerts must contain sanitized metadata only. Telegram enrollment must use a one-time, expiring invitation instead of the main admin password.

## Admin page

Add a protected `/admin/activity` page with:

- visit, submission, and delivery totals;
- a paginated activity stream;
- filters for date, event type, referral, operator, country, and delivery status;
- event details and Telegram delivery state;
- an audit log and Level 1-only audited export.

Level 2 results must be restricted in backend queries to assigned referral links. Hiding records only in the interface is not sufficient.

## Flow

```text
Visitor opens a public page
  -> consent rules are applied
  -> bots and repeated events are filtered
  -> privacy-safe event is stored
  -> Level 1 recipients are selected
  -> assigned Level 2 is added only for an assigned referral visit
  -> sanitized Telegram alert is queued
  -> delivery result is stored
  -> authorized event appears in God's Eye
```

## Proposed database records

- `activity_events`: event type/time, anonymous session, page, referral, country, device categories, consent, safe metadata, and retention time.
- `telegram_alert_deliveries`: event, operator/chat, delivery status, attempts, safe error code, and timestamps.
- `operators`: display name, Level 1/Level 2 role, status, and timestamps.
- `telegram_operator_chats`: operator relationship, required Telegram identifiers, authorization, and enrollment timestamps.
- `audit_events`: actor, action, target, sanitized metadata, and timestamp.

## Implementation requirements

- Validate inputs and use parameterized SQL.
- Derive identity, role, and referral scope from authenticated database records.
- Queue alerts with bounded, idempotent retries.
- Keep secrets outside the repository and redact logs.
- Add rate limiting, retention/deletion handling, and tests proving Level 2 cannot access another operator's events.
- Put every database change in a new numbered migration under `backend/sql/`. Never modify an applied migration or require manual production SQL.

## Done when

Level 1 receives all permitted visit alerts, Level 2 receives and sees only assigned-link activity, direct/unassigned visits go only to Level 1, prohibited information never reaches storage or Telegram, authorization and privacy tests pass, and clean-install and upgrade migrations both succeed.

