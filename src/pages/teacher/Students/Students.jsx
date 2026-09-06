import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Students.module.css'

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

export default function Students() {
    const { user } = useAuth()
    const isHod = user?.rank === 'hod'
    const myDept = user?.department || null
    const myTeacherId = user?.teacher_id || null

    const [classes, setClasses] = useState([])
    const [allClasses, setAllClasses] = useState([])
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // cascading filters
    const [program, setProgram] = useState('')
    const [semester, setSemester] = useState('')
    const [section, setSection] = useState('')

    // by-id lookup
    const [idQuery, setIdQuery] = useState('')
    const [idResult, setIdResult] = useState(null)   // student row | null
    const [idError, setIdError] = useState('')
    const [idLoading, setIdLoading] = useState(false)

    // detail drawer
    const [selected, setSelected] = useState(null)   // student row | null

    useEffect(() => {
        init()
        // eslint-disable-next-line
    }, [])

    async function init() {
        setLoading(true)
        setError(null)
        const [{ data: cls, error: cErr }, { data: st, error: sErr }] = await Promise.all([
            supabase.from('classes')
                .select('class_id, program, semester, section, class_teacher_id')
                .order('program').order('semester').order('section'),
            supabase.from('students')
                .select('*, users ( email, is_active ), classes ( class_id, program, semester, section )')
                .order('name'),
        ])
        if (cErr || sErr) setError((cErr || sErr).message)
        else {
            const all = cls || []
            setAllClasses(all)
            // Scope which classes this teacher can browse:
            //  - HOD: every class in their department (program)
            //  - Class teacher: only classes they are the class teacher of
            let visible = all
            if (isHod) {
                visible = myDept ? all.filter((c) => c.program === myDept) : []
            } else {
                visible = myTeacherId
                    ? all.filter((c) => c.class_teacher_id === myTeacherId)
                    : []
            }
            setClasses(visible)
            setStudents(st || [])
        }
        setLoading(false)
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

    // set of class_ids this teacher is allowed to see
    const visibleClassIds = useMemo(
        () => new Set(classes.map((c) => c.class_id)),
        [classes]
    )

    function inScope(student) {
        return student && visibleClassIds.has(student.class_id)
    }

    // ---- lookup by student ID ----
    async function handleIdLookup() {
        setIdError('')
        setIdResult(null)
        const raw = idQuery.trim()
        if (!raw) { setIdError('Enter a student ID.'); return }
        // Try local list first, then fall back to a direct query.
        let found = students.find((st) => String(st.student_id) === raw)
        if (!found) {
            setIdLoading(true)
            const { data, error } = await supabase
                .from('students')
                .select('*, users ( email, is_active ), classes ( class_id, program, semester, section )')
                .eq('student_id', raw)
                .maybeSingle()
            setIdLoading(false)
            if (error) { setIdError('Lookup failed: ' + error.message); return }
            found = data
        }
        if (!found) { setIdError('No student found with ID ' + raw + '.'); return }
        // Enforce hierarchy: teachers can only open students within their scope.
        if (!inScope(found)) {
            setIdError('That student is outside the classes you can access.')
            return
        }
        setIdResult(found)
        setSelected(found)
    }

    return (
        <div className={styles.page}>
            <h2 className={styles.heading}>Student lookup</h2>

            <div className={styles.scopeNote}>
                {isHod
                    ? `Showing students across the ${myDept || 'your'} department.`
                    : 'Showing students in the classes you are class teacher of.'}
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* By-ID lookup */}
            <div className={styles.card}>
                <div className={styles.cardTitle}>Find by student ID</div>
                <div className={styles.idRow}>
                    <input
                        className={styles.input}
                        value={idQuery}
                        onChange={(e) => setIdQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleIdLookup() }}
                        placeholder="e.g. 1024"
                    />
                    <button className={styles.primaryBtn} onClick={handleIdLookup} disabled={idLoading}>
                        {idLoading ? 'Searching…' : 'Look up'}
                    </button>
                </div>
                {idError && <div className={styles.inlineError}>{idError}</div>}
                {idResult && (
                    <div className={styles.idHit} onClick={() => setSelected(idResult)}>
                        <strong>{idResult.name}</strong>
                        <span className={styles.muted}>
                            · {classLabel(idResult.classes)} · Roll {idResult.roll_no || '—'}
                        </span>
                        <button className={styles.linkBtn}>View details</button>
                    </div>
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
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Name</th>
                                        <th>Roll no</th>
                                        <th>Gender</th>
                                        <th>Email</th>
                                        <th className={styles.actionCol}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classStudents.map((st) => (
                                        <tr key={st.student_id}>
                                            <td>{st.student_id}</td>
                                            <td className={styles.cellName}>{st.name}</td>
                                            <td>{st.roll_no || '—'}</td>
                                            <td className={styles.cap}>{st.gender || '—'}</td>
                                            <td>{st.users?.email || '—'}</td>
                                            <td className={styles.actionCol}>
                                                <button className={styles.linkBtn} onClick={() => setSelected(st)}>
                                                    Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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