import { Navigate } from 'react-router-dom'
import { isAdminAuthenticated } from '../api/auth.js'

function ProtectedRoute({ children }) {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
