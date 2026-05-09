import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BUCKET_COLORS, BUCKET_LABELS, BUCKET_DESCRIPTIONS } from '../utils/accountTypes.js'

function fmt(n) { return '$' + Math.round(n).toLocaleString() }
function pct(part, total) { return total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '0%' }

export default function BucketSummary({ buckets }) {
  const total = buckets.traditional + buckets.roth + buckets.taxable
  if (total === 0) return null

  // Ideal targets per transcript
  const idealTraditional = { min: 0.15, max: 0.20 }  // ~$600K-$800K of $4M
  const idealRoth = { min: 0.25, max: 0.375 }         // ~$1M-$1.5M of $4M
  const idealTaxable = { min: 0.20, max: 0.30 }       // ~$800K-$1.2M of $4M

  const data = ['traditional', 'roth', 'taxable']
    .filter(b => buckets[b] > 0)
    .map(b => ({ name: BUCKET_LABELS[b], value: buckets[b], bucket: b }))

  const traditionalPct = buckets.traditional / total
  const alerts = []
  if (traditionalPct > 0.7) {
    alerts.push({ level: 'danger', msg: `${pct(buckets.traditional, total)} of your portfolio is in tax-deferred accounts — you have very limited flexibility and maximum RMD exposure.` })
  } else if (traditionalPct > 0.5) {
    alerts.push({ level: 'warning', msg: `${pct(buckets.traditional, total)} in tax-deferred. Consider shifting more to Roth and taxable to gain flexibility.` })
  }
  if (buckets.roth / total < 0.10 && total > 500000) {
    alerts.push({ level: 'warning', msg: 'Little or no Roth assets. Roth income is invisible to the IRS — conversions now can reduce future forced income.' })
  }

  return (
    <div className="card">
      <h2 className="section-title">Three-Bucket Breakdown</h2>
      <div className="bucket-layout">
        <div className="bucket-chart">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ bucket }) => pct(buckets[bucket], total)}>
                {data.map(entry => (
                  <Cell key={entry.bucket} fill={BUCKET_COLORS[entry.bucket]} />
                ))}
              </Pie>
              <Tooltip formatter={v => fmt(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bucket-cards">
          {(['traditional', 'roth', 'taxable']).map(b => (
            <div key={b} className="bucket-stat" style={{ borderLeft: `4px solid ${BUCKET_COLORS[b]}` }}>
              <div className="bucket-stat-header">
                <span className="bucket-stat-name">{BUCKET_LABELS[b]}</span>
                <span className="bucket-stat-amount">{fmt(buckets[b])}</span>
              </div>
              <div className="bucket-stat-pct">{pct(buckets[b], total)} of total</div>
              <div className="bucket-stat-desc">{BUCKET_DESCRIPTIONS[b]}</div>
            </div>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`alert alert-${a.level}`}>{a.msg}</div>
          ))}
        </div>
      )}

      <div className="total-row">
        <span>Total Portfolio</span>
        <span className="total-amount">{fmt(total)}</span>
      </div>
    </div>
  )
}
