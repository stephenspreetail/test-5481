import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { calcRmd, calcFederalTax, calcTaxableSocialSecurity, getIrmaaSurcharge, STANDARD_DEDUCTION } from '../utils/taxCalc.js'
import { getRmdStartAge } from '../utils/taxCalc.js'

function fmt(n) { return '$' + Math.round(n).toLocaleString() }

export default function RmdProjection({ buckets, info }) {
  const { age, filingStatus, socialSecurity } = info
  if (!age || buckets.traditional === 0) return null

  const rmdStartAge = getRmdStartAge(age, 1960)
  const yearsToRmd = Math.max(0, rmdStartAge - age)
  const stdDed = STANDARD_DEDUCTION[filingStatus]

  const data = []
  // Project from rmdStartAge to rmdStartAge + 20 years
  let balance = buckets.traditional * Math.pow(1.05, yearsToRmd)
  const GROWTH = 0.05

  for (let i = 0; i <= 20; i++) {
    const projAge = rmdStartAge + i
    const rmd = calcRmd(balance, projAge)
    if (rmd <= 0) break
    const taxableSS = calcTaxableSocialSecurity(socialSecurity, rmd, filingStatus)
    const grossIncome = rmd + taxableSS
    const fedTax = calcFederalTax(Math.max(0, grossIncome - stdDed), filingStatus)
    const irmaa = getIrmaaSurcharge(grossIncome, filingStatus)

    data.push({
      age: projAge,
      rmd: Math.round(rmd),
      taxableSS: Math.round(taxableSS),
      fedTax: Math.round(fedTax),
      irmaa: Math.round(irmaa),
      netAfterTax: Math.round(rmd - fedTax - irmaa),
    })

    balance = (balance - rmd) * (1 + GROWTH)
    if (balance <= 0) break
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="chart-tooltip">
        <div className="tooltip-title">Age {label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {fmt(p.value)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="section-title">RMD Projection (Ages {rmdStartAge}–{rmdStartAge + 20})</h2>
      <p className="help-text">
        Required Minimum Distributions grow each year as both the balance and distribution percentage change.
        The IRS decides this income — not you.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="age" tick={{ fill: '#94a3b8', fontSize: 12 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: '#64748b' }} />
          <YAxis tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'K'} tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8' }} />
          <Bar dataKey="rmd" name="RMD Amount" fill="#ef4444" stackId="a" />
          <Bar dataKey="taxableSS" name="Taxable SS" fill="#f97316" stackId="a" />
          <Bar dataKey="fedTax" name="Federal Tax" fill="#7c3aed" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="rmd-insight">
        <strong>Key insight:</strong> At age {rmdStartAge}, your forced income is {fmt(data[0]?.rmd + data[0]?.taxableSS || 0)} —
        {' '}you didn't choose it, but you'll pay {fmt(data[0]?.fedTax + data[0]?.irmaa || 0)} in taxes and surcharges on it.
        By age {rmdStartAge + 10}, that grows to {fmt((data[10] || data[data.length - 1])?.rmd + (data[10] || data[data.length - 1])?.taxableSS || 0)}.
      </div>
    </div>
  )
}
