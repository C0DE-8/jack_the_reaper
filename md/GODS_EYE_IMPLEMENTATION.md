# God's Eye implementation and operation

Implemented in migration `009_activity.sql`, `/api/activity`, the public-page consent control, and the React `/admin/activity` and `/admin/activity/:id` pages.

## Setup

1. Install backend and client dependencies with `npm ci` in each directory.
2. Set `ACTIVITY_SIGNING_SECRET` to a unique random secret of at least 32 characters in the backend environment. Set `ACTIVITY_ADMIN_URL` to the origin serving the React admin application. Keep these values out of source control.
3. Run `npm run migrate` from `backend`. The numbered migration adds the activity tables and enrolls existing database admins as Level 1 operators. Existing Telegram chats are **not** automatically trusted for activity alerts. The migration runner now records completed migrations, including legacy migrations after their existing duplicate-column handling, so backfills cannot run again on subsequent launches.
4. Start the backend and run `npm run activity:worker` in a separate supervised process. Serverless deployments must schedule `node scripts/activity-worker.js --once`; the request handler does not launch background work that can be terminated after a response.
5. Configure the existing Telegram webhook and bot token. In God's Eye, open **Operators and referrals**, create operators as needed, and generate an invitation. The recipient sends the displayed `/enroll …` command to the bot in a private chat within 15 minutes. Invitations are hashed, single-use and replaced by newly issued invitations. Main-password enrollment has been removed. `/stop` disables activity alerts.
6. Create referral links from the same panel. Append the displayed `/?ref=…` path to the public site's origin. The public page exchanges a valid active code for signed, one-day session state only after consent. Assignment is resolved in the database; browser-supplied operator IDs are ignored.

The existing frontend uses `window.JTR_API_URL` / `wordApi.apiUrl` for its backend origin. The React app uses its existing `VITE_API_BASE_URL` configuration. Configure hosting to serve React routes, including event-detail deep links, from the React build.

## Privacy and access behavior

- Explicit consent is required on each public page load. Declining creates no activity event. Withdrawal deletes that session's stored activity and dependent deliveries. Already delivered Telegram messages cannot be recalled by this deletion.
- Only `/` and `/index.html` are allowed. Bot and health-check user agents are ignored; assets, admin routes, query strings, and arbitrary page paths are excluded. Visits and successful submission counts are grouped by session/page/type into five-minute windows.
- Analytics never stores or forwards form contents, passwords, cookies, authentication values, raw IP addresses, full user agents, or arbitrary metadata. This module does not change the separate pre-existing word submission data model.
- IP addresses are used transiently for local country lookup and a one-minute, bounded in-memory rate limiter. GeoIP results are approximate; private/unknown IPs display Unknown. No location requests go to an external service. Configure only actual trusted proxy IPs/CIDRs in `ACTIVITY_TRUSTED_PROXIES`; forwarded headers are otherwise ignored. Refresh the bundled GeoIP dataset as part of dependency maintenance.
- Existing database admins are Level 1. New operators can be Level 1 or Level 2; disabled operators cannot authenticate. Level 2 queries, details, totals and delivery filters are constrained to currently assigned referrals. Reassignment removes the prior operator's historical access. Queued deliveries recheck active status and assignment. Existing non-scoped word/account admin routes reject Level 2.
- All enrolled active Level 1 recipients receive permitted events. Only the assigned active Level 2 recipient receives referral events. Direct and unassigned visits never go to Level 2.
- Events and deliveries expire after 30 days; audit records after 90 days; expired invitations are deleted by the worker. Level 1 can also delete individual events through `DELETE /api/activity/:id`. Exports are JSON, limited to 10,000 matching events, and audited before download. Narrow date filters for larger datasets. Audit history is paginated through `/api/activity/audit?page=…`.
- The rate limiter is per process. Multi-instance deployments should also enforce an ingress rate limit. It does not constitute bot-proof visitor identity.

## Delivery guarantees

A unique event/chat constraint, transactionally created outbox, and database worker lock prevent duplicate scheduling and concurrent sends. Explicit retryable failures use delayed retries, with at most five attempts. Telegram rate limits respect `retry_after`. Network timeouts and abandoned in-flight sends are marked `delivery_unknown` and are not automatically replayed: Telegram's [sendMessage API](https://core.telegram.org/bots/api#sendmessage) does not provide an idempotency key, so exactly-once network delivery cannot be guaranteed. Worker and activity endpoint errors never log request bodies or Telegram response descriptions.

## Validation

- `cd backend && npm test`: consent, allowlist, sanitization, signed-state tampering/expiry, SQL scope and alert privacy tests.
- `cd backend && npm run test:integration`: creates uniquely named temporary MySQL databases, tests clean installation and upgrade from migrations 001–008, then exercises real HTTP authorization, routing, deduplication, invitation replay/expiry, reassignment, bounded retries, exports, withdrawal and retention. Uses a fake Telegram sender; sends no messages. Requires permission for the configured database user to create/drop test databases. Always cleans up only its generated databases.
- `cd client && npm run lint && npm run build`.

Live Telegram delivery and production hosting configuration require deployment credentials and enrolled recipients; automated tests use simulated delivery results.
