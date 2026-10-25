import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from '../../../components/PageShell/PageShell.module.css'

/* ======================================================================
   ADMIN · CREATE TEACHERS
   List, search, add, edit, delete teachers + reset a teacher's password.
   ====================================================================== */

const EMPTY = { name: '', email: '', password: '', employee_id: '', phone: '', rank: 'class_teacher', department: '' }

function rankLabel(r) {
    return r === 'hod' ? 'HOD' : 'Class Teacher'
}

// Readable temp password: no 0/O, 1/l/I to avoid mix-ups when read aloud.
function generatePassword(len = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const buf = new Uint32Array(len)
    crypto.getRandomValues(buf)
    return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

export default function Teachers() {
    const [teachers, setTeachers] = useState([])
    const [programs, setPrograms] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [editId, setEditId] = useState(null)   // teacher_id when editing
    const [editUserId, setEditUserId] = useState(null)
    const [saving, setSaving] = useState(false)

    // search + filters
    const [search, setSearch] = useState('')
    const [filterRank, setFilterRank] = useState('')
    const [filterDept, setFilterDept] = useState('')

    // reset password
    const [resetFor, setResetFor] = useState(null)   // teacher row | null
    const [notice, setNotice] = useState(null)       // success banner text

    useEffect(() => { fetchTeachers(); fetchPrograms() }, [])

    async function fetchPrograms() {
        const { data } = await supabase
            .from('classes')
            .select('program')
            .order('program')
        const list = [...new Set((data || []).map(c => c.program).filter(Boolean))]
        setPrograms(list)
    }

    async function fetchTeachers() {
        setLoading(true)
        // teachers joined to their login for email / active status
        const { data, error } = await supabase
            .from('teachers')
            .select('*, users ( email, is_active, must_change_password )')
            .order('name')
        if (error) setError(error.message)
        else setTeachers(data || [])
        setLoading(false)
    }

    // departments for the filter: known programs + any department already on a teacher
    const departments = useMemo(() => {
        const set = new Set(programs)
        teachers.forEach(t => t.department && set.add(t.department))
        return [...set].sort()
    }, [programs, teachers])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return teachers.filter(t => {
            if (filterRank && (t.rank || 'class_teacher') !== filterRank) return false
            if (filterDept && t.department !== filterDept) return false
            if (!q) return true
            return [t.name, t.users?.email, t.employee_id, t.phone, t.department, rankLabel(t.rank)]
                .some(v => (v || '').toString().toLowerCase().includes(q))
        })
    }, [teachers, search, filterRank, filterDept])

    const hasFilters = !!(search || filterRank || filterDept)
    function clearFilters() { setSearch(''); setFilterRank(''); setFilterDept('') }

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
            rank: t.rank || 'class_teacher',
            department: t.department || '',
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
        if (form.rank === 'hod' && !form.department) {
            setError('An HOD must be assigned a department.')
            return
        }
        setSaving(true); setError(null)

        const profileFields = {
            name: form.name.trim(),
            employee_id: form.employee_id.trim() || null,
            phone: form.phone.trim() || null,
            rank: form.rank,
            department: form.department || null,
        }

        if (editId) {
            // update login email + teacher profile
            const { error: uErr } = await supabase
                .from('users')
                .update({ email: form.email.trim().toLowerCase() })
                .eq('user_id', editUserId)
            if (uErr) { setSaving(false); setError('Could not update login: ' + uErr.message); return }

            const { error: tErr } = await supabase
                .from('teachers')
                .update(profileFields)
                .eq('teacher_id', editId)
            setSaving(false)
            if (tErr) { setError(hodConflictMessage(tErr) || 'Could not update teacher: ' + tErr.message); return }
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
            ...profileFields,
        })
        if (tErr) {
            await supabase.from('users').delete().eq('user_id', newUser.user_id)
            setSaving(false); setError(hodConflictMessage(tErr) || 'Could not create teacher: ' + tErr.message); return
        }
        setSaving(false); closeModal(); fetchTeachers()
    }

    // Friendlier message when the "one HOD per department" index is violated.
    function hodConflictMessage(err) {
        if (err?.code === '23505' || /one_hod_per_department/i.test(err?.message || '')) {
            return `${form.department} already has an HOD. Change the existing HOD first, or pick another department.`
        }
        return null
    }

    async function handleDelete(t) {
        if (!confirm(`Delete teacher ${t.name}? Their login will also be removed.`)) return
        // delete profile then login
        await supabase.from('teachers').delete().eq('teacher_id', t.teacher_id)
        const { error } = await supabase.from('users').delete().eq('user_id', t.user_id)
        if (error) setError(error.message)
        else fetchTeachers()
    }

    function openReset(t) {
        setNotice(null); setError(null); setResetFor(t)
    }

    return (
        <div>
            {/* ---------- toolbar: search + filters + add ---------- */}
            <div className={s.header}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label className={s.label} htmlFor="teacher-search">Search</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="teacher-search"
                                type="search"
                                className={s.input}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Escape' && setSearch('')}
                                placeholder="Name, email, employee ID or phone"
                                style={{ minWidth: 280, paddingRight: search ? 32 : 12 }}
                                autoComplete="off"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    aria-label="Clear search"
                                    title="Clear"
                                    style={ui.clearBtn}
                                >×</button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className={s.label} htmlFor="teacher-rank">Role</label>
                        <select
                            id="teacher-rank"
                            className={s.select}
                            value={filterRank}
                            onChange={e => setFilterRank(e.target.value)}
                            style={{ minWidth: 150 }}
                        >
                            <option value="">All roles</option>
                            <option value="hod">HOD</option>
                            <option value="class_teacher">Class Teacher</option>
                        </select>
                    </div>
                    <div>
                        <label className={s.label} htmlFor="teacher-dept">Department</label>
                        <select
                            id="teacher-dept"
                            className={s.select}
                            value={filterDept}
                            onChange={e => setFilterDept(e.target.value)}
                            style={{ minWidth: 160 }}
                        >
                            <option value="">All departments</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>
                <button className={s.btnPrimary} onClick={openAdd}>+ Add Teacher</button>
            </div>

            {error && !modal && <div className={s.error}>{error}</div>}
            {notice && <div style={ui.okBanner}>{notice}</div>}

            <div className={s.count} style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span>
                    {loading
                        ? 'Loading…'
                        : hasFilters
                            ? `${filtered.length} of ${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`
                            : `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}`}
                </span>
                {hasFilters && !loading && (
                    <button onClick={clearFilters} style={ui.linkBtn}>Clear filters</button>
                )}
            </div>

            {loading ? (
                <div className={s.loading}>Loading teachers...</div>
            ) : (
                <div className={s.tableWrap}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Department</th>
                                <th>Employee ID</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>
                                        <div className={s.empty}>
                                            <div className={s.emptyText}>
                                                {hasFilters
                                                    ? 'No teachers match your search.'
                                                    : 'No teachers yet. Add your first teacher.'}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(t => (
                                    <tr key={t.teacher_id}>
                                        <td><strong>{t.name}</strong></td>
                                        <td style={{ fontSize: '0.82rem', color: '#6b7280' }}>{t.users?.email || '—'}</td>
                                        <td>
                                            {t.rank === 'hod'
                                                ? <span className={`${s.badge} ${s.badgeGreen}`}>HOD</span>
                                                : <span className={`${s.badge} ${s.badgeGray}`}>Class Teacher</span>}
                                        </td>
                                        <td style={{ fontSize: '0.82rem' }}>{t.department || '—'}</td>
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
                                                <button
                                                    className={`${s.btnGhost} ${s.btnSm}`}
                                                    onClick={() => openReset(t)}
                                                    disabled={!t.user_id}
                                                    title={t.user_id ? 'Set a new temporary password' : 'This teacher has no login'}
                                                    style={{ whiteSpace: 'nowrap' }}
                                                >Reset password</button>
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

            {/* ---------- add / edit modal ---------- */}
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

                        <div className={s.grid2}>
                            <div className={s.field}>
                                <label className={s.label}>Role</label>
                                <select className={s.input} name="rank" value={form.rank} onChange={handleChange}>
                                    <option value="class_teacher">Class Teacher</option>
                                    <option value="hod">HOD (Head of Department)</option>
                                </select>
                            </div>
                            <div className={s.field}>
                                <label className={s.label}>
                                    Department {form.rank === 'hod' ? '(required)' : '(optional)'}
                                </label>
                                <select className={s.input} name="department" value={form.department} onChange={handleChange}>
                                    <option value="">— None —</option>
                                    {programs.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
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

            {/* ---------- reset password modal ---------- */}
            {resetFor && (
                <ResetPasswordModal
                    teacher={resetFor}
                    onClose={() => setResetFor(null)}
                    onDone={(t) => {
                        setNotice(`Password reset for ${t.name}. They'll be asked to change it after logging in.`)
                        fetchTeachers()
                    }}
                />
            )}
        </div>
    )
}

/* ======================================================================
   RESET PASSWORD MODAL
   Generate (default) or type a temporary password, save it, and show it
   once so the admin can pass it on. Also sets must_change_password.
   ====================================================================== */

function ResetPasswordModal({ teacher, onClose, onDone }) {
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
            .eq('user_id', teacher.user_id)
            .select('user_id')
        setSaving(false)
        if (uErr) { setError('Could not reset password: ' + uErr.message); return }
        if (!data || data.length === 0) { setError('No account was updated. Check that this teacher has a login.'); return }
        setDone(password)
        onDone?.(teacher)
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
        <div className={s.overlay} onMouseDown={e => e.target === e.currentTarget && close()}>
            <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="reset-title">
                <h2 id="reset-title" className={s.modalTitle}>Reset password</h2>

                {done ? (
                    <>
                        <div style={ui.okBanner}>Password reset for {teacher.name}.</div>
                        <label className={s.label}>New temporary password</label>
                        <div style={ui.pwRow}>
                            <code style={ui.pwBox}>{done}</code>
                            <button className={s.btnGhost} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                        </div>
                        <div style={ui.hint}>
                            Share this with the teacher. It won't be shown again. They'll be asked to choose a new password after logging in.
                        </div>
                        <div className={s.modalFooter}>
                            <button className={s.btnPrimary} onClick={onClose}>Done</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ ...ui.hint, marginTop: 0 }}>
                            Sets a new temporary password for <strong>{teacher.name}</strong> ({teacher.users?.email || 'no email'}).
                            Their current password stops working immediately.
                        </div>

                        {error && <div className={s.error}>{error}</div>}

                        <div style={ui.segment} role="radiogroup" aria-label="Password type">
                            <button
                                role="radio" aria-checked={mode === 'generate'}
                                style={{ ...ui.segBtn, ...(mode === 'generate' ? ui.segActive : null) }}
                                onClick={() => setMode('generate')}
                            >Generate</button>
                            <button
                                role="radio" aria-checked={mode === 'custom'}
                                style={{ ...ui.segBtn, ...(mode === 'custom' ? ui.segActive : null) }}
                                onClick={() => setMode('custom')}
                            >Type my own</button>
                        </div>

                        {mode === 'generate' ? (
                            <div className={s.field}>
                                <label className={s.label}>Temporary password</label>
                                <div style={ui.pwRow}>
                                    <code style={ui.pwBox}>{generated}</code>
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
                                    onChange={e => setCustom(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleReset()}
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

/* ---------------- small inline styles (keeps this a single file) ---------------- */

const ui = {
    clearBtn: {
        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
        width: 22, height: 22, border: 'none', borderRadius: '50%',
        background: '#e5e7eb', color: '#4b5563', fontSize: 14, lineHeight: '22px',
        cursor: 'pointer', padding: 0,
    },
    linkBtn: {
        background: 'none', border: 'none', padding: 0, color: '#4f46e5',
        fontSize: 'inherit', fontWeight: 600, cursor: 'pointer',
    },
    okBanner: {
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
        padding: '12px 16px', color: '#15803d', fontSize: '0.855rem', marginBottom: 16,
    },
    hint: {
        fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5, margin: '12px 0 16px',
    },
    segment: {
        display: 'inline-flex', background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 16,
    },
    segBtn: {
        padding: '6px 14px', background: 'none', border: 'none', borderRadius: 6,
        fontSize: '0.82rem', color: '#4b5563', cursor: 'pointer',
    },
    segActive: {
        background: '#fff', color: '#111827', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    },
    pwRow: { display: 'flex', gap: 8, alignItems: 'stretch' },
    pwBox: {
        flex: 1, display: 'flex', alignItems: 'center', padding: '9px 12px',
        background: '#f9fafb', border: '1.5px dashed #c7d2fe', borderRadius: 8,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '1rem', letterSpacing: 1, color: '#111827', userSelect: 'all',
        overflowWrap: 'anywhere',
    },
}