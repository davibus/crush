# Screenshot capture checklist

No screenshots are currently stored in this repository. Capture these eight images from the running application; do not use mockups or generated UI images.

## Capture setup

- Run `npm run dev` and use the default fictional Northstar Outdoor Co. demo data.
- Capture at approximately 1440 × 900, 100% browser zoom, using PNG.
- Keep the **Demo data** badge or another visible source label where practical.
- Hide bookmarks, notifications, local file paths, terminals, and all credentials.
- Do not show `.env.local`, API tokens, real customer names, or real account IDs.
- Use the filenames below exactly and place the files in this directory.

## Required images

| # | Filename | Navigate/capture | What must be visible | Best use |
| ---: | --- | --- | --- | --- |
| 1 | `01-dashboard-overview.png` | Top of `/` | Crush name, hero description, **Demo data** badge, Northstar Outdoor Co., “How this demo works,” and the start of Overview | README hero and case-study opening |
| 2 | `02-kpis-and-performance.png` | **Overview**, then **Performance** if needed for framing | All six KPI cards plus at least one readable trend/comparison chart, with date/source labels | Show the core operating view |
| 3 | `03-account-audit.png` | Click **Account health** | “Automated account audit,” total finding count, and several audit categories with severity, evidence, and recommendations readable | Explain deterministic analysis |
| 4 | `04-grounded-ai-insights.png` | Click **AI analysis** and run AI Insights only with a configured OpenAI key | Returned insight cards, evidence, confidence/presentation details, and analysis metadata; no errors or credentials | Demonstrate constrained model output |
| 5 | `05-ask-marketing-data.png` | Click **Ask your data**; ask “Which campaigns are performing best?” | Question, routed specialist, grounded answer, supporting evidence, and any limitation text | Show conversational analysis without relying on OpenAI |
| 6 | `06-specialist-agents.png` | In **Ask your data**, open the selector and/or submit a broad strategy question | Specialist selector with Auto, PPC, Analytics, CRO, SEO, and Strategist; preferably a result showing routing/contributors | Explain specialist boundaries and synthesis |
| 7 | `07-daily-analysis.png` | Click **AI analysis** | Daily Analysis heading, source/status information, completed-period comparisons, material findings or explicit source warnings | Show automation and graceful failure states |
| 8 | `08-weekly-report.png` | Click **Reporting** | Reporting/comparison periods, executive summary, evidence-linked wins/problems/actions, status, and warnings if present | Show stakeholder-ready reporting |

## Capture notes

- Screenshot 4 requires an actual successful OpenAI response. If no key is available, leave this file absent and use screenshot 3 or 5 in the case study. Do not fabricate a result.
- Screenshots 7 and 8 should represent an actual saved run. A truthful source warning is acceptable; never relabel the bundled August 2025 sample as a current report.
- If one screen is too tall, capture the most informative crop rather than shrinking text until it is unreadable.
- Review every PNG at full size before publishing. Metric values, evidence labels, and status badges should be legible.

## Insert after capture

Use these relative links in `docs/case-study.md`:

```markdown
![Crush dashboard overview](screenshots/01-dashboard-overview.png)
![KPI and performance overview](screenshots/02-kpis-and-performance.png)
![Deterministic account audit](screenshots/03-account-audit.png)
![Grounded AI insights](screenshots/04-grounded-ai-insights.png)
![Ask Your Marketing Data](screenshots/05-ask-marketing-data.png)
![Specialist agent workflow](screenshots/06-specialist-agents.png)
![Daily marketing analysis](screenshots/07-daily-analysis.png)
![Weekly marketing report](screenshots/08-weekly-report.png)
```

For the README, use the overview image after it exists:

```markdown
![Crush AI Marketing Command Center dashboard](docs/screenshots/01-dashboard-overview.png)
```
