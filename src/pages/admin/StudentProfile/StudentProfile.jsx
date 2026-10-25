import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import s from '../../../components/PageShell/PageShell.module.css'
import p from './StudentProfile.module.css'

/* ======================================================================
   ADMIN · STUDENT PROFILE
   /admin/students/:studentId
   Everything about one student: personal data, course, attendance,
   exam marks, notices, plus admin account actions (reset password,
   activate / deactivate).
   ====================================================================== */

const ATTENDANCE_THRESHOLD = 75   // % below which a subject is flagged
const PAGE_SIZE = 1000            // Supabase's default max rows per request

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'course', label: 'Course' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'exams', label: 'Exams & Marks' },
    { id: 'notices', label: 'Notices' },
]

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ---------------------------- helpers ---------------------------- */

function classLabel(c) {
    if (!c) return '—'
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}
function toDate(str) {
    if (!str) return null
    const d = str.length <= 10 ? new Date(str + 'T00:00:00') : new Date(str)
    return isNaN(d) ? null : d
}
function formatDate(str) {
    const d = toDate(str)
    if (!d) return '—'
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatMonth(ym) {
    const d = toDate(ym + '-01')
    if (!d) return ym
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
function fmtTime(t) {
    return t ? t.slice(0, 5) : ''
}
function calcAge(dob) {
    const b = toDate(dob)
    if (!b) return '—'
    const now = new Date()
    let age = now.getFullYear() - b.getFullYear()
    const m = now.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
    return age
}
function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pct(num, den) {
    if (!den) return null
    return Math.round((num / den) * 1000) / 10
}
function fmtPct(v) {
    return v === null || v === undefined ? '—' : `${v}%`
}
function fmtNum(n) {
    if (n === null || n === undefined) return '—'
    return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}
// Readable temp password: no 0/O, 1/l/I to avoid mix-ups when read aloud.
function generatePassword(len = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const buf = new Uint32Array(len)
    crypto.getRandomValues(buf)
    return Array.from(buf, (n) => chars[n % chars.length]).join('')
}
function capitalize(str) {
    return str ? str[0].toUpperCase() + str.slice(1) : ''
}

/* --------------------------- data loading --------------------------- */

async function fetchStudent(studentId) {
    const { data, error } = await supabase
        .from('students')
        .select(
            '*, users ( user_id, email, is_active, created_at, must_change_password ), ' +
            'classes ( class_id, program, semester, section, academic_year, class_teacher_id )'
        )
        .eq('student_id', studentId)
        .maybeSingle()
    if (error) throw error
    return data
}

async function fetchCourse(cls) {
    if (!cls) return { classTeacher: null, subjects: [], teachersBySubject: {} }

    const [tRes, sRes, aRes] = await Promise.all([
        cls.class_teacher_id
            ? supabase.from('teachers')
                .select('teacher_id, name, phone, employee_id, department')
                .eq('teacher_id', cls.class_teacher_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        supabase.from('subjects')
            .select('subject_id, subject_name, subject_code')
            .eq('program', cls.program)
            .eq('semester', cls.semester)
            .order('subject_name'),
        supabase.from('teacher_subject_class')
            .select('subject_id, teachers ( teacher_id, name )')
            .eq('class_id', cls.class_id),
    ])
    const err = tRes.error || sRes.error || aRes.error
    if (err) throw err

    const teachersBySubject = {}
    for (const row of aRes.data || []) {
        if (!row.teachers) continue
        const key = String(row.subject_id)
        if (!teachersBySubject[key]) teachersBySubject[key] = []
        teachersBySubject[key].push(row.teachers.name)
    }
    return { classTeacher: tRes.data, subjects: sRes.data || [], teachersBySubject }
}

// All attendance rows for the student, fetched in pages so a long history
// isn't silently cut off at Supabase's 1,000-row limit.
async function fetchAttendance(studentId) {
    const rows = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('attendance')
            .select(
                'attendance_id, date, status, marked_by, timetable_id, ' +
                'timetable ( period_no, start_time, end_time, class_id, subject_id, teacher_id, ' +
                'subjects ( subject_name ), teachers ( name ), classes ( program, semester, section ) )'
            )
            .eq('student_id', studentId)
            .order('date', { ascending: false })
            .order('attendance_id', { ascending: false })
            .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) break
    }

    // Who actually took each register (differs from the timetabled teacher
    // when a substitute covered the period).
    const markerIds = [...new Set(rows.map((r) => r.marked_by).filter(Boolean))]
    const markers = {}
    if (markerIds.length) {
        const { data } = await supabase.from('teachers').select('teacher_id, name').in('teacher_id', markerIds)
        for (const t of data || []) markers[String(t.teacher_id)] = t.name
    }

    return rows
        .map((r) => {
            const tt = r.timetable || {}
            const regular = tt.teachers?.name || null
            const marker = r.marked_by ? markers[String(r.marked_by)] || null : null
            const substitute = !!(r.marked_by && tt.teacher_id && String(r.marked_by) !== String(tt.teacher_id))
            return {
                id: r.attendance_id,
                date: r.date,
                status: r.status,
                periodNo: tt.period_no ?? null,
                start: tt.start_time,
                end: tt.end_time,
                subjectId: tt.subject_id ?? null,
                subjectName: tt.subjects?.subject_name || 'Unassigned',
                classText: classLabel(tt.classes),
                teacherName: substitute ? marker : (regular || marker),
                substitute,
            }
        })
        .sort((a, b) => (a.date === b.date ? (a.periodNo || 0) - (b.periodNo || 0) : a.date < b.date ? 1 : -1))
}

const PAPER_FIELDS =
    'id, exam_id, class_id, subject_id, exam_date, start_time, end_time, max_marks, pass_marks, ' +
    'exams ( exam_id, exam_name, academic_year, start_date, end_date ), ' +
    'subjects ( subject_name, subject_code ), classes ( program, semester, section )'

// Exams = every paper set for the student's current class (so unmarked
// papers show up) + every paper the student has a score for (covers exams
// taken in an earlier class).
async function fetchExams(studentId, classId) {
    const { data: scores, error: scErr } = await supabase
        .from('exam_scores')
        .select('exam_subject_id, marks_obtained, grade')
        .eq('student_id', studentId)
    if (scErr) throw scErr

    const scoreMap = {}
    for (const sc of scores || []) scoreMap[String(sc.exam_subject_id)] = sc
    const scoredIds = Object.keys(scoreMap)

    const queries = []
    if (classId) queries.push(supabase.from('exam_subjects').select(PAPER_FIELDS).eq('class_id', classId))
    if (scoredIds.length) queries.push(supabase.from('exam_subjects').select(PAPER_FIELDS).in('id', scoredIds))
    const results = await Promise.all(queries)
    for (const r of results) if (r.error) throw r.error

    const papers = {}
    for (const r of results) for (const paper of r.data || []) papers[String(paper.id)] = paper

    const byExam = {}
    for (const paper of Object.values(papers)) {
        const key = String(paper.exam_id)
        if (!byExam[key]) byExam[key] = { exam: paper.exams || { exam_id: paper.exam_id, exam_name: 'Exam' }, papers: [] }
        const sc = scoreMap[String(paper.id)]
        byExam[key].papers.push({
            ...paper,
            mark: sc ? Number(sc.marks_obtained) : null,
            grade: sc?.grade || null,
        })
    }

    const today = todayISO()
    const exams = Object.values(byExam).map((g) => {
        g.papers.sort((a, b) =>
            (a.exam_date || '9999').localeCompare(b.exam_date || '9999') ||
            (a.subjects?.subject_name || '').localeCompare(b.subjects?.subject_name || ''))
        const firstPaperDate = g.papers.find((x) => x.exam_date)?.exam_date || null
        return { ...g, sortDate: g.exam.start_date || firstPaperDate || '', summary: summarizeExam(g.papers, today) }
    })
    exams.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || '') || (b.exam.exam_id || 0) - (a.exam.exam_id || 0))
    return exams
}

// Same pass/fail/incomplete rules as the admin Exams → Results view.
function paperState(paper, today) {
    if (paper.mark !== null) {
        const pass = paper.pass_marks != null ? Number(paper.pass_marks) : 0
        return paper.mark < pass ? 'fail' : 'pass'
    }
    if (paper.exam_date && paper.exam_date > today) return 'scheduled'
    return 'missing'
}
function summarizeExam(papers, today) {
    let obtained = 0, maxEntered = 0, entered = 0, anyFail = false
    for (const paper of papers) {
        const st = paperState(paper, today)
        if (paper.mark === null) continue
        entered++
        obtained += paper.mark
        maxEntered += Number(paper.max_marks) || 0
        if (st === 'fail') anyFail = true
    }
    const status = papers.length === 0 ? 'incomplete'
        : anyFail ? 'fail'
            : entered < papers.length ? 'incomplete'
                : 'pass'
    return { obtained, maxEntered, entered, total: papers.length, percent: pct(obtained, maxEntered), status }
}

async function fetchNotices(classId) {
    const { data, error } = await supabase
        .from('announcements')
        .select('announcement_id, title, body, category, audience, class_id, start_date, end_date, created_at, attachment_url, announcement_classes ( class_id )')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(300)
    if (error) throw error
    const cid = classId ? String(classId) : null
    return (data || []).filter((a) => {
        if (a.audience === 'all' || a.audience === 'students') return true
        if (a.audience === 'class' && cid) {
            if (String(a.class_id) === cid) return true
            return (a.announcement_classes || []).some((ac) => String(ac.class_id) === cid)
        }
        return false
    })
}

/* ======================================================================
   PAGE
   ====================================================================== */

export default function StudentProfile() {
    const { studentId } = useParams()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const tab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'

    const [student, setStudent] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)

    // each section loads independently so one failure doesn't blank the page
    const [course, setCourse] = useState({ loading: true, data: null, error: null })
    const [attendance, setAttendance] = useState({ loading: true, data: [], error: null })
    const [exams, setExams] = useState({ loading: true, data: [], error: null })
    const [notices, setNotices] = useState({ loading: true, data: [], error: null })

    const [banner, setBanner] = useState(null)
    const [resetOpen, setResetOpen] = useState(false)
    const [toggling, setToggling] = useState(false)

    useEffect(() => {
        loadAll()
        // eslint-disable-next-line
    }, [studentId])

    async function loadAll() {
        setLoading(true); setLoadError(null); setBanner(null)
        let st
        try {
            st = await fetchStudent(studentId)
        } catch (e) {
            setLoadError(e.message); setLoading(false); return
        }
        setStudent(st)
        setLoading(false)
        if (!st) return

        const cls = st.classes
        const run = (fn, set, empty) => {
            set({ loading: true, data: empty, error: null })
            fn().then(
                (data) => set({ loading: false, data, error: null }),
                (e) => set({ loading: false, data: empty, error: e.message || String(e) })
            )
        }
        run(() => fetchCourse(cls), setCourse, null)
        run(() => fetchAttendance(st.student_id), setAttendance, [])
        run(() => fetchExams(st.student_id, cls?.class_id), setExams, [])
        run(() => fetchNotices(cls?.class_id), setNotices, [])
    }

    async function refreshStudent() {
        try { setStudent(await fetchStudent(studentId)) } catch { /* keep current */ }
    }

    function setTab(id) {
        const next = new URLSearchParams(searchParams)
        if (id === 'overview') next.delete('tab'); else next.set('tab', id)
        setSearchParams(next, { replace: true })
    }

    const attendanceStats = useMemo(() => buildAttendanceStats(attendance.data), [attendance.data])

    async function toggleActive() {
        const active = student.users?.is_active !== false
        const msg = active
            ? `Deactivate ${student.name}'s account? They won't be able to log in until it is activated again. Their records are kept.`
            : `Activate ${student.name}'s account? They will be able to log in again.`
        if (!window.confirm(msg)) return
        setToggling(true); setBanner(null)
        const { data, error } = await supabase
            .from('users')
            .update({ is_active: !active })
            .eq('user_id', student.user_id)
            .select('user_id')
        setToggling(false)
        if (error || !data || data.length === 0) {
            setBanner({ type: 'err', text: 'Could not update the account' + (error ? ': ' + error.message : '.') })
            return
        }
        setBanner({ type: 'ok', text: active ? 'Account deactivated.' : 'Account activated.' })
        refreshStudent()
    }

    /* ----------------------------- render ----------------------------- */

    if (loading) return <div className={s.loading}>Loading student…</div>

    if (loadError || !student) {
        return (
            <div className={p.page}>
                <button className={p.backLink} onClick={() => navigate('/admin/students')}>← Back to students</button>
                <div className={s.error}>
                    {loadError ? 'Could not load this student: ' + loadError : `No student found with ID ${studentId}.`}
                </div>
            </div>
        )
    }

    const isActive = student.users?.is_active !== false
    const cls = student.classes

    return (
        <div className={p.page}>
            <button className={p.backLink} onClick={() => navigate('/admin/students')}>← Back to students</button>

            {/* ---------- header ---------- */}
            <div className={p.hero}>
                <div className={p.avatar} aria-hidden="true">{initials(student.name)}</div>
                <div className={p.heroMain}>
                    <div className={p.nameRow}>
                        <h2 className={p.name}>{student.name}</h2>
                        <span className={`${p.pill} ${isActive ? p.pillGreen : p.pillRed}`}>
                            <span className={p.dot} /> {isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div className={p.metaRow}>
                        <span>ID <strong>{student.student_id}</strong></span>
                        <span className={p.sep}>·</span>
                        <span>Roll <strong>{student.roll_no || '—'}</strong></span>
                        <span className={p.sep}>·</span>
                        <span className={`${s.badge} ${s.badgeBlue}`}>{classLabel(cls)}</span>
                        {cls?.academic_year && <span className={p.muted}>AY {cls.academic_year}</span>}
                    </div>
                </div>
                <div className={p.heroActions}>
                    <button className={s.btnGhost} onClick={() => navigate(`/admin/students?edit=${student.student_id}`)}>Edit</button>
                    <button className={s.btnGhost} onClick={() => setResetOpen(true)}>Reset password</button>
                    <button
                        className={isActive ? s.btnDanger : s.btnGhost}
                        onClick={toggleActive}
                        disabled={toggling}
                    >
                        {toggling ? 'Saving…' : isActive ? 'Deactivate' : 'Activate'}
                    </button>
                </div>
            </div>

            {banner && (
                <div className={banner.type === 'ok' ? p.okBanner : s.error}>{banner.text}</div>
            )}

            {/* ---------- tabs ---------- */}
            <div className={p.tabs} role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`${p.tab} ${tab === t.id ? p.tabActive : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                        {t.id === 'exams' && !exams.loading && exams.data.length > 0 && (
                            <span className={p.tabCount}>{exams.data.length}</span>
                        )}
                        {t.id === 'notices' && !notices.loading && notices.data.length > 0 && (
                            <span className={p.tabCount}>{notices.data.length}</span>
                        )}
                    </button>
                ))}
            </div>

            <div className={p.panel}>
                {tab === 'overview' && (
                    <OverviewTab student={student} attendance={attendance} stats={attendanceStats} exams={exams} onTab={setTab} />
                )}
                {tab === 'course' && <CourseTab student={student} course={course} stats={attendanceStats} />}
                {tab === 'attendance' && <AttendanceTab attendance={attendance} stats={attendanceStats} />}
                {tab === 'exams' && <ExamsTab exams={exams} />}
                {tab === 'notices' && <NoticesTab notices={notices} />}
            </div>

            {resetOpen && (
                <ResetPasswordModal
                    student={student}
                    onClose={() => setResetOpen(false)}
                    onDone={refreshStudent}
                />
            )}
        </div>
    )
}

/* ======================================================================
   ATTENDANCE MATHS
   "Late" counts as attended.
   ====================================================================== */

function buildAttendanceStats(rows) {
    const total = rows.length
    let present = 0, late = 0, absent = 0
    const bySubject = {}
    for (const r of rows) {
        if (r.status === 'present') present++
        else if (r.status === 'late') late++
        else if (r.status === 'absent') absent++

        const key = `${r.subjectId ?? 'none'}|${r.classText}`
        if (!bySubject[key]) {
            bySubject[key] = { key, subjectId: r.subjectId, subjectName: r.subjectName, classText: r.classText, held: 0, present: 0, late: 0, absent: 0 }
        }
        const b = bySubject[key]
        b.held++
        if (r.status === 'present') b.present++
        else if (r.status === 'late') b.late++
        else if (r.status === 'absent') b.absent++
    }
    const subjects = Object.values(bySubject)
        .map((b) => ({ ...b, percent: pct(b.present + b.late, b.held) }))
        .sort((a, b) => a.classText.localeCompare(b.classText) || a.subjectName.localeCompare(b.subjectName))

    const percentBySubjectId = {}
    for (const b of subjects) {
        if (b.subjectId === null) continue
        const k = String(b.subjectId)
        const prev = percentBySubjectId[k]
        const held = (prev?.held || 0) + b.held
        const att = (prev?.att || 0) + b.present + b.late
        percentBySubjectId[k] = { held, att, percent: pct(att, held) }
    }

    return {
        total, present, late, absent,
        percent: pct(present + late, total),
        subjects,
        percentBySubjectId,
        months: [...new Set(rows.map((r) => r.date.slice(0, 7)))],   // rows are newest first
    }
}

/* ======================================================================
   SHARED BITS
   ====================================================================== */

function SectionState({ state, children }) {
    if (state.loading) return <div className={s.loading}>Loading…</div>
    if (state.error) return <div className={s.error}>Could not load: {state.error}</div>
    return children
}

function Card({ title, aside, children, flush = false }) {
    return (
        <section className={p.card}>
            {(title || aside) && (
                <div className={p.cardHead}>
                    {title && <h3 className={p.cardTitle}>{title}</h3>}
                    {aside && <div className={p.cardAside}>{aside}</div>}
                </div>
            )}
            <div className={flush ? '' : p.cardBody}>{children}</div>
        </section>
    )
}

function Detail({ label, children }) {
    return (
        <div className={p.detail}>
            <span className={p.detailLabel}>{label}</span>
            <span className={p.detailValue}>{children}</span>
        </div>
    )
}

function Stat({ label, value, sub, tone }) {
    return (
        <div className={`${p.stat} ${tone ? p['stat_' + tone] : ''}`}>
            <span className={p.statLabel}>{label}</span>
            <span className={p.statValue}>{value}</span>
            {sub && <span className={p.statSub}>{sub}</span>}
        </div>
    )
}

function Meter({ value }) {
    if (value === null || value === undefined) return <span className={p.muted}>—</span>
    const low = value < ATTENDANCE_THRESHOLD
    return (
        <div className={p.meterWrap}>
            <div className={p.meter}>
                <div className={`${p.meterFill} ${low ? p.meterLow : ''}`} style={{ width: `${Math.min(100, value)}%` }} />
                <div className={p.meterMark} style={{ left: `${ATTENDANCE_THRESHOLD}%` }} />
            </div>
            <span className={`${p.meterText} ${low ? p.textRed : ''}`}>{value}%</span>
        </div>
    )
}

const STATUS_META = {
    present: { label: 'Present', cls: 'pillGreen' },
    late: { label: 'Late', cls: 'pillAmber' },
    absent: { label: 'Absent', cls: 'pillRed' },
    pass: { label: 'Pass', cls: 'pillGreen' },
    fail: { label: 'Fail', cls: 'pillRed' },
    incomplete: { label: 'Incomplete', cls: 'pillGray' },
    missing: { label: 'Not entered', cls: 'pillGray' },
    scheduled: { label: 'Scheduled', cls: 'pillBlue' },
}
function StatusPill({ status }) {
    const m = STATUS_META[status] || { label: capitalize(status || '—'), cls: 'pillGray' }
    return <span className={`${p.pill} ${p[m.cls]}`}>{m.label}</span>
}

/* ======================================================================
   OVERVIEW
   ====================================================================== */

function OverviewTab({ student, attendance, stats, exams, onTab }) {
    const u = student.users || {}
    const withResults = exams.data.filter((e) => e.summary.entered > 0)
    const latest = withResults[0] || null
    // Only flag the current class's subjects here; older semesters are history.
    const currentClass = classLabel(student.classes)
    const lowSubjects = stats.subjects.filter((b) =>
        b.classText === currentClass && b.percent !== null && b.percent < ATTENDANCE_THRESHOLD)

    return (
        <>
            <div className={p.stats}>
                <Stat
                    label="Attendance"
                    value={attendance.loading ? '…' : fmtPct(stats.percent)}
                    sub={attendance.loading ? '' : stats.total ? `${stats.present + stats.late} of ${stats.total} classes` : 'No classes marked yet'}
                    tone={stats.percent !== null && stats.percent < ATTENDANCE_THRESHOLD ? 'red' : null}
                />
                <Stat
                    label={`Below ${ATTENDANCE_THRESHOLD}% this sem`}
                    value={attendance.loading ? '…' : lowSubjects.length}
                    sub={lowSubjects.length ? lowSubjects.slice(0, 2).map((b) => b.subjectName).join(', ') + (lowSubjects.length > 2 ? '…' : '') : 'All on track'}
                    tone={lowSubjects.length ? 'red' : null}
                />
                <Stat
                    label="Exams with results"
                    value={exams.loading ? '…' : withResults.length}
                    sub={exams.loading ? '' : `${exams.data.length} exam${exams.data.length === 1 ? '' : 's'} on record`}
                />
                <Stat
                    label="Latest result"
                    value={exams.loading ? '…' : latest ? fmtPct(latest.summary.percent) : '—'}
                    sub={latest ? `${latest.exam.exam_name} · ${STATUS_META[latest.summary.status].label}` : 'No marks yet'}
                    tone={latest?.summary.status === 'fail' ? 'red' : null}
                />
            </div>

            <div className={p.twoCol}>
                <Card title="Personal details">
                    <div className={p.details}>
                        <Detail label="Full name">{student.name}</Detail>
                        <Detail label="Student ID">{student.student_id}</Detail>
                        <Detail label="Roll no">{student.roll_no || '—'}</Detail>
                        <Detail label="Gender">{capitalize(student.gender) || '—'}</Detail>
                        <Detail label="Date of birth">{formatDate(student.dob)}</Detail>
                        <Detail label="Age">{calcAge(student.dob)}</Detail>
                        <Detail label="Admission date">{formatDate(student.admission_date)}</Detail>
                        <Detail label="Current class">{classLabel(student.classes)}</Detail>
                    </div>
                </Card>

                <Card title="Login account">
                    <div className={p.details}>
                        <Detail label="Email">{u.email || '—'}</Detail>
                        <Detail label="Status">
                            <span className={`${p.pill} ${u.is_active === false ? p.pillRed : p.pillGreen}`}>
                                {u.is_active === false ? 'Inactive' : 'Active'}
                            </span>
                        </Detail>
                        <Detail label="Account created">{formatDate(u.created_at)}</Detail>
                        <Detail label="Password">
                            {u.must_change_password
                                ? <span className={`${p.pill} ${p.pillAmber}`}>Temporary – must change</span>
                                : <span className={`${p.pill} ${p.pillGray}`}>Set by student</span>}
                        </Detail>
                    </div>
                </Card>
            </div>

            {lowSubjects.length > 0 && (
                <div className={p.warnBanner}>
                    Attendance is below {ATTENDANCE_THRESHOLD}% in {lowSubjects.length} subject{lowSubjects.length === 1 ? '' : 's'} this semester.{' '}
                    <button className={p.inlineLink} onClick={() => onTab('attendance')}>See attendance →</button>
                </div>
            )}
        </>
    )
}

/* ======================================================================
   COURSE
   ====================================================================== */

function CourseTab({ student, course, stats }) {
    const cls = student.classes
    if (!cls) {
        return <Card><div className={s.empty}><div className={s.emptyText}>This student isn't assigned to a class.</div></div></Card>
    }
    return (
        <SectionState state={course}>
            <Card title="Current class">
                <div className={p.details}>
                    <Detail label="Program">{cls.program || '—'}</Detail>
                    <Detail label="Semester">{cls.semester ?? '—'}</Detail>
                    <Detail label="Section">{cls.section || '—'}</Detail>
                    <Detail label="Academic year">{cls.academic_year || '—'}</Detail>
                    <Detail label="Class teacher">{course.data?.classTeacher?.name || 'Not assigned'}</Detail>
                    <Detail label="Class teacher phone">{course.data?.classTeacher?.phone || '—'}</Detail>
                </div>
            </Card>

            <Card
                title={`Subjects — ${cls.program} · Semester ${cls.semester}`}
                aside={<span className={p.muted}>{course.data?.subjects.length || 0} subjects</span>}
                flush
            >
                {!course.data?.subjects.length ? (
                    <div className={s.empty}><div className={s.emptyText}>No subjects set up for this program and semester.</div></div>
                ) : (
                    <div className={p.tableScroll}>
                        <table className={s.table}>
                            <thead>
                                <tr><th>Code</th><th>Subject</th><th>Teacher</th><th>Attendance</th></tr>
                            </thead>
                            <tbody>
                                {course.data.subjects.map((sub) => {
                                    const teachers = course.data.teachersBySubject[String(sub.subject_id)] || []
                                    const att = stats.percentBySubjectId[String(sub.subject_id)]
                                    return (
                                        <tr key={sub.subject_id}>
                                            <td><span className={`${s.badge} ${s.badgeGray}`}>{sub.subject_code || '—'}</span></td>
                                            <td><strong>{sub.subject_name}</strong></td>
                                            <td>{teachers.length ? teachers.join(', ') : <span className={p.muted}>Not assigned</span>}</td>
                                            <td><Meter value={att ? att.percent : null} /></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <div className={p.footnote}>
                Only the current class is stored for each student, so earlier semesters aren't listed here.
                Past attendance and marks still appear in their own tabs, labelled with the class they were taken in.
            </div>
        </SectionState>
    )
}

/* ======================================================================
   ATTENDANCE
   ====================================================================== */

function AttendanceTab({ attendance, stats }) {
    const [month, setMonth] = useState(null)     // null → most recent month with data
    const [statusFilter, setStatusFilter] = useState('')

    const activeMonth = month ?? stats.months[0] ?? 'all'
    const log = useMemo(() => attendance.data.filter((r) =>
        (activeMonth === 'all' || r.date.startsWith(activeMonth)) &&
        (!statusFilter || r.status === statusFilter)
    ), [attendance.data, activeMonth, statusFilter])

    return (
        <SectionState state={attendance}>
            {stats.total === 0 ? (
                <Card><div className={s.empty}><div className={s.emptyText}>No attendance has been marked for this student yet.</div></div></Card>
            ) : (
                <>
                    <div className={p.stats}>
                        <Stat label="Overall" value={fmtPct(stats.percent)} sub="Present + late ÷ marked"
                            tone={stats.percent < ATTENDANCE_THRESHOLD ? 'red' : 'green'} />
                        <Stat label="Present" value={stats.present} />
                        <Stat label="Late" value={stats.late} sub="Counted as attended" />
                        <Stat label="Absent" value={stats.absent} />
                        <Stat label="Classes marked" value={stats.total} />
                    </div>

                    <Card title="By subject" aside={<span className={p.muted}>Flagged below {ATTENDANCE_THRESHOLD}%</span>} flush>
                        <div className={p.tableScroll}>
                            <table className={s.table}>
                                <thead>
                                    <tr><th>Subject</th><th>Class</th><th className={p.num}>Held</th><th className={p.num}>Present</th><th className={p.num}>Late</th><th className={p.num}>Absent</th><th>Attendance</th></tr>
                                </thead>
                                <tbody>
                                    {stats.subjects.map((b) => (
                                        <tr key={b.key} className={b.percent < ATTENDANCE_THRESHOLD ? p.rowWarn : ''}>
                                            <td><strong>{b.subjectName}</strong></td>
                                            <td className={p.muted}>{b.classText}</td>
                                            <td className={p.num}>{b.held}</td>
                                            <td className={p.num}>{b.present}</td>
                                            <td className={p.num}>{b.late}</td>
                                            <td className={p.num}>{b.absent}</td>
                                            <td><Meter value={b.percent} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card
                        title="Daily log"
                        aside={
                            <div className={p.filters}>
                                <select className={`${s.select} ${p.smallSelect}`} value={activeMonth} onChange={(e) => setMonth(e.target.value)}>
                                    {stats.months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
                                    <option value="all">All months</option>
                                </select>
                                <select className={`${s.select} ${p.smallSelect}`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="">All statuses</option>
                                    <option value="present">Present</option>
                                    <option value="late">Late</option>
                                    <option value="absent">Absent</option>
                                </select>
                            </div>
                        }
                        flush
                    >
                        {log.length === 0 ? (
                            <div className={s.empty}><div className={s.emptyText}>No records for this filter.</div></div>
                        ) : (
                            <div className={p.tableScroll}>
                                <table className={s.table}>
                                    <thead>
                                        <tr><th>Date</th><th>Period</th><th>Subject</th><th>Teacher</th><th>Status</th></tr>
                                    </thead>
                                    <tbody>
                                        {log.map((r) => (
                                            <tr key={r.id}>
                                                <td className={p.nowrap}>
                                                    {formatDate(r.date)}
                                                    <span className={p.subtle}> · {WEEKDAY[toDate(r.date)?.getDay() ?? 0]}</span>
                                                </td>
                                                <td className={p.nowrap}>
                                                    {r.periodNo ? `P${r.periodNo}` : '—'}
                                                    {r.start && <span className={p.subtle}> · {fmtTime(r.start)}–{fmtTime(r.end)}</span>}
                                                </td>
                                                <td>
                                                    {r.subjectName}
                                                    <div className={p.subtle}>{r.classText}</div>
                                                </td>
                                                <td>
                                                    {r.teacherName || '—'}
                                                    {r.substitute && <span className={`${p.pill} ${p.pillPurple} ${p.pillSm}`}>Substitute</span>}
                                                </td>
                                                <td><StatusPill status={r.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </>
            )}
        </SectionState>
    )
}

/* ======================================================================
   EXAMS & MARKS
   ====================================================================== */

function ExamsTab({ exams }) {
    const today = todayISO()
    return (
        <SectionState state={exams}>
            {exams.data.length === 0 ? (
                <Card><div className={s.empty}><div className={s.emptyText}>No exams on record for this student or their class.</div></div></Card>
            ) : exams.data.map(({ exam, papers, summary }) => (
                <Card
                    key={exam.exam_id}
                    title={exam.exam_name}
                    aside={
                        <div className={p.examAside}>
                            {summary.entered > 0 && (
                                <span className={p.examTotal}>
                                    {fmtNum(summary.obtained)} / {fmtNum(summary.maxEntered)}
                                    <strong> {fmtPct(summary.percent)}</strong>
                                </span>
                            )}
                            <StatusPill status={summary.status} />
                        </div>
                    }
                    flush
                >
                    <div className={p.examMeta}>
                        {exam.academic_year && <span>AY {exam.academic_year}</span>}
                        {(exam.start_date || exam.end_date) && (
                            <span>{formatDate(exam.start_date)}{exam.end_date && exam.end_date !== exam.start_date ? ` – ${formatDate(exam.end_date)}` : ''}</span>
                        )}
                        {papers[0]?.classes && <span>{classLabel(papers[0].classes)}</span>}
                        {summary.entered < summary.total && (
                            <span>{summary.entered} of {summary.total} papers marked{summary.entered > 0 ? ' · total covers marked papers only' : ''}</span>
                        )}
                    </div>
                    {papers.length === 0 ? (
                        <div className={s.empty}><div className={s.emptyText}>No papers scheduled.</div></div>
                    ) : (
                        <div className={p.tableScroll}>
                            <table className={s.table}>
                                <thead>
                                    <tr><th>Subject</th><th>Date</th><th className={p.num}>Max</th><th className={p.num}>Pass</th><th className={p.num}>Marks</th><th>Result</th></tr>
                                </thead>
                                <tbody>
                                    {papers.map((paper) => {
                                        const st = paperState(paper, today)
                                        return (
                                            <tr key={paper.id}>
                                                <td>
                                                    <strong>{paper.subjects?.subject_name || '—'}</strong>
                                                    {paper.subjects?.subject_code && <div className={p.subtle}>{paper.subjects.subject_code}</div>}
                                                </td>
                                                <td className={p.nowrap}>
                                                    {formatDate(paper.exam_date)}
                                                    {paper.start_time && <div className={p.subtle}>{fmtTime(paper.start_time)}{paper.end_time ? `–${fmtTime(paper.end_time)}` : ''}</div>}
                                                </td>
                                                <td className={p.num}>{fmtNum(Number(paper.max_marks))}</td>
                                                <td className={p.num}>{paper.pass_marks != null ? fmtNum(Number(paper.pass_marks)) : '—'}</td>
                                                <td className={`${p.num} ${st === 'fail' ? p.textRed : ''}`}>
                                                    <strong>{paper.mark !== null ? fmtNum(paper.mark) : '—'}</strong>
                                                    {paper.grade && <span className={p.subtle}> ({paper.grade})</span>}
                                                </td>
                                                <td><StatusPill status={st} /></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            ))}
        </SectionState>
    )
}

/* ======================================================================
   NOTICES
   ====================================================================== */

const AUDIENCE_LABEL = { all: 'Everyone', students: 'All students', class: 'Their class', teachers: 'Teachers' }

function NoticesTab({ notices }) {
    return (
        <SectionState state={notices}>
            {notices.data.length === 0 ? (
                <Card><div className={s.empty}><div className={s.emptyText}>No announcements for this student.</div></div></Card>
            ) : (
                <Card title="Announcements this student can see" aside={<span className={p.muted}>{notices.data.length} total</span>} flush>
                    <ul className={p.noticeList}>
                        {notices.data.map((a) => (
                            <li key={a.announcement_id} className={p.notice}>
                                <div className={p.noticeHead}>
                                    <span className={`${p.pill} ${p['cat_' + (a.category || 'notice')] || p.pillGray}`}>{capitalize(a.category || 'notice')}</span>
                                    <strong className={p.noticeTitle}>{a.title}</strong>
                                </div>
                                <div className={p.noticeMeta}>
                                    {formatDate(a.start_date || a.created_at)}
                                    {a.end_date && a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ''}
                                    {' · '}{AUDIENCE_LABEL[a.audience] || a.audience}
                                </div>
                                <div className={p.noticeBody}>{a.body}</div>
                                {a.attachment_url && (
                                    <a className={`${p.inlineLink} ${p.attachment}`} href={a.attachment_url} target="_blank" rel="noreferrer">Attachment ↗</a>
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </SectionState>
    )
}

/* ======================================================================
   RESET PASSWORD
   ====================================================================== */

function ResetPasswordModal({ student, onClose, onDone }) {
    const [mode, setMode] = useState('generate')       // 'generate' | 'custom'
    const [generated, setGenerated] = useState(() => generatePassword())
    const [custom, setCustom] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [done, setDone] = useState(null)              // the password that was set
    const [copied, setCopied] = useState(false)

    const password = mode === 'generate' ? generated : custom

    function close() { if (!saving) onClose() }

    async function handleReset() {
        setError(null)
        if (mode === 'custom' && password.length < 6) {
            setError('Password must be at least 6 characters.'); return
        }
        setSaving(true)
        const { data, error: uErr } = await supabase
            .from('users')
            .update({ password, must_change_password: true })
            .eq('user_id', student.user_id)
            .select('user_id')
        setSaving(false)
        if (uErr) { setError('Could not reset password: ' + uErr.message); return }
        if (!data || data.length === 0) { setError('No account was updated. Check that this student has a login.'); return }
        setDone(password)
        onDone?.()
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(done)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            setCopied(false)
        }
    }

    return (
        <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="reset-title">
                <h2 id="reset-title" className={s.modalTitle}>Reset password</h2>

                {done ? (
                    <>
                        <div className={p.okBanner}>Password reset for {student.name}.</div>
                        <label className={s.label}>New temporary password</label>
                        <div className={p.pwRow}>
                            <code className={p.pwBox}>{done}</code>
                            <button className={s.btnGhost} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                        </div>
                        <div className={p.hint}>
                            Share this with the student. It won't be shown again here. They'll be asked to choose a new password after logging in.
                        </div>
                        <div className={s.modalFooter}>
                            <button className={s.btnPrimary} onClick={onClose}>Done</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={p.hint} style={{ marginTop: 0 }}>
                            Sets a new temporary password for <strong>{student.name}</strong> ({student.users?.email || 'no email'}).
                            Their current password stops working immediately.
                        </div>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={p.segment} role="radiogroup" aria-label="Password type">
                            <button
                                role="radio" aria-checked={mode === 'generate'}
                                className={`${p.segBtn} ${mode === 'generate' ? p.segActive : ''}`}
                                onClick={() => setMode('generate')}
                            >Generate</button>
                            <button
                                role="radio" aria-checked={mode === 'custom'}
                                className={`${p.segBtn} ${mode === 'custom' ? p.segActive : ''}`}
                                onClick={() => setMode('custom')}
                            >Type my own</button>
                        </div>

                        {mode === 'generate' ? (
                            <div className={s.field}>
                                <label className={s.label}>Temporary password</label>
                                <div className={p.pwRow}>
                                    <code className={p.pwBox}>{generated}</code>
                                    <button className={s.btnGhost} onClick={() => setGenerated(generatePassword())}>Regenerate</button>
                                </div>
                            </div>
                        ) : (
                            <div className={s.field}>
                                <label className={s.label} htmlFor="custom-pw">Temporary password</label>
                                <input
                                    id="custom-pw"
                                    className={s.input}
                                    value={custom}
                                    onChange={(e) => setCustom(e.target.value)}
                                    placeholder="At least 6 characters"
                                    autoComplete="off"
                                    autoFocus
                                />
                            </div>
                        )}

                        <div className={s.modalFooter}>
                            <button className={s.btnGhost} onClick={close} disabled={saving}>Cancel</button>
                            <button className={s.btnPrimary} onClick={handleReset} disabled={saving || !password}>
                                {saving ? 'Resetting…' : 'Reset password'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
