import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  FiCreditCard,
  FiGrid,
  FiLogOut,
  FiMessageSquare,
  FiUser,
  FiRefreshCw,
  FiLink,
  FiMenu,
  FiX,
  FiUsers,
} from 'react-icons/fi'
import { logoutAdmin } from '../api/auth.js'

const navigation = [
  { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/admin/batches', label: 'Word Batches', icon: FiMessageSquare },
  { to: '/admin/accounts', label: 'Accounts', icon: FiCreditCard },
  { to: '/admin/referrals', label: 'Referrals', icon: FiLink },
  { to: '/admin/gods-eye', label: "God's Eye", icon: FiUsers },
  { to: '/admin/profile', label: 'Profile', icon: FiUser },
]

function AdminLayout() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  function handleLogout() {
    logoutAdmin()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <header className="mobile-topbar">
        <NavLink className="mobile-brand" to="/admin" aria-label="Billions Group dashboard">
          <span className="brand-mark">BG</span>
          <span>Billions Group</span>
        </NavLink>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="admin-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>
      </header>
      {menuOpen ? <button className="menu-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">BG</span>
          <div>
            <strong>Billions Group</strong>
            <small>By Light Potato</small>
          </div>
        </div>

        <nav id="admin-navigation" className="nav-list" aria-label="Admin navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <button className="sidebar-action" type="button" onClick={() => window.location.reload()}>
          <FiRefreshCw aria-hidden="true" />
          <span>Refresh</span>
        </button>
        <button className="sidebar-action danger" type="button" onClick={handleLogout}>
          <FiLogOut aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </aside>

      <main className="main-panel">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
