# Round 2 Facilitator Guide — "88 MPH"

## At a Glance

| | |
|---|---|
| **Duration** | 25 min build + 5 min scoring |
| **Goal** | Teams upgrade their Kova app to add seasonality and exact date/time output |
| **The skill being tested** | Describing a multi-step algorithm to an AI app builder precisely enough to get it right |
| **Watch for** | Teams starting over; vague prompts about the time calculation; not testing seasonality separately |

---

## What Teams Are Actually Doing

Teams are prompting Kova to modify what they already built. The two new concepts — seasonality multipliers and fractional-day time interpolation — both need to be explained clearly in the chat. Neither is complicated once you understand them, but describing them precisely enough for Kova to implement correctly is the challenge.

The time calculation is the hardest part to describe. Most teams will need 2–3 iterations with Kova to get it right. That is expected and normal.

---

## Before the Round Starts

Pre-calculate correct answers for all three scenarios. Use these to immediately tell a team whether their output is right.

### Scoring Scenarios and Correct Answers

---

**Scenario A**
```
price         = 89.99
base_units    = 850
growth_rate   = 12%
ad_budget     = 15000
start_date    = 1955-01-01

seasonality:
  Jan=0.8  Feb=0.8  Mar=0.9  Apr=1.0  May=1.0  Jun=1.1
  Jul=1.2  Aug=1.2  Sep=1.1  Oct=1.0  Nov=1.3  Dec=1.5
```

| Month | Calendar | Seas. | Units | Revenue | Cumulative |
|---|---|---|---|---|---|
| 1 | Jan | 0.8 | 1,552 | $111,666.78 | $111,666.78 |
| 2 | Feb | 0.8 | 1,618 | $116,448.66 | $228,115.44 |
| 3 | Mar | 0.9 | 1,692 | $137,006.75 | $365,122.19 |
| 4 | Apr | 1.0 | 1,774 | $159,628.29 | $524,750.48 |
| 5 | May | 1.0 | 1,867 | $167,800.46 | $692,550.94 |
| 6 | Jun | 1.1 | 1,971 | $194,476.16 | $887,027.10 |
| 7 | Jul | 1.2 | 2,087 | $225,206.52 | $1,112,233.62 |
| 8 | Aug | 1.2 | 2,217 | $239,385.30 | $1,351,618.92 |

Crossing happens in **Month 8 (August 1955)**:
```
revenue_entering_month  = $1,112,233.62
revenue_needed          = $97,766.38
days_in_month           = 31
day_of_crossing         = 97,766.38 / (239,385.30 / 31) = 12.664
```

**Correct Answer A:** `achievement_date = 1955-08-12` / `achievement_time = 15:56`

---

**Scenario B**
```
price         = 24.99
base_units    = 4200
growth_rate   = 3%
ad_budget     = 5000
start_date    = 1955-06-01

seasonality:  all months = 1.0
```

Flat seasonality. This tests calendar arithmetic without the complication of varying multipliers. If a team gets A and C wrong but B right, seasonality mapping is the bug.

| Month | Calendar | Units | Revenue | Cumulative |
|---|---|---|---|---|
| 1 | Jun | 4,532 | $113,244.68 | $113,244.68 |
| 2 | Jul | 4,668 | $116,643.32 | $229,888.00 |
| 3 | Aug | 4,808 | $120,151.92 | $350,039.92 |
| 4 | Sep | 4,952 | $123,760.48 | $473,800.40 |
| 5 | Oct | 5,101 | $127,474.99 | $601,275.39 |
| 6 | Nov | 5,254 | $131,297.46 | $732,572.85 |
| 7 | Dec | 5,412 | $135,225.88 | $867,798.73 |
| 8 | Jan | 5,574 | $139,274.26 | $1,007,072.99 |
| 9 | Feb | 5,741 | $143,441.59 | $1,150,514.58 |
| 10 | Mar | 5,913 | $147,735.87 | $1,298,250.45 |

Crossing happens in **Month 10 (March 1956)**:
```
revenue_entering_month  = $1,150,514.58
revenue_needed          = $59,485.42
days_in_month           = 31
day_of_crossing         = 59,485.42 / (147,735.87 / 31) = 12.482
```

**Correct Answer B:** `achievement_date = 1956-03-12` / `achievement_time = 11:34`

---

**Scenario C**
```
price         = 299.00
base_units    = 120
growth_rate   = 25%
ad_budget     = 40000
start_date    = 1955-09-01

seasonality:
  Jan=0.7  Feb=0.7  Mar=0.8  Apr=0.9  May=1.0  Jun=1.0
  Jul=0.9  Aug=0.8  Sep=1.1  Oct=1.3  Nov=1.4  Dec=1.6
```

| Month | Calendar | Seas. | Units | Revenue | Cumulative |
|---|---|---|---|---|---|
| 1 | Sep | 1.1 | 1,750 | $575,575.00 | $575,575.00 |
| 2 | Oct | 1.3 | 2,388 | $927,643.20 | $1,503,218.20 |

Crossing happens in **Month 2 (October 1955)**:
```
revenue_entering_month  = $575,575.00
revenue_needed          = $634,425.00
days_in_month           = 31
day_of_crossing         = 634,425.00 / (927,643.20 / 31) = 21.200
```

**Correct Answer C:** `achievement_date = 1955-10-21` / `achievement_time = 04:48`

---

### Quick Reference

| Scenario | Date | Time |
|---|---|---|
| A | 1955-08-12 | 15:56 |
| B | 1956-03-12 | 11:34 |
| C | 1955-10-21 | 04:48 |

---

## Timing Guide

| Clock | What you do |
|---|---|
| 0:00 | Hand out brief. Say: "You are upgrading your existing app, not starting over. 25 minutes." |
| 3:00 | Check every team is prompting Kova to modify their existing app. Stop anyone who opened a new project. |
| 8:00 | Teams should have seasonality inputs added. Revenue table should be changing month-to-month. |
| 15:00 | Teams should be working on the date/time output. This is the hard part — most will be iterating with Kova here. |
| 22:00 | Announce "3 minutes." Teams should be testing outputs, not writing new prompts. |
| 25:00 | Call time. Reveal all three scenarios simultaneously. |
| 25:00–30:00 | Teams run each scenario and record outputs. Collect results. |

---

## What Healthy Team Progress Looks Like

**Minutes 0–5: Describing the upgrade**
- Team's first message to Kova says something like: "Upgrade the existing app. Add a campaign start date input and 12 monthly seasonality multipliers. Update the revenue formula to multiply by the seasonality value for the calendar month that each campaign month falls in."
- One team member is drafting the prompt; the other is checking the brief to make sure nothing is missed

**Minutes 5–12: Verifying seasonality**
- Seasonality inputs appear in the app
- Team does the sanity check: set all 12 values to 1.0 — numbers should be close to Round 1 output
- Team changes one month's multiplier (e.g. double November) and checks that November revenue doubles

**Minutes 12–22: Getting the date and time right**
- This takes most teams 2–3 attempts with Kova
- Common pattern: Kova gives a date but no time → team asks Kova to add the fractional day → time appears but is wrong → team describes the calculation more precisely
- Non-typing team member is working through the algorithm on paper as a reference for what to tell Kova next

**Minutes 22–25: Testing all three scenarios**
- Team runs all three scenarios and records outputs
- No new prompts — only final checks

---

## Common Problems and How to Coach Them

### "Kova added seasonality but the numbers didn't change"

The multiplier is not in the right place. Ask the team:

> "Tell Kova: the seasonality multiplier should be applied in the revenue calculation, not the units calculation. Revenue = units × price × seasonality for that calendar month."

### "The date looks right but there is no time showing"

Kova implemented the day calculation but not the fractional-to-hours conversion. Coach the team to prompt:

> "The day of crossing will have a decimal part — for example, 5.918 means the 5th day at 0.918 × 24 = 22.04 hours. Please show the achievement time by converting the fractional part of the crossing day into HH:MM format."

### "The time is always 00:00 or 12:00"

The fractional part is being lost — Kova is rounding the day to a whole number. Coach the team:

> "Tell Kova: do not round the day of crossing to an integer. Keep the decimal, then multiply the decimal portion by 24 to get the hour."

### "The calendar months are wrong — month 3 of a June start shows March instead of August"

Kova is counting from January instead of from the start month. Coach the team:

> "Tell Kova: the calendar month for campaign month N should be calculated as: start month + N - 1, wrapping around after December back to January."

### "Scenario B gives a different month than expected"

Scenario B uses different inputs (lower price, higher units, lower growth) — it is not expected to match Round 1. If the team thinks B is wrong because it doesn't match Round 1, reassure them: B is intentionally a different merchant. The sanity check (all 1.0 seasonality = Round 1 output) only works when using the exact same inputs as Round 1.

### "Team is starting over because the upgrade got messy"

Stop them immediately. Starting over costs 10+ minutes. Coach them:

> "Tell Kova exactly what is broken. 'The revenue formula is correct but the time output is missing.' Kova can fix one thing at a time."

---

## Scoring

### How to Score Each Team

Run this for each of the three scenarios:

```
revenue_error  = |team_revenue - correct_revenue| / correct_revenue
revenue_score  = max(0,  1 - revenue_error)

date_diff_days = |days between team_date and correct_date|
time_diff_mins = |team_time_in_minutes - correct_time_in_minutes|
date_score     = max(0,  1 - (date_diff_days + time_diff_mins / 1440) / 7)

scenario_score = (revenue_score × 0.7) + (date_score × 0.3)

round_2_score  = average of three scenario scores × 100
```

### Diagnosing Low Scores

| What the team got wrong | Likely cause |
|---|---|
| All three revenues off, dates off | Seasonality not applied to formula |
| Revenues right, date is first of crossing month, time = 00:00 | Date/time interpolation not implemented |
| Revenues right, date right, time = 00:00 | Fractional day not converted to HH:MM |
| A and C wrong, B right | Calendar month offset from start_date not applied |
| A right, B and C wrong | Correct for Round 1 inputs only; seasonality lookup is hardcoded |

---

## Transition to Round 3

> "You can now tell a merchant exactly when they will hit their revenue target. Round 3 flips the problem. Doc knows exactly when he needs to hit $1,210,000 — 22:04 on November 5th. Your app needs to work backwards: find the minimum ad budget that makes it happen. You'll describe an optimizer to Kova that runs your existing projection formula in a search loop."

Hand out the Round 3 brief immediately.
