import { useState } from 'react'
import { ACCOUNT_TYPES, BUCKET_COLORS, BUCKET_LABELS, getBucketFromAccount } from '../utils/accountTypes.js'

export default function PortfolioInput({ accounts, onChange }) {
  const [type, setType] = useState('401k')
  const [balance, setBalance] = useState('')
  const [label, setLabel] = useState('')

  function add() {
    const bal = parseFloat(balance.replace(/,/g, ''))
    if (!bal || bal <= 0) return
    onChange([...accounts, { id: Date.now(), type, balance: bal, label: label || ACCOUNT_TYPES.find(a => a.value === type)?.label }])
    setBalance('')
    setLabel('')
  }

  function remove(id) {
    onChange(accounts.filter(a => a.id !== id))
  }

  function formatBal(n) {
    return '$' + Number(n).toLocaleString()
  }

  return (
    <div className="card">
      <h2 className="section-title">Portfolio Accounts</h2>
      <p className="help-text">Add each account. They'll be mapped to one of the three tax buckets.</p>

      <div className="add-row">
        <select value={type} onChange={e => setType(e.target.value)} className="select">
          {ACCOUNT_TYPES.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Nickname (optional)"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder="Balance ($)"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          type="text"
          inputMode="numeric"
        />
        <button className="btn-primary" onClick={add}>Add</button>
      </div>

      {accounts.length > 0 && (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Tax Bucket</th>
              <th>Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => {
              const bucket = getBucketFromAccount(a.type)
              return (
                <tr key={a.id}>
                  <td>{a.label}</td>
                  <td>
                    <span className="bucket-badge" style={{ background: BUCKET_COLORS[bucket] + '22', color: BUCKET_COLORS[bucket], border: `1px solid ${BUCKET_COLORS[bucket]}55` }}>
                      {BUCKET_LABELS[bucket]}
                    </span>
                  </td>
                  <td className="text-right">{formatBal(a.balance)}</td>
                  <td>
                    <button className="btn-remove" onClick={() => remove(a.id)}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
