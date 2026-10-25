import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Students.module.css'

/* ======================================================================
   TEACHER · STUDENTS
   Search (name / roll no / student ID / email) and browse students in the
   classes this teacher may see:
     - HOD:           every class in their department (classes.program)
     - Class teacher: only the classes they are class teacher of
   ====================================================================== */

const PAGE_SIZE = 1000          // Supabase's default max rows per request
const MAX_RESULTS = 50          // cap the search result list
const STUDENT_FIELDS = '*, users ( email, is_active ), classes ( class_id, program, semester, section )'

function classLabel(c) {
    if (!c) return '—'
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}
function calcAge(dob) {
    if (!dob) return '—'
    const b = new Date(dob + 'T00:00:00')
    if (isNaN(b)) return '—'
    const now = new Date()
    let age = now.getFullYear() - b.getFullYear()
    const m = now.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
    return age
}
function formatDate(str) {
    if (!str) return '—'
    const d = new Date(str + 'T00:00:00')
    if (isNaN(d)) return '—'
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const isWholeNumber = (v) => /^\d+$/.test(v)

// Load every student in the given classes, page by page, so nobody is cut
// off by the 1,000-row limit.
async function fetchStudentsIn(classIds) {
    if (classIds.length === 0) return []
    const rows = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('students')
            .select(STUDENT_FIELDS)
            .in('class_id', classIds)
            .order('name')
            .order('student_id')
            .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) break
    }
    return rows
}

export default function Students() {
    const { user } = useAuth()
    const isHod = user?.rank === 'hod'
    const myDept = user?.department || null

    const [classes, setClasses] = useState([])      // classes this teacher may see
    const [students, setStudents] = useState([])    // students in those classes
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // cascading filters
    const [program, setProgram] = useState('')
    const [semester, setSemester] = useState('')
    const [section, setSection] = useState('')

    // search
    const [query, setQuery] = useState('')
    const [outOfScopeNote, setOutOfScopeNote] = useState('')

    // detail drawer
    const [selected, setSelected] = useState(null)   // student row | null

    useEffect(() => {
        init()
        // eslint-disable-next-line
    }, [user?.user_id])

    async function resolveTeacherId() {
        if (user?.teacher_id) return user.teacher_id
        // Older sessions may not carry teacher_id yet — look it up.
        if (!user?.user_id) return null
        const { data } = await supabase
            .from('teachers').select('teacher_id').eq('user_id', user.user_id).maybeSingle()
        return data?.teacher_id ?? null
    }

    async function init() {
        setLoading(true)
        setError(null)
        try {
            // 1) which classes can this teacher see?
            let q = supabase
                .from('classes')
                .select('class_id, program, semester, section, class_teacher_id')
                .order('program').order('semester').order('section')

            if (isHod) {
                if (!myDept) { setClasses([]); setStudents([]); return }
                q = q.eq('program', myDept)
            } else {
                const teacherId = await resolveTeacherId()
                if (!teacherId) { setClasses([]); setStudents([]); return }
                q = q.eq('class_teacher_id', teacherId)
            }

            const { data: cls, error: cErr } = await q
            if (cErr) throw cErr
            const visible = cls || []
            setClasses(visible)

            // 2) only the students in those classes
            setStudents(await fetchStudentsIn(visible.map((c) => c.class_id)))
        } catch (e) {
            setError(e.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    // ---- cascading option lists (each level narrows the next) ----
    const programs = useMemo(
        () => [...new Set(classes.map((c) => c.program).filter(Boolean))].sort(),
        [classes]
    )
    const semesters = useMemo(() => {
        if (!program) return []
        return [...new Set(
            classes.filter((c) => c.program === program).map((c) => c.semester)
        )].sort((a, b) => a - b)
    }, [classes, program])
    const sections = useMemo(() => {
        if (!program || !semester) return []
        return [...new Set(
            classes
                .filter((c) => c.program === program && String(c.semester) === String(semester))
                .map((c) => c.section)
        )].sort()
    }, [classes, program, semester])

    // the specific class matched by all three filters
    const matchedClass = useMemo(() => {
        if (!program || !semester || !section) return null
        return classes.find(
            (c) => c.program === program &&
                String(c.semester) === String(semester) &&
                c.section === section
        ) || null
    }, [classes, program, semester, section])

    // students of the matched class
    const classStudents = useMemo(() => {
        if (!matchedClass) return []
        return students.filter((st) => st.class_id === matchedClass.class_id)
    }, [students, matchedClass])

    // reset downstream filters when an upstream one changes
    function onProgramChange(v) { setProgram(v); setSemester(''); setSection('') }
    function onSemesterChange(v) { setSemester(v); setSection('') }

    // ---- search: name, roll no, student ID or email (in-scope students only) ----
    const trimmed = query.trim()
    const searchResults = useMemo(() => {
        const q = trimmed.toLowerCase()
        if (!q) return []
        const exactId = []
        const others = []
        for (const st of students) {
            if (String(st.student_id) === q) { exactId.push(st); continue }
            const hit =
                (st.name || '').toLowerCase().includes(q) ||
                (st.roll_no || '').toString().toLowerCase().includes(q) ||
                String(st.student_id).includes(q) ||
                (st.users?.email || '').toLowerCase().includes(q)
            if (hit) others.push(st)
        }
        return [...exactId, ...others]   // exact ID match first
    }, [students, trimmed])

    // If a numeric ID matches nobody in scope, check whether that student exists
    // elsewhere so we can say "outside your classes" instead of "not found".
    // Only whole numbers ever reach the database (student_id is a number column).
    useEffect(() => {
        setOutOfScopeNote('')
        if (!isWholeNumber(trimmed) || searchResults.length > 0) return
        let cancelled = false
        const t = setTimeout(async () => {
            const { data } = await supabase
                .from('students').select('student_id').eq('student_id', trimmed).maybeSingle()
            if (!cancelled && data) {
                setOutOfScopeNote(`Student ${trimmed} exists but is outside the classes you can access.`)
            }
        }, 350)
        return () => { cancelled = true; clearTimeout(t) }
    }, [trimmed, searchResults.length])

    const totalInScope = students.length

    return (
        <div className={styles.page}>
            <h2 className={styles.heading}>Student lookup</h2>

            <div className={styles.scopeNote}>
                {isHod
                    ? `Showing students across the ${myDept || 'your'} department.`
                    : 'Showing students in the classes you are class teacher of.'}
                {!loading && ` ${totalInScope} student${totalInScope === 1 ? '' : 's'} in ${classes.length} class${classes.length === 1 ? '' : 'es'}.`}
            </div>

            {error && <div className={styles.errorBanner}>Could not load students: {error}</div>}

            {!loading && !error && classes.length === 0 && (
                <div className={styles.errorBanner}>
                    {isHod
                        ? (myDept
                            ? `No classes found for the ${myDept} department.`
                            : 'Your profile has no department set. Ask the admin to assign one.')
                        : "You aren't class teacher of any class yet, so there are no students to show."}
                </div>
            )}

            {/* Search */}
            <div className={styles.card}>
                <div className={styles.cardTitle}>Search students</div>
                <div className={styles.idRow}>
                    <input
                        className={styles.input}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') setQuery('')
                            if (e.key === 'Enter' && searchResults.length === 1) setSelected(searchResults[0])
                        }}
                        placeholder="Name, roll no, student ID or email"
                        autoComplete="off"
                        disabled={loading}
                    />
                    {query && (
                        <button className={styles.primaryBtn} onClick={() => setQuery('')}>Clear</button>
                    )}
                </div>

                {loading && trimmed && <div className={styles.empty}>Loading…</div>}

                {!loading && trimmed && searchResults.length === 0 && (
                    <div className={styles.inlineError}>
                        {outOfScopeNote || `No student matching “${trimmed}” in your classes.`}
                    </div>
                )}

                {!loading && searchResults.length > 0 && (
                    <>
                        <div className={styles.resultHead}>
                            {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
                            {searchResults.length > MAX_RESULTS ? ` — showing the first ${MAX_RESULTS}, keep typing to narrow down` : ''}
                        </div>
                        <StudentTable rows={searchResults.slice(0, MAX_RESULTS)} showClass onOpen={setSelected} />
                    </>
                )}
            </div>

            {/* Cascading filters */}
            <div className={styles.card}>
                <div className={styles.cardTitle}>Browse by class</div>
                <div className={styles.filterRow}>
                    <div className={styles.field}>
                        <label>Program</label>
                        <select className={styles.input} value={program} onChange={(e) => onProgramChange(e.target.value)}>
                            <option value="">Select program</option>
                            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label>Semester</label>
                        <select
                            className={styles.input}
                            value={semester}
                            onChange={(e) => onSemesterChange(e.target.value)}
                            disabled={!program}
                        >
                            <option value="">Select semester</option>
                            {semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label>Section</label>
                        <select
                            className={styles.input}
                            value={section}
                            onChange={(e) => setSection(e.target.value)}
                            disabled={!semester}
                        >
                            <option value="">Select section</option>
                            {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
                        </select>
                    </div>
                </div>

                {/* Results */}
                {loading ? (
                    <div className={styles.empty}>Loading…</div>
                ) : !matchedClass ? (
                    <div className={styles.empty}>Choose a program, semester and section to see students.</div>
                ) : classStudents.length === 0 ? (
                    <div className={styles.empty}>No students in {classLabel(matchedClass)}.</div>
                ) : (
                    <>
                        <div className={styles.resultHead}>
                            {classLabel(matchedClass)} — {classStudents.length} student{classStudents.length === 1 ? '' : 's'}
                        </div>
                        <StudentTable rows={classStudents} onOpen={setSelected} />
                    </>
                )}
            </div>

            {/* Detail drawer */}
            {selected && (
                <div className={styles.overlay} onMouseDown={() => setSelected(null)}>
                    <div className={styles.drawer} onMouseDown={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHead}>
                            <h3>{selected.name}</h3>
                            <button className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">×</button>
                        </div>
                        <div className={styles.detailGrid}>
                            <div className={styles.detailItem}><span>Student ID</span><strong>{selected.student_id}</strong></div>
                            <div className={styles.detailItem}><span>Roll no</span><strong>{selected.roll_no || '—'}</strong></div>
                            <div className={styles.detailItem}><span>Class</span><strong>{classLabel(selected.classes)}</strong></div>
                            <div className={styles.detailItem}><span>Gender</span><strong className={styles.cap}>{selected.gender || '—'}</strong></div>
                            <div className={styles.detailItem}><span>Date of birth</span><strong>{formatDate(selected.dob)}</strong></div>
                            <div className={styles.detailItem}><span>Age</span><strong>{calcAge(selected.dob)}</strong></div>
                            <div className={styles.detailItem}><span>Admission date</span><strong>{formatDate(selected.admission_date)}</strong></div>
                            <div className={styles.detailItem}><span>Email</span><strong>{selected.users?.email || '—'}</strong></div>
                            <div className={styles.detailItem}>
                                <span>Account</span>
                                <strong>{selected.users?.is_active === false ? 'Inactive' : 'Active'}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function StudentTable({ rows, onOpen, showClass = false }) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Roll no</th>
                        {showClass && <th>Class</th>}
                        <th>Gender</th>
                        <th>Email</th>
                        <th className={styles.actionCol}></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((st) => (
                        <tr key={st.student_id}>
                            <td>{st.student_id}</td>
                            <td className={styles.cellName}>{st.name}</td>
                            <td>{st.roll_no || '—'}</td>
                            {showClass && <td>{classLabel(st.classes)}</td>}
                            <td className={styles.cap}>{st.gender || '—'}</td>
                            <td>{st.users?.email || '—'}</td>
                            <td className={styles.actionCol}>
                                <button className={styles.linkBtn} onClick={() => onOpen(st)}>
                                    Details
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}