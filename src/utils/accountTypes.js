// Maps account types to one of three core tax buckets
export const ACCOUNT_TYPES = [
  { value: '401k', label: '401(k) Traditional', bucket: 'traditional' },
  { value: '403b', label: '403(b) Traditional', bucket: 'traditional' },
  { value: '457', label: '457(b) Deferred Compensation', bucket: 'traditional' },
  { value: 'sep_ira', label: 'SEP IRA', bucket: 'traditional' },
  { value: 'simple_ira', label: 'SIMPLE IRA', bucket: 'traditional' },
  { value: 'trad_ira', label: 'Traditional IRA', bucket: 'traditional' },
  { value: 'pension', label: 'Pension / Defined Benefit', bucket: 'traditional' },
  { value: 'roth_ira', label: 'Roth IRA', bucket: 'roth' },
  { value: 'roth_401k', label: 'Roth 401(k)', bucket: 'roth' },
  { value: 'roth_403b', label: 'Roth 403(b)', bucket: 'roth' },
  { value: 'brokerage', label: 'Taxable Brokerage', bucket: 'taxable' },
  { value: 'savings', label: 'Savings / Money Market', bucket: 'taxable' },
  { value: 'i_bonds', label: 'I-Bonds / Treasury', bucket: 'taxable' },
  { value: 'hsa', label: 'HSA (invested)', bucket: 'roth' }, // triple tax advantaged, treated similar to Roth
]

export const BUCKET_LABELS = {
  traditional: 'Tax-Deferred (Traditional)',
  roth: 'Tax-Free (Roth)',
  taxable: 'Taxable Brokerage',
}

export const BUCKET_COLORS = {
  traditional: '#ef4444',  // red – taxed on way out
  roth: '#22c55e',          // green – tax-free
  taxable: '#3b82f6',       // blue – capital gains
}

export const BUCKET_DESCRIPTIONS = {
  traditional: 'Every dollar withdrawn is ordinary income. Subject to RMDs at 73–75. Fully visible to the IRS.',
  roth: 'Withdrawals are tax-free. No RMDs. Doesn\'t count toward Social Security taxability or IRMAA. IRS can\'t see it.',
  taxable: 'Taxed at long-term capital gains rates (usually 15%). You control when to recognize gains.',
}

export function getBucketFromAccount(accountType) {
  return ACCOUNT_TYPES.find(a => a.value === accountType)?.bucket ?? 'traditional'
}

export function sumBuckets(accounts) {
  const totals = { traditional: 0, roth: 0, taxable: 0 }
  for (const acct of accounts) {
    const bucket = getBucketFromAccount(acct.type)
    totals[bucket] += Number(acct.balance) || 0
  }
  return totals
}
