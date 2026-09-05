import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './Users.module.css'

function Users() {
    const [role, setRole] = useState('admin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const [teacherName, setTeacherName] = useState('')
    const [employeeId, setEmployeeId] = useState('')
    const [phone, setPhone] = useState('')

    const [studentName, setStudentName] = useState('')
    const [dob, setDob] = useState('')
    const [gender, setGender] = useState('male')
    const [rollNo, setRollNo] = useState('')
    const [classId, setClassId] = useState('')

    const [users, setUsers] = useState([])
    const [classes, setClasses] = useState([])

    const [message, setMessage] = useState(null) // { type: 'ok'|'err', text }
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchUsers()
        fetchClasses()
    }, [])

    async function fetchUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
        if (!error) setUsers(data)
    }

    async function fetchClasses() {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .order('program')   // ← this column was deleted
        if (!error) setClasses(data)
    }

    function resetForm() {
        setEmail('')
        setPassword('')
        setTeacherName('')
        setEmployeeId('')
        setPhone('')
        setStudentName('')
        setDob('')
        setGender('male')
        setRollNo('')
        setClassId('')
    }

    async function handleCreate() {
        setMessage(null)

        if (!email || !password) {
            setMessage({ type: 'err', text: 'Email and password are required.' })
            return
        }
        if (role === 'teacher' && !teacherName) {
            setMessage({ type: 'err', text: 'Teacher name is required.' })
            return
        }
        if (role === 'parent' && (!studentName || !classId)) {
            setMessage({ type: 'err', text: 'Student name and class are required.' })
            return
        }

        setSaving(true)

        const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ email, password, role, is_active: true, must_change_password: true })
            .select()
            .single()

        if (userError) {
            setSaving(false)
            setMessage({ type: 'err', text: 'Could not create login: ' + userError.message })
            return
        }

        if (role === 'teacher') {
            const { error: tErr } = await supabase.from('teachers').insert({
                user_id: newUser.user_id,
                name: teacherName,
                employee_id: employeeId || null,
                phone: phone || null,
            })
            if (tErr) {
                await supabase.from('users').delete().eq('user_id', newUser.user_id)
                setSaving(false)
                setMessage({ type: 'err', text: 'Could not create teacher: ' + tErr.message })
                return
            }
        } else if (role === 'parent') {
            const { error: sErr } = await supabase.from('students').insert({
                user_id: newUser.user_id,
                name: studentName,
                dob: dob || null,
                gender,
                roll_no: rollNo || null,
                class_id: classId,
                admission_date: new Date().toISOString().slice(0, 10),
            })
            if (sErr) {
                await supabase.from('users').delete().eq('user_id', newUser.user_id)
                setSaving(false)
                setMessage({ type: 'err', text: 'Could not create student: ' + sErr.message })
                return
            }
        }

        setSaving(false)
        setMessage({ type: 'ok', text: 'User created successfully.' })
        resetForm()
        fetchUsers()
    }

    async function handleDelete(userId) {
        if (!window.confirm('Delete this user? This cannot be undone.')) return
        const { error } = await supabase.from('users').delete().eq('user_id', userId)
        if (error) setMessage({ type: 'err', text: 'Could not delete: ' + error.message })
        else fetchUsers()
    }

    function badgeClass(r) {
        if (r === 'admin') return `${styles.badge} ${styles.badgeAdmin}`
        if (r === 'teacher') return `${styles.badge} ${styles.badgeTeacher}`
        return `${styles.badge} ${styles.badgeParent}`
    }

    return (
        <div>
            <div className={styles.header}>
                <h2>Users</h2>
                <p>Create and manage admin, teacher, and parent accounts.</p>
            </div>

            <div className={styles.grid}>
                {/* LEFT: create form */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>Create user</h3>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.formRow}>
                            <label>Role</label>
                            <select value={role} onChange={(e) => setRole(e.target.value)}>
                                <option value="admin">Admin</option>
                                <option value="teacher">Teacher</option>
                                <option value="parent">Parent / Student</option>
                            </select>
                        </div>

                        <div className={styles.formRow}>
                            <label>Email</label>
                            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@school.com" />
                        </div>
                        <div className={styles.formRow}>
                            <label>Temporary password</label>
                            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a starter password" />
                        </div>

                        {role === 'teacher' && (
                            <>
                                <div className={styles.divider}><span>Teacher details</span></div>
                                <div className={styles.formRow}>
                                    <label>Full name</label>
                                    <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Employee ID</label>
                                    <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Phone</label>
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                                </div>
                            </>
                        )}

                        {role === 'parent' && (
                            <>
                                <div className={styles.divider}><span>Student details</span></div>
                                <div className={styles.formRow}>
                                    <label>Student name</label>
                                    <input value={studentName} onChange={(e) => setStudentName(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Date of birth</label>
                                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Gender</label>
                                    <select value={gender} onChange={(e) => setGender(e.target.value)}>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className={styles.formRow}>
                                    <label>Roll no</label>
                                    <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
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
                            </>
                        )}

                        {message && (
                            <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                                {message.text}
                            </div>
                        )}

                        <button className={styles.submitBtn} onClick={handleCreate} disabled={saving}>
                            {saving ? 'Creating…' : 'Create user'}
                        </button>
                    </div>
                </div>

                {/* RIGHT: users list */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>All users <span>· {users.length}</span></h3>
                    </div>
                    {users.length === 0 ? (
                        <div className={styles.empty}>No users yet. Create the first one on the left.</div>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Status</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.user_id}>
                                            <td className={styles.emailCell}>{u.email}</td>
                                            <td><span className={badgeClass(u.role)}>{u.role}</span></td>
                                            <td>
                                                <span className={styles.status}>
                                                    <span className={`${styles.dot} ${u.is_active ? styles.dotActive : styles.dotInactive}`}></span>
                                                    {u.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <button className={styles.deleteBtn} onClick={() => handleDelete(u.user_id)}>
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

export default Users