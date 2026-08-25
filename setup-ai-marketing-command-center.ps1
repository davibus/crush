param(
    [Parameter(Mandatory=$true)]
    [string]$Repo,

    [string]$ProjectTitle = "AI Marketing Command Center",

    [string]$ProjectOwner = "@me"
)

$ErrorActionPreference = "Stop"

function Run-Gh {
    param([string[]]$Args)
    & gh @Args
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI command failed: gh $($Args -join ' ')"
    }
}

Write-Host "Checking GitHub CLI authentication..."
Run-Gh @("auth","status")

Write-Host "Ensuring project scope is available..."
Write-Host "If project access fails, run: gh auth refresh -s project"

# Resolve repository owner/name.
$repoInfo = gh repo view $Repo --json nameWithOwner | ConvertFrom-Json
$repoFull = $repoInfo.nameWithOwner
$repoOwner, $repoName = $repoFull.Split("/", 2)

# Create labels if they do not already exist.
$labels = @(
    @{ Name="AI";          Description="AI/LLM functionality" },
    @{ Name="Frontend";    Description="Dashboard and UI work" },
    @{ Name="Data";        Description="Marketing data, APIs, metrics, and analytics" },
    @{ Name="Automation";  Description="Automated workflows and scheduled jobs" },
    @{ Name="Setup";       Description="Project and development setup" },
    @{ Name="Portfolio";   Description="Demo, documentation, and portfolio work" },
    @{ Name="Bug";         Description="Something is not working correctly" },
    @{ Name="P0";          Description="Required for the first working demo" },
    @{ Name="P1";          Description="Important after the first demo" },
    @{ Name="P2";          Description="Nice-to-have / future work" }
)

Write-Host "Creating labels..."
foreach ($label in $labels) {
    & gh label create $label.Name --repo $Repo --description $label.Description 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Label '$($label.Name)' already exists or could not be created; continuing."
    }
}

# Find or create the GitHub Project.
Write-Host "Finding or creating GitHub Project '$ProjectTitle'..."
$projectsJson = gh project list --owner $ProjectOwner --format json
$projects = $projectsJson | ConvertFrom-Json
$project = $projects.projects | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1

if (-not $project) {
    $createdProjectJson = gh project create --owner $ProjectOwner --title $ProjectTitle --format json
    $project = $createdProjectJson | ConvertFrom-Json
    Write-Host "  Created project #$($project.number)."
} else {
    Write-Host "  Found project #$($project.number)."
}

$projectNumber = $project.number

# Create milestones if missing.
$milestoneNames = @(
    "1 - Project Foundation",
    "2 - Marketing Data Layer",
    "3 - AI Analysis Engine",
    "4 - Dashboard",
    "5 - Ask Your Marketing Data",
    "6 - Automated Marketing Auditor",
    "7 - Automation",
    "8 - Advanced AI Features",
    "9 - Portfolio Version"
)

Write-Host "Creating milestones..."
$existingMilestones = gh api "repos/$repoOwner/$repoName/milestones?state=all&per_page=100" | ConvertFrom-Json

foreach ($name in $milestoneNames) {
    if (-not ($existingMilestones | Where-Object { $_.title -eq $name })) {
        gh api --method POST "repos/$repoOwner/$repoName/milestones" -f "title=$name" | Out-Null
        Write-Host "  Created milestone: $name"
    } else {
        Write-Host "  Milestone already exists: $name"
    }
}

# Each issue is deliberately sized as a meaningful work unit.
$issues = @(
    @{
        Title="Set up repository and development environment"
        Milestone="1 - Project Foundation"
        Labels=@("Setup","P0")
        Body=@"
## Goal
Create the working foundation for the AI Marketing Command Center.

## Tasks
- [ ] Create or verify GitHub repository
- [ ] Create project README
- [ ] Write a one-paragraph product description
- [ ] Define Version 1 scope
- [ ] Create `/docs` folder
- [ ] Create `.env.local`
- [ ] Confirm environment files are ignored by Git
- [ ] Install Node.js
- [ ] Create Next.js application
- [ ] Run the project locally
- [ ] Connect local project to GitHub
- [ ] Make first commit
- [ ] Deploy the basic application to Vercel

## Done when
A basic Next.js application is running locally, committed to GitHub, and deployed.
"@
    },
    @{
        Title="Prepare sample Google Ads data"
        Milestone="2 - Marketing Data Layer"
        Labels=@("Data","P0")
        Body=@"
## Goal
Create a reliable sample dataset before connecting live APIs.

## Tasks
- [ ] Export campaign data
- [ ] Export keyword data
- [ ] Export search-term data
- [ ] Export geographic data
- [ ] Export conversion data
- [ ] Create `/data` folder
- [ ] Document each data file and its columns

## Done when
The project contains clean sample marketing data that can be used without a live Google Ads API connection.
"@
    },
    @{
        Title="Build CSV ingestion and structured data model"
        Milestone="2 - Marketing Data Layer"
        Labels=@("Data","P0")
        Body=@"
## Tasks
- [ ] Load CSV files into the application
- [ ] Convert rows into structured objects/JSON
- [ ] Normalize dates and numeric fields
- [ ] Handle missing values
- [ ] Handle duplicate rows
- [ ] Add basic validation
- [ ] Log useful import errors

## Done when
The application can ingest sample exports and produce a clean, predictable data structure.
"@
    },
    @{
        Title="Calculate core paid-media metrics"
        Milestone="2 - Marketing Data Layer"
        Labels=@("Data","P0")
        Body=@"
## Tasks
- [ ] Spend
- [ ] Clicks
- [ ] Impressions
- [ ] CTR
- [ ] CPC
- [ ] Conversions
- [ ] Conversion rate
- [ ] Cost per conversion / CPA
- [ ] Conversion value
- [ ] ROAS
- [ ] Handle zero-conversion cases
- [ ] Handle zero-spend cases
- [ ] Compare calculations against Google Ads exports

## Done when
Core metrics match the source data and edge cases do not break the application.
"@
    },
    @{
        Title="Connect the application to an LLM"
        Milestone="3 - AI Analysis Engine"
        Labels=@("AI","P0")
        Body=@"
## Tasks
- [ ] Create API project/key
- [ ] Store API key in environment variables
- [ ] Create server-side API endpoint
- [ ] Send a small marketing dataset to the model
- [ ] Receive a response
- [ ] Keep secrets out of browser/client code
- [ ] Add basic error handling

## Done when
The application can safely send marketing data to the model and receive a response.
"@
    },
    @{
        Title="Create structured AI marketing insight schema"
        Milestone="3 - AI Analysis Engine"
        Labels=@("AI","Data","P0")
        Body=@"
## Goal
Make AI output predictable enough for the dashboard.

## Required fields
- [ ] Problem/opportunity
- [ ] Severity
- [ ] Campaign/entity affected
- [ ] Evidence
- [ ] Recommended action
- [ ] Expected impact
- [ ] Confidence score

## Tasks
- [ ] Define structured output schema
- [ ] Validate returned data
- [ ] Reject malformed output
- [ ] Add fallback handling

## Done when
AI recommendations are returned in a stable machine-readable format.
"@
    },
    @{
        Title="Build first AI campaign-performance analyzer"
        Milestone="3 - AI Analysis Engine"
        Labels=@("AI","Data","P0")
        Body=@"
## Detect
- [ ] High CPA campaigns
- [ ] Low conversion-rate campaigns
- [ ] High-spend campaigns with few/no conversions
- [ ] Strong-performing campaigns
- [ ] Budget opportunities
- [ ] Geographic opportunities
- [ ] Device-performance differences
- [ ] Search-term waste
- [ ] Negative-keyword opportunities

## Done when
A sample dataset produces useful, evidence-based optimization recommendations.
"@
    },
    @{
        Title="Prevent unsupported or invented AI conclusions"
        Milestone="3 - AI Analysis Engine"
        Labels=@("AI","P0")
        Body=@"
## Tasks
- [ ] Require evidence for each recommendation
- [ ] Require metrics cited in findings to exist in supplied data
- [ ] Return 'insufficient data' when necessary
- [ ] Add calculation checks outside the LLM
- [ ] Test misleading and incomplete datasets

## Done when
The AI does not confidently invent campaign metrics or unsupported explanations.
"@
    },
    @{
        Title="Build dashboard KPI overview"
        Milestone="4 - Dashboard"
        Labels=@("Frontend","Data","P0")
        Body=@"
## KPI cards
- [ ] Spend
- [ ] Revenue/conversion value
- [ ] ROAS
- [ ] Conversions
- [ ] CPA
- [ ] Conversion rate

## Tasks
- [ ] Build responsive KPI components
- [ ] Add comparison period where possible
- [ ] Add sensible empty/loading states

## Done when
A user can understand overall account performance immediately from the dashboard.
"@
    },
    @{
        Title="Build marketing performance charts"
        Milestone="4 - Dashboard"
        Labels=@("Frontend","Data","P1")
        Body=@"
## Charts
- [ ] Spend over time
- [ ] Conversions over time
- [ ] CPA over time
- [ ] ROAS over time
- [ ] Campaign comparison
- [ ] Geographic performance

## Done when
Charts accurately reflect the underlying sample data and support useful comparisons.
"@
    },
    @{
        Title="Build AI Insights panel"
        Milestone="4 - Dashboard"
        Labels=@("Frontend","AI","P0")
        Body=@"
## Sections
- [ ] Critical issues
- [ ] Opportunities
- [ ] Budget recommendations
- [ ] Keyword recommendations
- [ ] Landing-page recommendations
- [ ] Evidence and confidence display

## Done when
Structured AI findings render cleanly and can be understood without reading raw JSON.
"@
    },
    @{
        Title="Build Ask Your Marketing Data chat interface"
        Milestone="5 - Ask Your Marketing Data"
        Labels=@("Frontend","AI","P0")
        Body=@"
## Tasks
- [ ] Build chat UI
- [ ] Send user questions to backend
- [ ] Supply relevant marketing data as context
- [ ] Display response
- [ ] Preserve short conversation context
- [ ] Add loading/error states

## Initial questions to support
- [ ] Why did CPA increase?
- [ ] Which campaigns are performing best?
- [ ] Which campaigns are wasting money?
- [ ] Which cities have the highest conversion rate?
- [ ] Where should budget increase?
- [ ] Which search terms should become negatives?
- [ ] What changed this week?

## Done when
A user can ask natural-language performance questions and receive grounded answers.
"@
    },
    @{
        Title="Add deterministic calculations to AI chat answers"
        Milestone="5 - Ask Your Marketing Data"
        Labels=@("AI","Data","P0")
        Body=@"
## Tasks
- [ ] Calculate requested metrics in code when possible
- [ ] Pass calculation results to the LLM for explanation
- [ ] Show the numbers behind important answers
- [ ] Identify insufficient data
- [ ] Test arithmetic consistency

## Done when
The AI explains calculated results instead of doing critical marketing arithmetic from memory.
"@
    },
    @{
        Title="Create automated account-audit framework"
        Milestone="6 - Automated Marketing Auditor"
        Labels=@("AI","Data","P1")
        Body=@"
## Audit categories
- [ ] Account structure
- [ ] Campaign performance
- [ ] Keyword performance
- [ ] Search-term waste
- [ ] Geographic performance
- [ ] Device performance
- [ ] Budget allocation
- [ ] Conversion performance
- [ ] Landing-page opportunities

## Done when
Running an audit generates a repeatable list of findings organized by category.
"@
    },
    @{
        Title="Create marketing account score"
        Milestone="6 - Automated Marketing Auditor"
        Labels=@("AI","Data","P1")
        Body=@"
## Score components
- [ ] Performance score
- [ ] Efficiency score
- [ ] Waste score
- [ ] Growth-opportunity score
- [ ] Tracking/data-quality score
- [ ] Overall score out of 100

## Tasks
- [ ] Define scoring rules
- [ ] Document scoring methodology
- [ ] Keep scoring deterministic
- [ ] Explain deductions and opportunities

## Done when
Two identical datasets always produce the same score and the user can understand why.
"@
    },
    @{
        Title="Connect Google Ads API"
        Milestone="7 - Automation"
        Labels=@("Data","Automation","P1")
        Body=@"
## Tasks
- [ ] Configure Google Ads API access
- [ ] Authenticate securely
- [ ] Retrieve campaign performance
- [ ] Retrieve keyword performance
- [ ] Retrieve search terms where available
- [ ] Retrieve geographic/device breakdowns
- [ ] Map API data into existing internal data model
- [ ] Replace sample CSV data optionally

## Done when
The application can analyze a live Google Ads account using the same pipeline as CSV data.
"@
    },
    @{
        Title="Connect GA4 Data API"
        Milestone="7 - Automation"
        Labels=@("Data","Automation","P1")
        Body=@"
## Tasks
- [ ] Configure GA4 Data API access
- [ ] Authenticate securely
- [ ] Retrieve sessions/users
- [ ] Retrieve key events/conversions
- [ ] Retrieve landing-page data
- [ ] Retrieve traffic-source data
- [ ] Join useful GA4 dimensions with advertising analysis

## Done when
GA4 context can be used alongside paid-media data in analysis and reporting.
"@
    },
    @{
        Title="Automate daily analysis and period comparisons"
        Milestone="7 - Automation"
        Labels=@("Automation","AI","Data","P1")
        Body=@"
## Tasks
- [ ] Retrieve yesterday's data
- [ ] Retrieve rolling 7-day data
- [ ] Compare against previous period
- [ ] Detect material changes
- [ ] Run AI analysis automatically
- [ ] Save findings
- [ ] Avoid alerts for insignificant changes

## Done when
The system can produce a useful daily analysis without a manual CSV upload.
"@
    },
    @{
        Title="Generate automated weekly marketing report"
        Milestone="7 - Automation"
        Labels=@("Automation","AI","P1")
        Body=@"
## Report
- [ ] Executive summary
- [ ] KPI changes
- [ ] Biggest wins
- [ ] Biggest problems
- [ ] Recommended actions
- [ ] Supporting evidence
- [ ] Next-week watch list

## Delivery
- [ ] Generate report automatically
- [ ] Add email or Slack delivery later

## Done when
The project creates a consistent weekly account-performance summary.
"@
    },
    @{
        Title="Prototype specialist marketing agents"
        Milestone="8 - Advanced AI Features"
        Labels=@("AI","P2")
        Body=@"
## Agents
- [ ] PPC Analyst
- [ ] Analytics Analyst
- [ ] CRO Analyst
- [ ] SEO Analyst
- [ ] Marketing Strategist / CMO

## Explore
- [ ] Tool calling
- [ ] Structured outputs
- [ ] RAG where useful
- [ ] MCP where useful
- [ ] Agent memory
- [ ] Multi-agent workflows

## Rule
Do not start this issue until the single-agent Version 1 is useful.

## Done when
Specialist agents demonstrably improve analysis rather than merely adding complexity.
"@
    },
    @{
        Title="Polish portfolio demo"
        Milestone="9 - Portfolio Version"
        Labels=@("Portfolio","Frontend","P1")
        Body=@"
## Product polish
- [ ] Professional dashboard design
- [ ] Demo dataset/account
- [ ] Onboarding/explanation
- [ ] Mobile-friendly layout
- [ ] Error/empty/loading states
- [ ] Final testing

## Done when
Someone unfamiliar with the project can open the demo and understand its purpose quickly.
"@
    },
    @{
        Title="Create project case study and demo materials"
        Milestone="9 - Portfolio Version"
        Labels=@("Portfolio","P1")
        Body=@"
## Case study
- [ ] Business problem
- [ ] Product goal
- [ ] AI architecture
- [ ] Technologies used
- [ ] Screenshots
- [ ] Challenges
- [ ] Solutions
- [ ] Results/lessons learned

## Demo
- [ ] Record 2-3 minute demo video
- [ ] Add live project URL
- [ ] Add GitHub repository link
- [ ] Add project to resume/portfolio

## Done when
The project can be shown clearly to an employer or client.
"@
    },
    @{
        Title="Future integrations and autonomous actions backlog"
        Milestone="9 - Portfolio Version"
        Labels=@("P2")
        Body=@"
Do not prioritize these until Version 1 works.

- [ ] Meta Ads integration
- [ ] Microsoft Ads integration
- [ ] Search Console integration
- [ ] SEO rank tracking
- [ ] Landing-page AI analysis
- [ ] Competitor analysis
- [ ] AI-generated ad copy
- [ ] AI-generated landing pages
- [ ] Budget forecasting
- [ ] Conversion forecasting
- [ ] Campaign anomaly alerts
- [ ] Automatic negative-keyword generation
- [ ] Carefully controlled Google Ads actions
- [ ] Client accounts
- [ ] Agency dashboard
- [ ] PDF marketing reports
"@
    }
)

# Avoid duplicate issue creation if the script is rerun.
Write-Host "Loading existing issue titles..."
$existingIssueTitles = gh issue list --repo $Repo --state all --limit 500 --json title |
    ConvertFrom-Json |
    ForEach-Object { $_.title }

Write-Host "Creating issues and adding them to '$ProjectTitle'..."
foreach ($issue in $issues) {
    if ($existingIssueTitles -contains $issue.Title) {
        Write-Host "  Skipping existing issue: $($issue.Title)"
        continue
    }

    $labelArg = ($issue.Labels -join ",")

    $url = gh issue create `
        --repo $Repo `
        --title $issue.Title `
        --body $issue.Body `
        --label $labelArg `
        --milestone $issue.Milestone `
        --project $ProjectTitle

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create issue: $($issue.Title)"
    }

    Write-Host "  Created: $($issue.Title)"
}

Write-Host ""
Write-Host "Done."
Write-Host "Repository: $repoFull"
Write-Host "Project: $ProjectTitle"
Write-Host ""
Write-Host "Open the project with:"
Write-Host "gh project view $projectNumber --owner $ProjectOwner --web"
