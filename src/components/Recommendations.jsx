import {
  calcRmd, calcFederalTax, calcTaxableSocialSecurity, getIrmaaSurcharge,
  getLifetimeTaxEstimate, STANDARD_DEDUCTION, getMarginalRate, getRmdStartAge
} from '../utils/taxCalc.js'

function fmt(n) { return '$' + Math.round(n).toLocaleString() }

export default function Recommendations({ buckets, info }) {
  const { age, filingStatus, socialSecurity, retirementAge, ssClaimAge, annualExpenses } = info
  if (!age || buckets.traditional + buckets.roth + buckets.taxable === 0) return null

  const total = buckets.traditional + buckets.roth + buckets.taxable
  const rmdStartAge = getRmdStartAge(age, 1960)
  const yearsToRmd = Math.max(0, rmdStartAge - age)

  // Ideal targets (from transcript):
  const idealTraditionalMin = 600000
  const idealTraditionalMax = 800000
  const idealRothMin = 1000000
  const idealRothMax = 1500000
  const idealTaxableMin = 800000
  const idealTaxableMax = 1200000

  // Scale ideals proportionally if total !== $4M
  const scale = total / 4000000
  const scaledIdealTrad = { min: idealTraditionalMin * scale, max: idealTraditionalMax * scale }
  const scaledIdealRoth = { min: idealRothMin * scale, max: idealRothMax * scale }
  const scaledIdealTaxable = { min: idealTaxableMin * scale, max: idealTaxableMax * scale }

  // Current vs ideal
  const tradGap = Math.max(0, buckets.traditional - scaledIdealTrad.max)
  const rothGap = Math.max(0, scaledIdealRoth.min - buckets.roth)
  const taxableGap = Math.max(0, scaledIdealTaxable.min - buckets.taxable)

  // Lifetime tax comparison
  const currentLifetimeTax = getLifetimeTaxEstimate(
    buckets.traditional * Math.pow(1.05, yearsToRmd), socialSecurity, filingStatus
  )
  const optimizedLifetimeTax = getLifetimeTaxEstimate(
    scaledIdealTrad.max * Math.pow(1.05, 0), socialSecurity, filingStatus
  )
  const potentialSavings = Math.max(0, currentLifetimeTax - optimizedLifetimeTax)

  // Build recommendations list
  const recs = []

  const traditionalPct = buckets.traditional / total
  const inConversionWindow = age >= retirementAge && age < rmdStartAge && age < ssClaimAge

  // Recommendation 1: Roth conversions
  if (tradGap > 50000) {
    recs.push({
      priority: 'high',
      title: 'Execute Roth Conversions',
      detail: `You have ${fmt(tradGap)} more than the ideal traditional balance. Convert ${fmt(Math.min(tradGap, 200000))}–${fmt(Math.min(tradGap, 300000))} per year during your low-income window to reduce future forced income.`,
      action: inConversionWindow
        ? `You are in the window now (ages ${retirementAge}–${Math.min(rmdStartAge, ssClaimAge)}). Start immediately.`
        : age < retirementAge
        ? `Your window opens at retirement (age ${retirementAge}). Plan now, execute then.`
        : `RMDs have started but conversions on top of RMDs are still beneficial.`,
    })
  }

  // Recommendation 2: Traditional balance target
  if (buckets.traditional > scaledIdealTrad.max) {
    recs.push({
      priority: 'high',
      title: `Reduce Traditional Balance to ${fmt(scaledIdealTrad.max)}`,
      detail: `Your current traditional balance of ${fmt(buckets.traditional)} will generate ${fmt(calcRmd(buckets.traditional * Math.pow(1.05, yearsToRmd), rmdStartAge))} in forced RMDs at age ${rmdStartAge}. Target ${fmt(scaledIdealTrad.min)}–${fmt(scaledIdealTrad.max)} to keep RMDs at ${fmt(calcRmd(scaledIdealTrad.max, rmdStartAge))}–${fmt(calcRmd(scaledIdealTrad.min, rmdStartAge))}.`,
      action: `Redirect this gap to Roth conversions and/or taxable brokerage contributions.`,
    })
  }

  // Recommendation 3: Build Roth
  if (rothGap > 50000) {
    recs.push({
      priority: 'medium',
      title: `Build Roth to ${fmt(scaledIdealRoth.min)}–${fmt(scaledIdealRoth.max)}`,
      detail: `Roth assets are invisible to the IRS — they don't count toward Social Security taxability, don't trigger IRMAA, and have no RMDs. You need ${fmt(rothGap)} more in Roth.`,
      action: `Convert from traditional during the low-income window. Pay taxes from taxable accounts to preserve Roth value.`,
    })
  }

  // Recommendation 4: Delay Social Security
  if (ssClaimAge < 70 && buckets.taxable + buckets.roth > annualExpenses * 3) {
    recs.push({
      priority: 'medium',
      title: 'Consider Delaying Social Security to Age 70',
      detail: `Each year you delay SS past FRA, benefits grow ~8%. Delaying to 70 means more SS income — but ideally taken after Roth conversions are complete so the income stacks on already-structured buckets.`,
      action: `Use Roth and taxable withdrawals to bridge income from ${ssClaimAge} to 70.`,
    })
  }

  // Recommendation 5: IRMAA management
  const rmdAtStart = calcRmd(buckets.traditional * Math.pow(1.05, yearsToRmd), rmdStartAge)
  const irmaaSurcharge = getIrmaaSurcharge(rmdAtStart + socialSecurity * 0.85, filingStatus)
  if (irmaaSurcharge > 0) {
    recs.push({
      priority: 'medium',
      title: 'Manage IRMAA Medicare Surcharges',
      detail: `At current trajectory, your income at age ${rmdStartAge} will trigger IRMAA surcharges of ${fmt(irmaaSurcharge)}/year. Use Roth withdrawals to stay below IRMAA tier thresholds in Medicare years.`,
      action: `In years you'd cross an IRMAA tier, substitute Roth withdrawals for traditional withdrawals. The IRS cannot see Roth income.`,
    })
  }

  // Recommendation 6: Tax-efficient withdrawal order
  recs.push({
    priority: 'low',
    title: 'Use Tax-Efficient Withdrawal Order in Retirement',
    detail: `Each year, fill the lowest brackets first: (1) Take your required RMD from traditional, (2) Pull from brokerage for capital-gains-eligible income if you need more, (3) Use Roth for any additional spending — it stays invisible.`,
    action: `Avoid the mistake of pulling from Roth first. Save the tax-free Roth for when it matters most — high-income years or IRMAA-sensitive years.`,
  })

  const priorityColors = { high: '#ef4444', medium: '#f97316', low: '#22c55e' }
  const priorityBg = { high: '#7f1d1d22', medium: '#7c2d1222', low: '#14532d22' }

  return (
    <div className="card">
      <h2 className="section-title">Recommendations</h2>

      {potentialSavings > 10000 && (
        <div className="savings-banner">
          <div className="savings-title">Potential lifetime tax savings</div>
          <div className="savings-amount">{fmt(potentialSavings)}</div>
          <div className="savings-note">
            Default path: {fmt(currentLifetimeTax)} in lifetime taxes vs.
            optimized: {fmt(optimizedLifetimeTax)} — same balance, different structure.
          </div>
        </div>
      )}

      <div className="target-grid">
        <h3>Ideal Bucket Targets (scaled to your portfolio size)</h3>
        <div className="target-row">
          <span className="target-label target-trad">Tax-Deferred</span>
          <span className="target-range">{fmt(scaledIdealTrad.min)} – {fmt(scaledIdealTrad.max)}</span>
          <span className="target-current" style={{ color: buckets.traditional > scaledIdealTrad.max ? '#ef4444' : '#22c55e' }}>
            Current: {fmt(buckets.traditional)} {buckets.traditional > scaledIdealTrad.max ? '▲ over target' : '✓'}
          </span>
        </div>
        <div className="target-row">
          <span className="target-label target-roth">Roth</span>
          <span className="target-range">{fmt(scaledIdealRoth.min)} – {fmt(scaledIdealRoth.max)}</span>
          <span className="target-current" style={{ color: buckets.roth < scaledIdealRoth.min ? '#f97316' : '#22c55e' }}>
            Current: {fmt(buckets.roth)} {buckets.roth < scaledIdealRoth.min ? '▼ below target' : '✓'}
          </span>
        </div>
        <div className="target-row">
          <span className="target-label target-taxable">Taxable Brokerage</span>
          <span className="target-range">{fmt(scaledIdealTaxable.min)} – {fmt(scaledIdealTaxable.max)}</span>
          <span className="target-current" style={{ color: buckets.taxable < scaledIdealTaxable.min ? '#f97316' : '#22c55e' }}>
            Current: {fmt(buckets.taxable)} {buckets.taxable < scaledIdealTaxable.min ? '▼ below target' : '✓'}
          </span>
        </div>
      </div>

      <div className="recs-list">
        {recs.map((rec, i) => (
          <div key={i} className="rec-item" style={{ borderLeft: `4px solid ${priorityColors[rec.priority]}`, background: priorityBg[rec.priority] }}>
            <div className="rec-header">
              <span className="rec-priority" style={{ color: priorityColors[rec.priority] }}>
                {rec.priority.toUpperCase()}
              </span>
              <span className="rec-title">{rec.title}</span>
            </div>
            <p className="rec-detail">{rec.detail}</p>
            <div className="rec-action">→ {rec.action}</div>
          </div>
        ))}
      </div>

      <div className="disclaimer">
        This tool provides educational projections based on general assumptions (5% growth, current tax law, standard deductions).
        Consult a qualified financial advisor or CPA before making conversion or withdrawal decisions.
      </div>
    </div>
  )
}
