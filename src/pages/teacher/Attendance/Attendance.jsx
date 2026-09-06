import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Attendance.module.css'

// JS getDay(): 0=Sun..6=Sat -> timetable.day_of_week labels
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function weekdayOf(dateStr) {
    if (!dateStr) return null
    return WEEKDAY[new Date(dateStr + 'T00:00:00').getDay()]
}
function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function classText(c) {
    if (!c) return ''
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}
function fmtTime(t) {
    if (!t) return ''
    return t.slice(0, 5)
}

/* ======================================================================
   TEACHER ATTENDANCE
   date -> my periods for that day -> pick one -> mark present/absent
   ====================================================================== */
function Attendance() {
    const { user } = useAuth()
    const [searchParams] = useSearchParams()

    // A dashboard link can deep-link to a specific date + period:
    //   /teacher/attendance?date=YYYY-MM-DD&period=<timetable_id>
    const urlDate = searchParams.get('date')
    const urlPeriod = searchParams.get('period')

    const [date, setDate] = useState(urlDate || todayISO())
    const [teacherId, setTeacherId] = useState(null)
    const [periods, setPeriods] = useState([])
    const [selectedPeriod, setSelectedPeriod] = useState(null)
    const [loadingPeriods, setLoadingPeriods] = useState(false)
    // period id we still want to auto-open once periods have loaded
    const [pendingPeriodId, setPendingPeriodId] = useState(urlPeriod || null)

    // resolve teacher_id from the logged-in user
    useEffect(() => {
        (async () => {
            if (!user?.user_id) return
            const { data } = await supabase
                .from('teachers').select('teacher_id').eq('user_id', user.user_id).single()
            setTeacherId(data?.teacher_id ?? null)
        })()
    }, [user])

    // load my periods whenever date or teacherId changes
    useEffect(() => {
        if (teacherId && date) loadMyPeriods()
        else { setPeriods([]); setSelectedPeriod(null) }
        // eslint-disable-next-line
    }, [teacherId, date])

    async function loadMyPeriods() {
        setLoadingPeriods(true)
        setSelectedPeriod(null)
        const weekday = weekdayOf(date)

        // (a) my regular class-type periods for this weekday
        const { data: mine } = await supabase
            .from('timetable')
            .select('*, subjects ( subject_name ), classes ( class_id, program, semester, section )')
            .eq('teacher_id', teacherId)
            .eq('day_of_week', weekday)
            .eq('period_type', 'class')

        const mineList = mine || []
        const mineIds = mineList.map((p) => p.timetable_id)

        // overrides on THIS date affecting my periods (a period of mine handed to a substitute)
        let removedIds = new Set()
        if (mineIds.length) {
            const { data: ov } = await supabase
                .from('timetable_override')
                .select('timetable_id, substitute_teacher_id')
                .eq('date', date)
                .in('timetable_id', mineIds)
            for (const o of ov || []) {
                if (o.substitute_teacher_id && String(o.substitute_teacher_id) !== String(teacherId)) {
                    removedIds.add(String(o.timetable_id))
                }
            }
        }

        // (b) periods I'm covering as substitute on this date
        const { data: covering } = await supabase
            .from('timetable_override')
            .select('timetable_id, timetable ( *, subjects ( subject_name ), classes ( class_id, program, semester, section ) )')
            .eq('date', date)
            .eq('substitute_teacher_id', teacherId)

        const coverPeriods = (covering || [])
            .map((o) => o.timetable)
            .filter((t) => t && t.period_type === 'class')
            .map((t) => ({ ...t, _substituting: true }))

        // combine: my periods (minus removed) + covered periods
        const kept = mineList.filter((p) => !removedIds.has(String(p.timetable_id)))
        const all = [...kept, ...coverPeriods]
            .sort((a, b) => (a.period_no || 0) - (b.period_no || 0))

        setPeriods(all)
        setLoadingPeriods(false)

        // If we arrived via a dashboard deep-link, open that period now.
        if (pendingPeriodId) {
            const match = all.find((p) => String(p.timetable_id) === String(pendingPeriodId))
            if (match) setSelectedPeriod(match)
            setPendingPeriodId(null)
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.pageHead}>
                <div>
                    <h2 className={styles.pageTitle}>Attendance</h2>
                    <p className={styles.pageSub}>Pick a date and one of your periods, then mark the class.</p>
                </div>
                <div className={styles.dateRow}>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={styles.dateInput} />
                    <span className={styles.weekdayTag}>{weekdayOf(date)}</span>
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHead}>
                    <h3>Your periods</h3>
                    <span className={styles.sheetMeta}>{loadingPeriods ? '' : `${periods.length} period${periods.length === 1 ? '' : 's'}`}</span>
                </div>
                <div className={styles.cardBody}>
                    {loadingPeriods ? (
                        <div className={styles.empty}>Loading your periods…</div>
                    ) : periods.length === 0 ? (
                        <div className={styles.empty}>You have no class periods scheduled for this day.</div>
                    ) : (
                        <div className={styles.periodList}>
                            {periods.map((p) => {
                                const active = selectedPeriod && selectedPeriod.timetable_id === p.timetable_id
                                return (
                                    <button
                                        key={p.timetable_id}
                                        className={`${styles.periodItem} ${active ? styles.periodItemActive : ''}`}
                                        onClick={() => setSelectedPeriod(p)}
                                    >
                                        <span className={styles.periodNo}>P{p.period_no}</span>
                                        <span className={styles.periodMain}>
                                            <span className={styles.periodSubject}>{p.subjects?.subject_name || 'Subject'}</span>
                                            <span className={styles.periodClass}>{classText(p.classes)}</span>
                                        </span>
                                        <span className={styles.periodTime}>{fmtTime(p.start_time)}–{fmtTime(p.end_time)}</span>
                                        {p._substituting && <span className={styles.subBadge}>Substitute</span>}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {selectedPeriod && (
                <RosterSheet
                    period={selectedPeriod}
                    date={date}
                    markedByTeacherId={teacherId}
                />
            )}
        </div>
    )
}

/* ======================================================================
   ROSTER SHEET (embedded) — mark present/absent for one period on one date
   ====================================================================== */
function RosterSheet({ period, date, markedByTeacherId }) {
    const [students, setStudents] = useState([])
    const [status, setStatus] = useState({})   // { student_id: 'present' | 'absent' }
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState(null)

    useEffect(() => {
        loadSheet()
        // eslint-disable-next-line
    }, [period.timetable_id, date])

    async function loadSheet() {
        setLoading(true)
        setMessage(null)

        const { data: roster } = await supabase
            .from('students')
            .select('student_id, name, roll_no')
            .eq('class_id', period.class_id)
            .order('roll_no')
        setStudents(roster || [])

        // existing attendance for this (timetable_id, date)
        const { data: existing } = await supabase
            .from('attendance')
            .select('student_id, status')
            .eq('timetable_id', period.timetable_id)
            .eq('date', date)
        const map = {}
        for (const row of existing || []) map[row.student_id] = row.status
        setStatus(map)   // starts blank for unmarked students
        setLoading(false)
    }

    function setMark(studentId, value) {
        setStatus((prev) => ({ ...prev, [studentId]: value }))
    }

    async function handleSave() {
        setMessage(null)
        const rows = []
        for (const s of students) {
            const st = status[s.student_id]
            if (st !== 'present' && st !== 'absent') continue  // skip unmarked
            const row = {
                student_id: s.student_id,
                timetable_id: period.timetable_id,
                date,
                status: st,
            }
            if (markedByTeacherId) row.marked_by = markedByTeacherId
            rows.push(row)
        }
        if (rows.length === 0) {
            setMessage({ type: 'err', text: 'Mark at least one student before saving.' }); return
        }
        setSaving(true)
        const { error } = await supabase
            .from('attendance')
            .upsert(rows, { onConflict: 'student_id,timetable_id,date' })
        setSaving(false)
        if (error) { setMessage({ type: 'err', text: 'Could not save: ' + error.message }); return }
        setMessage({ type: 'ok', text: `Saved attendance for ${rows.length} student${rows.length === 1 ? '' : 's'}.` })
    }

    const markedCount = students.filter((s) => status[s.student_id]).length
    const presentCount = students.filter((s) => status[s.student_id] === 'present').length
    const absentCount = students.filter((s) => status[s.student_id] === 'absent').length

    function markAll(value) {
        const next = {}
        for (const s of students) next[s.student_id] = value
        setStatus(next)
    }
    function clearAll() { setStatus({}) }

    return (
        <div className={styles.card}>
            <div className={styles.cardHead}>
                <h3>{period.subjects?.subject_name} — {classText(period.classes)}</h3>
                <span className={styles.sheetMeta}>
                    {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
            </div>
            <div className={styles.cardBody}>
                {message && (
                    <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className={styles.empty}>Loading students…</div>
                ) : students.length === 0 ? (
                    <div className={styles.empty}>No students are enrolled in this class.</div>
                ) : (
                    <>
                        {/* summary + bulk actions */}
                        <div className={styles.rosterBar}>
                            <div className={styles.summary}>
                                <span className={styles.sumChip}>{markedCount}/{students.length} marked</span>
                                <span className={`${styles.sumChip} ${styles.sumPresent}`}>{presentCount} present</span>
                                <span className={`${styles.sumChip} ${styles.sumAbsent}`}>{absentCount} absent</span>
                            </div>
                            <div className={styles.bulk}>
                                <button className={styles.bulkBtn} onClick={() => markAll('present')}>All present</button>
                                <button className={styles.bulkBtn} onClick={() => markAll('absent')}>All absent</button>
                                <button className={styles.bulkBtn} onClick={clearAll}>Clear</button>
                            </div>
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.rosterTable}>
                                <thead>
                                    <tr><th>Roll</th><th>Student</th><th className={styles.statusCol}>Status</th></tr>
                                </thead>
                                <tbody>
                                    {students.map((s) => {
                                        const st = status[s.student_id]
                                        return (
                                            <tr key={s.student_id} className={st === 'absent' ? styles.rowAbsent : ''}>
                                                <td>
                                                    <span className={styles.rollBadge}>{s.roll_no || '—'}</span>
                                                </td>
                                                <td className={styles.strong}>{s.name}</td>
                                                <td className={styles.statusCol}>
                                                    <div className={styles.toggle}>
                                                        <button
                                                            className={`${styles.toggleBtn} ${st === 'present' ? styles.presentOn : ''}`}
                                                            onClick={() => setMark(s.student_id, 'present')}
                                                        >Present</button>
                                                        <button
                                                            className={`${styles.toggleBtn} ${st === 'absent' ? styles.absentOn : ''}`}
                                                            onClick={() => setMark(s.student_id, 'absent')}
                                                        >Absent</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.sheetFoot}>
                            <span className={styles.footHint}>Unmarked students are left unchanged.</span>
                            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : 'Save attendance'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default Attendance