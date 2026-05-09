import { useState } from 'react'
import PortfolioInput from './components/PortfolioInput.jsx'
import PersonalInfo from './components/PersonalInfo.jsx'
import BucketSummary from './components/BucketSummary.jsx'
import TaxExposure from './components/TaxExposure.jsx'
import RmdProjection from './components/RmdProjection.jsx'
import ConversionWindow from './components/ConversionWindow.jsx'
import Recommendations from './components/Recommendations.jsx'
import { sumBuckets } from './utils/accountTypes.js'

const DEMO_ACCOUNTS = [
  { id: 1, type: '401k', label: '401(k) Traditional', balance: 1500000 },
  { id: 2, type: 'roth_ira', label: 'Roth IRA', balance: 700000 },
  { id: 3, type: 'brokerage', label: 'Taxable Brokerage', balance: 1500000 },
]

const DEFAULT_INFO = {
  age: 62,
  filingStatus: 'mfj',
  socialSecurity: 55000,
  retirementAge: 63,
  ssClaimAge: 67,
  annualExpenses: 120000,
}

export default function App() {
  const [accounts, setAccounts] = useState(DEMO_ACCOUNTS)
  const [info, setInfo] = useState(DEFAULT_INFO)
  const [activeTab, setActiveTab] = useState('analysis')

  const buckets = sumBuckets(accounts)
  const total = buckets.traditional + buckets.roth + buckets.taxable
  const hasData = total > 0 && info.age

  const tabs = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'strategy', label: 'Strategy' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Tax Efficiency Planner</h1>
          <p className="header-sub">Structure your portfolio to control what the IRS can see</p>
        </div>
      </header>

      <div className="tab-bar">
        {tabs.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'tab-active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="app-main">
        {activeTab === 'portfolio' && (
          <div className="tab-content">
            <PersonalInfo info={info} onChange={setInfo} />
            <PortfolioInput accounts={accounts} onChange={setAccounts} />
            {hasData && <BucketSummary buckets={buckets} />}
            {hasData && (
              <div className="next-btn-wrap">
                <button className="btn-primary btn-lg" onClick={() => setActiveTab('analysis')}>
                  View Tax Analysis →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="tab-content">
            {!hasData ? (
              <div className="empty-state">
                <p>Enter your portfolio and age on the <button className="link-btn" onClick={() => setActiveTab('portfolio')}>Portfolio tab</button> to see analysis.</p>
              </div>
            ) : (
              <>
                <BucketSummary buckets={buckets} />
                <TaxExposure buckets={buckets} info={info} />
                <RmdProjection buckets={buckets} info={info} />
                <div className="next-btn-wrap">
                  <button className="btn-primary btn-lg" onClick={() => setActiveTab('strategy')}>
                    See Strategies →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="tab-content">
            {!hasData ? (
              <div className="empty-state">
                <p>Enter your portfolio on the <button className="link-btn" onClick={() => setActiveTab('portfolio')}>Portfolio tab</button> first.</p>
              </div>
            ) : (
              <>
                <ConversionWindow buckets={buckets} info={info} />
                <Recommendations buckets={buckets} info={info} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
