import { useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from '../../../components/PageShell/PageShell.module.css'

const EMPTY = { name: '', email: '', password: '', employee_id: '', phone: '' }

export default function Teachers() {
    const [teachers, setTeachers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [editId, setEditId] = useState(null)   // teacher_id when editing
    const [editUserId, setEditUserId] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => { fetchTeachers() }, [])

    async function fetchTeachers() {
        setLoading(true)
        // teachers joined to their login for email / active status
        const { data, error } = await supabase
            .from('teachers')
            .select('*, users ( email, is_active )')
            .order('name')
        if (error) setError(error.message)
        else setTeachers(data || [])
        setLoading(false)
    }

    function openAdd() {
        setForm(EMPTY); setEditId(null); setEditUserId(null); setError(null); setModal(true)
    }
    function openEdit(t) {
        setForm({
            name: t.name || '',
            email: t.users?.email || '',
            password: '',
            employee_id: t.employee_id || '',
            phone: t.phone || '',
        })
        setEditId(t.teacher_id)
        setEditUserId(t.user_id)
        setError(null)
        setModal(true)
    }
    function closeModal() { if (!saving) { setModal(false); setError(null) } }
    function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

    async function handleSave() {
        if (!form.name.trim() || !form.email.trim() || (!editId && !form.password)) {
            setError(editId ? 'Name and email are required.' : 'Name, email and password are required.')
            return
        }
        setSaving(true); setError(null)

        if (editId) {
            // update login email + teacher profile
            const { error: uErr } = await supabase
                .from('users')
                .update({ email: form.email.trim().toLowerCase() })
                .eq('user_id', editUserId)
            if (uErr) { setSaving(false); setError('Could not update login: ' + uErr.message); return }

            const { error: tErr } = await supabase
                .from('teachers')
                .update({
                    name: form.name.trim(),
                    employee_id: form.employee_id.trim() || null,
                    phone: form.phone.trim() || null,
                })
                .eq('teacher_id', editId)
            setSaving(false)
            if (tErr) { setError('Could not update teacher: ' + tErr.message); return }
            closeModal(); fetchTeachers(); return
        }

        // create: login first, then teacher profile (roll back login on failure)
        const { data: newUser, error: uErr } = await supabase
            .from('users')
            .insert({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                role: 'teacher',
                is_active: true,
                must_change_password: true,
            })
            .select()
            .single()
        if (uErr) { setSaving(false); setError('Could not create login: ' + uErr.message); return }

        const { error: tErr } = await supabase.from('teachers').insert({
            user_id: newUser.user_id,
            name: form.name.trim(),
            employee_id: form.employee_id.trim() || null,
            phone: form.phone.trim() || null,
        })
        if (tErr) {
            await supabase.from('users').delete().eq('user_id', newUser.user_id)
            setSaving(false); setError('Could not create teacher: ' + tErr.message); return
        }
        setSaving(false); closeModal(); fetchTeachers()
    }

    async function handleDelete(t) {
        if (!confirm(`Delete teacher ${t.name}? Their login will also be removed.`)) return
        // delete profile then login
        await supabase.from('teachers').delete().eq('teacher_id', t.teacher_id)
        const { error } = await supabase.from('users').delete().eq('user_id', t.user_id)
        if (error) setError(error.message)
        else fetchTeachers()
    }

    return (
        <div>
            <div className={s.header}>
                <div className={s.count}>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</div>
                <button className={s.btnPrimary} onClick={openAdd}>+ Add Teacher</button>
            </div>

            {error && !modal && <div className={s.error}>{error}</div>}

            {loading ? (
                <div className={s.loading}>Loading teachers...</div>
            ) : (
                <div className={s.tableWrap}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Employee ID</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teachers.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className={s.empty}>
                                            <div className={s.emptyText}>No teachers yet. Add your first teacher.</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                teachers.map(t => (
                                    <tr key={t.teacher_id}>
                                        <td><strong>{t.name}</strong></td>
                                        <td style={{ fontSize: '0.82rem', color: '#6b7280' }}>{t.users?.email || '—'}</td>
                                        <td style={{ fontSize: '0.82rem' }}>{t.employee_id || '—'}</td>
                                        <td style={{ fontSize: '0.82rem' }}>{t.phone || '—'}</td>
                                        <td>
                                            {t.users?.is_active !== false
                                                ? <span className={`${s.badge} ${s.badgeGreen}`}>Active</span>
                                                : <span className={`${s.badge} ${s.badgeGray}`}>Inactive</span>}
                                        </td>
                                        <td>
                                            <div className={s.actions}>
                                                <button className={`${s.btnGhost} ${s.btnSm}`} onClick={() => openEdit(t)}>Edit</button>
                                                <button className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(t)}>Delete</button>
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
                        <h2 className={s.modalTitle}>{editId ? 'Edit Teacher' : 'Add Teacher'}</h2>
                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.field}>
                            <label className={s.label}>Full Name</label>
                            <input className={s.input} name="name" value={form.name} onChange={handleChange} placeholder="e.g. Ravi Kumar" />
                        </div>

                        <div className={s.field}>
                            <label className={s.label}>Email</label>
                            <input className={s.input} name="email" type="email" value={form.email} onChange={handleChange} placeholder="e.g. ravi@school.in" />
                        </div>

                        {!editId && (
                            <div className={s.field}>
                                <label className={s.label}>Temporary Password</label>
                                <input className={s.input} name="password" value={form.password} onChange={handleChange} placeholder="Set a starter password" />
                            </div>
                        )}

                        <div className={s.grid2}>
                            <div className={s.field}>
                                <label className={s.label}>Employee ID</label>
                                <input className={s.input} name="employee_id" value={form.employee_id} onChange={handleChange} placeholder="Optional" />
                            </div>
                            <div className={s.field}>
                                <label className={s.label}>Phone</label>
                                <input className={s.input} name="phone" value={form.phone} onChange={handleChange} placeholder="Optional" />
                            </div>
                        </div>

                        <div className={s.modalFooter}>
                            <button className={s.btnGhost} onClick={closeModal}>Cancel</button>
                            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editId ? 'Update' : 'Add Teacher'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}