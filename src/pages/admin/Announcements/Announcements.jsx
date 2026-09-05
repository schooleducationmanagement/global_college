import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Announcements.module.css'

/* ------------------------------------------------------------------ */
/*  Reference data                                                     */
/* ------------------------------------------------------------------ */
const AUDIENCES = [
    { value: 'all', label: 'Everyone (Teachers + Students)' },
    { value: 'teachers', label: 'Teachers' },
    { value: 'parents', label: 'Parents' },
    { value: 'class', label: 'Specific class' },
]

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
// Calendar starts on Monday, to match the screenshot (Mon..Sun)
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIME_FILTERS = [
    { value: 'all', label: 'All-Time' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past', label: 'Past' },
    { value: 'month', label: 'This Month' },
]

/* ------------------------------------------------------------------ */
/*  Small helpers (all local, no timezone surprises)                   */
/* ------------------------------------------------------------------ */
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
function audienceLabel(v) {
    return AUDIENCES.find((a) => a.value === v)?.label || v
}
function formatDate(str) {
    if (!str) return '—'
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
function Announcements() {
    const { user } = useAuth()

    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-11
    const [selectedDate, setSelectedDate] = useState(null) // 'YYYY-MM-DD' | null

    // data
    const [announcements, setAnnouncements] = useState([])
    const [classes, setClasses] = useState([])
    const [loading, setLoading] = useState(true)
    const [connected, setConnected] = useState(true)

    // list filter
    const [timeFilter, setTimeFilter] = useState('all')

    // modal + form
    const [modalOpen, setModalOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [audience, setAudience] = useState('all')
    const [selectedClassIds, setSelectedClassIds] = useState([])
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        init()
        // eslint-disable-next-line
    }, [])

    async function init() {
        setLoading(true)
        await fetchClasses()
        await fetchAnnouncements()
        setLoading(false)
    }

    async function fetchClasses() {
        const { data, error } = await supabase
            .from('classes')
            .select('class_id, program, semester, section')
            .order('program')
        if (!error) setClasses(data || [])
    }

    async function fetchAnnouncements() {
        const { data, error } = await supabase
            .from('announcements')
            .select(
                '*, announcement_classes ( class_id, classes ( class_id, program, semester, section ) ), users ( email )'
            )
            .order('created_at', { ascending: false })
        if (error) {
            setConnected(false)
            return
        }
        setConnected(true)
        setAnnouncements(data || [])
    }

    /* ---------- derived ---------- */
    const latest = announcements[0] || null

    function linkedClasses(a) {
        return (a.announcement_classes || []).map((ac) => ac.classes).filter(Boolean)
    }

    // list respecting the time filter
    const filteredList = useMemo(() => {
        const todayStr = ymd(today)
        const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
        return announcements.filter((a) => {
            const start = a.start_date || a.created_at?.slice(0, 10)
            const end = a.end_date || start
            if (!start) return timeFilter === 'all'
            switch (timeFilter) {
                case 'upcoming': return start >= todayStr
                case 'past': return end < todayStr
                case 'month': return start.startsWith(monthPrefix)
                default: return true
            }
        })
        // eslint-disable-next-line
    }, [announcements, timeFilter, viewYear, viewMonth])

    // days in the visible month that have any announcement covering them
    const markedDays = useMemo(() => {
        const set = new Set()
        announcements.forEach((a) => {
            const start = a.start_date || a.created_at?.slice(0, 10)
            if (!start) return
            const end = a.end_date || start
            let d = new Date(start + 'T00:00:00')
            const last = new Date(end + 'T00:00:00')
            while (d <= last) {
                set.add(ymd(d))
                d.setDate(d.getDate() + 1)
            }
        })
        return set
    }, [announcements])

    // announcements whose date range covers a given day string
    function coversDay(a, dayStr) {
        const start = a.start_date || a.created_at?.slice(0, 10)
        if (!start) return false
        const end = a.end_date || start
        return start <= dayStr && dayStr <= end
    }

    // items for the currently selected day
    const selectedDayItems = useMemo(() => {
        if (!selectedDate) return []
        return announcements.filter((a) => coversDay(a, selectedDate))
    }, [announcements, selectedDate])

    // the announcement shown in the hero when a day is selected (first match)
    const heroItem = selectedDayItems[0] || null

    // Monday-first calendar grid
    const grid = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1)
        // JS getDay: 0=Sun..6=Sat -> shift so Monday is column 0
        const startDow = (first.getDay() + 6) % 7
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

    /* ---------- modal ---------- */
    function openModal() {
        setTitle(''); setBody(''); setAudience('all'); setSelectedClassIds([])
        setStartDate(''); setEndDate(''); setFormError('')
        setModalOpen(true)
    }
    function closeModal() {
        if (saving) return
        setModalOpen(false)
    }

    async function handleSave() {
        setFormError('')
        if (!title.trim()) { setFormError('Enter a title for the announcement.'); return }
        if (!body.trim()) { setFormError('Enter a description.'); return }
        if (audience === 'class' && selectedClassIds.length === 0) {
            setFormError('Choose at least one class.'); return
        }
        if (startDate && endDate && endDate < startDate) {
            setFormError('End date cannot be before the start date.'); return
        }

        setSaving(true)
        const row = {
            title: title.trim(),
            body: body.trim(),
            category: 'notice',
            audience,
            start_date: startDate || ymd(today),
            end_date: endDate || null,
        }
        if (user?.user_id) row.posted_by = user.user_id

        const { data: created, error } = await supabase
            .from('announcements')
            .insert(row)
            .select()
            .single()

        if (error) {
            setSaving(false)
            setFormError(error.message || 'Could not save the announcement.')
            return
        }

        if (audience === 'class' && selectedClassIds.length > 0) {
            const links = selectedClassIds.map((cid) => ({
                announcement_id: created.announcement_id,
                class_id: cid,
            }))
            const { error: linkErr } = await supabase.from('announcement_classes').insert(links)
            if (linkErr) {
                await supabase.from('announcements').delete().eq('announcement_id', created.announcement_id)
                setSaving(false)
                setFormError('Saved the notice but could not link classes: ' + linkErr.message)
                return
            }
        }

        setSaving(false)
        setModalOpen(false)
        fetchAnnouncements()
    }

    async function handleDelete(id) {
        if (!window.confirm('Delete this announcement? This cannot be undone.')) return
        await supabase.from('announcement_classes').delete().eq('announcement_id', id)
        const { error } = await supabase.from('announcements').delete().eq('announcement_id', id)
        if (!error) fetchAnnouncements()
    }

    /* ---------------------------------------------------------------- */
    return (
        <div className={styles.page}>
            <div className={styles.topGrid}>
                {/* Hero */}
                <section className={styles.hero}>
                    <div className={styles.heroInner}>
                        {selectedDate ? (
                            /* --- a date is selected: show that day's announcement --- */
                            heroItem ? (
                                <>
                                    <span className={styles.heroEyebrow}>
                                        Announcement · {formatDate(selectedDate)}
                                    </span>
                                    <h1 className={styles.heroTitle}>{heroItem.title}</h1>
                                    <p className={styles.heroBody}>{heroItem.body}</p>
                                    <div className={styles.heroDates}>
                                        <div className={styles.heroDate}>
                                            <span className={styles.heroDateLabel}>Start Date</span>
                                            <span className={styles.heroDateValue}>
                                                {formatDate(heroItem.start_date || heroItem.created_at?.slice(0, 10))}
                                            </span>
                                        </div>
                                        <div className={styles.heroDate}>
                                            <span className={styles.heroDateLabel}>End Date</span>
                                            <span className={styles.heroDateValue}>
                                                {formatDate(heroItem.end_date)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={styles.heroActions}>
                                        <button className={styles.heroBtn} onClick={openModal}>Add Announcement</button>
                                        <button className={styles.heroLink} onClick={() => setSelectedDate(null)}>
                                            Back to latest
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span className={styles.heroEyebrow}>
                                        Announcement · {formatDate(selectedDate)}
                                    </span>
                                    <h1 className={styles.heroTitle}>No Announcement</h1>
                                    <p className={styles.heroBody}>Nothing is scheduled on this day.</p>
                                    <div className={styles.heroActions}>
                                        <button className={styles.heroBtn} onClick={openModal}>Add Announcement</button>
                                        <button className={styles.heroLink} onClick={() => setSelectedDate(null)}>
                                            Back to latest
                                        </button>
                                    </div>
                                </>
                            )
                        ) : (
                            /* --- default: latest announcement --- */
                            latest ? (
                                <>
                                    <span className={styles.heroEyebrow}>Latest Announcement</span>
                                    <h1 className={styles.heroTitle}>{latest.title}</h1>
                                    <p className={styles.heroBody}>{latest.body}</p>
                                    <div className={styles.heroDates}>
                                        <div className={styles.heroDate}>
                                            <span className={styles.heroDateLabel}>Start Date</span>
                                            <span className={styles.heroDateValue}>
                                                {formatDate(latest.start_date || latest.created_at?.slice(0, 10))}
                                            </span>
                                        </div>
                                        <div className={styles.heroDate}>
                                            <span className={styles.heroDateLabel}>End Date</span>
                                            <span className={styles.heroDateValue}>{formatDate(latest.end_date)}</span>
                                        </div>
                                    </div>
                                    <button className={styles.heroBtn} onClick={openModal}>Add Announcement</button>
                                </>
                            ) : (
                                <>
                                    <span className={styles.heroEyebrow}>Latest Announcement</span>
                                    <h1 className={styles.heroTitle}>No Announcements</h1>
                                    <p className={styles.heroBody}>
                                        All announcements will appear here. Click the button below to add your first one.
                                    </p>
                                    <button className={styles.heroBtn} onClick={openModal}>Add Announcement</button>
                                </>
                            )
                        )}
                    </div>
                </section>

                {/* Calendar */}
                <section className={styles.calCard}>
                    <div className={styles.calHead}>
                        <button className={styles.calNav} onClick={prevMonth} aria-label="Previous month">‹</button>
                        <div className={styles.calTitle}>{MONTHS[viewMonth]} {viewYear}</div>
                        <button className={styles.calNav} onClick={nextMonth} aria-label="Next month">›</button>
                    </div>
                    <div className={styles.weekRow}>
                        {WEEKDAYS.map((w) => (
                            <div
                                key={w}
                                className={`${styles.weekCell} ${w === 'Sun' ? styles.weekEnd : ''}`}
                            >{w}</div>
                        ))}
                    </div>
                    <div className={styles.dayGrid}>
                        {grid.map((cell, i) => {
                            if (!cell) return <div key={i} className={styles.dayEmpty} />
                            const str = ymd(cell)
                            const isToday = str === ymd(today)
                            const isSelected = str === selectedDate
                            const isWeekend = cell.getDay() === 0 // Sunday
                            const marked = markedDays.has(str)
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={[
                                        styles.dayCell,
                                        isToday ? styles.dayToday : '',
                                        isSelected ? styles.daySelected : '',
                                        isWeekend ? styles.dayWeekend : '',
                                    ].join(' ')}
                                    onClick={() => setSelectedDate(str)}
                                >
                                    <span className={styles.dayNum}>{cell.getDate()}</span>
                                    {marked && <span className={styles.dayMark} />}
                                </button>
                            )
                        })}
                    </div>
                    <div className={styles.calFoot}>
                        <span className={styles.footTick} />
                        <span className={styles.footLine} />
                        <span className={styles.footTick} />
                    </div>
                </section>
            </div>

            {/* List */}
            <div className={styles.listBlock}>
                <h2 className={styles.listHeading}>Announcement List</h2>

                <div className={styles.listCard}>
                    <div className={styles.listToolbar}>
                        <select
                            className={styles.filterSelect}
                            value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}
                        >
                            {TIME_FILTERS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Announcement Title</th>
                                    <th>Audience</th>
                                    <th>Description</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th className={styles.actionCol}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className={styles.tableEmpty}>Loading…</td></tr>
                                ) : filteredList.length === 0 ? (
                                    <tr><td colSpan={6} className={styles.tableEmpty}>No announcements found.</td></tr>
                                ) : (
                                    filteredList.map((a) => (
                                        <tr key={a.announcement_id}>
                                            <td className={styles.cellTitle}>{a.title}</td>
                                            <td>
                                                {audienceLabel(a.audience)}
                                                {a.audience === 'class' && linkedClasses(a).length > 0 && (
                                                    <span className={styles.cellSub}>
                                                        {linkedClasses(a).map(classText).join(', ')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={styles.cellDesc}>{a.body}</td>
                                            <td>{formatDate(a.start_date || a.created_at?.slice(0, 10))}</td>
                                            <td>{formatDate(a.end_date)}</td>
                                            <td className={styles.actionCol}>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={() => handleDelete(a.announcement_id)}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.recordCount}>
                        Showing {loading ? 0 : filteredList.length} record{filteredList.length === 1 ? '' : 's'}
                    </div>
                </div>
            </div>

            {/* Add modal */}
            {modalOpen && (
                <div className={styles.overlay} onMouseDown={closeModal}>
                    <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
                        <h3 className={styles.modalTitle}>Add New Announcement</h3>

                        {formError && <div className={styles.modalError}>{formError}</div>}

                        <div className={styles.field}>
                            <label>Announcement Title</label>
                            <input
                                className={styles.input}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter title"
                            />
                        </div>

                        <div className={styles.field}>
                            <label>Description</label>
                            <textarea
                                className={styles.textarea}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Enter description"
                                rows={4}
                            />
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.field}>
                                <label>Start Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className={styles.field}>
                                <label>End Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className={styles.divider} />

                        <div className={styles.field}>
                            <label>Target Audience</label>
                            <select
                                className={styles.input}
                                value={audience}
                                onChange={(e) => setAudience(e.target.value)}
                            >
                                {AUDIENCES.map((a) => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                        </div>

                        {audience === 'class' && (
                            <div className={styles.field}>
                                <label>Classes</label>
                                <div className={styles.classPicker}>
                                    {classes.length === 0 ? (
                                        <div className={styles.classEmpty}>No classes available.</div>
                                    ) : (
                                        classes.map((c) => {
                                            const checked = selectedClassIds.includes(c.class_id)
                                            return (
                                                <label key={c.class_id} className={styles.classOption}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked)
                                                                setSelectedClassIds((p) => [...p, c.class_id])
                                                            else
                                                                setSelectedClassIds((p) => p.filter((id) => id !== c.class_id))
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

                        <div className={styles.modalFoot}>
                            <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>
                                Cancel
                            </button>
                            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : 'Save Announcement'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Announcements