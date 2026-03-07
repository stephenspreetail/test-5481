# Round 2 — "88 MPH"

## Your Mission

Doc needs precision. The flux capacitor requires hitting **exactly $1,210,000 at exactly 22:04** on the target date. Upgrade your app to account for seasonal demand and output an exact date and time — not just a month number.

---

## New Inputs (add these to your existing app)

| Field | Description | Example |
|---|---|---|
| `campaign_start_date` | The date the merchant launches | `1955-03-01` |
| `seasonality` | A multiplier for each calendar month (12 values) | `Jan=0.8, Feb=0.8, ... Dec=1.5` |

Seasonality multipliers reflect demand changes by month. `1.0` means normal demand. `1.5` means 50% higher than normal. `0.8` means 20% lower than normal.

---

## Updated Formula (replaces your Round 1 formula)

**Units sold in month N:**
```
monthly_units(N) = base_units × (1 + growth_rate / 100)^N + (ad_budget / 25)
```

**Revenue in month N** (now includes seasonality):
```
monthly_revenue(N) = monthly_units(N) × price × seasonality[calendar_month_of_N]
```

Where `calendar_month_of_N` is the actual calendar month (Jan–Dec) that month N falls in, based on `campaign_start_date`.

**Cumulative revenue after month N:**
```
cumulative(N) = sum of monthly_revenue(1) through monthly_revenue(N)
```

---

## What Your App Must Output

Keep your Round 1 output. Add these three new fields:

| Field | Description | Example |
|---|---|---|
| `projected_revenue` | Cumulative total at the point of crossing $1,210,000 | `$1,214,320` |
| `achievement_date` | The exact calendar date of crossing | `1955-11-05` |
| `achievement_time` | The exact time of day of crossing | `22:04` |

---

## How to Calculate the Exact Date and Time

Once you find the month N where cumulative first exceeds $1,210,000:

```
1. revenue_entering_month  = cumulative(N-1)
2. revenue_needed          = 1,210,000 - revenue_entering_month
3. days_in_month           = actual number of days in that calendar month
4. day_of_crossing         = revenue_needed / (monthly_revenue(N) / days_in_month)
5. achievement_date        = campaign_start_date + (N-1) months + day_of_crossing days
6. achievement_time        = fractional part of day_of_crossing × 24 hours → format as HH:MM
```

**Example:** If `day_of_crossing = 5.918`, then:
- Date = the 5th of that month (plus campaign start offset)
- Time = 0.918 × 24 = 22.04 hours = **22:04**

---

## Rules

- Keep everything from Round 1. This is an upgrade, not a replacement.
- Seasonality multipliers are per calendar month, not per month-of-campaign.
- Use actual calendar days per month (e.g. November has 30 days, not 31).
- You have **25 minutes**.

---

## Scoring Scenarios (revealed at time's up)

You will be given three sets of inputs. Run each through your app and submit all three outputs. Each scenario is scored independently.
