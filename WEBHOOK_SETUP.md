# WhatsApp Notification Setup

When all 4 players submit their 2 selections (8 total), the app will trigger a webhook that can be used with Apple Shortcuts to send a WhatsApp message.

## Setup Steps

### 1. Create Apple Shortcut

1. Open **Shortcuts** app on iPhone/Mac
2. Create new shortcut called "Betting Selections Complete"
3. Add these actions:
   - **Get Contents of URL** (this will receive the webhook)
   - **Get Dictionary from Input**
   - **Get value for "summary" in Dictionary**
   - **Set variable** "Selections" to result
   - **Text**: Build your message (see example below)
   - **Send Message via WhatsApp** to your group

### 2. Get Webhook URL

1. In the shortcut settings (•••), enable **"Allow Sharing"**
2. Tap **"Add to Home Screen"** or **"Share Shortcut"**
3. Copy the webhook URL (or use automation URL)
4. Alternatively, use a service like:
   - [Webhook.site](https://webhook.site) (for testing)
   - [Pipedream](https://pipedream.com) (can forward to Apple Shortcuts)
   - [Make.com](https://make.com) (formerly Integromat)
   - [Zapier Webhooks](https://zapier.com)

### 3. Add URL to .env.local

```bash
SELECTIONS_COMPLETE_WEBHOOK_URL=https://your-webhook-url-here
```

### 4. Restart Dev Server

```bash
npm run dev
```

## Webhook Payload

The webhook sends this JSON structure:

```json
{
  "event": "selections_complete",
  "week_id": 123,
  "saturday_date": "2026-02-08",
  "total_selections": 8,
  "players_submitted": 4,
  "summary": {
    "Kezza": [
      {
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "kick_off": "2026-02-08T15:00:00Z"
      },
      {
        "home_team": "Liverpool",
        "away_team": "Man City",
        "kick_off": "2026-02-08T15:00:00Z"
      }
    ],
    "Mikey": [...],
    "Krissy": [...],
    "Tommy": [...]
  },
  "selections": [/* full selection objects with fixture details */]
}
```

## Example WhatsApp Message

You can format the message in Apple Shortcuts like this:

```
🎲 All Selections In! 🎲

📅 Saturday: [saturday_date]

⚽️ Picks:

Kezza:
• [home_team] vs [away_team]
• [home_team] vs [away_team]

Mikey:
• [home_team] vs [away_team]
• [home_team] vs [away_team]

Krissy:
• [home_team] vs [away_team]
• [home_team] vs [away_team]

Tommy:
• [home_team] vs [away_team]
• [home_team] vs [away_team]

Good luck! 🍀
```

## Testing

1. Use [Webhook.site](https://webhook.site) to get a test URL
2. Add it to `.env.local`
3. Submit all 8 selections (4 players × 2 each)
4. Check Webhook.site to see the payload
5. Once confirmed, set up your Apple Shortcut with the real URL

## Production Deployment

When deploying to Vercel:

1. Add environment variable in Vercel dashboard:
   ```
   SELECTIONS_COMPLETE_WEBHOOK_URL=your-production-webhook-url
   ```

2. Redeploy the app

3. Test with real selections

## Alternative: Direct Apple Shortcuts Integration

If you want to skip webhook services, you can:

1. Use **Shortcuts Automations** with "When I receive a notification"
2. Or use **iCloud Personal Automation** that checks the API periodically
3. Or use **Push Cut Automation Server** for background triggers

## Notes

- Webhook only triggers when the 8th (final) selection is submitted
- If a player re-submits their picks, it won't re-trigger (unless someone else submits after)
- Webhook runs async - won't block the selection submission response
- Errors are logged to console but won't affect user experience
