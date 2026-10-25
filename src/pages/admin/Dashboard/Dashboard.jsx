import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../supabaseClient'
import styles from './Dashboard.module.css'

function Dashboard() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, subjects: 0 })
  const [classCounts, setClassCounts] = useState([])   // [{ label, count }]
  const [recentTeachers, setRecentTeachers] = useState([])

  useEffect(() => {
    loadDashboard()
    // eslint-disable-next-line
  }, [])

  async function loadDashboard() {
    setLoading(true)

    const [studentsRes, teachersRes, classesRes, subjectsRes, recentTeachersRes] =
      await Promise.all([
        supabase.from('students').select('student_id, class_id'),
        supabase.from('teachers').select('teacher_id'),
        supabase.from('classes').select('class_id, program, semester, section'),
        supabase.from('subjects').select('subject_id'),
        supabase
          .from('teachers')
          .select('teacher_id, name, department, rank, users ( is_active )')
          .order('teacher_id', { ascending: false })
          .limit(5),
      ])

    const students = studentsRes.data || []
    const classes = classesRes.data || []

    setStats({
      students: students.length,
      teachers: (teachersRes.data || []).length,
      classes: classes.length,
      subjects: (subjectsRes.data || []).length,
    })

    // Students per class
    const countMap = {}
    students.forEach((s) => {
      if (s.class_id) countMap[s.class_id] = (countMap[s.class_id] || 0) + 1
    })
    const perClass = classes
      .map((c) => ({
        label: `${c.program} · Sem ${c.semester} · ${c.section}`,
        count: countMap[c.class_id] || 0,
      }))
      .sort((a, b) => b.count - a.count)
    setClassCounts(perClass)

    setRecentTeachers(recentTeachersRes.data || [])
    setLoading(false)
  }

  const maxCount = Math.max(...classCounts.map((c) => c.count), 1)

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.greeting}>Welcome back{user?.email ? `, ${user.email}` : ''}</div>
        <div className={styles.dateLine}>{today}</div>
      </div>

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        <Link to="/admin/students" className={styles.statCard}>
          <div className={styles.statIcon}>🎓</div>
          <div className={styles.statInfo}>
            <span className={styles.statNumber}>{stats.students}</span>
            <span className={styles.statLabel}>Students</span>
          </div>
        </Link>

        <Link to="/admin/teachers" className={styles.statCard}>
          <div className={styles.statIcon}>👨‍🏫</div>
          <div className={styles.statInfo}>
            <span className={styles.statNumber}>{stats.teachers}</span>
            <span className={styles.statLabel}>Teachers</span>
          </div>
        </Link>

        <Link to="/admin/classes" className={styles.statCard}>
          <div className={styles.statIcon}>🏫</div>
          <div className={styles.statInfo}>
            <span className={styles.statNumber}>{stats.classes}</span>
            <span className={styles.statLabel}>Classes</span>
          </div>
        </Link>

        <Link to="/admin/subjects" className={styles.statCard}>
          <div className={styles.statIcon}>📚</div>
          <div className={styles.statInfo}>
            <span className={styles.statNumber}>{stats.subjects}</span>
            <span className={styles.statLabel}>Subjects</span>
          </div>
        </Link>
      </div>

      {/* Two-column sections */}
      <div className={styles.sectionsGrid}>
        {/* Students per Class */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>📊</span>
            Students per Class
          </div>
          {classCounts.length === 0 ? (
            <div className={styles.emptyRow}>No classes found.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {classCounts.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td>
                      <div className={styles.countBar}>
                        <div
                          className={styles.bar}
                          style={{ width: `${(c.count / maxCount) * 100}%` }}
                        />
                        <span className={styles.countNum}>{c.count}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Teachers */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>👤</span>
            Recent Teachers
          </div>
          {recentTeachers.length === 0 ? (
            <div className={styles.emptyRow}>No teachers found.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTeachers.map((t) => (
                  <tr key={t.teacher_id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.department || '—'}</td>
                    <td>
                      {t.rank === 'hod' ? (
                        <span className={`${styles.badge} ${styles.badgeGreen}`}>HOD</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeGray}`}>Class Teacher</span>
                      )}
                    </td>
                    <td>
                      {t.users?.is_active !== false ? (
                        <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeGray}`}>Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
