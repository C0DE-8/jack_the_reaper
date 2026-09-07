import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import api, { apiErrorMessage } from '../api/adminApi.js'
import { getAdminSession } from '../api/auth.js'

function telegramName(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return fullName || (user.username ? `@${user.username}` : `Telegram ${user.chat_id}`)
}

export default function OperatorsPage() {
  const session = getAdminSession()
  const [users, setUsers] = useState([])
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingChat, setWorkingChat] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadUsers() {
    const { data } = await api.get('/activity/telegram-users')
    setUsers(data.telegramUsers || [])
    setReferrals(data.referrals || [])
    setError('')
  }

  async function refreshUsers() {
    setLoading(true)
    setError('')
    try {
      await loadUsers()
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.role === 'level2') return undefined
    let active = true
    api.get('/activity/telegram-users')
      .then(({ data }) => {
        if (active) {
          setUsers(data.telegramUsers || [])
          setReferrals(data.referrals || [])
          setError('')
        }
      })
      .catch(requestError => {
        if (active) setError(apiErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [session?.role])

  if (session?.role === 'level2') return <Navigate to="/admin/activity" replace />

  async function updateAccess(user, role, active) {
    try {
      setWorkingChat(user.chat_id)
      setError('')
      setNotice('')
      await api.put(`/activity/telegram-users/${encodeURIComponent(user.chat_id)}/access`, { role, active })
      await loadUsers()
      const access = active ? (role === 'level1' ? 'Level 1' : 'Level 2') : 'disabled'
      setNotice(`${telegramName(user)} is now ${access}.`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setWorkingChat('')
    }
  }

  async function updateReferral(user, referral, assigned) {
    if (!user.operator_id) {
      setError('Approve this Telegram user before assigning a referral link.')
      return
    }
    try {
      setWorkingChat(user.chat_id)
      setError('')
      setNotice('')
      await api.put(`/activity/referrals/${referral.id}`, {
        operatorId: assigned ? user.operator_id : '',
        active: Boolean(referral.active),
      })
      await loadUsers()
      setNotice(`${referral.name} was ${assigned ? 'assigned to' : 'removed from'} ${telegramName(user)}.`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setWorkingChat('')
    }
  }

  return (
    <section className="activity-page">
      <header className="page-header">
        <div>
          <h1>Telegram admins</h1>
          <p>Manage alert levels for Telegram admins stored in the database.</p>
        </div>
        <button type="button" disabled={loading} onClick={refreshUsers}>Refresh</button>
      </header>

      {error && <p role="alert">{error}</p>}
      {notice && <p className="operator-notice" role="status">{notice}</p>}

      <p>Level 1 receives every permitted alert. Level 2 receives alerts only from referral links assigned to that Telegram user.</p>

      {loading && <p>Loading Telegram admins…</p>}
      {!loading && !error && users.length === 0 && <p>No Telegram admins found in the database.</p>}
      {users.length > 0 && (
        <div className="activity-table">
          <table>
            <thead>
              <tr><th>User</th><th>Username</th><th>Chat ID</th><th>Level</th><th>Assigned links</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map(user => {
                const role = user.role || 'level2'
                const busy = workingChat === user.chat_id
                const enabled = Boolean(user.active && user.authorized)
                return (
                  <tr key={user.chat_id}>
                    <td>{telegramName(user)}</td>
                    <td>{user.username ? `@${user.username}` : '—'}</td>
                    <td><code>{user.chat_id}</code></td>
                    <td>
                      <select value={role} disabled={busy} onChange={event => updateAccess(user, event.target.value, true)}>
                        <option value="level2">Level 2 — assigned links</option>
                        <option value="level1">Level 1 — all alerts</option>
                      </select>
                    </td>
                    <td>
                      {role !== 'level2' ? 'All activity' : referrals.length === 0 ? 'No links created' : (
                        <div className="operator-links">
                          {referrals.map(referral => {
                            const assignedHere = String(referral.operator_id || '') === String(user.operator_id || '') && Boolean(user.operator_id)
                            const assignedElsewhere = Boolean(referral.operator_id) && !assignedHere
                            return (
                              <label key={referral.id} title={assignedElsewhere ? 'Currently assigned to another Level 2 user' : ''}>
                                <input
                                  type="checkbox"
                                  checked={assignedHere}
                                  disabled={busy || !enabled || !user.operator_id}
                                  onChange={event => updateReferral(user, referral, event.target.checked)}
                                />
                                {referral.name}{assignedElsewhere ? ' (reassign)' : ''}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td>{enabled ? 'Active' : user.operator_id ? 'Disabled' : 'Pending'}</td>
                    <td>
                      <button type="button" disabled={busy} onClick={() => updateAccess(user, role, !enabled)}>
                        {busy ? 'Saving…' : enabled ? 'Disable' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
