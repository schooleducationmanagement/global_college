import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from './Attendance.module.css'

const EMPTY_FILTERS = { academicYear: '', classId: '', subjectId: '', status: '', search: '' }
const statusLabel = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unmarked'
const timeLabel = value => value ? new Date(`1970-01-01T${value}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'

function Attendance() {
    const [filters, setFilters] = useState(EMPTY_FILTERS)
    const [classes, setClasses] = useState([])
    const [subjects, setSubjects] = useState([])
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedStudent, setSelectedStudent] = useState(null)
    const [history, setHistory] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)

    useEffect(() => {
        let active = true
        async function loadOptions() {
            const [{ data: classData, error: classError }, { data: subjectData, error: subjectError }] = await Promise.all([
                supabase.from('classes').select('class_id, section, academic_year, program, semester').order('academic_year', { ascending: false }).order('section'),
                supabase.from('subjects').select('subject_id, subject_name, program, semester').order('subject_name'),
            ])
            if (!active) return
            if (classError || subjectError) setError(classError?.message || subjectError?.message || 'Could not load filter options.')
            setClasses(classData || [])
            setSubjects(subjectData || [])
        }
        loadOptions()
        return () => { active = false }
    }, [])

    const fetchAttendance = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            let query = supabase.from('attendance').select(`
                attendance_id, date, status, created_at,
                student:students!attendance_student_id_fkey(
                    student_id, name, roll_no, class_id,
                    class:classes!students_class_id_fkey(class_id, section, academic_year, program, semester)
                ),
                timetable:timetable!attendance_timetable_id_fkey(
                    timetable_id, period_no, start_time, end_time,
                    subject:subjects!timetable_subject_id_fkey(subject_id, subject_name, subject_code),
                    teacher:teachers!timetable_teacher_id_fkey(teacher_id, name)
                ),
                marker:teachers!attendance_marked_by_fkey(teacher_id, name)
            `).order('date', { ascending: false }).order('attendance_id', { ascending: false })

            const { data, error: queryError } = await query
            if (queryError) throw queryError

            let filtered = (data || []).filter(row => {
                const student = row.student || {}
                const cls = student.class || {}
                const subject = row.timetable?.subject || {}
                if (filters.academicYear && cls.academic_year !== filters.academicYear) return false
                if (filters.classId && String(student.class_id) !== filters.classId) return false
                if (filters.subjectId && String(subject.subject_id) !== filters.subjectId) return false
                if (filters.status && row.status !== filters.status) return false
                const term = filters.search.trim().toLowerCase()
                if (term && !`${student.name || ''} ${student.roll_no || ''}`.toLowerCase().includes(term)) return false
                return true
            })
            setRows(filtered)
        } catch (e) {
            setError(e?.message || 'Unable to load attendance.')
            setRows([])
        } finally {
            setLoading(false)
        }
    }, [filters])

    useEffect(() => { fetchAttendance() }, [fetchAttendance])

    const stats = useMemo(() => {
        const present = rows.filter(r => r.status === 'present').length
        const absent = rows.filter(r => r.status === 'absent').length
        const late = rows.filter(r => r.status === 'late').length
        const total = present + absent + late
        return { present, absent, late, total, rate: total ? Math.round(((present + late) / total) * 1000) / 10 : 0 }
    }, [rows])

    function updateFilter(key, value) { setFilters(current => ({ ...current, [key]: value })) }
    function resetFilters() { setFilters(EMPTY_FILTERS) }

    function exportCSV() {
        const columns = ['Roll Number', 'Student Name', 'Class', 'Academic Year', 'Date', 'Subject', 'Period', 'Status', 'Marked By']
        const values = rows.map(row => [row.student?.roll_no, row.student?.name, row.student?.class?.section, row.student?.class?.academic_year, row.date, row.timetable?.subject?.subject_name, row.timetable?.period_no, row.status, row.marker?.name])
        const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`
        const csv = [columns, ...values].map(line => line.map(escape).join(',')).join('\r\n')
        const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `attendance-export.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    async function openStudent(student) {
        if (!student?.student_id) return
        setSelectedStudent(student)
        setHistory([])
        setHistoryLoading(true)
        const { data, error: historyError } = await supabase.from('attendance').select(`
            attendance_id, date, status,
            timetable:timetable!attendance_timetable_id_fkey(period_no, start_time, subject:subjects!timetable_subject_id_fkey(subject_name)),
            marker:teachers!attendance_marked_by_fkey(name)
        `).eq('student_id', student.student_id).order('date', { ascending: false }).limit(100)
        if (historyError) setError(historyError.message)
        setHistory(data || [])
        setHistoryLoading(false)
    }

    const academicYears = [...new Set(classes.map(c => c.academic_year).filter(Boolean))].sort().reverse()
    const visibleSubjects = subjects.filter(sub => {
        const selectedClass = classes.find(c => String(c.class_id) === filters.classId)
        return !selectedClass || ((!selectedClass.program || !sub.program || sub.program === selectedClass.program) && (!selectedClass.semester || !sub.semester || sub.semester === selectedClass.semester))
    })

    const hasFilters = Object.values(filters).some(v => v !== '')

    return (
        <div className={s.page}>
            {/* Header */}
            <div className={s.header}>
                <div className={s.headerLeft}>
                    <h1 className={s.title}>Attendance</h1>
                    <span className={s.count}>
                        {loading ? 'Loading…' : `${rows.length} record${rows.length !== 1 ? 's' : ''}`}
                    </span>
                </div>
                <button className={s.exportBtn} onClick={exportCSV} disabled={!rows.length}>Export CSV</button>
            </div>

            {/* Filters */}
            <div className={s.filters}>
                <div className={s.filterGroup}>
                    <label className={s.filterLabel}>Academic Year</label>
                    <select className={s.filterSelect} value={filters.academicYear} onChange={e => updateFilter('academicYear', e.target.value)}>
                        <option value="">All years</option>
                        {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div className={s.filterGroup}>
                    <label className={s.filterLabel}>Class</label>
                    <select className={s.filterSelect} value={filters.classId} onChange={e => updateFilter('classId', e.target.value)}>
                        <option value="">All classes</option>
                        {classes.filter(c => !filters.academicYear || c.academic_year === filters.academicYear).map(c => (
                            <option key={c.class_id} value={c.class_id}>{c.section}{c.program ? ` · ${c.program}` : ''}{c.semester ? ` · Sem ${c.semester}` : ''}</option>
                        ))}
                    </select>
                </div>
                <div className={s.filterGroup}>
                    <label className={s.filterLabel}>Subject</label>
                    <select className={s.filterSelect} value={filters.subjectId} onChange={e => updateFilter('subjectId', e.target.value)}>
                        <option value="">All subjects</option>
                        {visibleSubjects.map(sub => <option key={sub.subject_id} value={sub.subject_id}>{sub.subject_name}</option>)}
                    </select>
                </div>
                <div className={s.filterGroup}>
                    <label className={s.filterLabel}>Status</label>
                    <select className={s.filterSelect} value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
                        <option value="">All</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                    </select>
                </div>
                <div className={`${s.filterGroup} ${s.filterSearch}`}>
                    <label className={s.filterLabel}>Search</label>
                    <input className={s.filterInput} type="search" value={filters.search} onChange={e => updateFilter('search', e.target.value)} placeholder="Name or roll no" />
                </div>
                {hasFilters && <button className={s.resetBtn} onClick={resetFilters}>Reset</button>}
            </div>

            {error && <div className={s.error}>{error}</div>}

            {/* Summary chips */}
            {!loading && rows.length > 0 && (
                <div className={s.summary}>
                    <span className={`${s.chip} ${s.chipGreen}`}>{stats.present} Present</span>
                    <span className={`${s.chip} ${s.chipRed}`}>{stats.absent} Absent</span>
                    <span className={`${s.chip} ${s.chipAmber}`}>{stats.late} Late</span>
                    <span className={`${s.chip} ${s.chipPurple}`}>{stats.rate}% Rate</span>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className={s.emptyState}>Loading attendance records…</div>
            ) : rows.length === 0 ? (
                <div className={s.emptyState}>
                    <strong>No attendance records found</strong>
                    <span>Try changing or removing some of the filters above.</span>
                </div>
            ) : (
                <div className={s.tableCard}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Class</th>
                                <th>Date</th>
                                <th>Subject / Period</th>
                                <th>Status</th>
                                <th>Marked By</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const student = row.student || {}
                                const cls = student.class || {}
                                const timetable = row.timetable || {}
                                return (
                                    <tr key={row.attendance_id}>
                                        <td>
                                            <button className={s.studentBtn} onClick={() => openStudent(student)}>
                                                <span className={s.avatar}>{(student.name || '?').trim().charAt(0).toUpperCase()}</span>
                                                <span>
                                                    <strong>{student.name || 'Unknown'}</strong>
                                                    <small>Roll {student.roll_no || '—'}</small>
                                                </span>
                                            </button>
                                        </td>
                                        <td>
                                            <span className={s.classBadge}>{cls.section || '—'}</span>
                                            <small className={s.muted}>{cls.academic_year || ''}</small>
                                        </td>
                                        <td>{row.date ? new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                        <td>
                                            <strong>{timetable.subject?.subject_name || '—'}</strong>
                                            <small className={s.muted}>{timetable.period_no ? `Period ${timetable.period_no}` : '—'} · {timeLabel(timetable.start_time)}</small>
                                        </td>
                                        <td><span className={`${s.statusBadge} ${s[`st_${row.status}`] || ''}`}>{statusLabel(row.status)}</span></td>
                                        <td className={s.muted}>{row.marker?.name || '—'}</td>
                                        <td><button className={s.viewBtn} onClick={() => openStudent(student)} disabled={!student.student_id}>View</button></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Student history modal */}
            {selectedStudent && (
                <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) setSelectedStudent(null) }}>
                    <div className={s.modal}>
                        <div className={s.modalTop}>
                            <div>
                                <h2 className={s.modalTitle}>{selectedStudent.name}</h2>
                                <p className={s.modalSub}>Roll no. {selectedStudent.roll_no || '—'}</p>
                            </div>
                            <button className={s.closeBtn} onClick={() => setSelectedStudent(null)} aria-label="Close">×</button>
                        </div>

                        {historyLoading ? <p className={s.modalEmpty}>Loading history…</p> : <>
                            <div className={s.modalStats}>
                                <div><span>Present</span><strong>{history.filter(r => r.status === 'present').length}</strong></div>
                                <div><span>Absent</span><strong>{history.filter(r => r.status === 'absent').length}</strong></div>
                                <div><span>Late</span><strong>{history.filter(r => r.status === 'late').length}</strong></div>
                            </div>

                            <p className={s.modalNote}>Latest {history.length} records (up to 100)</p>

                            <div className={s.historyList}>
                                {history.length === 0
                                    ? <p className={s.modalEmpty}>No attendance history found.</p>
                                    : history.map(item => (
                                        <div className={s.historyRow} key={item.attendance_id}>
                                            <div>
                                                <strong>{item.timetable?.subject?.subject_name || 'Subject unavailable'}</strong>
                                                <span>{item.date} · {item.timetable?.period_no ? `Period ${item.timetable.period_no}` : '—'} · {item.marker?.name || '—'}</span>
                                            </div>
                                            <span className={`${s.statusBadge} ${s[`st_${item.status}`] || ''}`}>{statusLabel(item.status)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </>}
                    </div>
                </div>
            )}
        </div>
    )
}

export default Attendance
