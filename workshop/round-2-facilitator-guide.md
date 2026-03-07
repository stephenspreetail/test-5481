# Round 2 Facilitator Guide — "88 MPH"

## At a Glance

| | |
|---|---|
| **Duration** | 25 min build + 5 min scoring |
| **Goal** | Teams add seasonality and date/time interpolation to their Round 1 app |
| **Complexity** | Medium — two new concepts: seasonality mapping + fractional day calculation |
| **Watch for** | Teams rebuilding from scratch (redirect them); time arithmetic bugs |

---

## Before the Round Starts

Pre-calculate correct answers for all three scenarios. Work through each one using the formula below so you can diagnose team errors quickly during the round.

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

Month-by-month (seasonality applied):

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

Crossing happens in **Month 8 (August 1955)**.

```
revenue_entering_month  = $1,112,233.62
revenue_needed          = $1,210,000 - $1,112,233.62 = $97,766.38
days_in_month           = 31  (August has 31 days)
daily_revenue           = $239,385.30 / 31 = $7,721.46
day_of_crossing         = $97,766.38 / $7,721.46 = 12.664...

date = 1955-01-01 + 7 months + 12.664 days = 1955-08-12 + 0.664 days
time = 0.664 × 24 = 15.94 hours → 15:56
```

**Correct Answer A:**
```
projected_revenue  = $1,214,920  (cumulative at end of crossing month, for reference)
achievement_date   = 1955-08-12
achievement_time   = 15:56
```

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

Flat seasonality means this scenario tests clean date arithmetic with no multiplier complexity.

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

Crossing happens in **Month 10 (March 1956)**.

```
revenue_entering_month  = $1,150,514.58
revenue_needed          = $1,210,000 - $1,150,514.58 = $59,485.42
days_in_month           = 31  (March has 31 days)
daily_revenue           = $147,735.87 / 31 = $4,765.67
day_of_crossing         = $59,485.42 / $4,765.67 = 12.482...

date = 1955-06-01 + 9 months + 12.482 days = 1956-03-12 + 0.482 days
time = 0.482 × 24 = 11.57 hours → 11:34
```

**Correct Answer B:**
```
projected_revenue  = $1,298,250.45
achievement_date   = 1956-03-12
achievement_time   = 11:34
```

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

Crossing happens in **Month 2 (October 1955)**.

```
revenue_entering_month  = $575,575.00
revenue_needed          = $1,210,000 - $575,575.00 = $634,425.00
days_in_month           = 31  (October has 31 days)
daily_revenue           = $927,643.20 / 31 = $29,924.62
day_of_crossing         = $634,425.00 / $29,924.62 = 21.200...

date = 1955-09-01 + 1 month + 21.200 days = 1955-10-21 + 0.200 days
time = 0.200 × 24 = 4.80 hours → 04:48
```

**Correct Answer C:**
```
projected_revenue  = $1,503,218.20
achievement_date   = 1955-10-21
achievement_time   = 04:48
```

---

## Timing Guide

| Clock | What you do |
|---|---|
| 0:00 | Hand out brief. Say: "Keep your Round 1 app. You are adding on top of it. 25 minutes." |
| 3:00 | Check that every team is modifying their existing app, not starting fresh. |
| 8:00 | Teams should have seasonal multipliers wired in and monthly revenue changing. |
| 15:00 | Teams should be working on the date/time interpolation step. If not, coach now. |
| 22:00 | Announce "3 minutes." Teams should be testing, not building. |
| 25:00 | Call time. Reveal all three scenarios simultaneously. |
| 25:00–30:00 | Teams run each scenario and record their outputs. Collect results. |

---

## What Healthy Team Progress Looks Like

**Minutes 0–5**
- Engineer immediately adds `campaign_start_date` and the 12 seasonality inputs to the existing UI
- Non-engineer prepares a simple validation: if all seasonality values are 1.0, output should match Round 1
- Both agree not to change the units formula — only the revenue formula gains the multiplier

**Minutes 5–15**
- Monthly revenue is visibly different month-to-month based on the multiplier
- Engineer and non-engineer test Scenario B (all 1.0 seasonality) as a sanity check against Round 1 output
- Non-engineer asks: "If I change November to 2.0, does November revenue double?" — it should

**Minutes 15–22**
- Engineer is implementing the date/time interpolation
- Non-engineer is working out the day arithmetic on paper as a reference: "November starts on day 1 of the month. If I need 40% of November's revenue, that's 40% × 30 days = 12 days in. 0.4 × 24 hours = 9:36."
- Both verify: fractional day → hours → HH:MM format is working

**Minutes 22–25**
- Testing with all three scenario inputs
- Output shows date AND time, not just a month number

---

## Common Problems and How to Coach Them

### "We're getting the right month but the date is wrong"

The interpolation arithmetic is off. Walk them through it step by step:

1. "How much revenue do you have entering the crossing month?" (cumulative at end of previous month)
2. "How much revenue do you need to reach $1,210,000 from there?"
3. "How much revenue does the crossing month generate per day?" (monthly revenue ÷ days in that month)
4. "How many days into the month until you earn that much?" (revenue needed ÷ daily revenue)

If step 4 gives a number > 31, their previous-month cumulative is wrong.

### "Our time is always midnight or noon"

They computed days but dropped the fractional part. Ask: "What is your `day_of_crossing` value? Does it have a decimal?" If it's being floored to an integer, find where that truncation happens.

### "Seasonality doesn't seem to change anything"

They are applying the multiplier to the wrong thing — likely to units instead of revenue, or not applying it at all. Ask: "If I set every month to 0.0, does your revenue become zero?" If not, the multiplier is not in the revenue formula.

### "Our calendar months are off by one"

This is a common fence-post error. If campaign starts Jan 1:
- Month 1 of campaign = January → seasonality[Jan]
- Month 13 would wrap back to January

Ask: "What calendar month does your app say month 3 of the campaign falls in?" With a Jan 1 start, Month 3 = March. With a Jun 1 start, Month 3 = August.

### "Scenario B gives a different answer than Round 1"

Expected — Round 2 changes the formula. Even with all seasonality = 1.0, the growth compounding is the same but the test scenario uses different inputs (start date Jun 1955, not a Round 1 input). If they are re-running the exact Round 1 inputs with all 1.0 seasonality and getting a different revenue, their multiplier application is wrong.

---

## Scoring

### How to Score Each Team

Run this for each of the three scenarios:

```
revenue_error  = |team_revenue - correct_revenue| / correct_revenue
revenue_score  = max(0,  1 - revenue_error)

team_minutes   = hours_part × 60 + minutes_part   (from team's achievement_time)
correct_mins   = hours_part × 60 + minutes_part   (from correct answer)
date_error     = |days between team_date and correct_date| + |team_minutes - correct_mins| / 1440
date_score     = max(0,  1 - date_error / 7)       ← 7-day tolerance

scenario_score = (revenue_score × 0.7) + (date_score × 0.3)

round_2_score  = average of three scenario scores × 100
```

### Quick Reference — Correct Answers

| Scenario | Revenue | Date | Time |
|---|---|---|---|
| A | $1,214,920 | 1955-08-12 | 15:56 |
| B | $1,298,250 | 1956-03-12 | 11:34 |
| C | $1,503,218 | 1955-10-21 | 04:48 |

### Diagnosing Team Scores

| Symptom | Likely cause |
|---|---|
| Revenue wrong, date wrong | Seasonality not applied |
| Revenue right, date is just month 1 | Interpolation not implemented |
| Revenue right, date right, time = 00:00 | Fractional day not converted to time |
| All three scenarios give same date | Calendar month not shifting with start_date |
| Scenario B wrong but A and C right | Off-by-one error in month indexing |

---

## What to Say When Transitioning to Round 3

> "You can now tell a merchant exactly when they will hit their target. Round 3 flips the problem. Instead of projecting forward, your app will work backwards. Doc knows when he needs to hit the number. Your app will find the minimum ad budget to make it happen."

Pause for any quick questions, then hand out the Round 3 brief.
