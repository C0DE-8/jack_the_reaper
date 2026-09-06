# Referral-Link and Telegram Assignment Plan

## Goal

Let a Level 1 admin create a named referral link with a system-generated public code and optionally assign a Level 2 Telegram operator.

## Link creation

The admin enters:

- an internal display name, such as `Habibi Campaign`;
- an allowlisted destination inside the site;
- an optional active Level 2 Telegram operator;
- an optional expiry date and active/inactive status.

The backend securely generates a unique public code and returns a copyable link such as:

```text
https://example.com/r/oxeyeh
```

The admin does not create the code. Generate it with a cryptographically secure random generator, check uniqueness, and retry on collision. Prefer 10–12 case-insensitive characters without confusing symbols; a six-character code such as `oxeyeh` should be used only after a guessing-risk and expected-volume review. Never expose database, operator, or Telegram IDs in the code.

Store the display name separately from the stable code. Renaming the link or assigning, unassigning, or reassigning an operator must not change its public URL.

## Optional Telegram assignment

- A link can be created without an operator.
- Level 1 receives all permitted referral alerts.
- The assigned Level 2 operator receives only alerts from that operator's links.
- An unassigned link sends no Level 2 alerts.
- Level 1 may assign, unassign, or reassign an operator later.
- Every creation, assignment, reassignment, status change, and revocation is audited.

## Flow

```text
Level 1 enters the link name and settings
  -> optionally selects a Level 2 Telegram operator
  -> backend generates and stores a unique code
  -> complete /r/{code} URL is returned with a copy action

Visitor opens /r/oxeyeh
  -> backend resolves the active, unexpired link
  -> consent rules are applied
  -> safe referral event is stored
  -> signed first-party referral state is created
  -> visitor is redirected to an allowlisted local destination
  -> later permitted activity inherits the referral ID server-side
  -> Level 1 is alerted
  -> assigned Level 2 is alerted only when an assignment exists
```

Never trust an operator ID submitted by the browser. Reject open redirects, expired/disabled links, unknown codes, tampered referral state, and excessive requests.

## Admin page

Add a protected `/admin/referral-links` page that supports:

- create, copy, search, and filter;
- display name, generated URL, destination, assignment, status, expiry, visits, and permitted submissions;
- activate/deactivate;
- assign, unassign, or reassign an operator;
- rename without changing the URL;
- view audit history.

Prefer deactivation over deletion so historical attribution remains intact.

## Proposed database records

- `referral_links`: ID, name, unique generated code, allowlisted destination, nullable operator ID, status, expiry, creator, and timestamps.
- `operators`: Level 1/Level 2 identities and status.
- `telegram_operator_chats`: enrolled Telegram destinations.
- `activity_events`: events with nullable referral attribution.
- `telegram_alert_deliveries`: delivery tracking.
- `audit_events`: administrative and authorization history.

## Authorization and safety

Every Level 2 backend query must be scoped by authenticated operator assignment. Level 2 cannot enumerate other operators, unassigned links, visitors, or submissions. Referral links must never be used to collect or forward passwords, authentication codes/tokens, wallet recovery/seed phrases, private keys, payment credentials, raw IP addresses, or other sensitive account-access information.

## Migration requirement

Put every schema change in a new numbered migration under `backend/sql/`, such as `009_referral_links_and_operator_roles.sql`. Never edit an already-applied migration or depend on manual production SQL. Include unique constraints, foreign keys, indexes, safe backfills, and explicit handling of existing Telegram chats. Test clean installation and upgrade from the current schema.

## Done when

The admin can create and copy a stable system-generated URL with or without an operator, assignment changes do not alter the URL, Level 1 receives all permitted alerts, Level 2 receives and views only assigned-link activity, unassigned links never alert Level 2, attribution cannot be forged, and role, rate-limit, audit, and migration tests pass.

