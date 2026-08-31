# GA4 Data API setup

Crush uses the official `@google-analytics/data` server library and a Google
Cloud service account. Credentials are read only in the server-side data-access
layer. GA4 remains optional: missing or invalid configuration does not prevent
the existing Google Ads dashboard from loading.

## 1. Enable the Google Analytics Data API

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select
   the project that should own this integration (or create one).
2. Go to **APIs & Services > Library**.
3. Search for **Google Analytics Data API** (`analyticsdata.googleapis.com`).
4. Open it and click **Enable**. This is the Data API, not the Analytics Admin
   API.

## 2. Create a service account and JSON key

1. In the same Cloud project, go to **IAM & Admin > Service Accounts**.
2. Click **Create service account**, name it (for example, `crush-ga4-reader`),
   and finish creation. A Google Cloud project role is not required merely to
   read a GA4 property; GA4 property access is granted separately below.
3. Open the new service account, select **Keys > Add key > Create new key**,
   choose **JSON**, and click **Create**.
4. Store the downloaded JSON securely. It contains a private key and must never
   be committed, pasted into client code, or sent to the browser. Copy the
   `client_email` and `private_key` values for the environment setup below.

If your organization disables service-account key creation, use its approved
secret-management or workload-identity process instead. This project's
environment-variable setup is intended for a server runtime where the values
are stored as encrypted secrets.

## 3. Find the GA4 property ID

1. Open [Google Analytics](https://analytics.google.com/) and select the correct
   GA4 property.
2. Click **Admin**.
3. Under **Property**, open **Property details** (shown as **Property settings >
   Property details** in some UI versions).
4. Copy the numeric **Property ID**. Use only the digits, not a measurement ID
   such as `G-XXXXXXXXXX` and not the `properties/` prefix.

## 4. Grant the service account read access in GA4

1. In GA4 **Admin**, select the same property and open **Property access
   management**.
2. Click **+ > Add users**.
3. Enter the service account's `client_email` from the downloaded JSON, such as
   `crush-ga4-reader@your-project.iam.gserviceaccount.com`.
4. Assign the **Viewer** role and click **Add**. Viewer is the least-privilege
   built-in role needed for this read-only reporting integration; do not grant
   Editor or Administrator unless the account needs unrelated responsibilities.

The service account is not a human Google login, but its email can be added as a
GA4 property user.

## 5. Add `.env.local` values

Copy these names into `.env.local` at the repository root:

```dotenv
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=crush-ga4-reader@your-project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_CONTENT\n-----END PRIVATE KEY-----\n"
GA4_START_DATE=30daysAgo
GA4_END_DATE=yesterday
```

- `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, and `GA4_PRIVATE_KEY` are required to
  enable GA4. If all three are absent, Crush simply shows GA4 as unconfigured.
- `GA4_START_DATE` and `GA4_END_DATE` are optional. They default to `30daysAgo`
  and `yesterday`; accepted values are `today`, `yesterday`, `NdaysAgo`, or an
  ISO date such as `2026-08-01`.
- Keep the private key on one line inside double quotes and preserve each line
  break as the two characters `\n`. Crush converts those escaped line breaks
  back to PEM newlines only on the server. An environment provider that supports
  true multiline secret values may store the PEM with real newlines instead.
- Never use a `NEXT_PUBLIC_` prefix. Never commit `.env.local` or the downloaded
  JSON file. For deployment, add these names through the host's encrypted
  environment/secret settings and rotate the key if it is exposed.

Restart `npm run dev` after changing environment variables.

## What Crush requests

For the selected period, the adapter retrieves sessions, total users, active
users, engaged sessions, engagement rate, key events by event name, landing
pages, source/medium, channel group, campaign name, and Google Ads campaign ID.
The UI joins a GA4 row to a loaded Google Ads campaign only when
`sessionGoogleAdsCampaignId` exactly matches that campaign's ID. Google Ads
clicks/conversions and GA4 sessions/key events use different measurement and
attribution systems, so Crush displays them side by side and does not fabricate
reconciliation or cross-channel attribution.

Official references:

- [GA4 Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- [GA4 dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Create and manage service-account keys](https://cloud.google.com/iam/docs/keys-create-delete)
