import { useEffect, useState } from 'react'
import { FiMinus, FiPlus, FiRefreshCw } from 'react-icons/fi'
import {
  apiErrorMessage,
  fetchAccounts,
  removeAccountBalance,
  topUpAccount,
} from '../api/adminApi.js'

const assets = ['usdt', 'btc', 'eth', 'bnb', 'tron']

function balanceLabel(account) {
  return assets
    .map((asset) => `${asset.toUpperCase()} ${Number(account.balances?.[asset] || 0).toLocaleString()}`)
    .join(' | ')
}

function AccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyAccount, setBusyAccount] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ accountNumber: '', asset: 'usdt', amount: '' })

  async function loadAccounts() {
    try {
      setError('')
      setLoading(true)
      setAccounts(await fetchAccounts(50))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadInitialAccounts() {
      try {
        const accountData = await fetchAccounts(50)
        if (active) setAccounts(accountData)
      } catch (requestError) {
        if (active) setError(apiErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInitialAccounts()

    return () => {
      active = false
    }
  }, [])

  async function submitBalance(action) {
    try {
      setError('')
      setBusyAccount(form.accountNumber)
      const updated =
        action === 'top-up'
          ? await topUpAccount(form.accountNumber, form.asset, form.amount)
          : await removeAccountBalance(form.accountNumber, form.asset, form.amount)
      setAccounts((current) =>
        current.map((account) => (account.accountNumber === updated.accountNumber ? updated : account)),
      )
      setForm((current) => ({ ...current, amount: '' }))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusyAccount('')
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Balances</span>
          <h1>Accounts</h1>
        </div>
        <button className="secondary-button" type="button" onClick={loadAccounts}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <article className="panel balance-panel">
        <div className="panel-title">
          <h2>Balance action</h2>
        </div>
        <div className="balance-form">
          <label>
            <span>Account</span>
            <select
              value={form.accountNumber}
              onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.accountNumber}>
                  {account.accountNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Asset</span>
            <select
              value={form.asset}
              onChange={(event) => setForm((current) => ({ ...current, asset: event.target.value }))}
            >
              {assets.map((asset) => (
                <option key={asset} value={asset}>{asset.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount</span>
            <input
              min="0"
              step="any"
              type="number"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              placeholder="0.00"
            />
          </label>
          <div className="balance-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!form.accountNumber || !form.amount || Boolean(busyAccount)}
              onClick={() => submitBalance('top-up')}
            >
              <FiPlus aria-hidden="true" />
              Add
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!form.accountNumber || !form.amount || Boolean(busyAccount)}
              onClick={() => submitBalance('remove')}
            >
              <FiMinus aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Title</th>
                <th>Balances</th>
                <th>Total USD</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5">Loading accounts...</td></tr>
              ) : accounts.length ? (
                accounts.map((account) => (
                  <tr key={account.id}>
                    <td><strong>{account.accountNumber}</strong></td>
                    <td>{account.title || 'Untitled'}</td>
                    <td>{balanceLabel(account)}</td>
                    <td>{account.totalUsd === null ? 'N/A' : `$${Number(account.totalUsd || 0).toLocaleString()}`}</td>
                    <td>{account.createdAt ? new Date(account.createdAt).toLocaleString() : 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5">No accounts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

export default AccountsPage
