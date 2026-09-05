import { useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from '../../../components/PageShell/PageShell.module.css'

const EMPTY = { teacher_id: '', class_id: '', subject_id: '' }

function classLabel(c) {
    if (!c) return '—'
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}

export default function TeacherAssignments() {
    const [assignments, setAssignments] = useState([])
    const [teachers, setTeachers] = useState([])
    const [classes, setClasses] = useState([])
    const [allSubjects, setAllSubjects] = useState([])
    const [filteredSubs, setFilteredSubs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [a, t, cls, sub] = await Promise.all([
            supabase
                .from('teacher_subject_class')
                .select(`
                    id,
                    teachers ( teacher_id, name ),
                    subjects ( subject_id, subject_name ),
                    classes ( class_id, program, semester, section )
                `)
                .order('id'),
            supabase.from('teachers').select('teacher_id, name').order('name'),
            supabase.from('classes').select('class_id, program, semester, section').order('program').order('semester').order('section'),
            supabase.from('subjects').select('subject_id, subject_name, program, semester').order('subject_name'),
        ])
        if (a.error) setError(a.error.message)
        else setAssignments(a.data || [])
        if (t.data) setTeachers(t.data)
        if (cls.data) setClasses(cls.data)
        if (sub.data) setAllSubjects(sub.data)
        setLoading(false)
    }

    function openAdd() { setForm(EMPTY); setFilteredSubs([]); setError(null); setModal(true) }
    function closeModal() { if (!saving) { setModal(false); setError(null); setFilteredSubs([]) } }

    function handleTeacherChange(e) { setForm(f => ({ ...f, teacher_id: e.target.value })) }

    function handleClassChange(e) {
        const classId = e.target.value
        const cls = classes.find(c => String(c.class_id) === String(classId))
        // college subjects belong to program + semester (not class_id)
        const subs = cls
            ? allSubjects.filter(sub => sub.program === cls.program && sub.semester === cls.semester)
            : []
        setFilteredSubs(subs)
        setForm(f => ({ ...f, class_id: classId, subject_id: '' }))
    }

    function handleSubjectChange(e) { setForm(f => ({ ...f, subject_id: e.target.value })) }

    async function handleSave() {
        if (!form.teacher_id || !form.class_id || !form.subject_id) {
            setError('Please select a teacher, class and subject.')
            return
        }
        setSaving(true); setError(null)
        const { error } = await supabase.from('teacher_subject_class').insert({
            teacher_id: form.teacher_id,
            subject_id: form.subject_id,
            class_id: form.class_id,
        })
        setSaving(false)
        if (error) {
            setError(error.code === '23505'
                ? 'This teacher is already assigned that subject for that class.'
                : error.message)
            return
        }
        closeModal(); fetchAll()
    }

    async function handleDelete(id) {
        if (!confirm('Remove this assignment?')) return
        const { error } = await supabase.from('teacher_subject_class').delete().eq('id', id)
        if (error) setError(error.message)
        else fetchAll()
    }

    return (
        <div>
            <div className={s.header}>
                <div>
                    <div className={s.count}>{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                        Pick a class to filter its subjects, then assign a teacher.
                    </div>
                </div>
                <button className={s.btnPrimary} onClick={openAdd}>+ Add Assignment</button>
            </div>

            {error && !modal && <div className={s.error}>{error}</div>}

            {loading ? (
                <div className={s.loading}>Loading assignments...</div>
            ) : (
                <div className={s.tableWrap}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Teacher</th>
                                <th>Subject</th>
                                <th>Class</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.length === 0 ? (
                                <tr>
                                    <td colSpan={4}>
                                        <div className={s.empty}>
                                            <div className={s.emptyText}>
                                                No assignments yet.<br />
                                                Add classes + subjects first, then assign teachers here.
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                assignments.map(a => (
                                    <tr key={a.id}>
                                        <td><strong>{a.teachers?.name || '—'}</strong></td>
                                        <td>{a.subjects?.subject_name || '—'}</td>
                                        <td><span className={`${s.badge} ${s.badgeBlue}`}>{classLabel(a.classes)}</span></td>
                                        <td>
                                            <button className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(a.id)}>Remove</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && (
                <div className={s.overlay} onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className={s.modal}>
                        <h2 className={s.modalTitle}>Add Assignment</h2>
                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.field}>
                            <label className={s.label}>1. Select Teacher</label>
                            <select className={s.select} value={form.teacher_id} onChange={handleTeacherChange}>
                                <option value="">— Select Teacher —</option>
                                {teachers.map(t => (
                                    <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>2. Select Class</label>
                            <select className={s.select} value={form.class_id} onChange={handleClassChange}>
                                <option value="">— Select Class —</option>
                                {classes.map(c => (
                                    <option key={c.class_id} value={c.class_id}>{classLabel(c)}</option>
                                ))}
                            </select>
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>3. Select Subject</label>
                            <select
                                className={s.select}
                                value={form.subject_id}
                                onChange={handleSubjectChange}
                                disabled={!form.class_id}
                            >
                                <option value="">
                                    {!form.class_id
                                        ? '— Select a class first —'
                                        : filteredSubs.length === 0
                                            ? '— No subjects for this program/semester —'
                                            : '— Select Subject —'}
                                </option>
                                {filteredSubs.map(sub => (
                                    <option key={sub.subject_id} value={sub.subject_id}>{sub.subject_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className={s.modalFooter}>
                            <button className={s.btnGhost} onClick={closeModal}>Cancel</button>
                            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Add Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}