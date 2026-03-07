# Round 1 — "Great Scott!"

## Your Mission

Use **Kova** to build a revenue projection app. Describe what you want in the chat interface — Kova will build it for you. Your job is to give Kova clear enough instructions that the app comes out correct.

---

## What to Build

A merchant enters their product details and ad spend. The app shows them how much money they will make over the next 12 months.

---

## Inputs the App Must Accept

| Field | Description | Example |
|---|---|---|
| Price | Selling price per unit | `89.99` |
| Base units | Units sold per month before any advertising | `850` |
| Growth rate | Monthly growth rate as a percentage | `12` |
| Ad budget | Total advertising budget (spent evenly each month) | `15000` |

---

## What the App Must Show

- A table of revenue for each of the 12 months
- A cumulative total at the end of month 12
- The first month where cumulative revenue exceeds $1,210,000

---

## The Formula

Give this formula to Kova exactly as written. It must not be changed.

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

## Tips for Prompting Kova

- Describe the inputs and outputs in plain language first, then paste the formula
- Ask Kova to show all 12 months in a table, not just the final total
- If the output looks wrong, describe what is wrong and ask Kova to fix it — do not start over
- Both team members should take turns suggesting what to ask Kova next

---

## Rules

- Use Kova's chat interface to build the app — no manual coding
- The formula above is fixed. If Kova changes it, correct it
- You have **25 minutes**

---

## Scoring Scenario (revealed at time's up)

You will be given one set of inputs. Enter them into your Kova-built app and submit the output.
