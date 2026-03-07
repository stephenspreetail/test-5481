# Round 1 Facilitator Guide — "Great Scott!"

## At a Glance

| | |
|---|---|
| **Duration** | 25 min build + 5 min scoring |
| **Goal** | Teams use Kova to build a working revenue projection app |
| **The skill being tested** | Describing requirements clearly enough for an AI app builder to get them right |
| **Watch for** | Teams writing vague prompts; teams accepting wrong output without challenging it |

---

## What Teams Are Actually Doing

Teams are **not writing code**. They are prompting Kova — describing the app they want in the chat interface — and Kova builds it. The challenge is in how precisely and completely they can describe:

1. What inputs the app should have
2. What the formula is
3. What the output should look like
4. What is wrong when it comes out incorrect

Both team members are equally useful here. The person who can describe requirements in plain language is as valuable as the person who understands the formula.

---

## Before the Round Starts

Pre-calculate the correct answers so you can immediately tell a team whether their app is producing correct output.

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
breakeven_month  = Month 8  (cumulative first exceeds $1,210,000 between months 7 and 8)
```

---

## Timing Guide

| Clock | What you do |
|---|---|
| 0:00 | Hand out brief. Say: "Use Kova to build this. Describe what you want — Kova builds it. 25 minutes." |
| 5:00 | Walk the room. Every team should have sent at least one message to Kova. |
| 10:00 | Teams should have an app with inputs and some output visible. If output is blank or erroring, coach on prompt clarity. |
| 18:00 | Teams should be testing numbers and correcting Kova if outputs are wrong. |
| 23:00 | Announce "2 minutes." Teams should be running final checks, not prompting new features. |
| 25:00 | Call time. Reveal the scoring inputs. Teams enter values and record output. |
| 25:00–30:00 | Collect results. Score and display on leaderboard. |

---

## What Healthy Team Progress Looks Like

**Minutes 0–5: Scoping the prompt**
- Team discusses what to tell Kova — what does the app need to do?
- First message to Kova describes all four inputs, the desired output table, and the formula
- Both team members contribute: one describes the inputs, the other describes the formula

**Minutes 5–15: Iterating on the output**
- Kova has built something — team checks whether numbers look reasonable
- Team does a quick sanity check: "Month 1 with budget=0 and growth=0 should be 850 × 89.99 = $76,491. Does it say that?"
- If numbers are wrong, team tells Kova specifically what is wrong — not "fix it" but "the formula for units should use exponentiation for growth, not multiplication"

**Minutes 15–25: Refining and verifying**
- Table shows all 12 months with a cumulative column
- Breakeven month is identified
- Team tests with a few different inputs to confirm the app behaves sensibly

---

## Common Problems and How to Coach Them

### "Kova built something but we don't know if the numbers are right"

Ask the team to test a simple known case first:

> "Set growth to 0% and budget to 0. Month 1 revenue should be exactly base_units × price. Does your app give that?"

If yes, the base case is right. Then ask them to increase growth to 10% and check that month 2 units are higher than month 1.

### "Kova keeps changing the formula or ignoring it"

The team needs to be more explicit. Coach them to paste the formula directly into their Kova message and say:

> "Use this formula exactly. Do not simplify or change it."

If Kova still approximates it, the team should follow up: "The formula for monthly_units uses `(1 + growth_rate/100)^N` — the N is an exponent, not a multiplier."

### "The app looks nice but has no numbers / the table is empty"

Kova may have built the UI without wiring up the calculation. Coach the team to ask Kova:

> "When I click calculate, it should run the formula for each of the 12 months and populate the table. Can you add that?"

### "Both team members are watching one person type"

This is the most common waste of time. The non-typing person should be:
- Working out what to check in the output
- Drafting the next prompt on paper
- Doing the manual calculation for month 1 to verify against the app

Redirect them: "While Kova is building, your partner should be calculating what month 1 output should be so you can check it the moment it appears."

### "Team is starting over because something is wrong"

Stop them. Starting over loses all progress. Coach them to describe the specific problem to Kova instead:

> "The cumulative column is adding wrong — it seems to reset each month instead of running total. Can you fix just that column?"

---

## Scoring

### How to Score Each Team

```
revenue_error   = |team_total_revenue - 2,274,970.66| / 2,274,970.66
revenue_score   = max(0,  1 - revenue_error)

breakeven_score = 1 if team says Month 8, else 0

round_1_score   = (revenue_score × 0.7 + breakeven_score × 0.3) × 100
```

### Example Scores

| Team output | Revenue score | Breakeven | Round 1 score |
|---|---|---|---|
| $2,274,970 / Month 8 | 1.00 | 1 | **100** |
| $2,200,000 / Month 8 | 0.97 | 1 | **97.8** |
| $2,274,970 / Month 7 | 1.00 | 0 | **70** |
| $1,800,000 / Month 6 | 0.79 | 0 | **55.4** |

### Announcing Results

Read scores team by team. For teams below 80, briefly say whether the revenue was off, the breakeven was wrong, or both — so they know which prompt to fix before Round 2.

---

## Transition to Round 2

> "Your app can project revenue by month. But Doc needs to know the exact date and time the number crosses — not just which month. In Round 2 you will add two things: seasonal demand that varies by calendar month, and an output that gives a precise date and time. Keep everything you've built. You're describing an upgrade to Kova, not starting a new app."

Hand out the Round 2 brief immediately after scores are announced.
