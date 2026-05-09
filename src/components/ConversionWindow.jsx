import {
  calcRmd, calcFederalTax, getMarginalRate, getIrmaaThresholdRemaining,
  getIrmaaSurcharge, STANDARD_DEDUCTION, roomInBracket, getRmdStartAge
} from '../utils/taxCalc.js'

function fmt(n) { return '$' + Math.round(n).toLocaleString() }

export default function ConversionWindow({ buckets, info }) {
  const { age, filingStatus, socialSecurity, retirementAge, ssClaimAge, annualExpenses } = info
  if (!age || buckets.traditional === 0) return null

  const rmdStartAge = getRmdStartAge(age, 1960)
  const isRetired = age >= retirementAge
  const inConversionWindow = age >= retirementAge && age < rmdStartAge && age < ssClaimAge
  const yearsToRmd = Math.max(0, rmdStartAge - age)
  const yearsToSS = Math.max(0, ssClaimAge - age)
  const windowYears = Math.max(0, Math.min(rmdStartAge, ssClaimAge) - Math.max(age, retirementAge))

  // During conversion window, income is just from investment income (assume minimal)
  // Estimate taxable income during window (expenses funded from brokerage = capital gains, not ordinary income)
  const estimatedOtherIncome = 0  // pre-SS, pre-RMD low income window
  const stdDed = STANDARD_DEDUCTION[filingStatus]

  // Calculate how much we can convert at each bracket
  const brackets22 = roomInBracket(estimatedOtherIncome - stdDed, 0.22, filingStatus)
  const brackets24 = roomInBracket(estimatedOtherIncome - stdDed, 0.24, filingStatus)

  // IRMAA threshold remaining
  const irmaaRemaining = getIrmaaThresholdRemaining(estimatedOtherIncome, filingStatus)
  const conversionCeiling = Math.min(brackets24 > 0 ? brackets24 : brackets22, irmaaRemaining)

  // Ideal conversion amount per year
  const idealAnnualConversion = conversionCeiling

  // Ideal traditional target from transcript: $600K-$800K
  const idealTraditionalMin = 600000
  const idealTraditionalMax = 800000
  const conversionNeeded = Math.max(0, buckets.traditional - idealTraditionalMax)
  const yearsNeeded = idealAnnualConversion > 0 ? Math.ceil(conversionNeeded / idealAnnualConversion) : null

  // Tax cost of converting now vs. forced later
  const conversionTax = calcFederalTax(idealAnnualConversion, filingStatus) - calcFederalTax(0, filingStatus)
  const projectedRmd = calcRmd(buckets.traditional * Math.pow(1.05, yearsToRmd), rmdStartAge)
  const forcedTaxRate = getMarginalRate(projectedRmd - stdDed, filingStatus)

  const stage = inConversionWindow ? 'active'
    : age < retirementAge ? 'pre'
    : age >= rmdStartAge ? 'post'
    : 'between'

  return (
    <div className="card">
      <h2 className="section-title">Conversion Window Strategy</h2>

      {stage === 'pre' && (
        <div className="stage-banner stage-pre">
          <div className="stage-icon">⏳</div>
          <div>
            <strong>Pre-retirement: Prepare now</strong>
            <p>Your conversion window opens at retirement (age {retirementAge}) and closes when RMDs begin at {rmdStartAge} or SS starts at {ssClaimAge}. That gives you a potential {windowYears}-year window.</p>
            <p>Focus now: maximize contributions, keep taxable brokerage growing, and plan which brackets to target after retirement.</p>
          </div>
        </div>
      )}

      {stage === 'active' && (
        <div className="stage-banner stage-active">
          <div className="stage-icon">🎯</div>
          <div>
            <strong>You are in the conversion window right now</strong>
            <p>This is the most valuable planning window of your retirement. You have low taxable income, no forced withdrawals, and you control what the IRS sees.</p>
          </div>
        </div>
      )}

      {stage === 'post' && (
        <div className="stage-banner stage-post">
          <div className="stage-icon">⚠️</div>
          <div>
            <strong>RMDs are active — conversion opportunity is reduced but not gone</strong>
            <p>Conversions are still possible but you must add them on top of your RMD income. Every dollar converted now still grows tax-free and creates no future RMDs.</p>
          </div>
        </div>
      )}

      {stage === 'between' && (
        <div className="stage-banner stage-pre">
          <div className="stage-icon">📅</div>
          <div>
            <strong>Conversion window opens soon</strong>
            <p>You retire at {retirementAge} and RMDs start at {rmdStartAge}. Social Security begins at {ssClaimAge}. Plan conversions for the {windowYears}-year window in between.</p>
          </div>
        </div>
      )}

      <div className="conversion-grid">
        <div className="conversion-stat">
          <div className="cstat-label">Conversion Window Length</div>
          <div className="cstat-value">{windowYears} years</div>
          <div className="cstat-note">Ages {Math.max(age, retirementAge)} → {Math.min(rmdStartAge, ssClaimAge)}</div>
        </div>
        <div className="conversion-stat">
          <div className="cstat-label">Annual Conversion Ceiling</div>
          <div className="cstat-value">{fmt(conversionCeiling)}</div>
          <div className="cstat-note">To top of 24% bracket or IRMAA tier, whichever is lower</div>
        </div>
        <div className="conversion-stat">
          <div className="cstat-label">Amount to Convert</div>
          <div className="cstat-value">{fmt(conversionNeeded)}</div>
          <div className="cstat-note">To reach ideal traditional target of {fmt(idealTraditionalMax)}</div>
        </div>
        <div className="conversion-stat">
          <div className="cstat-label">Years Needed</div>
          <div className="cstat-value">{yearsNeeded !== null ? yearsNeeded : 'N/A'}</div>
          <div className="cstat-note">At {fmt(idealAnnualConversion)}/year</div>
        </div>
      </div>

      <div className="conversion-rules">
        <h3>Conversion Rules</h3>
        <ol>
          <li>Convert to the <strong>top of the 22% or 24% bracket</strong> — whichever you're comfortable with</li>
          <li>Stop at the <strong>next IRMAA threshold</strong> if it comes first — crossing a tier can cost $4,000–$9,000 in surcharges</li>
          <li>Convert every year during the window — this is an annual process, not a one-time event</li>
          <li>Pay the conversion tax from <strong>taxable accounts</strong>, not the Roth, to preserve the conversion's value</li>
          <li>Every dollar in Roth grows tax-free and is <strong>invisible to the IRS</strong> forever — no RMDs, no SS trigger, no IRMAA</li>
        </ol>
      </div>

      <div className="tax-comparison">
        <h3>Pay Now vs. Pay Later</h3>
        <div className="comparison-row">
          <div className="comparison-card comparison-now">
            <div className="cc-title">Convert now (during window)</div>
            <div className="cc-rate">~22–24% rate</div>
            <div className="cc-detail">Known. Manageable. You choose the amount.</div>
          </div>
          <div className="comparison-vs">vs.</div>
          <div className="comparison-card comparison-later">
            <div className="cc-title">Forced RMDs later</div>
            <div className="cc-rate">~{(forcedTaxRate * 100).toFixed(0)}%+ effective rate</div>
            <div className="cc-detail">Plus SS stacking + IRMAA. IRS decides the amount.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
