import { useEffect, useState } from 'react'
import { FiSave, FiUser } from 'react-icons/fi'
import { apiErrorMessage, fetchAdminProfile, updateAdminProfile } from '../api/adminApi.js'
import { getAdminPassword, getAdminSession, saveAdminSession } from '../api/auth.js'

function ProfilePage() {
  const session = getAdminSession()
  const [form, setForm] = useState({
    name: session?.name || 'Admin',
    email: session?.email || 'admin@admin.com',
    currentPassword: getAdminPassword(),
    newPassword: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadProfile() {
      try {
        const admin = await fetchAdminProfile()
        if (!active) return
        setForm((current) => ({
          ...current,
          name: admin.name || 'Admin',
          email: admin.email || current.email,
        }))
      } catch (requestError) {
        if (active) setError(apiErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setMessage('')
      setError('')
      const admin = await updateAdminProfile({
        currentEmail: session?.email || form.email,
        currentPassword: form.currentPassword,
        name: form.name,
        email: form.email,
        newPassword: form.newPassword,
      })
      saveAdminSession(admin, form.newPassword || form.currentPassword)
      setForm((current) => ({
        ...current,
        currentPassword: current.newPassword || current.currentPassword,
        newPassword: '',
      }))
      setMessage('Profile updated.')
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Admin Profile</h1>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <article className="panel profile-panel">
        <div className="panel-title">
          <h2>Account details</h2>
          <FiUser aria-hidden="true" />
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <label>
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <label>
            <span>Current password</span>
            <input
              type="password"
              value={form.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              disabled={loading}
              required
            />
          </label>
          <label>
            <span>New password</span>
            <input
              type="password"
              value={form.newPassword}
              onChange={(event) => updateField('newPassword', event.target.value)}
              disabled={loading}
              placeholder="Leave blank to keep current"
            />
          </label>

          <button className="primary-button" type="submit" disabled={loading || saving}>
            <FiSave aria-hidden="true" />
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </article>
    </section>
  )
}

export default ProfilePage
