import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import s from './Sidebar.module.css'

// Admin nav — grouped like the school app
const adminGroups = [
    {
        section: 'Overview',
        items: [
            // { to: '/admin', label: 'Dashboard', icon: '⊞', end: true },
            { to: '/admin/announcements', label: 'Announcements', icon: '📢' },
        ],
    },
    {
        section: 'Setup',
        items: [
            { to: '/admin/teachers', label: 'Create Teachers', icon: '👤' },
            { to: '/admin/classes', label: 'Classes & Subjects', icon: '🎓' },
            { to: '/admin/teacher-assignments', label: 'Teacher Assignments', icon: '📋' },
            { to: '/admin/students', label: 'Create Students', icon: '👥' },
        ],
    },
    {
        section: 'Timetable',
        items: [
            { to: '/admin/timetable', label: 'Timetable', icon: '📅' },
            { to: '/admin/substitutes', label: 'Substitutes', icon: '🔁' },
        ],
    },
    {
        section: 'Academics',
        items: [
            { to: '/admin/attendance', label: 'Attendance', icon: '✅' },
            { to: '/admin/exams', label: 'Exams', icon: '📝' },
            { to: '/admin/study-materials', label: 'Study Materials', icon: '📚' },
        ],
    },
]

// Teacher nav
const teacherGroups = [
    {
        section: 'Overview',
        items: [
            { to: '/teacher', label: 'Dashboard', icon: '⊞', end: true },
            { to: '/teacher/announcements', label: 'Announcements', icon: '📢' },
        ],
    },
    {
        section: 'Teaching',
        items: [
            { to: '/teacher/attendance', label: 'Attendance', icon: '✅' },
            { to: '/teacher/timetable', label: 'Timetable', icon: '📅' },
            { to: '/teacher/exams', label: 'Exams', icon: '📝' },
            { to: '/teacher/students', label: 'Students', icon: '👥' },
            { to: '/teacher/study-materials', label: 'Study Materials', icon: '📚' },
        ],
    },
    {
        section: 'Account',
        items: [
            { to: '/teacher/profile', label: 'My Profile', icon: '👤' },
        ],
    },
]

function Sidebar({ collapsed = false, onToggle, onNavClick }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const isAdmin = user?.role === 'admin'
    const groups = isAdmin ? adminGroups : teacherGroups
    const portal = isAdmin ? 'Admin Portal' : 'Teacher Portal'

    function handleLogout() {
        logout()
        navigate('/login')
    }

    return (
        <>
            {!collapsed && onToggle && (
                <div className={s.backdrop} onClick={onToggle} aria-hidden="true" />
            )}

            <aside className={`${s.sidebar} ${collapsed ? s.collapsed : ''}`}>
                <div className={s.header}>
                    <div className={s.logo}>
                        <span className={s.logoIcon}>E</span>
                        <div className={s.logoText}>
                            <p className={s.logoName}>EduCore</p>
                            <p className={s.logoSub}>{portal}</p>
                        </div>
                    </div>
                    {onToggle && (
                        <button
                            className={s.toggleBtn}
                            onClick={onToggle}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {collapsed ? '›' : '‹'}
                        </button>
                    )}
                </div>

                <nav className={s.nav}>
                    {groups.map(group => (
                        <div key={group.section}>
                            <div className={s.section}>{group.section}</div>
                            {group.items.map(link => (
                                <NavLink
                                    key={link.to}
                                    to={link.to}
                                    end={link.end || false}
                                    className={({ isActive }) => `${s.item} ${isActive ? s.active : ''}`}
                                    onClick={onNavClick}
                                    title={collapsed ? link.label : undefined}
                                >
                                    <span className={s.icon}>{link.icon}</span>
                                    <span className={s.label}>{link.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className={s.footer}>
                    <button className={s.item} onClick={handleLogout} title={collapsed ? 'Logout' : undefined} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <span className={s.icon}>🚪</span>
                        <span className={s.label}>Logout</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

export default Sidebar