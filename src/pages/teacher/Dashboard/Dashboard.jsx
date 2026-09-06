import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Dashboard.module.css'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function classText(c) {
    if (!c) return '—'
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}
function fmtTime(t) {
    if (!t) return ''
    return t.slice(0, 5)
}

function Dashboard() {
    const { user } = useAuth()

    const [teacher, setTeacher] = useState(null)
    const [periods, setPeriods] = useState([])
    const [announcement, setAnnouncement] = useState(null)
    const [loading, setLoading] = useState(true)

    const today = todayISO()
    const dow = new Date().getDay()

    useEffect(() => {
        if (user?.user_id) init()
        // eslint-disable-next-line
    }, [user])

    async function init() {
        setLoading(true)

        // resolve teacher profile
        const { data: t } = await supabase
            .from('teachers')
            .select('teacher_id, name')
            .eq('user_id', user.user_id)
            .single()

        if (!t) { setLoading(false); return }
        setTeacher(t)

        const weekday = WEEKDAY[dow]

        // today's own periods + periods being covered as substitute + latest announcement
        const [mineRes, coverRes, annRes] = await Promise.all([
            supabase
                .from('timetable')
                .select('*, subjects ( subject_name ), classes ( class_id, program, semester, section )')
                .eq('teacher_id', t.teacher_id)
                .eq('day_of_week', weekday)
                .eq('period_type', 'class'),
            supabase
                .from('timetable_override')
                .select('timetable_id, timetable ( *, subjects ( subject_name ), classes ( class_id, program, semester, section ) )')
                .eq('date', today)
                .eq('substitute_teacher_id', t.teacher_id),
            supabase
                .from('announcements')
                .select('title, body, created_at, start_date')
                .order('created_at', { ascending: false })
                .limit(1),
        ])

        const mineList = mineRes.data || []
        const mineIds = mineList.map((p) => p.timetable_id)

        // periods of mine handed to a substitute today -> drop them
        let removed = new Set()
        if (mineIds.length) {
            const { data: ov } = await supabase
                .from('timetable_override')
                .select('timetable_id, substitute_teacher_id')
                .eq('date', today)
                .in('timetable_id', mineIds)
            for (const o of ov || []) {
                if (o.substitute_teacher_id && String(o.substitute_teacher_id) !== String(t.teacher_id)) {
                    removed.add(String(o.timetable_id))
                }
            }
        }

        const covering = (coverRes.data || [])
            .map((o) => o.timetable)
            .filter((tt) => tt && tt.period_type === 'class')
            .map((tt) => ({ ...tt, _substituting: true }))

        const kept = mineList.filter((p) => !removed.has(String(p.timetable_id)))
        const allPeriods = [...kept, ...covering].sort((a, b) => (a.period_no || 0) - (b.period_no || 0))
        setPeriods(allPeriods)

        setAnnouncement((annRes.data && annRes.data[0]) || null)
        setLoading(false)
    }

    // which period is happening right now?
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    function isNow(p) {
        if (!p.start_time || !p.end_time) return false
        const toMin = (t) => parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5))
        return toMin(p.start_time) <= nowMin && nowMin < toMin(p.end_time)
    }

    const longDate = new Date().toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    return (
        <div className={styles.page}>
            {/* Header: today's date + period count */}
            <div className={styles.header}>
                <h1 className={styles.date}>{longDate}</h1>
                <p className={styles.sub}>
                    {loading
                        ? 'Loading your day...'
                        : periods.length === 0
                            ? 'No periods scheduled today.'
                            : `${periods.length} period${periods.length === 1 ? '' : 's'} scheduled`}
                </p>
            </div>

            {/* Today's schedule */}
            <div className={styles.schedule}>
                {loading ? (
                    <div className={styles.empty}>Loading...</div>
                ) : periods.length === 0 ? (
                    <div className={styles.empty}>Nothing scheduled for today. Enjoy the breather.</div>
                ) : (
                    <ul className={styles.periodList}>
                        {periods.map((p) => {
                            const now = isNow(p)
                            return (
                                <li
                                    key={p.timetable_id}
                                    className={`${styles.periodItem} ${now ? styles.periodNow : ''}`}
                                >
                                    <span className={styles.periodTime}>
                                        <span className={styles.periodNo}>P{p.period_no}</span>
                                        <span className={styles.periodClock}>
                                            {fmtTime(p.start_time)} - {fmtTime(p.end_time)}
                                        </span>
                                    </span>

                                    <span className={styles.periodInfo}>
                                        <span className={styles.periodSubject}>
                                            {p.subjects?.subject_name || 'Subject'}
                                            {now && <span className={styles.nowTag}>Now</span>}
                                            {p._substituting && <span className={styles.subTag}>Substitute</span>}
                                        </span>
                                        <span className={styles.periodClass}>{classText(p.classes)}</span>
                                    </span>

                                    <Link
                                        to={`/teacher/attendance?date=${today}&period=${p.timetable_id}`}
                                        className={styles.attendanceBtn}
                                    >
                                        Attendance
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            {/* Latest announcement */}
            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <h2>Latest announcement</h2>
                    <Link to="/teacher/announcements" className={styles.cardLink}>All</Link>
                </div>
                <div className={styles.cardBody}>
                    {loading ? (
                        <div className={styles.empty}>Loading...</div>
                    ) : !announcement ? (
                        <div className={styles.empty}>No announcements yet.</div>
                    ) : (
                        <div className={styles.annBlock}>
                            <div className={styles.annTitle}>{announcement.title}</div>
                            <p className={styles.annBody}>{announcement.body}</p>
                            <span className={styles.annDate}>
                                {new Date((announcement.start_date || announcement.created_at?.slice(0, 10)) + 'T00:00:00')
                                    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}

export default Dashboard