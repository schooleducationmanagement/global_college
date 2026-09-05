import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function RoleHome() {
    const { user } = useAuth()

    if (user?.role === 'admin') return <Navigate to="/admin" replace />
    if (user?.role === 'teacher') return <Navigate to="/teacher" replace />

    // Fallback: unknown role → login
    return <Navigate to="/login" replace />
}

export default RoleHome
