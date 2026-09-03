import { useEffect, useMemo, useState } from 'react'
import { FiCheckCircle, FiClock, FiCreditCard, FiDatabase } from 'react-icons/fi'
import { apiErrorMessage, fetchAccounts, fetchWordBatches } from '../api/adminApi.js'
import MetricCard from '../components/MetricCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function currency(value) {
  if (value === null || typeof value === 'undefined') return 'N/A'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
}

function DashboardPage() {
  const [batches, setBatches] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true)
        const [batchData, accountData] = await Promise.all([fetchWordBatches(25), fetchAccounts(25)])
        setBatches(batchData)
        setAccounts(accountData)
      } catch (requestError) {
        setError(apiErrorMessage(requestError))
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  const stats = useMemo(() => {
    const pending = batches.filter((batch) => batch.approvalStatus === 'pending').length
    const approved = batches.filter((batch) => batch.approvalStatus === 'approved').length
    const totalUsd = accounts.reduce((sum, account) => sum + Number(account.totalUsd || 0), 0)

    return { pending, approved, totalUsd }
  }, [accounts, batches])

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>Admin Dashboard</h1>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="metrics-grid">
        <MetricCard icon={FiDatabase} label="Recent batches" value={loading ? '...' : batches.length} detail="Latest records" />
        <MetricCard icon={FiClock} label="Pending review" value={loading ? '...' : stats.pending} detail="Need action" />
        <MetricCard icon={FiCheckCircle} label="Approved" value={loading ? '...' : stats.approved} detail="Active accounts" />
        <MetricCard icon={FiCreditCard} label="Total value" value={loading ? '...' : currency(stats.totalUsd)} detail="Loaded accounts" />
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-title">
            <h2>Latest batches</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Words</th>
                </tr>
              </thead>
              <tbody>
                {batches.slice(0, 8).map((batch) => (
                  <tr key={batch.id}>
                    <td>#{batch.id}</td>
                    <td>{batch.title || 'Untitled'}</td>
                    <td><StatusBadge status={batch.approvalStatus} /></td>
                    <td>{batch.wordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <h2>Top accounts</h2>
          </div>
          <div className="account-list">
            {accounts.slice(0, 6).map((account) => (
              <div className="account-row" key={account.id}>
                <div>
                  <strong>{account.accountNumber}</strong>
                  <span>{account.title || 'No title'}</span>
                </div>
                <b>{currency(account.totalUsd)}</b>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

export default DashboardPage
