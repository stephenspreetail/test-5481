# Round 1 Facilitator Guide — "Great Scott!"

## At a Glance

| | |
|---|---|
| **Duration** | 25 min build + 5 min scoring |
| **Goal** | Teams build a basic revenue projection tool |
| **Complexity** | Low — single formula, 12-month loop, no edge cases |
| **Watch for** | Teams overthinking the UI; keep them focused on correct output |

---

## Before the Round Starts

Pre-calculate the correct answers for your scoring scenarios. Use this formula:

```
monthly_units(N) = base_units × (1 + growth_rate/100)^N + (ad_budget/25)
monthly_revenue(N) = monthly_units(N) × price
cumulative(N) = sum of monthly_revenue(1..N)
```

### Pre-Calculated Scoring Scenario

**Inputs:**
```
price         = 89.99
base_units    = 850
growth_rate   = 12
ad_budget     = 15000
```

**Correct outputs:**

| Month | Units | Revenue | Cumulative |
|---|---|---|---|
| 1 | 1,552 | $139,583.48 | $139,583.48 |
| 2 | 1,618 | $145,560.82 | $285,144.30 |
| 3 | 1,692 | $152,229.72 | $437,374.02 |
| 4 | 1,774 | $159,628.29 | $597,002.31 |
| 5 | 1,867 | $167,800.46 | $764,802.77 |
| 6 | 1,971 | $176,796.51 | $941,599.28 |
| 7 | 2,087 | $187,672.10 | $1,129,271.38 |
| 8 | 2,217 | $199,487.75 | $1,328,759.13 |
| 9 | 2,363 | $212,612.08 | $1,541,371.21 |
| 10 | 2,527 | $227,325.85 | $1,768,697.06 |
| 11 | 2,710 | $243,928.75 | $2,012,625.81 |
| 12 | 2,915 | $262,344.85 | $2,274,970.66 |

```
total_revenue    = $2,274,970.66
breakeven_month  = Month 8 (cumulative first exceeds $1,210,000)
```

> **Note on Month 8:** Cumulative after Month 7 is $1,129,271. After Month 8 it is $1,328,759. So Month 8 is the correct answer for breakeven_month.

---

## Timing Guide

| Clock | What you do |
|---|---|
| 0:00 | Hand out or display the team brief. Say: "You have 25 minutes. Go." |
| 5:00 | Walk the room. Any team still debating what to build needs a nudge — see coaching below. |
| 15:00 | Check in with each team. They should have output appearing on screen. If not, see coaching. |
| 20:00 | Announce "5 minutes remaining." Teams should be testing, not building. |
| 25:00 | Call time. Reveal the scoring scenario (inputs above). |
| 25:00–30:00 | Teams enter inputs and record their outputs. Collect results. |

---

## What Healthy Team Progress Looks Like

**Minutes 0–5**
- Engineer is setting up a project or file
- Non-engineer is working out the formula by hand on paper or in a calculator
- Both are aligned on what format the output will take (table in a web page, printed rows in terminal, etc.)

**Minutes 5–15**
- The loop is running — app is producing 12 rows of numbers
- Numbers may be wrong but output is visible
- Non-engineer is spot-checking: "Month 1 with these inputs should be roughly $140k — does your app say that?"

**Minutes 15–25**
- Output looks reasonable
- Team is adding the cumulative column and breakeven_month detection
- Non-engineer is testing edge cases: what if budget is 0? What if growth is 0?

---

## Common Problems and How to Coach Them

### "Our numbers don't match yours at all"

Ask: "What does your app output for Month 1 with budget=0 and growth=0?"

Expected answer: `850 × 89.99 = $76,491.50`

If they get that right, the bug is in the compounding. Ask them to show you how they apply `(1 + growth_rate/100)^N`. Common mistake: they multiply by `growth_rate` instead of `(1 + growth_rate/100)`.

### "We're not sure what 'breakeven' means"

Clarify: "Find the first month where your running total first goes over $1,210,000. That month number is your answer." Draw it on paper: a cumulative column, circle the first cell that exceeds the target.

### "We built something too complicated"

If a team spent 10 minutes on UI styling and hasn't wired up the formula: "Freeze the design. Get a number on the screen — any number — using the formula. You can make it pretty in the last 5 minutes."

### "We finished early"

Good. Direct them to validate edge cases:
- Budget = 0: does it still run? Units should just be compounded base units.
- Growth = 0: revenue should be a flat line.
- Very high growth (e.g. 100%): cumulative should hit $1.21M in month 1 or 2.

---

## Scoring

### How to Score Each Team

```
revenue_error  = |team_total_revenue - 2,274,970.66| / 2,274,970.66
revenue_score  = max(0,  1 - revenue_error)

breakeven_correct = 1 if team says Month 8, else 0

round_1_score = (revenue_score × 0.7 + breakeven_correct × 0.3) × 100
```

### Example Scores

| Team output | Revenue score | Breakeven | Round 1 score |
|---|---|---|---|
| $2,274,970 / Month 8 | 1.00 | 1 | **100** |
| $2,200,000 / Month 8 | 0.97 | 1 | **97.8** |
| $2,274,970 / Month 7 | 1.00 | 0 | **70** |
| $1,800,000 / Month 6 | 0.79 | 0 | **55.4** |

### Announcing Results

Read out scores team by team. For any team below 80, briefly say which part cost them points — revenue accuracy or breakeven month — so they know what to check. This sets them up to fix their formula before Round 2.

---

## What to Say When Transitioning to Round 2

> "Good work. Your app can project revenue. But Doc needs more than a ballpark — he needs to know the exact date and time the number crosses. In Round 2 you are going to add calendar awareness and seasonal demand. Keep everything you built. You're adding on top of it."

Hand out the Round 2 brief immediately after announcing Round 1 scores.
