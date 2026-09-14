import { useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from '../../../components/PageShell/PageShell.module.css'

const EMPTY = {
    name: '', email: '', password: '',
    roll_no: '', dob: '', gender: 'male', class_id: '',
}

function classLabel(c) {
    if (!c) return '—'
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}

export default function Students() {
    const [students, setStudents] = useState([])
    const [classes, setClasses] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // filters
    const [filterClass, setFilterClass] = useState('')
    const [search, setSearch] = useState('')

    // modal
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [editId, setEditId] = useState(null)      // student_id
    const [editUserId, setEditUserId] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchClasses(); fetchStudents() }, [])

    async function fetchClasses() {
        const { data } = await supabase
            .from('classes')
            .select('class_id, program, semester, section')
            .order('program').order('semester').order('section')
        setClasses(data || [])
    }

    async function fetchStudents() {
        setLoading(true); setError(null)
        const { data, error } = await supabase
            .from('students')
            .select('*, users ( email, is_active ), classes ( class_id, program, semester, section )')
            .order('name')
        if (error) setError(error.message)
        else setStudents(data || [])
        setLoading(false)
    }

    const filtered = students.filter(st => {
        if (filterClass && String(st.class_id) !== String(filterClass)) return false
        if (search) {
            const q = search.toLowerCase()
            const hit =
                (st.name || '').toLowerCase().includes(q) ||
                (st.roll_no || '').toLowerCase().includes(q) ||
                (st.users?.email || '').toLowerCase().includes(q)
            if (!hit) return false
        }
        return true
    })

    function openAdd() {
        setForm({ ...EMPTY, class_id: filterClass || '' })
        setEditId(null); setEditUserId(null); setError(null); setModal(true)
    }
    function openEdit(st) {
        setForm({
            name: st.name || '',
            email: st.users?.email || '',
            password: '',
            roll_no: st.roll_no || '',
            dob: st.dob || '',
            gender: st.gender || 'male',
            class_id: st.class_id ? String(st.class_id) : '',
        })
        setEditId(st.student_id); setEditUserId(st.user_id); setError(null); setModal(true)
    }
    function closeModal() { if (!saving) { setModal(false); setError(null) } }
    function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

    async function handleSave() {
        if (!form.name.trim() || !form.email.trim() || !form.class_id || (!editId && !form.password)) {
            setError(editId
                ? 'Name, email and class are required.'
                : 'Name, email, password and class are required.')
            return
        }
        setSaving(true); setError(null)

        if (editId) {
            const { error: uErr } = await supabase
                .from('users').update({ email: form.email.trim().toLowerCase() }).eq('user_id', editUserId)
            if (uErr) { setSaving(false); setError('Could not update login: ' + uErr.message); return }

            const { error: sErr } = await supabase.from('students').update({
                name: form.name.trim(),
                roll_no: form.roll_no.trim() || null,
                dob: form.dob || null,
                gender: form.gender,
                class_id: form.class_id,
            }).eq('student_id', editId)
            setSaving(false)
            if (sErr) { setError('Could not update student: ' + sErr.message); return }
            closeModal(); fetchStudents(); return
        }

        // create login (role student) then student profile
        const { data: newUser, error: uErr } = await supabase
            .from('users')
            .insert({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                role: 'student',
                is_active: true,
                must_change_password: true,
            })
            .select().single()
        if (uErr) { setSaving(false); setError('Could not create login: ' + uErr.message); return }

        const { error: sErr } = await supabase.from('students').insert({
            user_id: newUser.user_id,
            name: form.name.trim(),
            roll_no: form.roll_no.trim() || null,
            dob: form.dob || null,
            gender: form.gender,
            class_id: form.class_id,
            admission_date: new Date().toISOString().slice(0, 10),
        })
        if (sErr) {
            await supabase.from('users').delete().eq('user_id', newUser.user_id)
            setSaving(false); setError('Could not create student: ' + sErr.message); return
        }
        setSaving(false); closeModal(); fetchStudents()
    }

    async function handleDelete(st) {
        if (!confirm(`Delete student ${st.name}? Their login will also be removed.`)) return
        await supabase.from('students').delete().eq('student_id', st.student_id)
        const { error } = await supabase.from('users').delete().eq('user_id', st.user_id)
        if (error) setError(error.message)
        else fetchStudents()
    }

    return (
        <div>
            <div className={s.header}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label className={s.label}>Class</label>
                        <select
                            className={s.select}
                            value={filterClass}
                            onChange={e => setFilterClass(e.target.value)}
                            style={{ minWidth: 200 }}
                        >
                            <option value="">All classes</option>
                            {classes.map(c => (
                                <option key={c.class_id} value={c.class_id}>{classLabel(c)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={s.label}>Search</label>
                        <input
                            className={s.input}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Name, roll no or email"
                            style={{ minWidth: 220 }}
                        />
                    </div>
                </div>
                <button className={s.btnPrimary} onClick={openAdd}>+ Add Student</button>
            </div>

            {error && !modal && <div className={s.error}>{error}</div>}

            <div className={s.count} style={{ marginBottom: 10 }}>
                {loading ? 'Loading…' : `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`}
            </div>

            {loading ? (
                <div className={s.loading}>Loading students...</div>
            ) : (
                <div className={s.tableWrap}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Roll</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Gender</th>
                                <th>Class</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className={s.empty}>
                                            <div className={s.emptyText}>
                                                {search || filterClass
                                                    ? 'No students match your filters.'
                                                    : 'No students yet. Add your first student.'}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(st => (
                                    <tr key={st.student_id}>
                                        <td>
                                            <span className={`${s.badge} ${s.badgeGray}`}>{st.roll_no || '—'}</span>
                                        </td>
                                        <td>
                                            <strong>{st.name}</strong>
                                            {st.dob && (
                                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                    DOB: {new Date(st.dob + 'T00:00:00').toLocaleDateString('en-IN')}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ fontSize: '0.82rem', color: '#6b7280' }}>{st.users?.email || '—'}</td>
                                        <td style={{ fontSize: '0.82rem', textTransform: 'capitalize' }}>{st.gender || '—'}</td>
                                        <td><span className={`${s.badge} ${s.badgeBlue}`}>{classLabel(st.classes)}</span></td>
                                        <td>
                                            <div className={s.actions}>
                                                <button className={`${s.btnGhost} ${s.btnSm}`} onClick={() => openEdit(st)}>Edit</button>
                                                <button className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(st)}>Delete</button>
                                            </div>
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
                        <h2 className={s.modalTitle}>{editId ? 'Edit Student' : 'Add Student'}</h2>
                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.field}>
                            <label className={s.label}>Full Name</label>
                            <input className={s.input} name="name" value={form.name} onChange={handleChange} placeholder="e.g. Anita Sharma" />
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>Email</label>
                            <input className={s.input} name="email" type="email" value={form.email} onChange={handleChange} placeholder="e.g. anita@school.in" />
                        </div>

                        {!editId && (
                            <div className={s.field}>
                                <label className={s.label}>Temporary Password</label>
                                <input className={s.input} name="password" value={form.password} onChange={handleChange} placeholder="Set a starter password" />
                            </div>
                        )}

                        <div className={s.grid2}>
                            <div className={s.field}>
                                <label className={s.label}>Roll No</label>
                                <input className={s.input} name="roll_no" value={form.roll_no} onChange={handleChange} placeholder="Optional" />
                            </div>
                            <div className={s.field}>
                                <label className={s.label}>Date of Birth</label>
                                <input className={s.input} name="dob" type="date" value={form.dob} onChange={handleChange} />
                            </div>
                        </div>

                        <div className={s.grid2}>
                            <div className={s.field}>
                                <label className={s.label}>Gender</label>
                                <select className={s.select} name="gender" value={form.gender} onChange={handleChange}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className={s.field}>
                                <label className={s.label}>Class</label>
                                <select className={s.select} name="class_id" value={form.class_id} onChange={handleChange}>
                                    <option value="">— Select class —</option>
                                    {classes.map(c => (
                                        <option key={c.class_id} value={c.class_id}>{classLabel(c)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={s.modalFooter}>
                            <button className={s.btnGhost} onClick={closeModal}>Cancel</button>
                            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editId ? 'Update' : 'Add Student'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}