// 2024 Federal tax brackets
export const TAX_BRACKETS = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  mfj: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
}

// Standard deductions 2024
export const STANDARD_DEDUCTION = { single: 14600, mfj: 29200 }

// IRMAA thresholds 2024 (MAGI, Part B monthly surcharge per person)
export const IRMAA_TIERS = {
  single: [
    { max: 103000, surcharge: 0 },
    { max: 129000, surcharge: 838.80 },    // $69.90/mo × 12
    { max: 161000, surcharge: 2096.40 },   // $174.70/mo × 12
    { max: 193000, surcharge: 3354.00 },   // $279.50/mo × 12
    { max: 500000, surcharge: 4611.60 },   // $384.30/mo × 12
    { max: Infinity, surcharge: 5031.60 }, // $419.30/mo × 12
  ],
  mfj: [
    { max: 206000, surcharge: 0 },
    { max: 258000, surcharge: 1677.60 },   // both spouses
    { max: 322000, surcharge: 4192.80 },
    { max: 386000, surcharge: 6708.00 },
    { max: 750000, surcharge: 9223.20 },
    { max: Infinity, surcharge: 10063.20 },
  ],
}

// IRS Uniform Lifetime Table (age → distribution period)
const RMD_TABLE = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5,  95: 8.9,
}

export function getRmdDivisor(age) {
  if (age < 73) return null
  return RMD_TABLE[Math.min(age, 95)] ?? 7.8
}

export function calcRmd(traditionalBalance, age) {
  const divisor = getRmdDivisor(age)
  if (!divisor) return 0
  return traditionalBalance / divisor
}

export function calcFederalTax(taxableIncome, filingStatus) {
  const brackets = TAX_BRACKETS[filingStatus]
  let tax = 0
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break
    const taxable = Math.min(taxableIncome, bracket.max) - bracket.min
    tax += taxable * bracket.rate
  }
  return Math.max(0, tax)
}

export function getMarginalRate(taxableIncome, filingStatus) {
  const brackets = TAX_BRACKETS[filingStatus]
  for (const bracket of [...brackets].reverse()) {
    if (taxableIncome > bracket.min) return bracket.rate
  }
  return 0.10
}

export function getIrmaaSurcharge(magi, filingStatus) {
  const tiers = IRMAA_TIERS[filingStatus]
  for (const tier of tiers) {
    if (magi <= tier.max) return tier.surcharge
  }
  return tiers[tiers.length - 1].surcharge
}

export function getIrmaaThresholdRemaining(magi, filingStatus) {
  const tiers = IRMAA_TIERS[filingStatus]
  for (const tier of tiers) {
    if (magi <= tier.max) return tier.max - magi
  }
  return 0
}

export function calcTaxableSocialSecurity(ssAnnual, otherIncome, filingStatus) {
  const combinedIncome = otherIncome + ssAnnual * 0.5
  const lower = filingStatus === 'mfj' ? 32000 : 25000
  const upper = filingStatus === 'mfj' ? 44000 : 34000
  if (combinedIncome <= lower) return 0
  if (combinedIncome <= upper) return Math.min(ssAnnual * 0.5, (combinedIncome - lower) * 0.5)
  const base = Math.min(ssAnnual * 0.5, (upper - lower) * 0.5)
  const extra = Math.min(ssAnnual * 0.85 - base, (combinedIncome - upper) * 0.85)
  return Math.min(ssAnnual * 0.85, base + extra)
}

export function calcEffectiveRate(taxableIncome, filingStatus) {
  if (taxableIncome <= 0) return 0
  return calcFederalTax(taxableIncome, filingStatus) / taxableIncome
}

// How much room remains in a given bracket
export function roomInBracket(currentIncome, targetRate, filingStatus) {
  const brackets = TAX_BRACKETS[filingStatus]
  const bracket = brackets.find(b => b.rate === targetRate)
  if (!bracket) return 0
  return Math.max(0, bracket.max - currentIncome)
}

// RMD age depends on birth year per SECURE 2.0
export function getRmdStartAge(age, birthYear) {
  if (birthYear >= 1960) return 75
  if (birthYear >= 1951) return 73
  return 72
}

export function getLifetimeTaxEstimate(
  traditionalBalance, ssAnnual, filingStatus, years = 25, growthRate = 0.05
) {
  let balance = traditionalBalance
  let totalTax = 0
  const standardDed = STANDARD_DEDUCTION[filingStatus]

  for (let i = 0; i < years; i++) {
    const age = 73 + i
    const rmd = calcRmd(balance, age)
    const taxableSS = calcTaxableSocialSecurity(ssAnnual, rmd, filingStatus)
    const grossIncome = rmd + taxableSS
    const taxableIncome = Math.max(0, grossIncome - standardDed)
    const fedTax = calcFederalTax(taxableIncome, filingStatus)
    const irmaa = getIrmaaSurcharge(grossIncome, filingStatus)
    totalTax += fedTax + irmaa
    balance = (balance - rmd) * (1 + growthRate)
    if (balance <= 0) break
  }
  return totalTax
}
