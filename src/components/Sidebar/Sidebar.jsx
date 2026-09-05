import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Sidebar.module.css'

function Sidebar() {
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'
    const base = isAdmin ? '/admin' : '/teacher'

    // Admin navigation (full access), all under /admin
    const adminLinks = [
        { to: '/admin', label: 'Dashboard', end: true },
        { to: '/admin/users', label: 'Users' },
        { to: '/admin/classes', label: 'Classes' },
        { to: '/admin/subjects', label: 'Subjects' },
        { to: '/admin/timetable', label: 'Timetable' },
        { to: '/admin/exams', label: 'Exams' },
        { to: '/admin/attendance', label: 'Attendance' },
        { to: '/admin/announcements', label: 'Announcements' },
        { to: '/admin/teacher-assignments', label: 'Teacher Assignments' },
        { to: '/admin/substitutes', label: 'Substitutes' },
    ]

    // Teacher navigation (limited), all under /teacher
    const teacherLinks = [
        { to: '/teacher', label: 'Dashboard', end: true },
        { to: '/teacher/attendance', label: 'Attendance' },
        { to: '/teacher/timetable', label: 'Timetable' },
        { to: '/teacher/exams', label: 'Exams' },
        { to: '/teacher/announcements', label: 'Announcements' },
    ]

    const links = isAdmin ? adminLinks : teacherLinks

    return (
        <aside className={styles.sidebar}>
            <div className={styles.title}>School MS</div>
            <nav>
                {links.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end || false}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ''}`
                        }
                    >
                        {link.label}
                    </NavLink>
                ))}
            </nav>
        </aside>
    )
}

export default Sidebar