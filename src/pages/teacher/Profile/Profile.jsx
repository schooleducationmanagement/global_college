import { useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Profile.module.css'

export default function Profile() {
    const { user, login } = useAuth()

    const [teacher, setTeacher] = useState(null)
    const [coordClasses, setCoordClasses] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // change-password form
    const [oldPw, setOldPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [pwMsg, setPwMsg] = useState(null)   // { type, text }
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (user?.user_id) init()
        // eslint-disable-next-line
    }, [user])

    async function init() {
        setLoading(true)
        setError(null)
        const { data: t, error: tErr } = await supabase
            .from('teachers')
            .select('*')
            .eq('user_id', user.user_id)
            .single()
        if (tErr) { setError(tErr.message); setLoading(false); return }
        setTeacher(t)

        const { data: cls } = await supabase
            .from('classes')
            .select('class_id, program, semester, section')
            .eq('class_teacher_id', t.teacher_id)
            .order('program')
        setCoordClasses(cls || [])
        setLoading(false)
    }

    async function handleChangePassword() {
        setPwMsg(null)

        if (!oldPw || !newPw || !confirmPw) {
            setPwMsg({ type: 'err', text: 'Please fill in all three fields.' }); return
        }
        if (newPw !== confirmPw) {
            setPwMsg({ type: 'err', text: 'New password and confirmation do not match.' }); return
        }
        if (newPw.length < 6) {
            setPwMsg({ type: 'err', text: 'New password must be at least 6 characters.' }); return
        }
        if (newPw === oldPw) {
            setPwMsg({ type: 'err', text: 'New password must be different from the current one.' }); return
        }

        setSaving(true)

        // 1) verify the current password against the DB
        const { data: current, error: vErr } = await supabase
            .from('users')
            .select('user_id, password')
            .eq('user_id', user.user_id)
            .single()

        if (vErr || !current) {
            setSaving(false)
            setPwMsg({ type: 'err', text: 'Could not verify your account. Try again.' }); return
        }
        if (current.password !== oldPw) {
            setSaving(false)
            setPwMsg({ type: 'err', text: 'Your current password is incorrect.' }); return
        }

        // 2) write the new password (and clear the must-change flag if set)
        const { data: updated, error: uErr } = await supabase
            .from('users')
            .update({ password: newPw, must_change_password: false })
            .eq('user_id', user.user_id)
            .select('*')
            .single()

        setSaving(false)
        if (uErr) {
            setPwMsg({ type: 'err', text: 'Could not update password: ' + uErr.message }); return
        }

        // 3) refresh the stored session so it stays in sync
        if (updated) login(updated)

        setOldPw(''); setNewPw(''); setConfirmPw('')
        setPwMsg({ type: 'ok', text: 'Password changed successfully.' })
    }

    function classLabel(c) {
        return `${c.program} · Sem ${c.semester} · ${c.section}`
    }

    if (loading) return <div className={styles.page}><div className={styles.empty}>Loading…</div></div>

    return (
        <div className={styles.page}>
            <h2 className={styles.heading}>My profile</h2>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* Profile details */}
            <div className={styles.card}>
                <div className={styles.avatarRow}>
                    <div className={styles.avatar}>
                        {(teacher?.name || 'T').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className={styles.name}>{teacher?.name || '—'}</div>
                        <div className={styles.role}>Teacher</div>
                    </div>
                </div>

                <div className={styles.detailGrid}>
                    <div className={styles.detailItem}><span>Email</span><strong>{user?.email || '—'}</strong></div>
                    <div className={styles.detailItem}><span>Employee ID</span><strong>{teacher?.employee_id || '—'}</strong></div>
                    <div className={styles.detailItem}><span>Phone</span><strong>{teacher?.phone || '—'}</strong></div>
                    <div className={styles.detailItem}>
                        <span>Class coordinator of</span>
                        <strong>
                            {coordClasses.length === 0
                                ? 'None'
                                : coordClasses.map(classLabel).join(', ')}
                        </strong>
                    </div>
                </div>
            </div>

            {/* Change password */}
            <div className={styles.card}>
                <div className={styles.cardTitle}>Change password</div>

                <div className={styles.field}>
                    <label>Current password</label>
                    <input
                        type="password"
                        className={styles.input}
                        value={oldPw}
                        onChange={(e) => setOldPw(e.target.value)}
                        placeholder="Enter your current password"
                    />
                </div>
                <div className={styles.field}>
                    <label>New password</label>
                    <input
                        type="password"
                        className={styles.input}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="At least 6 characters"
                    />
                </div>
                <div className={styles.field}>
                    <label>Confirm new password</label>
                    <input
                        type="password"
                        className={styles.input}
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                        placeholder="Re-enter the new password"
                    />
                </div>

                {pwMsg && (
                    <div className={`${styles.msg} ${pwMsg.type === 'ok' ? styles.msgOk : styles.msgErr}`}>
                        {pwMsg.text}
                    </div>
                )}

                <button className={styles.primaryBtn} onClick={handleChangePassword} disabled={saving}>
                    {saving ? 'Updating…' : 'Update password'}
                </button>
            </div>
        </div>
    )
}