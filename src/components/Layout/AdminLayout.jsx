import { Outlet } from 'react-router-dom'
import Sidebar from '../Sidebar/Sidebar'
import Topbar from '../Topbar/Topbar'
import styles from './Layout.module.css'

function AdminLayout() {
    return (
        <div className={styles.layout}>
            <Sidebar />
            <div className={styles.mainArea}>
                <Topbar title="Admin Portal" />
                <main className={styles.content}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export default AdminLayout
