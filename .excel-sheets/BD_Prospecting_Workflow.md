Create a "BD Prospecting" app that mimics the workflow across the four Excel sheets as described below. Use a modern, monochrome blue ui design.

The app must:
- Provide a sample Excel download in the Raw input sheet's required format
- Accept an Excel file upload in the Raw input sheet's required format
- Provide tabs to view: Parameters -> Raw Data -> Procesing -> Output
- Pre-populate parameters
- Not pre-populate the raw data in the app - the user must upload a sheet

# BD_Prospecting_Workflow.xlsx - Workflow Documentation

## Overview

**Purpose**: Score and prioritize business development prospects using a multi-dimensional scoring model (Fit, Intent, Engagement), then generate a prioritized action queue with recommended outreach strategies.

**Sheet Count**: 4 sheets

**Data Flow**: Parameters → Raw Data → Processing → Output

---

## Data Flow Diagram

```
Parameters              Raw Data               Processing              Output
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Scoring Weights  │   │ Prospect Data    │   │ Score Calcs      │   │ Action Queue     │
│ • Fit: 40%       │   │                  │   │                  │   │                  │
│ • Intent: 35%    │   │ • Company Info   │   │ • Fit Score      │   │ • Priority Tier  │
│ • Engage: 25%    │ → │ • Contact Info   │ → │ • Intent Score   │ → │ • Channel        │
│                  │   │ • Intent Signals │   │ • Engage Score   │   │ • Cadence        │
│ Fit Criteria     │   │ • Engagement     │   │ • Composite      │   │ • Next Action    │
│ • Industries     │   │ • Trigger Events │   │ • Timing Adj     │   │ • Talking Points │
│ • Size Range     │   │                  │   │ • Final Score    │   │                  │
│ • Geographies    │   └──────────────────┘   └──────────────────┘   │ Dashboard        │
│                  │           │                      ▲              │ • Tier Counts    │
│ Thresholds       │           │                      │              │ • Stale Alerts   │
│ • Hot: 80+       │           └──────────────────────┴──────────────┘
│ • Warm: 60-79    │                    (formulas reference both)
│ • Nurture: 40-59 │
│                  │
│ Timing Bonuses   │
│ • Q4: +15        │
│ • Trigger: +20   │
└──────────────────┘
```

---

## Sheet Details

### Sheet 1: Parameters

**Role**: Configuration hub controlling scoring weights, fit criteria, point values, and thresholds

| Section | Parameter | Cell | Value | Used By |
|---------|-----------|------|-------|---------|
| **Scoring Weights** | Fit Weight | B5 | 0.40 | Processing!P |
| | Intent Weight | B6 | 0.35 | Processing!P |
| | Engagement Weight | B7 | 0.25 | Processing!P |
| **Fit Criteria** | Target Industry 1 | B11 | SaaS | Processing!C |
| | Target Industry 2 | B12 | FinTech | Processing!C |
| | Target Industry 3 | B13 | HealthTech | Processing!C |
| | Adjacent Industry 1 | B14 | Manufacturing | Processing!C |
| | Adjacent Industry 2 | B15 | Retail | Processing!C |
| | Min Employees | B16 | 50 | Processing!D |
| | Max Employees | B17 | 1000 | Processing!D |
| | Ideal Emp Min | B18 | 200 | Processing!D |
| | Ideal Emp Max | B19 | 500 | Processing!D |
| | Target Geo 1 | B20 | US | Processing!E |
| | Target Geo 2 | B21 | UK | Processing!E |
| | Target Geo 3 | B22 | CA | Processing!E |
| **Intent Scoring** | Points per Website Visit | B26 | 10 | Processing!G |
| | Points per Content Download | B27 | 25 | Processing!H |
| | Points per Event Attendance | B28 | 40 | Processing!I |
| | Max Visit Score | B30 | 40 | Processing!G |
| | Max Content Score | B31 | 50 | Processing!H |
| | Max Event Score | B32 | 60 | Processing!I |
| **Engagement Scoring** | Points per Email Open | B36 | 5 | Processing!K |
| | Points per Email Reply | B37 | 30 | Processing!L |
| | Points per Meeting Held | B38 | 50 | Processing!M |
| | Staleness Penalty per Day | B39 | -2 | Processing!N |
| | Max Staleness Penalty | B40 | -40 | Processing!N |
| **Tier Thresholds** | Hot Threshold | B44 | 80 | Output!D |
| | Warm Threshold | B45 | 60 | Output!D |
| | Nurture Threshold | B46 | 40 | Output!D |
| **Timing Adjustments** | Q4 Budget Flush Bonus | B50 | 15 | Processing!Q |
| | Trigger Event Bonus | B51 | 20 | Processing!Q |
| | Q4 Start Month | B52 | 10 | Processing!Q |
| | Q4 End Month | B53 | 12 | Processing!Q |

---

### Sheet 2: Raw Data

**Role**: Source prospect and engagement data input (typically CRM export)

| Column | Header | Data Type | Description |
|--------|--------|-----------|-------------|
| A | Company ID | Text (COMP-###) | Unique identifier |
| B | Company Name | Text | Account name |
| C | Industry | Text | Primary industry vertical |
| D | Employee Count | Number | Company headcount |
| E | Revenue ($M) | Currency | Estimated annual revenue |
| F | HQ Country | Text | Headquarters location |
| G | Primary Contact | Text | Best contact name |
| H | Contact Title | Text | Role/seniority |
| I | Contact Email | Text | Email address |
| J | Website Visits (30d) | Number | Count from analytics |
| K | Content Downloads (30d) | Number | Gated content count |
| L | Event Registrations | Number | Webinar/event count |
| M | Emails Sent | Number | Total outreach count |
| N | Email Opens | Number | Open count |
| O | Email Replies | Number | Response count |
| P | Meetings Held | Number | Meeting count |
| Q | Last Touch Date | Date | Most recent interaction |
| R | Trigger Event | Text | Recent news/signal |
| S | Owner | Text | Assigned sales rep |
| T | Notes | Text | Context/comments |

**Row Count**: 10 sample prospects

---

### Sheet 3: Processing

**Role**: Calculate Fit, Intent, and Engagement sub-scores, then combine into Final Score with timing adjustments

**Key Formulas**:

| Column | Header | Formula | Purpose |
|--------|--------|---------|---------|
| A-B | Company ID/Name | `='Raw Data'!A2` | Link to source |
| C | Industry Match | `=IF(OR(Industry=Target1,Target2,Target3),100,IF(OR(Adjacent1,Adjacent2),50,0))` | 100 for target industries, 50 for adjacent, 0 otherwise |
| D | Size Match | `=IF(AND(Emp>=IdealMin,Emp<=IdealMax),100,IF(AND(Emp>=Min,Emp<=Max),60,0))` | 100 for ideal range, 60 for acceptable, 0 outside |
| E | Geo Match | `=IF(OR(Geo=Target1,Target2,Target3),100,40)` | 100 for target geos, 40 for other |
| F | Fit Score | `=AVERAGE(C:E)` | Average of industry/size/geo matches |
| G | Visit Score | `=MIN(Visits*PointsPerVisit, MaxVisitScore)` | Capped at 40 |
| H | Content Score | `=MIN(Downloads*PointsPerDL, MaxContentScore)` | Capped at 50 |
| I | Event Score | `=MIN(Events*PointsPerEvent, MaxEventScore)` | Capped at 60 |
| J | Intent Score | `=MIN(G+H+I, 100)` | Sum of intent signals, capped |
| K | Open Score | `=Opens*PointsPerOpen` | Email open points |
| L | Reply Score | `=Replies*PointsPerReply` | Email reply points |
| M | Meeting Score | `=Meetings*PointsPerMeeting` | Meeting points |
| N | Staleness Adj | `=MAX(MaxPenalty, DaysSinceTouch*PenaltyPerDay)` | Negative adjustment for stale prospects |
| O | Engage Score | `=MAX(0, MIN(K+L+M+N, 100))` | Bounded 0-100 |
| P | Composite Score | `=F*FitWeight + J*IntentWeight + O*EngageWeight` | Weighted combination |
| Q | Timing Adj | `=IF(Q4Month,Q4Bonus,0) + IF(TriggerEvent<>"",TriggerBonus,0)` | Seasonal + event bonuses |
| R | Final Score | `=MIN(P+Q, 100)` | Capped at 100 |

**Dependencies**: Raw Data (all columns), Parameters (B5:B7, B11:B22, B26:B32, B36:B40, B50:B53)

---

### Sheet 4: Output

**Role**: Present prioritized action queue and dashboard metrics for sales execution

**Key Formulas**:

| Column | Header | Formula | Purpose |
|--------|--------|---------|---------|
| A-B | Company ID/Name | `=Processing!A2` | Link to processing |
| C | Final Score | `=Processing!R2` | Pull calculated score |
| D | Priority Tier | `=IF(Score>=80,"HOT",IF(>=60,"WARM",IF(>=40,"NURTURE","DISQUALIFY")))` | Tier classification |
| E | Recommended Channel | `=IF(Meetings>0,"Call",IF(Replies>0,"Email",IF(Opens>2,"LinkedIn","Cold Email")))` | Based on engagement history |
| F | Cadence | `=IF(HOT,"Daily",IF(WARM,"2x/Week",IF(NURTURE,"Monthly","None")))` | Touch frequency |
| G | Next Action | `=IF(NoMeetings,"Book intro call",IF(NoReplies,"Send follow-up","Schedule demo"))` | Specific task |
| H | Days Since Touch | `=TODAY()-LastTouchDate` | Staleness indicator |
| I | Owner | `='Raw Data'!S2` | Assigned rep |
| J | Talking Points | `=IF(TriggerEvent,"Discuss: "&Event,IndustryDefault)` | Personalization hooks |

**Dashboard Metrics** (Rows 14-22):

| Metric | Formula | Purpose |
|--------|---------|---------|
| Total Hot Prospects | `=COUNTIF(Tier,"HOT")` | Pipeline health |
| Total Warm Prospects | `=COUNTIF(Tier,"WARM")` | Pipeline depth |
| Total Nurture | `=COUNTIF(Tier,"NURTURE")` | Long-term pipeline |
| Total Disqualified | `=COUNTIF(Tier,"DISQUALIFY")` | Bad fit count |
| Avg Score (Hot) | `=AVERAGEIF(Tier,"HOT",Score)` | Quality check |
| Avg Days Since Touch | `=AVERAGE(DaysSinceTouch)` | Engagement freshness |
| Stale Hot Prospects | `=SUMPRODUCT((Tier="HOT")*(Days>7))` | Urgent attention needed |

---

## Parameter Impact Analysis

| Parameter | Affects | Impact |
|-----------|---------|--------|
| Fit/Intent/Engage Weights (B5:B7) | Processing!P, Output!C | Changes relative importance of each dimension |
| Target Industries (B11:B13) | Processing!C | Determines which industries get 100 vs 50 vs 0 |
| Employee Range (B16:B19) | Processing!D | Defines acceptable and ideal company sizes |
| Target Geographies (B20:B22) | Processing!E | Determines which countries get full points |
| Intent Point Values (B26:B28) | Processing!G-I | Higher values increase intent signal weight |
| Intent Caps (B30:B32) | Processing!G-I | Prevents any single signal from dominating |
| Engagement Points (B36:B38) | Processing!K-M | Controls engagement signal sensitivity |
| Staleness Penalty (B39:B40) | Processing!N-O | How quickly cold prospects lose points |
| Tier Thresholds (B44:B46) | Output!D | Cutoffs for HOT/WARM/NURTURE/DQ classification |
| Q4 Bonus (B50) | Processing!Q | Seasonal scoring boost (Oct-Dec) |
| Trigger Event Bonus (B51) | Processing!Q | Bonus for prospects with news triggers |

---

## Decision Logic Summary

**Priority Tier Assignment**:
- Score ≥ 80 → **HOT** (Daily outreach)
- Score 60-79 → **WARM** (2x/week outreach)
- Score 40-59 → **NURTURE** (Monthly drip)
- Score < 40 → **DISQUALIFY** (Remove from active)

**Channel Recommendation**:
- Has held meetings → Call (warm relationship)
- Has email replies → Email (engaged)
- Has 3+ email opens → LinkedIn (aware but not responding)
- Otherwise → Cold Email (start fresh)

---

## Notes

- Scores recalculate dynamically via `TODAY()` for staleness penalty and Q4 detection
- All scoring parameters adjustable in Parameters sheet without formula changes
- Dashboard provides at-a-glance pipeline health and stale prospect alerts
- Designed for periodic CRM data refresh in Raw Data sheet
