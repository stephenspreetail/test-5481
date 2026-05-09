import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Legend,
} from 'recharts'
import { projectPortfolio, getMilestoneRows } from '../utils/portfolioProjection.js'
import { getRmdStartAge } from '../utils/taxCalc.js'
import { BUCKET_COLORS } from '../utils/accountTypes.js'

function fmtM(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n
}
function fmt(n) { return '$' + Math.round(n).toLocaleString() }

const PHASE_LABELS = {
  pre: 'Pre-Retirement',
  window: 'Conversion Window',
  rmd: 'RMD Phase',
}

const PHASE_COLORS = {
  pre: '#3b82f620',
  window: '#22c55e18',
  rmd: '#ef444418',
}

const CustomTooltip = ({ active, payload, label, retirementAge, rmdStartAge, ssClaimAge }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const rmd = payload[0]?.payload?.rmd
  const phase = payload[0]?.payload?.phase

  const tags = []
  if (label === retirementAge) tags.push('Retirement')
  if (label === ssClaimAge) tags.push('SS Starts')
  if (label === rmdStartAge) tags.push('RMDs Begin')

  return (
    <div className="chart-tooltip">
      <div className="tooltip-title">
        Age {label}
        {tags.map(t => <span key={t} className="tooltip-tag">{t}</span>)}
      </div>
      <div className="tooltip-phase">{PHASE_LABELS[phase]}</div>
      {[...payload].reverse().map(p => (
        <div key={p.dataKey} className="tooltip-row" style={{ color: p.fill }}>
          <span>{p.name}</span>
          <span>{fmtM(p.value)}</span>
        </div>
      ))}
      <div className="tooltip-total">
        <span>Total</span>
        <span>{fmtM(total)}</span>
      </div>
      {rmd > 0 && <div className="tooltip-rmd">RMD this year: {fmt(rmd)}</div>}
    </div>
  )
}

export default function PortfolioGrowth({ buckets, info }) {
  const { age, retirementAge, ssClaimAge } = info
  if (!age || buckets.traditional + buckets.roth + buckets.taxable === 0) return null

  const rmdStartAge = getRmdStartAge(age, 1960)
  const rows = projectPortfolio(buckets, info)
  const milestones = getMilestoneRows(rows, info)

  const windowStart = Math.max(age, retirementAge)
  const windowEnd = Math.min(rmdStartAge, ssClaimAge)

  const milestoneLabels = {
    [retirementAge]: 'Retire',
    [ssClaimAge]: 'SS',
    [rmdStartAge]: 'RMDs',
  }

  return (
    <div className="card">
      <h2 className="section-title">Portfolio Growth Projection</h2>
      <p className="help-text">
        5% annual growth, tax-efficient withdrawal order in retirement (taxable → Roth → traditional).
        Assumes no Roth conversions — this is the default path.
      </p>

      <div className="phase-legend">
        <span className="phase-pill" style={{ background: PHASE_COLORS.pre, border: '1px solid #3b82f640' }}>Pre-Retirement</span>
        <span className="phase-pill" style={{ background: PHASE_COLORS.window, border: '1px solid #22c55e40' }}>Conversion Window</span>
        <span className="phase-pill" style={{ background: PHASE_COLORS.rmd, border: '1px solid #ef444440' }}>RMD Phase</span>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <defs>
            {['traditional', 'roth', 'taxable'].map(b => (
              <linearGradient key={b} id={`grad-${b}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BUCKET_COLORS[b]} stopOpacity={0.5} />
                <stop offset="95%" stopColor={BUCKET_COLORS[b]} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>

          {/* Phase shading */}
          {age < retirementAge && (
            <ReferenceArea x1={age} x2={retirementAge} fill={PHASE_COLORS.pre} />
          )}
          {windowEnd > windowStart && (
            <ReferenceArea x1={windowStart} x2={windowEnd} fill={PHASE_COLORS.window} />
          )}
          <ReferenceArea x1={rmdStartAge} x2={90} fill={PHASE_COLORS.rmd} />

          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="age"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: '#64748b' }}
          />
          <YAxis
            tickFormatter={fmtM}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            width={62}
          />
          <Tooltip
            content={
              <CustomTooltip
                retirementAge={retirementAge}
                rmdStartAge={rmdStartAge}
                ssClaimAge={ssClaimAge}
              />
            }
          />
          <Legend
            formatter={v => v === 'traditional' ? 'Tax-Deferred' : v === 'roth' ? 'Roth' : 'Taxable'}
            wrapperStyle={{ color: '#94a3b8', fontSize: '0.8rem' }}
          />

          <Area type="monotone" dataKey="traditional" name="traditional" stackId="1"
            stroke={BUCKET_COLORS.traditional} fill={`url(#grad-traditional)`} strokeWidth={1.5} />
          <Area type="monotone" dataKey="taxable" name="taxable" stackId="1"
            stroke={BUCKET_COLORS.taxable} fill={`url(#grad-taxable)`} strokeWidth={1.5} />
          <Area type="monotone" dataKey="roth" name="roth" stackId="1"
            stroke={BUCKET_COLORS.roth} fill={`url(#grad-roth)`} strokeWidth={1.5} />

          {/* Milestone lines */}
          {Object.entries(milestoneLabels).map(([a, label]) => (
            Number(a) > age && Number(a) <= 90 && (
              <ReferenceLine key={a} x={Number(a)} stroke="#475569" strokeDasharray="4 3"
                label={{ value: label, position: 'top', fill: '#94a3b8', fontSize: 11 }} />
            )
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Milestone table */}
      <div className="growth-table-wrap">
        <h3 className="growth-table-title">Balance at Key Ages</h3>
        <table className="growth-table">
          <thead>
            <tr>
              <th>Age</th>
              <th>Phase</th>
              <th style={{ color: BUCKET_COLORS.traditional }}>Tax-Deferred</th>
              <th style={{ color: BUCKET_COLORS.roth }}>Roth</th>
              <th style={{ color: BUCKET_COLORS.taxable }}>Taxable</th>
              <th>Total</th>
              <th>Annual RMD</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map(r => {
              const isKeyAge = [retirementAge, ssClaimAge, rmdStartAge].includes(r.age)
              return (
                <tr key={r.age} className={isKeyAge ? 'milestone-row' : ''}>
                  <td>
                    <span className="age-cell">
                      {r.age}
                      {r.age === retirementAge && <span className="age-tag">Retire</span>}
                      {r.age === ssClaimAge && <span className="age-tag">SS</span>}
                      {r.age === rmdStartAge && <span className="age-tag age-tag-rmd">RMDs</span>}
                    </span>
                  </td>
                  <td><span className={`phase-label phase-${r.phase}`}>{PHASE_LABELS[r.phase]}</span></td>
                  <td className="num-cell">{fmtM(r.traditional)}</td>
                  <td className="num-cell">{fmtM(r.roth)}</td>
                  <td className="num-cell">{fmtM(r.taxable)}</td>
                  <td className="num-cell num-total">{fmtM(r.total)}</td>
                  <td className="num-cell">{r.rmd > 0 ? <span className="rmd-cell">{fmtM(r.rmd)}</span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
