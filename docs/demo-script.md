# Crush 2–3 minute demo script

This script is paced for about **2 minutes 55 seconds**. Record with the included demo account so the walkthrough never depends on a live Google Ads, GA4, or OpenAI request succeeding.

## Before recording

- Run `npm run dev`, open `http://localhost:3000`, and set the browser near 1440 × 900 at 100% zoom.
- Use the default `GOOGLE_ADS_DATA_SOURCE=sample` mode. Confirm the header says **Demo data**.
- Collapse unrelated browser UI, hide notifications, and close any tab or terminal that could reveal environment variables.
- Scroll once through the page so fonts and chart code are loaded.
- For a predictable chat result, use: **“Which campaigns are performing best?”** The specialist/chat path is deterministic and does not require OpenAI.
- Do not promise to generate a fresh daily or weekly result on camera. Show the interface and describe the workflow.

## 0:00–0:20 — What Crush is and the problem

**On screen:** Start at the top of the dashboard. Keep the product name, hero copy, Demo data badge, account name, and “How this demo works” panel visible.

**Say:**

> “Crush is an AI marketing command center I built as a personal portfolio project. It brings Google Ads performance, optional GA4 context, automated analysis, account auditing, and grounded recommendations into one view. I built it from my hands-on digital marketing experience to reduce the repetitive work between seeing a metric and deciding what deserves attention.”

**Employer signal:** Product framing, domain expertise, and transparent demo-data labeling.

## 0:20–0:50 — Dashboard and KPI overview

**Click/scroll:** Click **Overview** in the sticky navigation. Pause on the six KPI cards, then scroll just enough to reveal the GA4 context panel.

**Say:**

> “The server loads a clearly labeled fictional Google Ads account by default, so the application is useful without credentials. These KPIs—spend, conversion value, ROAS, conversions, CPA, and conversion rate—are calculated in code with explicit handling for missing comparison data and zero denominators. GA4 is optional and independently labeled, because sessions and key events should not be treated as identical to Ads clicks and conversions.”

**Employer signal:** Reliable onboarding, calculation correctness, and measurement discipline.

## 0:50–1:20 — Charts, account audit, and insights

**Click/scroll:** Click **Performance**. Point to the daily trend, campaign comparison, geographic view, and campaign table. Then click **Account health** and pause on the audit cards. If time permits, briefly click **AI analysis** and point to the AI Insights panel without submitting it.

**Say:**

> “The same normalized rows drive trend charts, campaign and geography comparisons, and this campaign table. The account audit then applies deterministic rules across nine areas, with evidence, severity, and a recommendation for every supported finding. The separate AI Insights feature can use OpenAI to prioritize prebuilt candidates, but model output is shown only if it matches the application’s calculated entity, wording, and evidence.”

**Employer signal:** One reusable data model, explainable rules, and post-model validation.

**If OpenAI is not configured:**

> “OpenAI is intentionally optional in this recording. The important design point is that the facts and candidates already exist before a model is called; without a key, the dashboard, audit, calculations, chat, and specialist workflows still work.”

## 1:20–1:50 — Ask Your Marketing Data and specialists

**Click/scroll:** Click **Ask your data**. Leave the selector on **Auto**, enter **“Which campaigns are performing best?”**, and submit. Point to the routed specialist, answer, evidence, and limitations. Then open the selector so PPC, Analytics, CRO, SEO, and Marketing Strategist / CMO are visible.

**Say:**

> “Ask Your Marketing Data is a grounded conversational interface. Auto uses deterministic routing, and answers come from validated calculations and evidence packets rather than an open-ended model call. Each specialist has a defined scope. Broad questions use a bounded specialists-to-strategist synthesis, while missing Analytics, CRO, or SEO evidence is reported as a limitation or testable hypothesis—not invented as a fact.”

**Employer signal:** Intentional agent boundaries, schema design, and honest insufficient-data behavior.

**If the request does not complete:**

> “This path is designed to work from the bundled dataset without OpenAI. If the local request is unavailable during recording, the same deterministic answer and evidence behavior is covered by the repository verification suite.”

## 1:50–2:15 — Daily and weekly automation

**Click/scroll:** Click **AI analysis** and pause on **Daily Analysis**. Click **Reporting** and pause on **Weekly Marketing Report**. Do not click the run buttons in the default demo unless you have prepared live integrations and storage.

**Say:**

> “Daily Analysis compares yesterday with the day before and the latest completed seven days with the prior seven. A change must clear absolute and relative materiality thresholds. Weekly reporting turns the same source-labeled evidence into a saved executive summary, wins, problems, actions, and a watch list. Both can run manually or through secret-protected Vercel cron routes, with local JSON or private Blob persistence.”

**Employer signal:** Automation, completed-period logic, graceful partial-source handling, and durable storage design.

**If live APIs are not configured:**

> “Automation deliberately does not relabel old sample rows as the current period. Live Google Ads and GA4 are needed for a meaningful fresh run; missing sources are recorded instead of hidden.”

## 2:15–2:40 — Architecture, grounding, and live integrations

**Click/scroll:** Switch to the Mermaid architecture diagram in [the case study](case-study.md), rendered in GitHub or your editor preview. Trace Google Ads/demo data to normalization, then the deterministic and AI branches. Point to the independent GA4 line.

**Say:**

> “The application uses Next.js 16’s App Router. Server Components load protected data, Client Components handle interaction, and Route Handlers run AI and reporting workflows. Google Ads uses a read-only REST reporting adapter; GA4 uses the official Data API library. Credentials stay server-only. If Google Ads fails, Crush visibly falls back to demo data. OpenAI receives only grounded candidates through structured output, with storage disabled, and invalid responses are rejected.”

**Employer signal:** Full-stack architecture, API integration, security boundaries, and AI safety controls.

## 2:40–3:00 — Conclusion

**Click/scroll:** Return to the top of the dashboard or show the GitHub README with the Case study and Demo links.

**Say:**

> “Crush shows how I combine practical digital marketing judgment with AI-assisted application development. The outcome is not a claim about client revenue; it is a working, testable product that demonstrates how I approach measurement, automation, trustworthy AI, and clear user experience. The code, detailed case study, and implementation notes are available in the GitHub repository.”

End on the repository URL: **https://github.com/davibus/crush**.

## Recording backup plan

If anything external is unavailable, keep the demo credible:

- Stay in **Demo data** mode and call it a fictional, repeatable portfolio dataset.
- Use dashboard, charts, audit, and Ask Your Marketing Data; all are meaningful without live APIs.
- Describe AI Insights rather than submitting when `OPENAI_API_KEY` is absent.
- Describe the daily/weekly run controls without triggering them; point to saved-output and scheduling architecture.
- Never imply the sample account is a customer or that its metrics are business results from Crush.
