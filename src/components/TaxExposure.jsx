import {
  calcRmd, calcFederalTax, calcTaxableSocialSecurity, getIrmaaSurcharge,
  getLifetimeTaxEstimate, STANDARD_DEDUCTION, getIrmaaThresholdRemaining,
  getMarginalRate, getRmdStartAge
} from '../utils/taxCalc.js'

function fmt(n) { return '$' + Math.round(n).toLocaleString() }
function fmtK(n) { return '$' + (n / 1000).toFixed(0) + 'K' }

export default function TaxExposure({ buckets, info }) {
  const { age, filingStatus, socialSecurity, retirementAge, ssClaimAge } = info
  if (!age || buckets.traditional + buckets.roth + buckets.taxable === 0) return null

  const total = buckets.traditional + buckets.roth + buckets.taxable
  const rmdStartAge = filingStatus === 'mfj' ? getRmdStartAge(age, 1960) : getRmdStartAge(age, 1960)

  // Current age scenario — what happens at RMD age if nothing changes
  const projectedTraditional = buckets.traditional * Math.pow(1.05, Math.max(0, rmdStartAge - age))
  const yearOneRmd = calcRmd(projectedTraditional, rmdStartAge)
  const taxableSS = calcTaxableSocialSecurity(socialSecurity, yearOneRmd, filingStatus)
  const grossIncome = yearOneRmd + taxableSS
  const stdDed = STANDARD_DEDUCTION[filingStatus]
  const taxableIncome = Math.max(0, grossIncome - stdDed)
  const fedTax = calcFederalTax(taxableIncome, filingStatus)
  const irmaa = getIrmaaSurcharge(grossIncome, filingStatus)
  const totalBurden = fedTax + irmaa

  const lifetimeTax = getLifetimeTaxEstimate(projectedTraditional, socialSecurity, filingStatus)
  const marginalRate = getMarginalRate(taxableIncome, filingStatus)

  // Current tax exposure (if already in retirement)
  const currentRmd = age >= rmdStartAge ? calcRmd(buckets.traditional, age) : 0
  const currentTaxableSS = calcTaxableSocialSecurity(socialSecurity, currentRmd, filingStatus)
  const currentGross = currentRmd + currentTaxableSS
  const currentFedTax = calcFederalTax(Math.max(0, currentGross - stdDed), filingStatus)
  const currentIrmaa = getIrmaaSurcharge(currentGross, filingStatus)

  const isPreRmd = age < rmdStartAge
  const yearsToRmd = Math.max(0, rmdStartAge - age)

  const items = [
    {
      label: isPreRmd ? `Projected Year-1 RMD (at age ${rmdStartAge})` : 'Current Year RMD',
      value: isPreRmd ? yearOneRmd : currentRmd,
      note: isPreRmd ? `Traditional balance grows to ${fmt(projectedTraditional)} at ${rmdStartAge}` : null,
      highlight: true,
    },
    {
      label: '85% of Social Security becomes taxable',
      value: isPreRmd ? taxableSS : currentTaxableSS,
      note: `Combined income triggers taxability at IRS threshold`,
    },
    {
      label: isPreRmd ? `Total forced income at ${rmdStartAge}` : 'Total forced income this year',
      value: isPreRmd ? grossIncome : currentGross,
      highlight: true,
    },
    {
      label: 'Federal income tax on forced income',
      value: isPreRmd ? fedTax : currentFedTax,
      note: `Marginal rate: ${(marginalRate * 100).toFixed(0)}%`,
    },
    {
      label: 'IRMAA Medicare surcharge',
      value: isPreRmd ? irmaa : currentIrmaa,
      note: irmaa > 0 ? 'Income exceeds Medicare premium threshold' : 'Below IRMAA threshold — conversion headroom exists',
    },
    {
      label: 'Total annual tax burden on forced income',
      value: isPreRmd ? totalBurden : currentFedTax + currentIrmaa,
      highlight: true,
    },
  ]

  return (
    <div className="card">
      <h2 className="section-title">Tax Exposure Analysis</h2>
      <p className="help-text">
        {isPreRmd
          ? `You have ${yearsToRmd} year${yearsToRmd !== 1 ? 's' : ''} before RMDs begin at age ${rmdStartAge}. This is your conversion window. Here's what the default path looks like if nothing changes.`
          : `RMDs are active. Here's your current forced income picture.`
        }
      </p>

      <div className="exposure-table">
        {items.map((item, i) => (
          <div key={i} className={`exposure-row ${item.highlight ? 'exposure-highlight' : ''}`}>
            <div>
              <div className="exposure-label">{item.label}</div>
              {item.note && <div className="exposure-note">{item.note}</div>}
            </div>
            <div className="exposure-value">{fmt(item.value)}</div>
          </div>
        ))}
      </div>

      <div className="lifetime-box">
        <div className="lifetime-title">Estimated Lifetime Tax Burden (25 years, no restructuring)</div>
        <div className="lifetime-amount">{fmt(lifetimeTax)}</div>
        <div className="lifetime-pct">
          {total > 0 ? ((lifetimeTax / total) * 100).toFixed(0) : 0}% of total portfolio goes to taxes
        </div>
        <div className="lifetime-note">
          Based on {fmtK(projectedTraditional)} traditional balance at RMD start, 5% annual growth, current tax law.
        </div>
      </div>
    </div>
  )
}
