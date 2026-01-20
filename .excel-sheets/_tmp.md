Create a "Loss Reserve Adequacy" app that mimics the workflow across the four Excel sheets as described below. Use a modern, monochrome blue ui design.

The app must:
- Provide a sample Excel download in the Raw input sheet's required format
- Accept an Excel file upload in the Raw input sheet's required format

# Loss_Reserve_Adequacy.xlsx - Workflow Documentation

## Overview

**Purpose**: Calculate insurance loss reserve adequacy by applying development factors to claims, then flag policies for renewal decisions based on projected ultimate loss ratios.

**Sheet Count**: 4 sheets

**Data Flow**: Parameters → Raw Data → Processing → Output

---

## Data Flow Diagram

```
Parameters            Raw Data             Processing              Output
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Dev Factors  │    │ Policy/Claim │    │ Claim-Level      │    │ Policy-Level     │
│ • 0-6mo: 2.5 │    │ Details      │    │ Development      │    │ Decisions        │
│ • 6-12: 1.8  │    │              │    │                  │    │                  │
│ • 12-24: 1.35│ →  │ • Policy ID  │ →  │ • Age Bracket    │ →  │ • Adequacy Flag  │
│ • 24-36: 1.15│    │ • Claim ID   │    │ • Dev Factor     │    │ • Renewal Action │
│ • 36+: 1.05  │    │ • Incurred   │    │ • Projected Ult  │    │ • Priority       │
│              │    │ • Litigation │    │ • Large Claim?   │    │                  │
│ Thresholds   │    └──────────────┘    └──────────────────┘    └──────────────────┘
│ • Warn: 80%  │           │                    ▲                       ▲
│ • Crit: 60%  │           │                    │                       │
│ • Target: 60%│           └────────────────────┴───────────────────────┘
│ • Troubled:75│                     (formulas reference both)
│              │
│ Assumptions  │
│ • Large: 25k │
│ • Lit: 1.4x  │
└──────────────┘
```

---

## Sheet Details

### Sheet 1: Parameters

**Role**: Configuration parameters controlling development factors, thresholds, and assumptions

| Parameter | Cell | Value | Used By |
|-----------|------|-------|---------|
| Dev Factor - 0-6 months | B5 | 2.5 | Processing!F |
| Dev Factor - 6-12 months | B6 | 1.8 | Processing!F |
| Dev Factor - 12-24 months | B7 | 1.35 | Processing!F |
| Dev Factor - 24-36 months | B8 | 1.15 | Processing!F |
| Dev Factor - 36+ months | B9 | 1.05 | Processing!F |
| Reserve Adequacy Warning | B13 | 0.8 | Output!I |
| Reserve Adequacy Critical | B14 | 0.6 | Output!I |
| Target Loss Ratio | B15 | 0.6 | Output!L |
| Troubled Account LR | B16 | 0.75 | Output!L |
| Large Claim Threshold | B20 | 25000 | Processing!M |
| Litigation Load Factor | B21 | 1.4 | Processing!H |

---

### Sheet 2: Raw Data

**Role**: Source claim and policy data input

| Column | Description | Data Type |
|--------|-------------|-----------|
| A | Policy ID | Text (POL-###) |
| B | Insured Name | Text |
| C | Effective Date | Date |
| D | Earned Premium | Currency |
| E | Claim ID | Text (CLM-###) |
| F | Date of Loss | Date |
| G | Date Reported | Date |
| H | Claim Status | Text (Open/Closed) |
| I | In Litigation? | Y/N |
| J | Claim Type | Text (BI/PD) |
| K | Paid to Date | Currency |
| L | Current Reserve | Currency |
| M | Total Incurred | Currency |

**Row Count**: 9 data rows

---

### Sheet 3: Processing

**Role**: Apply development factors to each claim to project ultimate loss

**Key Formulas**:

| Column | Formula | Purpose |
|--------|---------|---------|
| D | `=DATEDIF(C2,TODAY(),"M")` | Calculate claim age in months |
| E | `=IF(D2<6,"0-6 mo",IF(D2<12,...))` | Assign age bracket |
| F | `=IF(D2<6,Parameters!$B$5,IF(...))` | Look up base development factor |
| H | `=IF(G2="Y",Parameters!$B$21,1)` | Apply litigation load (1.4x if Y) |
| I | `=F2*H2` | Final development factor |
| K | `=J2*I2` | Projected ultimate = incurred × factor |
| L | `=K2-J2` | Development needed (reserve shortfall) |
| M | `=IF(K2>Parameters!$B$20,"Y","N")` | Flag if large claim |

**Dependencies**: Raw Data (A, E, F, I, M), Parameters (B5:B9, B20, B21)

---

### Sheet 4: Output

**Role**: Aggregate to policy level and determine renewal decisions

**Key Formulas**:

| Column | Formula | Purpose |
|--------|---------|---------|
| C | `=SUMIF(...)/COUNTIF(...)` | Earned premium per policy |
| D | `=SUMIF('Raw Data'!A:A,A2,'Raw Data'!M:M)` | Sum reported incurred |
| E | `=SUMIF(Processing!A:A,A2,Processing!K:K)` | Sum projected ultimate |
| F | `=D2/C2` | Current loss ratio |
| G | `=E2/C2` | Developed loss ratio |
| H | `=D2/E2` | Reserve adequacy % |
| I | `=IF(H2<B14,"CRITICAL",IF(H2<B13,"WARNING","OK"))` | Adequacy flag |
| L | `=IF(G2>1,"NON-RENEW",IF(G2>B16,"REPRICE",...))` | Renewal action |
| M | `=IF(L2="NON-RENEW",1,IF(...))` | Priority ranking (1-4) |

**Decision Logic**:
- If Reserve Adequacy < 60% → CRITICAL
- If Reserve Adequacy < 80% → WARNING
- If Developed LR > 100% → NON-RENEW
- If Developed LR > 75% → REPRICE
- If Developed LR > 60% → MONITOR
- Otherwise → RENEW AS-IS

---

## Parameter Impact Analysis

| Parameter | Affects | Impact |
|-----------|---------|--------|
| Dev Factors (B5:B9) | Processing!K, Output!E,G | Higher factors increase projected ultimate, raising developed LR |
| Litigation Load (B21) | Processing!H,I,K | Claims in suit get 1.4x multiplier on development |
| Large Claim Threshold (B20) | Processing!M, Output!K | Flags claims over $25k for extra scrutiny |
| Adequacy Thresholds (B13:B14) | Output!I | Controls WARNING/CRITICAL flag breakpoints |
| Target/Troubled LR (B15:B16) | Output!L | Controls renewal action recommendations |

---

## Notes

- Claim age calculated dynamically via `TODAY()` - results change daily
- One policy can have multiple claims; Output aggregates to policy level
- Closed claims still included in development calculations
- Priority column enables sorting: 1=NON-RENEW, 2=REPRICE, 3=MONITOR, 4=RENEW
