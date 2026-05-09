export default function PersonalInfo({ info, onChange }) {
  function set(field, value) {
    onChange({ ...info, [field]: value })
  }

  return (
    <div className="card">
      <h2 className="section-title">Personal Information</h2>
      <div className="info-grid">
        <div className="field">
          <label>Current Age</label>
          <input
            className="input"
            type="number"
            min="30"
            max="95"
            value={info.age}
            onChange={e => set('age', parseInt(e.target.value) || '')}
          />
        </div>
        <div className="field">
          <label>Filing Status</label>
          <select className="select" value={info.filingStatus} onChange={e => set('filingStatus', e.target.value)}>
            <option value="mfj">Married Filing Jointly</option>
            <option value="single">Single</option>
          </select>
        </div>
        <div className="field">
          <label>Expected Annual Social Security</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input
              className="input with-prefix"
              type="number"
              min="0"
              step="1000"
              value={info.socialSecurity}
              onChange={e => set('socialSecurity', parseFloat(e.target.value) || 0)}
            />
          </div>
          <span className="field-hint">Combined household benefit at full retirement age</span>
        </div>
        <div className="field">
          <label>Planned Retirement Age</label>
          <input
            className="input"
            type="number"
            min="50"
            max="75"
            value={info.retirementAge}
            onChange={e => set('retirementAge', parseInt(e.target.value) || '')}
          />
        </div>
        <div className="field">
          <label>SS Claiming Age</label>
          <input
            className="input"
            type="number"
            min="62"
            max="70"
            value={info.ssClaimAge}
            onChange={e => set('ssClaimAge', parseInt(e.target.value) || 67)}
          />
          <span className="field-hint">Age you plan to start collecting SS</span>
        </div>
        <div className="field">
          <label>Annual Living Expenses</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input
              className="input with-prefix"
              type="number"
              min="0"
              step="5000"
              value={info.annualExpenses}
              onChange={e => set('annualExpenses', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
