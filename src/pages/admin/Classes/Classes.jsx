import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './Classes.module.css'

const SEMESTERS = [1, 2, 3, 4, 5, 6]

function Classes() {
  const [program, setProgram] = useState('')
  const [semester, setSemester] = useState('1')
  const [section, setSection] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [classTeacherId, setClassTeacherId] = useState('')

  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [programs, setPrograms] = useState([])

  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchClasses()
    fetchTeachers()
    fetchPrograms()
  }, [])

  async function fetchClasses() {
    const { data, error } = await supabase
      .from('classes')
      .select('*, teachers ( name )')
      .order('program')
      .order('semester')
    if (!error) setClasses(data)
  }

  async function fetchTeachers() {
    const { data, error } = await supabase
      .from('teachers')
      .select('teacher_id, name')
      .order('name')
    if (!error) setTeachers(data)
  }

  async function fetchPrograms() {
    const { data, error } = await supabase
      .from('classes')
      .select('program')
    if (!error) {
      const unique = [...new Set(data.map((d) => d.program))].sort()
      setPrograms(unique)
    }
  }

  function resetForm() {
    setProgram('')
    setSemester('1')
    setSection('')
    setAcademicYear('')
    setClassTeacherId('')
  }

  async function handleCreate() {
    setMessage(null)

    if (!program || !semester || !section || !academicYear) {
      setMessage({ type: 'err', text: 'Program, semester, section, and academic year are required.' })
      return
    }

    setSaving(true)

    const { error } = await supabase.from('classes').insert({
      program: program,
      semester: parseInt(semester),
      section: section,
      academic_year: academicYear,
      class_teacher_id: classTeacherId || null,
    })

    setSaving(false)

    if (error) {
      setMessage({ type: 'err', text: 'Could not create class: ' + error.message })
      return
    }

    setMessage({ type: 'ok', text: 'Class created successfully.' })
    resetForm()
    fetchClasses()
    fetchPrograms()
  }

  async function handleDelete(classId) {
    if (!window.confirm('Delete this class? Students in it will be unassigned.')) return
    const { error } = await supabase.from('classes').delete().eq('class_id', classId)
    if (error) setMessage({ type: 'err', text: 'Could not delete: ' + error.message })
    else fetchClasses()
  }

  return (
    <div>
      <div className={styles.header}>
        <h2>Classes</h2>
        <p>Set up student groups by program, semester, and section.</p>
      </div>

      <div className={styles.grid}>
        {/* LEFT: create form */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Create class</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.formRow}>
              <label>Program</label>
              <input
                list="program-list"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="e.g. BCA"
              />
              <datalist id="program-list">
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
              <label>Section</label>
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. A"
              />
            </div>
            <div className={styles.formRow}>
              <label>Academic year</label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025-2026"
              />
            </div>
            <div className={styles.formRow}>
              <label>Class coordinator</label>
              <select value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)}>
                <option value="">Unassigned</option>
                {teachers.map((t) => (
                  <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>
                ))}
              </select>
            </div>

            {message && (
              <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                {message.text}
              </div>
            )}

            <button className={styles.submitBtn} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </div>

        {/* RIGHT: class list */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>All classes <span>· {classes.length}</span></h3>
          </div>
          {classes.length === 0 ? (
            <div className={styles.empty}>No classes yet. Create the first one on the left.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Academic year</th>
                    <th>Coordinator</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.class_id}>
                      <td className={styles.strong}>
                        {c.program} · Sem {c.semester} · {c.section}
                      </td>
                      <td>{c.academic_year}</td>
                      <td>
                        {c.teachers ? c.teachers.name : <span className={styles.muted}>Unassigned</span>}
                      </td>
                      <td>
                        <button className={styles.deleteBtn} onClick={() => handleDelete(c.class_id)}>
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

export default Classes