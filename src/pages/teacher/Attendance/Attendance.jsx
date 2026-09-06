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
    const isHod = user?.rank === 'hod'
    const myDept = user?.department || null
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

    // HOD-only: scope toggle + department class picker
    const [mode, setMode] = useState('mine')          // 'mine' | 'dept'  (HODs only)
    const [deptClasses, setDeptClasses] = useState([])
    const [selectedClassId, setSelectedClassId] = useState(null)

    // resolve teacher_id from the logged-in user
    useEffect(() => {
        (async () => {
            if (!user?.user_id) return
            const { data } = await supabase
                .from('teachers').select('teacher_id').eq('user_id', user.user_id).single()
            setTeacherId(data?.teacher_id ?? null)
        })()
    }, [user])

    // HOD: load the department's classes once
    useEffect(() => {
        if (!isHod || !myDept) return
        (async () => {
            const { data } = await supabase
                .from('classes')
                .select('class_id, program, semester, section')
                .eq('program', myDept)
                .order('semester').order('section')
            setDeptClasses(data || [])
        })()
    }, [isHod, myDept])

    // load periods whenever the date, teacher, mode, or chosen class changes
    useEffect(() => {
        if (!date) { setPeriods([]); setSelectedPeriod(null); return }
        if (mode === 'dept' && isHod) {
            if (selectedClassId) loadClassPeriods()
            else { setPeriods([]); setSelectedPeriod(null) }
        } else {
            if (teacherId) loadMyPeriods()
            else { setPeriods([]); setSelectedPeriod(null) }
        }
        // eslint-disable-next-line
    }, [teacherId, date, mode, selectedClassId])

    // HOD department mode: every class-period for the chosen class on this date
    async function loadClassPeriods() {
        setLoadingPeriods(true)
        setSelectedPeriod(null)
        const weekday = weekdayOf(date)

        const { data: rows } = await supabase
            .from('timetable')
            .select('*, subjects ( subject_name ), classes ( class_id, program, semester, section ), teachers ( name )')
            .eq('class_id', selectedClassId)
            .eq('day_of_week', weekday)
            .eq('period_type', 'class')

        const list = (rows || []).slice()

        // annotate any period that has a substitute assigned on this date
        const ids = list.map((p) => p.timetable_id)
        if (ids.length) {
            const { data: ov } = await supabase
                .from('timetable_override')
                .select('timetable_id, substitute_teacher_id, teachers:substitute_teacher_id ( name )')
                .eq('date', date)
                .in('timetable_id', ids)
            const subMap = {}
            for (const o of ov || []) {
                if (o.substitute_teacher_id) subMap[String(o.timetable_id)] = o.teachers?.name || 'Substitute'
            }
            for (const p of list) {
                if (subMap[String(p.timetable_id)]) p._subName = subMap[String(p.timetable_id)]
            }
        }

        list.sort((a, b) => (a.period_no || 0) - (b.period_no || 0))
        setPeriods(list)
        setLoadingPeriods(false)
    }

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
                    <p className={styles.pageSub}>
                        {mode === 'dept'
                            ? 'Pick a class in your department, then a period, and mark the class.'
                            : 'Pick a date and one of your periods, then mark the class.'}
                    </p>
                </div>
                <div className={styles.dateRow}>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={styles.dateInput} />
                    <span className={styles.weekdayTag}>{weekdayOf(date)}</span>
                </div>
            </div>

            {/* HOD: scope toggle */}
            {isHod && myDept && (
                <div className={styles.scopeToggle}>
                    <button
                        className={`${styles.scopeBtn} ${mode === 'mine' ? styles.scopeActive : ''}`}
                        onClick={() => { setMode('mine'); setSelectedPeriod(null) }}
                    >
                        My periods
                    </button>
                    <button
                        className={`${styles.scopeBtn} ${mode === 'dept' ? styles.scopeActive : ''}`}
                        onClick={() => { setMode('dept'); setSelectedPeriod(null) }}
                    >
                        Department ({myDept})
                    </button>
                </div>
            )}

            {/* HOD department mode: choose a class first */}
            {isHod && mode === 'dept' && (
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>Classes in {myDept}</h3>
                        <span className={styles.sheetMeta}>{deptClasses.length} class{deptClasses.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div className={styles.cardBody}>
                        {deptClasses.length === 0 ? (
                            <div className={styles.empty}>No classes in this department yet.</div>
                        ) : (
                            <div className={styles.classPickRow}>
                                {deptClasses.map((c) => (
                                    <button
                                        key={c.class_id}
                                        className={`${styles.classChip} ${String(selectedClassId) === String(c.class_id) ? styles.classChipActive : ''}`}
                                        onClick={() => { setSelectedClassId(c.class_id); setSelectedPeriod(null) }}
                                    >
                                        {classText(c)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Periods list — shown for "mine" mode, or once a class is picked in dept mode */}
            {(mode === 'mine' || selectedClassId) && (
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>{mode === 'dept' ? 'Periods' : 'Your periods'}</h3>
                        <span className={styles.sheetMeta}>{loadingPeriods ? '' : `${periods.length} period${periods.length === 1 ? '' : 's'}`}</span>
                    </div>
                    <div className={styles.cardBody}>
                        {loadingPeriods ? (
                            <div className={styles.empty}>Loading periods…</div>
                        ) : periods.length === 0 ? (
                            <div className={styles.empty}>
                                {mode === 'dept'
                                    ? 'No periods scheduled for this class on this day.'
                                    : 'You have no class periods scheduled for this day.'}
                            </div>
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
                                                <span className={styles.periodClass}>
                                                    {mode === 'dept'
                                                        ? (p._subName || p.teachers?.name || 'Unassigned')
                                                        : classText(p.classes)}
                                                </span>
                                            </span>
                                            <span className={styles.periodTime}>{fmtTime(p.start_time)}–{fmtTime(p.end_time)}</span>
                                            {p._substituting && <span className={styles.subBadge}>Substitute</span>}
                                            {mode === 'dept' && p._subName && <span className={styles.subBadge}>Sub</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

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