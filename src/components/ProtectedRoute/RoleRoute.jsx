import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function RoleRoute({ role, children }) {
    const { user, loading } = useAuth()

    if (loading) return <div style={{ padding: 40 }}>Loading...</div>
    if (!user) return <Navigate to="/login" replace />
    if (user.role !== role) return <Navigate to={`/${user.role}`} replace />

    return children
}

export default RoleRoute
