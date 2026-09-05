import { useAuth } from '../../../context/AuthContext'

function Dashboard() {
    const { user } = useAuth()
    return (
        <div>
            <h2>Dashboard</h2>
            <p>Welcome back, {user?.email}.</p>
            <p>You are logged in as: <strong>{user?.role}</strong></p>
        </div>
    )
}

export default Dashboard
