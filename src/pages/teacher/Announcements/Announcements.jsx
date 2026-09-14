import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Announcements.module.css'

const AUDIENCES = [
    { value: 'all', label: 'Everyone' },
    { value: 'parents', label: 'Students' },
    { value: 'teachers', label: 'Teachers' },
    { value: 'class', label: 'Specific class' },
]

const CATEGORIES = [
    { value: 'notice', label: 'Notice' },
    { value: 'event', label: 'Event' },
    { value: 'exam', label: 'Exam' },
    { value: 'holiday', label: 'Holiday' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// --- date helpers (all local, no timezone surprises) ---
function ymd(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}
function classText(c) {
    if (!c) return null
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}
function categoryLabel(v) {
    return CATEGORIES.find((c) => c.value === v)?.label || v
}
function audienceLabel(v) {
    return AUDIENCES.find((a) => a.value === v)?.label || v
}

function Announcements() {
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'

    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-11
    const [selectedDate, setSelectedDate] = useState(ymd(today))  // 'YYYY-MM-DD'

    // data
    const [announcements, setAnnouncements] = useState([])
    const [examItems, setExamItems] = useState([])
    const [classes, setClasses] = useState([])
    const [myCoordClassIds, setMyCoordClassIds] = useState([])
    const [loading, setLoading] = useState(true)

    // form
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [category, setCategory] = useState('notice')
    const [audience, setAudience] = useState('all')
    const [selectedClassIds, setSelectedClassIds] = useState([])
    const [startDate, setStartDate] = useState(ymd(today))
    const [endDate, setEndDate] = useState('')
    const [attachmentUrl, setAttachmentUrl] = useState('')

    const [message, setMessage] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        init()
        // eslint-disable-next-line
    }, [])

    async function init() {
        await fetchClasses()
        await resolveCoordinatorClasses()
        await Promise.all([fetchAnnouncements(), fetchExams()])
        setLoading(false)
    }

    async function fetchClasses() {
        const { data, error } = await supabase
            .from('classes')
            .select('class_id, program, semester, section')
            .order('program')
        if (!error) setClasses(data || [])
    }

    async function resolveCoordinatorClasses() {
        if (!user || user.role !== 'teacher') { setMyCoordClassIds([]); return }
        const { data: teacher } = await supabase
            .from('teachers').select('teacher_id').eq('user_id', user.user_id).single()
        if (!teacher) { setMyCoordClassIds([]); return }
        const { data: coord } = await supabase
            .from('classes').select('class_id').eq('class_teacher_id', teacher.teacher_id)
        setMyCoordClassIds((coord || []).map((c) => c.class_id))
    }

    async function fetchAnnouncements() {
        const { data, error } = await supabase
            .from('announcements')
            .select('*, announcement_classes ( class_id, classes ( class_id, program, semester, section ) ), users ( email )')
            .order('created_at', { ascending: false })
        if (!error) setAnnouncements(data || [])
    }

    // Exam papers as per-date items (Option A: subject level)
    async function fetchExams() {
        const { data, error } = await supabase
            .from('exam_subjects')
            .select('id, exam_date, start_time, max_marks, exams ( exam_name ), subjects ( subject_name ), classes ( program, semester, section )')
            .not('exam_date', 'is', null)
        if (!error) setExamItems(data || [])
    }

    // classes linked to an announcement (via junction table)
    function linkedClasses(a) {
        return (a.announcement_classes || []).map((ac) => ac.classes).filter(Boolean)
    }
    function linkedClassIds(a) {
        return (a.announcement_classes || []).map((ac) => ac.class_id)
    }

    // ---- visibility gating for announcements ----
    function canSee(a) {
        // Only published (approved) announcements appear in the calendar/feed.
        // Pending and rejected posts are never shown to readers.
        if ((a.status || 'approved') !== 'approved') return false
        if (isAdmin) return true
        if (a.audience === 'all' || a.audience === 'teachers') return true
        if (a.audience === 'class') {
            // visible if the teacher coordinates ANY of the linked classes
            return linkedClassIds(a).some((id) => myCoordClassIds.includes(id))
        }
        return false
    }
    // does this announcement's date-range cover the given day?
    function coversDay(a, dayStr) {
        const start = a.start_date || a.created_at?.slice(0, 10)
        if (!start) return false
        const end = a.end_date || start
        return start <= dayStr && dayStr <= end
    }

    // Build a map of day-strings -> Set of categories (for dot colors)
    const markedDays = useMemo(() => {
        const map = {}
        const add = (day, cat) => {
            if (!map[day]) map[day] = new Set()
            map[day].add(cat)
        }
        announcements.filter((a) => canSee(a)).forEach((a) => {
            const start = a.start_date || a.created_at?.slice(0, 10)
            if (!start) return
            const end = a.end_date || start
            let d = new Date(start + 'T00:00:00')
            const last = new Date(end + 'T00:00:00')
            while (d <= last) {
                add(ymd(d), a.category || 'notice')
                d.setDate(d.getDate() + 1)
            }
        })
        examItems.forEach((e) => {
            if (e.exam_date) add(e.exam_date, 'exam')
        })
        return map
        // eslint-disable-next-line
    }, [announcements, examItems, myCoordClassIds, isAdmin])

    // Items for the selected day (merged + sorted, exams first)
    const dayItems = useMemo(() => {
        const anns = announcements
            .filter((a) => canSee(a) && coversDay(a, selectedDate))
            .map((a) => ({ kind: 'announcement', data: a }))
        const exams = examItems
            .filter((e) => e.exam_date === selectedDate)
            .map((e) => ({ kind: 'exam', data: e }))
        return [...exams, ...anns]
        // eslint-disable-next-line
    }, [announcements, examItems, selectedDate, myCoordClassIds, isAdmin])

    // ---- this teacher's own submissions (any status) ----
    const mySubmissions = useMemo(() => {
        if (!user?.user_id) return []
        return announcements
            .filter((a) => a.posted_by === user.user_id)
            .slice()
            .sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''))
    }, [announcements, user])

    // ---- calendar grid ----
    const grid = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1)
        const startDow = first.getDay()
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
        const cells = []
        for (let i = 0; i < startDow; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d))
        return cells
    }, [viewYear, viewMonth])

    function prevMonth() {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
        else setViewMonth(viewMonth - 1)
    }
    function nextMonth() {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
        else setViewMonth(viewMonth + 1)
    }

    // ---- posting ----
    function resetForm() {
        setTitle(''); setBody(''); setCategory('notice'); setAudience('all')
        setSelectedClassIds([]); setEndDate(''); setAttachmentUrl('')
        setStartDate(selectedDate)
    }

    async function handlePost() {
        setMessage(null)
        if (!title.trim() || !body.trim()) {
            setMessage({ type: 'err', text: 'Title and body are required.' }); return
        }
        if (audience === 'class' && selectedClassIds.length === 0) {
            setMessage({ type: 'err', text: 'Please choose at least one class for a class announcement.' }); return
        }
        if (!startDate) {
            setMessage({ type: 'err', text: 'Please choose a start date.' }); return
        }
        if (endDate && endDate < startDate) {
            setMessage({ type: 'err', text: 'End date cannot be before the start date.' }); return
        }

        setSaving(true)
        const row = {
            title: title.trim(),
            body: body.trim(),
            category,
            audience,
            start_date: startDate,
            end_date: endDate || null,
            attachment_url: attachmentUrl.trim() || null,
            // Admins publish instantly; teacher posts wait for admin approval.
            status: isAdmin ? 'approved' : 'pending',
        }
        if (user?.user_id) row.posted_by = user.user_id

        // 1) insert the announcement, get its id back
        const { data: created, error } = await supabase
            .from('announcements')
            .insert(row)
            .select()
            .single()

        if (error) {
            setSaving(false)
            setMessage({ type: 'err', text: 'Could not post: ' + error.message }); return
        }

        // 2) if class-targeted, link the selected classes via the junction table
        if (audience === 'class' && selectedClassIds.length > 0) {
            const links = selectedClassIds.map((cid) => ({
                announcement_id: created.announcement_id,
                class_id: cid,
            }))
            const { error: linkErr } = await supabase.from('announcement_classes').insert(links)
            if (linkErr) {
                // roll back the announcement so we don't leave an orphan with no classes
                await supabase.from('announcements').delete().eq('announcement_id', created.announcement_id)
                setSaving(false)
                setMessage({ type: 'err', text: 'Could not link classes: ' + linkErr.message }); return
            }
        }

        setSaving(false)
        setMessage({
            type: 'ok',
            text: isAdmin
                ? 'Announcement posted.'
                : 'Submitted for admin approval. It will be published once approved.',
        })
        resetForm()
        fetchAnnouncements()
    }

    async function handleDelete(id) {
        if (!window.confirm('Delete this announcement? This cannot be undone.')) return
        const { error } = await supabase.from('announcements').delete().eq('announcement_id', id)
        if (error) setMessage({ type: 'err', text: 'Could not delete: ' + error.message })
        else fetchAnnouncements()
    }

    function badgeClass(cat) {
        return `${styles.badge} ${styles['badge_' + cat] || styles.badge_notice}`
    }
    function formatDate(str) {
        if (!str) return ''
        const d = new Date(str + 'T00:00:00')
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const selectedLabel = formatDate(selectedDate)

    return (
        <div>
            <div className={styles.calGrid}>
                {/* LEFT: calendar */}
                <div className={styles.card}>
                    <div className={styles.calHead}>
                        <button className={styles.navBtn} onClick={prevMonth}>‹</button>
                        <div className={styles.calTitle}>{MONTHS[viewMonth]} {viewYear}</div>
                        <button className={styles.navBtn} onClick={nextMonth}>›</button>
                    </div>
                    <div className={styles.calBody}>
                        <div className={styles.weekRow}>
                            {WEEKDAYS.map((w) => <div key={w} className={styles.weekCell}>{w}</div>)}
                        </div>
                        <div className={styles.dayGrid}>
                            {grid.map((cell, i) => {
                                if (!cell) return <div key={i} className={styles.dayEmpty} />
                                const str = ymd(cell)
                                const isSel = str === selectedDate
                                const isToday = str === ymd(today)
                                const cats = markedDays[str]
                                return (
                                    <button
                                        key={i}
                                        className={`${styles.day} ${isSel ? styles.daySelected : ''} ${isToday ? styles.dayToday : ''}`}
                                        onClick={() => setSelectedDate(str)}
                                    >
                                        <span>{cell.getDate()}</span>
                                        {cats && (
                                            <span className={styles.dots}>
                                                {[...cats].slice(0, 4).map((c) => (
                                                    <span key={c} className={`${styles.dot} ${styles['dot_' + c] || styles.dot_notice}`} />
                                                ))}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                        <div className={styles.legend}>
                            {CATEGORIES.map((c) => (
                                <span key={c.value} className={styles.legendItem}>
                                    <span className={`${styles.dot} ${styles['dot_' + c.value]}`} /> {c.label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT: selected day feed */}
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>{selectedLabel} <span>· {dayItems.length} item(s)</span></h3>
                    </div>
                    {loading ? (
                        <div className={styles.empty}>Loading…</div>
                    ) : dayItems.length === 0 ? (
                        <div className={styles.empty}>Nothing on this day.</div>
                    ) : (
                        <div className={styles.feed}>
                            {dayItems.map((item) => {
                                if (item.kind === 'exam') {
                                    const e = item.data
                                    return (
                                        <div key={'ex' + e.id} className={styles.item}>
                                            <div className={styles.itemTop}>
                                                <div className={styles.itemTitle}>
                                                    {e.subjects?.subject_name} exam
                                                </div>
                                                <span className={badgeClass('exam')}>Exam</span>
                                            </div>
                                            <div className={styles.itemBody}>
                                                {e.exams?.exam_name}
                                                {e.classes ? ` — ${classText(e.classes)}` : ''}
                                                {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ''}
                                                {e.max_marks != null ? ` · ${e.max_marks} marks` : ''}
                                            </div>
                                            <div className={styles.itemMeta}>
                                                <span className={styles.muted}>From Exams schedule</span>
                                            </div>
                                        </div>
                                    )
                                }
                                const a = item.data
                                const range = a.end_date && a.end_date !== a.start_date
                                    ? `${formatDate(a.start_date)} – ${formatDate(a.end_date)}`
                                    : formatDate(a.start_date)
                                return (
                                    <div key={'an' + a.announcement_id} className={styles.item}>
                                        <div className={styles.itemTop}>
                                            <div className={styles.itemTitle}>{a.title}</div>
                                            <span className={badgeClass(a.category || 'notice')}>
                                                {categoryLabel(a.category || 'notice')}
                                            </span>
                                        </div>
                                        <div className={styles.itemBody}>{a.body}</div>
                                        {a.attachment_url && (
                                            <a className={styles.attach} href={a.attachment_url} target="_blank" rel="noreferrer">
                                                View attachment ↗
                                            </a>
                                        )}
                                        <div className={styles.itemMeta}>
                                            <span>
                                                {audienceLabel(a.audience)}
                                                {a.audience === 'class' && linkedClasses(a).length > 0
                                                    ? ` · ${linkedClasses(a).map(classText).join(', ')}`
                                                    : ''}
                                                {' · '}{range}
                                                {a.users?.email ? ` · ${a.users.email}` : ''}
                                            </span>
                                            <button className={styles.deleteBtn} onClick={() => handleDelete(a.announcement_id)}>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* MY SUBMISSIONS — status of this teacher's own posts */}
            <div className={styles.card} style={{ marginTop: 24 }}>
                <div className={styles.cardHead}>
                    <h3>My submissions</h3>
                </div>
                <div className={styles.cardBody}>
                    {mySubmissions.length === 0 ? (
                        <div className={styles.empty}>You haven’t posted any announcements yet.</div>
                    ) : (
                        <div className={styles.feed}>
                            {mySubmissions.map((a) => {
                                const st = a.status || 'approved'
                                const label = st === 'pending' ? 'Pending review'
                                    : st === 'rejected' ? 'Rejected' : 'Approved'
                                return (
                                    <div key={'mine' + a.announcement_id} className={styles.item}>
                                        <div className={styles.itemTop}>
                                            <div className={styles.itemTitle}>{a.title}</div>
                                            <span className={`${styles.statusPill} ${styles['status_' + st] || ''}`}>
                                                {label}
                                            </span>
                                        </div>
                                        <div className={styles.itemBody}>{a.body}</div>
                                        <div className={styles.itemMeta}>
                                            <span className={styles.muted}>
                                                {audienceLabel(a.audience)} · {formatDate(a.start_date)}
                                            </span>
                                            {st !== 'approved' && (
                                                <button className={styles.deleteBtn} onClick={() => handleDelete(a.announcement_id)}>
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* POST FORM (full width below) */}
            <div className={styles.card} style={{ marginTop: 24 }}>
                <div className={styles.cardHead}>
                    <h3>New announcement</h3>
                </div>
                <div className={styles.cardBody}>
                    <div className={styles.formTwoCol}>
                        <div className={styles.formRow}>
                            <label>Title</label>
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sports day" />
                        </div>
                        <div className={styles.formRow}>
                            <label>Category</label>
                            <select value={category} onChange={(e) => setCategory(e.target.value)}>
                                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <label>Message</label>
                        <textarea className={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)}
                            rows={4} placeholder="Write the announcement…" />
                    </div>

                    <div className={styles.formTwoCol}>
                        <div className={styles.formRow}>
                            <label>Audience</label>
                            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                                {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                        </div>
                        {audience === 'class' && (
                            <div className={styles.formRow}>
                                <label>Classes (select one or more)</label>
                                <div className={styles.classPicker}>
                                    {classes.length === 0 ? (
                                        <div className={styles.muted}>No classes available.</div>
                                    ) : (
                                        classes.map((c) => {
                                            const checked = selectedClassIds.includes(c.class_id)
                                            return (
                                                <label key={c.class_id} className={styles.classOption}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedClassIds((prev) => [...prev, c.class_id])
                                                            } else {
                                                                setSelectedClassIds((prev) => prev.filter((id) => id !== c.class_id))
                                                            }
                                                        }}
                                                    />
                                                    <span>{classText(c)}</span>
                                                </label>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.formTwoCol}>
                        <div className={styles.formRow}>
                            <label>Start date</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className={styles.formRow}>
                            <label>End date (optional)</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <label>Attachment link (optional)</label>
                        <input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)}
                            placeholder="https://… (PDF, Drive link, etc.)" />
                    </div>

                    {message && (
                        <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                            {message.text}
                        </div>
                    )}

                    <button className={styles.submitBtn} onClick={handlePost} disabled={saving}>
                        {saving ? 'Submitting…' : 'Submit for approval'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Announcements