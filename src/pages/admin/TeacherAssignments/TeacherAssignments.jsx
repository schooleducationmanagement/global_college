import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './TeacherAssignments.module.css'

function TeacherAssignments() {
    const [teacherId, setTeacherId] = useState('')
    const [subjectId, setSubjectId] = useState('')
    const [classId, setClassId] = useState('')

    const [teachers, setTeachers] = useState([])
    const [subjects, setSubjects] = useState([])
    const [classes, setClasses] = useState([])
    const [assignments, setAssignments] = useState([])

    const [message, setMessage] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchDropdowns()
        fetchAssignments()
    }, [])

    async function fetchDropdowns() {
        const [t, s, c] = await Promise.all([
            supabase.from('teachers').select('teacher_id, name').order('name'),
            supabase.from('subjects').select('subject_id, subject_name').order('subject_name'),
            supabase.from('classes').select('class_id, program, semester, section').order('program'),
        ])
        if (!t.error) setTeachers(t.data)
        if (!s.error) setSubjects(s.data)
        if (!c.error) setClasses(c.data)
    }

    // Pull each assignment with the related names in one query (joins).
    async function fetchAssignments() {
        const { data, error } = await supabase
            .from('teacher_subject_class')
            .select(`
        id,
        teacher_id,
        teachers ( name ),
        subjects ( subject_name ),
        classes ( program, semester, section )
      `)
            .order('teacher_id')
        if (!error) setAssignments(data)
    }

    async function handleCreate() {
        setMessage(null)

        if (!teacherId || !subjectId || !classId) {
            setMessage({ type: 'err', text: 'Please choose a teacher, subject, and class.' })
            return
        }

        setSaving(true)

        const { error } = await supabase.from('teacher_subject_class').insert({
            teacher_id: teacherId,
            subject_id: subjectId,
            class_id: classId,
        })

        setSaving(false)

        if (error) {
            if (error.code === '23505') {
                setMessage({ type: 'err', text: 'This teacher is already assigned that subject for that class.' })
            } else {
                setMessage({ type: 'err', text: 'Could not save assignment: ' + error.message })
            }
            return
        }

        setMessage({ type: 'ok', text: 'Assignment added.' })
        setSubjectId('')
        setClassId('')
        // keep the teacher selected, so adding several for one teacher is quick
        fetchAssignments()
    }

    async function handleDelete(id) {
        if (!window.confirm('Remove this assignment?')) return
        const { error } = await supabase.from('teacher_subject_class').delete().eq('id', id)
        if (error) setMessage({ type: 'err', text: 'Could not remove: ' + error.message })
        else fetchAssignments()
    }

    // Group the flat assignment rows by teacher for display.
    const grouped = assignments.reduce((acc, a) => {
        const key = a.teacher_id
        if (!acc[key]) {
            acc[key] = { name: a.teachers?.name || 'Unknown teacher', items: [] }
        }
        acc[key].items.push(a)
        return acc
    }, {})

    return (
        <div>
            <div className={styles.header}>
                <h2>Teacher assignments</h2>
                <p>Assign which subject each teacher teaches, and to which class.</p>
            </div>

            <div className={styles.grid}>
                {/* LEFT: create form */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>Add assignment</h3>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.formRow}>
                            <label>Teacher</label>
                            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                                <option value="">Select a teacher</option>
                                {teachers.map((t) => (
                                    <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formRow}>
                            <label>Subject</label>
                            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                                <option value="">Select a subject</option>
                                {subjects.map((s) => (
                                    <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formRow}>
                            <label>Class</label>
                            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                                <option value="">Select a class</option>
                                {classes.map((c) => (
                                    <option key={c.class_id} value={c.class_id}>
                                        {c.program} · Sem {c.semester} · {c.section}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {message && (
                            <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                                {message.text}
                            </div>
                        )}

                        <button className={styles.submitBtn} onClick={handleCreate} disabled={saving}>
                            {saving ? 'Adding…' : 'Add assignment'}
                        </button>

                        <p className={styles.hint}>
                            Tip: the teacher stays selected after adding, so you can quickly add several
                            subjects/classes for the same teacher.
                        </p>
                    </div>
                </div>

                {/* RIGHT: grouped list */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>Current assignments <span>· {assignments.length}</span></h3>
                    </div>

                    {assignments.length === 0 ? (
                        <div className={styles.empty}>No assignments yet. Add the first one on the left.</div>
                    ) : (
                        Object.entries(grouped).map(([teacherKey, group]) => (
                            <div key={teacherKey} className={styles.teacherGroup}>
                                <div className={styles.teacherName}>{group.name}</div>
                                {group.items.map((a) => (
                                    <div key={a.id} className={styles.assignRow}>
                                        <div className={styles.assignInfo}>
                                            <span className={styles.subjectPill}>
                                                {a.subjects?.subject_name || '—'}
                                            </span>
                                            <span className={styles.arrow}>→</span>
                                            <span className={styles.classText}>
                                                {a.classes ? `${a.classes.program} · Sem ${a.classes.semester} · ${a.classes.section}` : '—'}
                                            </span>
                                        </div>
                                        <button className={styles.deleteBtn} onClick={() => handleDelete(a.id)}>
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

export default TeacherAssignments