# Round 2 — "88 MPH"

## Your Mission

Doc needs precision. The flux capacitor requires hitting **exactly $1,210,000 at exactly 22:04** on the target date. Use Kova to upgrade your existing app to handle seasonal demand and output an exact date and time — not just a month number.

**Do not start a new app. Describe the upgrade to Kova and let it modify what you already built.**

---

## New Inputs to Add

Tell Kova the app needs two new inputs:

| Field | Description | Example |
|---|---|---|
| Campaign start date | The date the merchant launches | `1955-03-01` |
| Seasonality (12 values) | A demand multiplier for each calendar month, January through December | `Jan=0.8, Feb=0.8 ... Dec=1.5` |

Seasonality reflects how demand changes by time of year. `1.0` = normal. `1.5` = 50% higher than normal. `0.8` = 20% lower.

---

## Updated Formula

Tell Kova to update the revenue formula. Only the revenue line changes — the units formula stays the same.

**Units sold in month N (unchanged from Round 1):**
```
monthly_units(N) = base_units × (1 + growth_rate / 100)^N + (ad_budget / 25)
```

**Revenue in month N (updated — now includes seasonality):**
```
monthly_revenue(N) = monthly_units(N) × price × seasonality[calendar_month_of_N]
```

Where `calendar_month_of_N` is the actual calendar month (Jan–Dec) that month N falls in, based on the campaign start date.

**Cumulative revenue (unchanged):**
```
cumulative(N) = sum of monthly_revenue(1) through monthly_revenue(N)
```

---

## New Output Fields to Add

Keep the Round 1 table. Ask Kova to also show:

| Field | Description | Example |
|---|---|---|
| `achievement_date` | The exact calendar date when cumulative revenue crosses $1,210,000 | `1955-11-05` |
| `achievement_time` | The exact time of day of crossing | `22:04` |

---

## How to Explain the Date and Time Calculation to Kova

Describe it step by step in your prompt:

> Once you find the month where cumulative revenue first exceeds $1,210,000:
> 1. Calculate how much revenue was accumulated at the end of the previous month
> 2. Calculate how much additional revenue is needed to reach $1,210,000
> 3. Divide that by the daily revenue rate for the crossing month (monthly revenue ÷ days in that month)
> 4. That gives you the day of the month when crossing happens, including a decimal fraction
> 5. The date is: campaign start date + (N-1) full months + that many days
> 6. The time is: the decimal fraction of the day × 24 hours, formatted as HH:MM

**Example to give Kova:** If the crossing happens 5.918 days into a month, the date is the 5th of that month and the time is 0.918 × 24 = 22.04 hours = **22:04**.

---

## Tips for Prompting Kova

- Start by telling Kova: "I want to upgrade the existing app, not replace it"
- Give Kova the seasonality explanation and the date/time algorithm in one clear message
- Test seasonality first: set all 12 values to 1.0 — revenue should be close to Round 1 output
- Test the time calculation separately: ask Kova what time it shows if the crossing day is 5.918

---

## Rules

- Upgrade the existing Kova app — do not start over
- The formula must use actual calendar days per month (November = 30, August = 31, etc.)
- You have **25 minutes**

---

## Scoring Scenarios (revealed at time's up)

You will be given three sets of inputs including seasonality values. Run each through your app and submit all three outputs.
