import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './Subjects.module.css'

const SEMESTERS = [1, 2, 3, 4, 5, 6]

function Subjects() {
    const [subjectName, setSubjectName] = useState('')
    const [subjectCode, setSubjectCode] = useState('')
    const [program, setProgram] = useState('')
    const [semester, setSemester] = useState('1')

    const [subjects, setSubjects] = useState([])
    const [programs, setPrograms] = useState([])
    const [message, setMessage] = useState(null)
    const [saving, setSaving] = useState(false)

    // Filters for the list
    const [filterProgram, setFilterProgram] = useState('All')
    const [filterSemester, setFilterSemester] = useState('All')

    useEffect(() => {
        fetchSubjects()
        fetchPrograms()
    }, [])

    async function fetchSubjects() {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('program')
            .order('semester')
            .order('subject_name')
        if (!error) setSubjects(data)
    }

    async function fetchPrograms() {
        // Pull programs from BOTH subjects and classes so the dropdown always
        // reflects programs that exist on subjects, even if no class uses them yet.
        const [subRes, clsRes] = await Promise.all([
            supabase.from('subjects').select('program'),
            supabase.from('classes').select('program'),
        ])

        const rows = [
            ...(subRes.error ? [] : subRes.data),
            ...(clsRes.error ? [] : clsRes.data),
        ]

        const unique = [...new Set(
            rows
                .map((d) => d.program)
                .filter((p) => p != null && p !== '')   // drop null/empty programs
        )].sort()

        setPrograms(unique)
    }

    function resetForm() {
        setSubjectName('')
        setSubjectCode('')
        // keep program + semester selected, so adding several for one semester is quick
    }

    async function handleCreate() {
        setMessage(null)

        if (!subjectName || !program || !semester) {
            setMessage({ type: 'err', text: 'Subject name, program, and semester are required.' })
            return
        }

        setSaving(true)

        const { error } = await supabase.from('subjects').insert({
            subject_name: subjectName,
            subject_code: subjectCode || null,
            program: program,
            semester: parseInt(semester),
        })

        setSaving(false)

        if (error) {
            if (error.code === '23505') {
                setMessage({ type: 'err', text: 'That subject code is already in use.' })
            } else {
                setMessage({ type: 'err', text: 'Could not create subject: ' + error.message })
            }
            return
        }

        setMessage({ type: 'ok', text: 'Subject added.' })
        resetForm()
        fetchSubjects()
        fetchPrograms()   // pick up a newly-introduced program right away
    }

    async function handleDelete(subjectId) {
        if (!window.confirm('Delete this subject? This cannot be undone.')) return
        const { error } = await supabase.from('subjects').delete().eq('subject_id', subjectId)
        if (error) setMessage({ type: 'err', text: 'Could not delete: ' + error.message })
        else fetchSubjects()
    }

    // Apply the list filters
    const visibleSubjects = subjects.filter((s) => {
        if (filterProgram !== 'All' && s.program !== filterProgram) return false
        if (filterSemester !== 'All' && s.semester !== parseInt(filterSemester)) return false
        return true
    })

    return (
        <div>
            <div className={styles.header}>
                <h2>Subjects</h2>
                <p>Maintain the papers offered in each program and semester.</p>
            </div>

            <div className={styles.grid}>
                {/* LEFT: create form */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>Add subject</h3>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.formRow}>
                            <label>Program</label>
                            <input
                                list="subject-program-list"
                                value={program}
                                onChange={(e) => setProgram(e.target.value)}
                                placeholder="e.g. BCA"
                            />
                            <datalist id="subject-program-list">
                                {programs.map((p) => (
                                    <option key={p} value={p} />
                                ))}
                            </datalist>
                        </div>
                        <div className={styles.formRow}>
                            <label>Semester</label>
                            <select value={semester} onChange={(e) => setSemester(e.target.value)}>
                                {SEMESTERS.map((s) => (
                                    <option key={s} value={s}>Semester {s}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formRow}>
                            <label>Subject name</label>
                            <input
                                value={subjectName}
                                onChange={(e) => setSubjectName(e.target.value)}
                                placeholder="e.g. Data Structures"
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label>Subject code</label>
                            <input
                                value={subjectCode}
                                onChange={(e) => setSubjectCode(e.target.value)}
                                placeholder="e.g. BCA301 (optional)"
                            />
                        </div>

                        {message && (
                            <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                                {message.text}
                            </div>
                        )}

                        <button className={styles.submitBtn} onClick={handleCreate} disabled={saving}>
                            {saving ? 'Adding…' : 'Add subject'}
                        </button>
                    </div>
                </div>

                {/* RIGHT: subject list */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>All subjects <span>· {visibleSubjects.length}</span></h3>
                    </div>

                    {/* Filters */}
                    <div className={styles.filterBar}>
                        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
                            <option value="All">All programs</option>
                            {programs.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <select value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}>
                            <option value="All">All semesters</option>
                            {SEMESTERS.map((s) => (
                                <option key={s} value={s}>Semester {s}</option>
                            ))}
                        </select>
                    </div>

                    {visibleSubjects.length === 0 ? (
                        <div className={styles.empty}>No subjects match. Add one on the left.</div>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>Subject</th>
                                        <th>Code</th>
                                        <th>Program / Sem</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleSubjects.map((s) => (
                                        <tr key={s.subject_id}>
                                            <td className={styles.strong}>{s.subject_name}</td>
                                            <td>
                                                {s.subject_code
                                                    ? <span className={styles.code}>{s.subject_code}</span>
                                                    : <span className={styles.muted}>—</span>}
                                            </td>
                                            <td>{s.program} · Sem {s.semester}</td>
                                            <td>
                                                <button className={styles.deleteBtn} onClick={() => handleDelete(s.subject_id)}>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Subjects