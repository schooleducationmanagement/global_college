import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './Classes.module.css'

const SEMESTERS = [1, 2, 3, 4, 5, 6]

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
function classTitle(c) {
  return `${c.program} · ${c.section}`
}
// subjects belong to a program + semester (not a section), so all sections
// of a semester share the same paper list.
function subjectKey(program, semester) {
  return `${program}||${semester}`
}

/* ================================================================== */
function Classes() {
  // data
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)

  // ui
  const [expanded, setExpanded] = useState(null) // class_id currently open
  const [banner, setBanner] = useState(null)     // { type, text }

  // class modal
  const [classModal, setClassModal] = useState(false)
  const [editingClass, setEditingClass] = useState(null) // class row | null
  const [cProgram, setCProgram] = useState('')
  const [cSemester, setCSemester] = useState('1')
  const [cSection, setCSection] = useState('')
  const [cYear, setCYear] = useState('')
  const [cTeacher, setCTeacher] = useState('')
  const [classErr, setClassErr] = useState('')

  // subject modal
  const [subjectModal, setSubjectModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState(null) // subject row | null
  const [subjectCtx, setSubjectCtx] = useState(null)         // { program, semester }
  const [sName, setSName] = useState('')
  const [sCode, setSCode] = useState('')
  const [subjectErr, setSubjectErr] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    init()
    // eslint-disable-next-line
  }, [])

  async function init() {
    setLoading(true)
    await Promise.all([fetchClasses(), fetchSubjects(), fetchTeachers()])
    setLoading(false)
  }

  async function fetchClasses() {
    const { data, error } = await supabase
      .from('classes')
      .select('*, teachers ( name )')
      .order('program')
      .order('semester')
      .order('section')
    if (!error) {
      setClasses(data || [])
      refreshPrograms(data || [], null)
    }
  }

  async function fetchSubjects() {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('program')
      .order('semester')
      .order('subject_name')
    if (!error) {
      setSubjects(data || [])
      refreshPrograms(null, data || [])
    }
  }

  async function fetchTeachers() {
    const { data, error } = await supabase
      .from('teachers')
      .select('teacher_id, name')
      .order('name')
    if (!error) setTeachers(data || [])
  }

  // keep a merged program suggestion list from classes + subjects
  function refreshPrograms(clsArg, subArg) {
    const cls = clsArg ?? classes
    const sub = subArg ?? subjects
    const all = [...cls, ...sub]
      .map((r) => r.program)
      .filter((p) => p != null && p !== '')
    setPrograms((prev) => [...new Set([...prev, ...all])].sort())
  }

  // subjects for a given program+semester
  function subjectsFor(program, semester) {
    return subjects.filter((s) => s.program === program && s.semester === semester)
  }

  /* ---------------- class modal ---------------- */
  function openAddClass() {
    setEditingClass(null)
    setCProgram(''); setCSemester('1'); setCSection(''); setCYear(''); setCTeacher('')
    setClassErr('')
    setClassModal(true)
  }
  function openEditClass(c) {
    setEditingClass(c)
    setCProgram(c.program || '')
    setCSemester(String(c.semester || '1'))
    setCSection(c.section || '')
    setCYear(c.academic_year || '')
    setCTeacher(c.class_teacher_id ? String(c.class_teacher_id) : '')
    setClassErr('')
    setClassModal(true)
  }
  function closeClassModal() { if (!saving) setClassModal(false) }

  async function saveClass() {
    setClassErr('')
    if (!cProgram.trim() || !cSemester || !cSection.trim() || !cYear.trim()) {
      setClassErr('Program, semester, section, and academic year are required.')
      return
    }
    setSaving(true)
    const row = {
      program: cProgram.trim(),
      semester: parseInt(cSemester),
      section: cSection.trim(),
      academic_year: cYear.trim(),
      class_teacher_id: cTeacher || null,
    }
    let error
    if (editingClass) {
      ({ error } = await supabase.from('classes').update(row).eq('class_id', editingClass.class_id))
    } else {
      ({ error } = await supabase.from('classes').insert(row))
    }
    setSaving(false)
    if (error) { setClassErr('Could not save class: ' + error.message); return }
    setClassModal(false)
    setBanner({ type: 'ok', text: editingClass ? 'Class updated.' : 'Class created.' })
    fetchClasses()
  }

  async function deleteClass(c) {
    if (!window.confirm('Delete this class? Students in it will be unassigned.')) return
    const { error } = await supabase.from('classes').delete().eq('class_id', c.class_id)
    if (error) setBanner({ type: 'err', text: 'Could not delete class: ' + error.message })
    else { setBanner({ type: 'ok', text: 'Class deleted.' }); fetchClasses() }
  }

  /* ---------------- subject modal ---------------- */
  function openAddSubject(program, semester) {
    setEditingSubject(null)
    setSubjectCtx({ program, semester })
    setSName(''); setSCode(''); setSubjectErr('')
    setSubjectModal(true)
  }
  function openEditSubject(s) {
    setEditingSubject(s)
    setSubjectCtx({ program: s.program, semester: s.semester })
    setSName(s.subject_name || '')
    setSCode(s.subject_code || '')
    setSubjectErr('')
    setSubjectModal(true)
  }
  function closeSubjectModal() { if (!saving) setSubjectModal(false) }

  async function saveSubject() {
    setSubjectErr('')
    if (!sName.trim()) { setSubjectErr('Enter a subject name.'); return }
    setSaving(true)
    const row = {
      subject_name: sName.trim(),
      subject_code: sCode.trim() || null,
      program: subjectCtx.program,
      semester: subjectCtx.semester,
    }
    let error
    if (editingSubject) {
      ({ error } = await supabase.from('subjects').update(row).eq('subject_id', editingSubject.subject_id))
    } else {
      ({ error } = await supabase.from('subjects').insert(row))
    }
    setSaving(false)
    if (error) {
      setSubjectErr(error.code === '23505'
        ? 'That subject code is already in use.'
        : 'Could not save subject: ' + error.message)
      return
    }
    setSubjectModal(false)
    fetchSubjects()
  }

  async function deleteSubject(s) {
    if (!window.confirm('Delete this subject? This cannot be undone.')) return
    const { error } = await supabase.from('subjects').delete().eq('subject_id', s.subject_id)
    if (error) setBanner({ type: 'err', text: 'Could not delete subject: ' + error.message })
    else fetchSubjects()
  }

  /* ---------------------------------------------------------------- */
  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {loading ? 'Loading…' : `${classes.length} class${classes.length === 1 ? '' : 'es'}`}
        </span>
        <button className={styles.addClassBtn} onClick={openAddClass}>+ Add Class</button>
      </div>

      {banner && (
        <div className={`${styles.banner} ${banner.type === 'ok' ? styles.bannerOk : styles.bannerErr}`}>
          {banner.text}
          <button className={styles.bannerX} onClick={() => setBanner(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableCard}>
        <div className={styles.headRow}>
          <div className={styles.colClass}>Class</div>
          <div className={styles.colGrade}>Semester</div>
          <div className={styles.colSection}>Section</div>
          <div className={styles.colSubjects}>Subjects</div>
          <div className={styles.colActions}>Actions</div>
        </div>

        {!loading && classes.length === 0 && (
          <div className={styles.emptyRow}>No classes yet. Click “Add Class” to create the first one.</div>
        )}

        {classes.map((c) => {
          const isOpen = expanded === c.class_id
          const subs = subjectsFor(c.program, c.semester)
          return (
            <div key={c.class_id} className={styles.rowGroup}>
              <div className={`${styles.dataRow} ${isOpen ? styles.dataRowOpen : ''}`}>
                <div className={styles.colClass}>
                  <span className={styles.className}>{classTitle(c)}</span>
                </div>
                <div className={styles.colGrade}>
                  <span className={styles.gradeBadge}>Sem {c.semester}</span>
                </div>
                <div className={styles.colSection}>
                  <span className={styles.sectionBadge}>Section {c.section}</span>
                </div>
                <div className={styles.colSubjects}>
                  <span className={styles.subjectsBadge}>
                    {subs.length} subject{subs.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className={styles.colActions}>
                  <button
                    className={`${styles.toggleBtn} ${isOpen ? styles.toggleBtnOn : ''}`}
                    onClick={() => setExpanded(isOpen ? null : c.class_id)}
                  >
                    {isOpen ? 'Hide' : 'Subjects'}
                  </button>
                  <button className={styles.editBtn} onClick={() => openEditClass(c)}>Edit</button>
                  <button className={styles.iconDelete} onClick={() => deleteClass(c)}>Delete</button>
                </div>
              </div>

              {isOpen && (
                <div className={styles.subjectPanel}>
                  <div className={styles.subjectPanelHead}>
                    <div className={styles.subjectPanelTitle}>
                      Subjects — <strong>{classTitle(c)}</strong>
                      <span className={styles.subjectPanelMeta}>· Sem {c.semester}</span>
                    </div>
                    <button
                      className={styles.addSubjectBtn}
                      onClick={() => openAddSubject(c.program, c.semester)}
                    >
                      + Add Subject
                    </button>
                  </div>

                  {subs.length === 0 ? (
                    <div className={styles.noSubjects}>
                      No subjects for {c.program} · Sem {c.semester} yet.
                    </div>
                  ) : (
                    <div className={styles.subjectGrid}>
                      {subs.map((s) => (
                        <div key={s.subject_id} className={styles.subjectCard}>
                          <div className={styles.subjectInfo}>
                            <span className={styles.subjectName} title={s.subject_name}>
                              {s.subject_name}
                            </span>
                            {s.subject_code && (
                              <span className={styles.subjectCode}>{s.subject_code}</span>
                            )}
                          </div>
                          <button className={styles.miniEdit} onClick={() => openEditSubject(s)}>Edit</button>
                          <button className={styles.miniDelete} onClick={() => deleteSubject(s)}>Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---------- Class modal ---------- */}
      {classModal && (
        <div className={styles.overlay} onMouseDown={closeClassModal}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{editingClass ? 'Edit Class' : 'Add New Class'}</h3>
            {classErr && <div className={styles.modalError}>{classErr}</div>}

            <div className={styles.field}>
              <label>Program</label>
              <input
                className={styles.input}
                list="program-suggestions"
                value={cProgram}
                onChange={(e) => setCProgram(e.target.value)}
                placeholder="e.g. BCA, BCom, BBA"
              />
              <datalist id="program-suggestions">
                {programs.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Semester</label>
                <select className={styles.input} value={cSemester} onChange={(e) => setCSemester(e.target.value)}>
                  {SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Section</label>
                <input className={styles.input} value={cSection} onChange={(e) => setCSection(e.target.value)} placeholder="e.g. A" />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Academic Year</label>
                <input className={styles.input} value={cYear} onChange={(e) => setCYear(e.target.value)} placeholder="e.g. 2025-2026" />
              </div>
              <div className={styles.field}>
                <label>Class Coordinator</label>
                <select className={styles.input} value={cTeacher} onChange={(e) => setCTeacher(e.target.value)}>
                  <option value="">Unassigned</option>
                  {teachers.map((t) => <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.modalFoot}>
              <button className={styles.cancelBtn} onClick={closeClassModal} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={saveClass} disabled={saving}>
                {saving ? 'Saving…' : (editingClass ? 'Save Changes' : 'Save Class')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Subject modal ---------- */}
      {subjectModal && (
        <div className={styles.overlay} onMouseDown={closeSubjectModal}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{editingSubject ? 'Edit Subject' : 'Add New Subject'}</h3>
            {subjectCtx && (
              <p className={styles.modalSub}>
                {subjectCtx.program} · Semester {subjectCtx.semester}
              </p>
            )}
            {subjectErr && <div className={styles.modalError}>{subjectErr}</div>}

            <div className={styles.field}>
              <label>Subject Name</label>
              <input className={styles.input} value={sName} onChange={(e) => setSName(e.target.value)} placeholder="e.g. Data Structures" />
            </div>
            <div className={styles.field}>
              <label>Subject Code</label>
              <input className={styles.input} value={sCode} onChange={(e) => setSCode(e.target.value)} placeholder="e.g. BCA301 (optional)" />
            </div>

            <div className={styles.modalFoot}>
              <button className={styles.cancelBtn} onClick={closeSubjectModal} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={saveSubject} disabled={saving}>
                {saving ? 'Saving…' : (editingSubject ? 'Save Changes' : 'Save Subject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Classes