import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  FiCreditCard,
  FiGrid,
  FiLogOut,
  FiMessageSquare,
  FiUser,
  FiRefreshCw,
} from 'react-icons/fi'
import { logoutAdmin } from '../api/auth.js'

const navigation = [
  { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/admin/batches', label: 'Word Batches', icon: FiMessageSquare },
  { to: '/admin/accounts', label: 'Accounts', icon: FiCreditCard },
  { to: '/admin/profile', label: 'Profile', icon: FiUser },
]

function AdminLayout() {
  const navigate = useNavigate()

  function handleLogout() {
    logoutAdmin()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">BG</span>
          <div>
            <strong>Billions Group</strong>
            <small>By Light Potato</small>
          </div>
        </div>

        <nav className="nav-list" aria-label="Admin navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
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
