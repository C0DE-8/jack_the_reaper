import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiLock, FiMail } from 'react-icons/fi'
import { loginAdmin } from '../api/auth.js'

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@admin.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const result = loginAdmin(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate('/admin', { replace: true })
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <span className="eyebrow">Secure admin</span>
          <h1>Word approval control center</h1>
          <p>Review submitted word batches, approve accounts, and manage crypto balances.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <h2>Admin sign in</h2>
            <p>Use the configured admin credentials.</p>
          </div>

          {error ? <div className="alert error">{error}</div> : null}

          <label className="input-field">
            <span>Email</span>
            <div>
              <FiMail aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label className="input-field">
            <span>Password</span>
            <div>
              <FiLock aria-hidden="true" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>

          <button className="primary-button" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  )
}

export default LoginPage
