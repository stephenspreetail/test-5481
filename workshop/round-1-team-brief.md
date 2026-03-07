# Round 1 — "Great Scott!"

## Your Mission

Build a revenue projection app. A merchant gives you their product details and ad spend. Your app tells them how much money they will make over the next 12 months.

---

## Inputs Your App Must Accept

| Field | Description | Example |
|---|---|---|
| `price` | Selling price per unit | `89.99` |
| `base_units` | Units sold per month before any advertising | `850` |
| `growth_rate` | Monthly growth rate as a percentage | `12` |
| `ad_budget` | Total advertising budget (spent evenly each month) | `15000` |

---

## What Your App Must Output

| Field | Description |
|---|---|
| `monthly_revenue` | A table showing revenue for each of the 12 months |
| `total_revenue` | Cumulative revenue at the end of month 12 |
| `breakeven_month` | The first month where cumulative revenue exceeds $1,210,000 |

---

## The Formula

**Units sold in month N:**
```
monthly_units(N) = base_units × (1 + growth_rate / 100)^N + (ad_budget / 25)
```

**Revenue in month N:**
```
monthly_revenue(N) = monthly_units(N) × price
```

**Cumulative revenue after month N:**
```
cumulative(N) = sum of monthly_revenue(1) through monthly_revenue(N)
```

---

## Rules

- Build anything — web app, spreadsheet, script, command-line tool. Whatever your team is fastest with.
- The formula above is fixed. Do not change it.
- Your output must show all 12 months, not just the final total.
- You have **25 minutes**.

---

## Scoring Scenario (revealed at time's up)

You will be given one set of inputs. Enter them into your app and submit your output. Scoring is based on accuracy versus the pre-calculated correct answer.
