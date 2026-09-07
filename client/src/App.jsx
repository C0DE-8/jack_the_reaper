import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AccountsPage from './pages/AccountsPage.jsx'
import BatchesPage from './pages/BatchesPage.jsx'
import ClientPage from './pages/ClientPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ReferralsPage from './pages/ReferralsPage.jsx'
import VisitorPage from './pages/VisitorPage.jsx'
import VisitorsPage from './pages/VisitorsPage.jsx'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/client" element={<ClientPage />} />
      <Route path="/visitor" element={<VisitorPage />} />
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="visitors" element={<VisitorsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
