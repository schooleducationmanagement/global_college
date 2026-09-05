import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import styles from './Topbar.module.css'

function Topbar({ title = 'Admin & Teacher Portal' }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <header className={styles.topbar}>
            <div className={styles.title}>{title}</div>
            <div className={styles.right}>
                <span className={styles.user}>
                    {user?.email} ({user?.role})
                </span>
                <button className={styles.logoutBtn} onClick={handleLogout}>
                    Logout
                </button>
            </div>
        </header>
    )
}

export default Topbar
