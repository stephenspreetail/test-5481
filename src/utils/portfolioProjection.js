import { calcRmd, getRmdStartAge } from './taxCalc.js'

export function projectPortfolio(buckets, info) {
  const { age, retirementAge, ssClaimAge, annualExpenses, socialSecurity } = info
  const rmdStartAge = getRmdStartAge(age, 1960)
  const GROWTH = 0.05

  let trad = buckets.traditional
  let roth = buckets.roth
  let taxable = buckets.taxable

  const rows = []

  // Starting snapshot (no growth yet)
  rows.push({
    age,
    traditional: Math.round(trad),
    roth: Math.round(roth),
    taxable: Math.round(taxable),
    total: Math.round(trad + roth + taxable),
    rmd: 0,
    phase: age < retirementAge ? 'pre' : age < Math.min(rmdStartAge, ssClaimAge) ? 'window' : 'rmd',
  })

  for (let a = age + 1; a <= 90; a++) {
    const isRetired = a >= retirementAge
    const hasRmd = a >= rmdStartAge
    const hasSS = a >= ssClaimAge

    // Growth applied to all buckets
    trad *= (1 + GROWTH)
    roth *= (1 + GROWTH)
    taxable *= (1 + GROWTH)

    // Forced RMD from traditional
    const rmd = hasRmd ? calcRmd(trad, a) : 0
    trad -= rmd

    // Cover living expenses (tax-efficient withdrawal order)
    if (isRetired) {
      const ssIncome = hasSS ? socialSecurity : 0
      let expenses = Math.max(0, annualExpenses - ssIncome - rmd)

      const fromTaxable = Math.min(taxable, expenses)
      taxable -= fromTaxable
      expenses -= fromTaxable

      const fromRoth = Math.min(roth, expenses)
      roth -= fromRoth
      expenses -= fromRoth

      trad -= Math.min(trad, expenses)
    }

    trad = Math.max(0, trad)
    roth = Math.max(0, roth)
    taxable = Math.max(0, taxable)

    rows.push({
      age: a,
      traditional: Math.round(trad),
      roth: Math.round(roth),
      taxable: Math.round(taxable),
      total: Math.round(trad + roth + taxable),
      rmd: Math.round(rmd),
      phase: !isRetired ? 'pre' : !hasRmd ? 'window' : 'rmd',
    })
  }

  return rows
}

export function getMilestoneRows(rows, info) {
  const { retirementAge, ssClaimAge } = info
  const rmdStartAge = getRmdStartAge(info.age, 1960)

  const milestoneAges = new Set([
    info.age,
    retirementAge,
    ssClaimAge,
    rmdStartAge,
    ...Array.from({ length: 10 }, (_, i) => Math.ceil(info.age / 5) * 5 + i * 5).filter(a => a <= 90),
  ])

  return rows.filter(r => milestoneAges.has(r.age))
}
