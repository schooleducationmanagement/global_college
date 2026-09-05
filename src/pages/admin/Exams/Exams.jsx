import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Exams.module.css'

/* Shared helper: human-readable class label */
function classText(c) {
    if (!c) return null
    return `${c.program} · Sem ${c.semester} · ${c.section}`
}

/* Format an ISO date string (yyyy-mm-dd) as dd/mm/yyyy */
function formatDate(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
}

/* Format a stored time (HH:MM:SS) as 12-hour with AM/PM, e.g. 2:56 PM */
function formatTime(t) {
    if (!t) return ''
    const [hStr, mStr] = t.split(':')
    let h = parseInt(hStr, 10)
    const m = mStr ?? '00'
    if (Number.isNaN(h)) return t
    const period = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    return `${h}:${m} ${period}`
}

/* Format a start/end pair as e.g. 9:00 AM – 11:00 AM */
function formatTimeRange(start, end) {
    const s = formatTime(start)
    const e = formatTime(end)
    if (s && e) return `${s} – ${e}`
    return s || e || ''
}

const SUBVIEWS = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'scores', label: 'Scores' },
    { id: 'results', label: 'Results' },
]

function Exams() {
    const { user } = useAuth()

    // Top-level shell state: are we looking at the list, or inside one exam?
    const [exams, setExams] = useState([])
    const [selectedExamId, setSelectedExamId] = useState('')
    const [subview, setSubview] = useState('schedule')
    const [message, setMessage] = useState(null)

    useEffect(() => { fetchExams() }, [])

    async function fetchExams() {
        const { data } = await supabase
            .from('exams').select('*').order('start_date', { ascending: false })
        setExams(data || [])
    }

    const selectedExam = exams.find((e) => String(e.exam_id) === String(selectedExamId))

    function openExam(id) {
        setSelectedExamId(String(id))
        setSubview('schedule')
        setMessage(null)
    }
    function backToList() {
        setSelectedExamId('')
        setMessage(null)
    }

    return (
        <div>
            <div className={styles.header}>
                <h2>Exams</h2>
                <p>Create an exam, schedule its papers by class, then enter scores and view results.</p>
            </div>

            {!selectedExam ? (
                <ExamListView
                    user={user}
                    exams={exams}
                    refreshExams={fetchExams}
                    onOpen={openExam}
                    message={message}
                    setMessage={setMessage}
                />
            ) : (
                <ExamWorkspace
                    user={user}
                    exam={selectedExam}
                    subview={subview}
                    setSubview={setSubview}
                    onBack={backToList}
                    refreshExams={fetchExams}
                    message={message}
                    setMessage={setMessage}
                />
            )}
        </div>
    )
}

/* ======================================================================
   EXAM LIST + CREATE  (the landing view of the page)
   ====================================================================== */
function ExamListView({ user, exams, refreshExams, onOpen, message, setMessage }) {
    const [name, setName] = useState('')
    const [academicYear, setAcademicYear] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [saving, setSaving] = useState(false)

    async function handleCreateExam() {
        setMessage(null)
        if (!name.trim() || !academicYear.trim()) {
            setMessage({ type: 'err', text: 'Exam name and academic year are required.' }); return
        }
        if (startDate && endDate && endDate < startDate) {
            setMessage({ type: 'err', text: 'End date cannot be before start date.' }); return
        }
        setSaving(true)
        const row = {
            exam_name: name.trim(),
            academic_year: academicYear.trim(),
            start_date: startDate || null,
            end_date: endDate || null,
        }
        if (user?.user_id) row.created_by = user.user_id
        const { data, error } = await supabase.from('exams').insert(row).select().single()
        setSaving(false)
        if (error) { setMessage({ type: 'err', text: 'Could not create exam: ' + error.message }); return }
        setName(''); setAcademicYear(''); setStartDate(''); setEndDate('')
        await refreshExams()
        onOpen(data.exam_id)   // jump straight into the new exam
    }

    async function handleDeleteExam(examId, ev) {
        ev.stopPropagation()
        if (!window.confirm('Delete this exam and everything under it (classes, papers, scores)?')) return
        const { data: ps } = await supabase.from('exam_subjects').select('id').eq('exam_id', examId)
        const paperIds = (ps || []).map((p) => p.id)
        if (paperIds.length) {
            await supabase.from('exam_scores').delete().in('exam_subject_id', paperIds)
        }
        await supabase.from('exam_subjects').delete().eq('exam_id', examId)
        await supabase.from('exam_classes').delete().eq('exam_id', examId)
        await supabase.from('exams').delete().eq('exam_id', examId)
        await refreshExams()
    }

    function formatRange(e) {
        if (!e.start_date && !e.end_date) return 'No dates set'
        if (e.start_date && e.end_date) return `${formatDate(e.start_date)} → ${formatDate(e.end_date)}`
        return formatDate(e.start_date || e.end_date)
    }

    return (
        <div className={styles.grid}>
            {/* LEFT: create */}
            <div className={styles.card}>
                <div className={styles.cardHead}><h3>Create exam</h3></div>
                <div className={styles.cardBody}>
                    <div className={styles.formRow}>
                        <label>Exam name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid-Term" />
                    </div>
                    <div className={styles.formRow}>
                        <label>Academic year</label>
                        <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g. 2025-2026" />
                    </div>
                    <div className={styles.formTwoCol}>
                        <div className={styles.formRow}>
                            <label>Start date</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className={styles.formRow}>
                            <label>End date</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>

                    {message && (
                        <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                            {message.text}
                        </div>
                    )}

                    <button className={styles.submitBtn} onClick={handleCreateExam} disabled={saving}>
                        {saving ? 'Creating…' : 'Create exam'}
                    </button>
                </div>
            </div>

            {/* RIGHT: list */}
            <div className={styles.card}>
                <div className={styles.cardHead}>
                    <h3>All exams <span>· {exams.length}</span></h3>
                </div>
                <div className={styles.cardBody}>
                    {exams.length === 0 ? (
                        <div className={styles.empty}>No exams yet. Create the first one on the left.</div>
                    ) : (
                        <div className={styles.examList}>
                            {exams.map((e) => (
                                <div
                                    key={e.exam_id}
                                    className={styles.examRow}
                                    onClick={() => onOpen(e.exam_id)}
                                >
                                    <div>
                                        <div className={styles.examName}>{e.exam_name}</div>
                                        <div className={styles.examMeta}>{e.academic_year} · {formatRange(e)}</div>
                                    </div>
                                    <div className={styles.examRowActions}>
                                        <span className={styles.openHint}>Open →</span>
                                        <button className={styles.deleteBtn} onClick={(ev) => handleDeleteExam(e.exam_id, ev)}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ======================================================================
   EXAM WORKSPACE  (inside one exam: sub-view tabs + back)
   ====================================================================== */
function ExamWorkspace({ user, exam, subview, setSubview, onBack, refreshExams, message, setMessage }) {
    return (
        <div>
            {/* Workspace bar: back + which exam + sub-view tabs */}
            <div className={styles.workspaceBar}>
                <button className={styles.backBtn} onClick={onBack}>← All exams</button>
                <div className={styles.workspaceTitle}>
                    <span className={styles.workspaceName}>{exam.exam_name}</span>
                    <span className={styles.workspaceMeta}>{exam.academic_year}</span>
                </div>
            </div>

            <div className={styles.tabs}>
                {SUBVIEWS.map((s) => (
                    <button
                        key={s.id}
                        className={`${styles.tab} ${subview === s.id ? styles.tabActive : ''}`}
                        onClick={() => { setSubview(s.id); setMessage(null) }}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {subview === 'schedule' && (
                <ScheduleView
                    exam={exam}
                    message={message}
                    setMessage={setMessage}
                />
            )}
            {subview === 'scores' && (
                <ScoresView
                    exam={exam}
                    user={user}
                    message={message}
                    setMessage={setMessage}
                />
            )}
            {subview === 'results' && (
                <ResultsView
                    exam={exam}
                    user={user}
                    message={message}
                    setMessage={setMessage}
                />
            )}
        </div>
    )
}

/* ======================================================================
   SCHEDULE VIEW  (classes as collapsible sections, subjects inside each)
   ====================================================================== */
function ScheduleView({ exam, message, setMessage }) {
    const [classes, setClasses] = useState([])        // all classes (for the "add class" picker)
    const [subjects, setSubjects] = useState([])      // all subjects (filtered per class in the UI)
    const [examClasses, setExamClasses] = useState([]) // exam_classes rows w/ class detail
    const [papers, setPapers] = useState([])          // exam_subjects rows for this exam
    const [loading, setLoading] = useState(true)

    // add-class picker
    const [addClassId, setAddClassId] = useState('')

    // which class sections are collapsed (by class_id)
    const [collapsed, setCollapsed] = useState({})

    useEffect(() => {
        loadAll()
        // eslint-disable-next-line
    }, [exam.exam_id])

    async function loadAll() {
        setLoading(true)
        const [clsRes, subRes] = await Promise.all([
            supabase.from('classes').select('class_id, program, semester, section').order('program'),
            supabase.from('subjects').select('subject_id, subject_name, program, semester').order('subject_name'),
        ])
        setClasses(clsRes.data || [])
        setSubjects(subRes.data || [])
        await loadExamData()
        setLoading(false)
    }

    async function loadExamData() {
        const { data: ec } = await supabase
            .from('exam_classes')
            .select('id, class_id, classes ( class_id, program, semester, section )')
            .eq('exam_id', exam.exam_id)
        setExamClasses(ec || [])

        const { data: ps } = await supabase
            .from('exam_subjects')
            .select('id, exam_date, start_time, end_time, max_marks, pass_marks, class_id, subject_id, subjects ( subject_name )')
            .eq('exam_id', exam.exam_id)
            .order('exam_date')
        setPapers(ps || [])
    }

    async function handleAddClass() {
        setMessage(null)
        if (!addClassId) return
        if (examClasses.some((ec) => String(ec.class_id) === String(addClassId))) {
            setMessage({ type: 'err', text: 'That class is already added.' }); return
        }
        const { error } = await supabase.from('exam_classes').insert({
            exam_id: exam.exam_id, class_id: addClassId,
        })
        if (error) { setMessage({ type: 'err', text: 'Could not add class: ' + error.message }); return }
        setAddClassId('')
        await loadExamData()
    }

    async function handleRemoveClass(ec) {
        if (!window.confirm(`Remove ${classText(ec.classes)} and its papers from this exam?`)) return
        const classPapers = papers.filter((p) => String(p.class_id) === String(ec.class_id))
        const ids = classPapers.map((p) => p.id)
        if (ids.length) {
            await supabase.from('exam_scores').delete().in('exam_subject_id', ids)
            await supabase.from('exam_subjects').delete().in('id', ids)
        }
        await supabase.from('exam_classes').delete().eq('id', ec.id)
        await loadExamData()
    }

    function toggleCollapse(classId) {
        setCollapsed((prev) => ({ ...prev, [classId]: !prev[classId] }))
    }

    // Classes not yet added (for the picker)
    const availableClasses = classes.filter(
        (c) => !examClasses.some((ec) => String(ec.class_id) === String(c.class_id))
    )

    return (
        <div className={styles.card}>
            <div className={styles.cardBody}>
                {message && (
                    <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                        {message.text}
                    </div>
                )}

                {/* Add a class to this exam */}
                <div className={styles.addClassBar}>
                    <select value={addClassId} onChange={(e) => setAddClassId(e.target.value)}>
                        <option value="">Add a class…</option>
                        {availableClasses.map((c) => (
                            <option key={c.class_id} value={c.class_id}>{classText(c)}</option>
                        ))}
                    </select>
                    <button className={styles.smallBtn} onClick={handleAddClass} disabled={!addClassId}>
                        Add class
                    </button>
                </div>

                {loading ? (
                    <div className={styles.empty}>Loading…</div>
                ) : examClasses.length === 0 ? (
                    <div className={styles.empty}>No classes yet. Add a class above to start scheduling papers.</div>
                ) : (
                    <div className={styles.classSections}>
                        {examClasses.map((ec) => (
                            <ClassSection
                                key={ec.id}
                                exam={exam}
                                examClass={ec}
                                subjects={subjects}
                                papers={papers.filter((p) => String(p.class_id) === String(ec.class_id))}
                                collapsed={!!collapsed[ec.class_id]}
                                onToggle={() => toggleCollapse(ec.class_id)}
                                onRemoveClass={() => handleRemoveClass(ec)}
                                onChanged={loadExamData}
                                setMessage={setMessage}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ---------- one collapsible class section ---------- */
function ClassSection({ exam, examClass, subjects, papers, collapsed, onToggle, onRemoveClass, onChanged, setMessage }) {
    const cls = examClass.classes

    // add-subject form (scoped to this class)
    const [subjectId, setSubjectId] = useState('')
    const [date, setDate] = useState('')
    const [startTime, setStartTime] = useState('')
    const [endTime, setEndTime] = useState('')
    const [maxMarks, setMaxMarks] = useState('100')
    const [passMarks, setPassMarks] = useState('35')
    const [adding, setAdding] = useState(false)

    // Only subjects for this class's program + semester
    const classSubjects = subjects.filter(
        (s) => s.program === cls?.program && s.semester === cls?.semester
    )

    async function handleAddSubject() {
        setMessage(null)
        if (!subjectId || !date) {
            setMessage({ type: 'err', text: 'Subject and date are required.' }); return
        }
        if (!startTime || !endTime) {
            setMessage({ type: 'err', text: 'Start time and end time are required.' }); return
        }
        if (endTime <= startTime) {
            setMessage({ type: 'err', text: 'End time must be after start time.' }); return
        }
        if (!maxMarks) {
            setMessage({ type: 'err', text: 'Max marks is required.' }); return
        }
        if (papers.some((p) => String(p.subject_id) === String(subjectId))) {
            setMessage({ type: 'err', text: 'That subject is already scheduled for this class.' }); return
        }
        setAdding(true)
        const { error } = await supabase.from('exam_subjects').insert({
            exam_id: exam.exam_id,
            class_id: examClass.class_id,
            subject_id: subjectId,
            exam_date: date,
            start_time: startTime,
            end_time: endTime,
            max_marks: parseFloat(maxMarks),
            pass_marks: passMarks ? parseFloat(passMarks) : null,
        })
        setAdding(false)
        if (error) { setMessage({ type: 'err', text: 'Could not add subject: ' + error.message }); return }
        setSubjectId(''); setDate(''); setStartTime(''); setEndTime('')
        await onChanged()
    }

    async function handleDeletePaper(id) {
        if (!window.confirm('Remove this subject from the class?')) return
        await supabase.from('exam_scores').delete().eq('exam_subject_id', id)
        await supabase.from('exam_subjects').delete().eq('id', id)
        await onChanged()
    }

    return (
        <div className={styles.classSection}>
            <div className={styles.classSectionHead}>
                <button className={styles.collapseToggle} onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
                    <span className={styles.caret}>{collapsed ? '▸' : '▾'}</span>
                    <span className={styles.className}>{classText(cls)}</span>
                    <span className={styles.paperCount}>{papers.length} paper{papers.length === 1 ? '' : 's'}</span>
                </button>
                <button className={styles.deleteBtn} onClick={onRemoveClass}>Remove class</button>
            </div>

            {!collapsed && (
                <div className={styles.classSectionBody}>
                    {/* add subject */}
                    <div className={styles.addSubjectRow}>
                        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                            <option value="">
                                {classSubjects.length ? 'Subject…' : 'No subjects for this program/semester'}
                            </option>
                            {classSubjects.map((s) => (
                                <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
                            ))}
                        </select>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Exam date" />
                        <input type="time" className={styles.timeInput} value={startTime}
                            onChange={(e) => setStartTime(e.target.value)} title="Start time" />
                        <input type="time" className={styles.timeInput} value={endTime}
                            onChange={(e) => setEndTime(e.target.value)} title="End time" />
                        <input type="number" className={styles.marksInput} value={maxMarks}
                            onChange={(e) => setMaxMarks(e.target.value)} placeholder="Max" title="Max marks" />
                        <input type="number" className={styles.marksInput} value={passMarks}
                            onChange={(e) => setPassMarks(e.target.value)} placeholder="Pass" title="Pass marks" />
                        <button className={styles.smallBtn} onClick={handleAddSubject}
                            disabled={adding || classSubjects.length === 0}>
                            {adding ? 'Adding…' : 'Add'}
                        </button>
                    </div>

                    {/* papers in this class */}
                    {papers.length === 0 ? (
                        <div className={styles.classEmpty}>No subjects scheduled for this class yet.</div>
                    ) : (
                        <table className={styles.dataTable}>
                            <thead>
                                <tr><th>Subject</th><th>Date</th><th>Time</th><th>Marks</th><th></th></tr>
                            </thead>
                            <tbody>
                                {papers.map((p) => (
                                    <tr key={p.id}>
                                        <td className={styles.strong}>{p.subjects?.subject_name}</td>
                                        <td>{formatDate(p.exam_date)}</td>
                                        <td>{formatTimeRange(p.start_time, p.end_time) || '—'}</td>
                                        <td>{p.max_marks}{p.pass_marks != null ? ` (pass ${p.pass_marks})` : ''}</td>
                                        <td>
                                            <button className={styles.deleteBtn} onClick={() => handleDeletePaper(p.id)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}

/* ======================================================================
   SCORES VIEW  (pick class -> subject -> enter marks for that class's students)
   ====================================================================== */
function ScoresView({ exam, user, message, setMessage }) {
    const [examClasses, setExamClasses] = useState([])   // classes in this exam
    const [papers, setPapers] = useState([])             // exam_subjects in this exam
    const [loading, setLoading] = useState(true)

    // selection
    const [classId, setClassId] = useState('')
    const [paperId, setPaperId] = useState('')

    // score sheet
    const [students, setStudents] = useState([])
    const [marks, setMarks] = useState({})               // { student_id: "value" }
    const [sheetLoading, setSheetLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // permission
    const isAdmin = user?.role === 'admin'
    const [teacherId, setTeacherId] = useState(null)
    const [coordClassIds, setCoordClassIds] = useState([])

    useEffect(() => {
        loadExamStructure()
        loadPermission()
        // eslint-disable-next-line
    }, [exam.exam_id])

    async function loadExamStructure() {
        setLoading(true)
        const { data: ec } = await supabase
            .from('exam_classes')
            .select('id, class_id, classes ( class_id, program, semester, section )')
            .eq('exam_id', exam.exam_id)
        setExamClasses(ec || [])

        const { data: ps } = await supabase
            .from('exam_subjects')
            .select('id, class_id, subject_id, max_marks, pass_marks, subjects ( subject_name )')
            .eq('exam_id', exam.exam_id)
        setPapers(ps || [])
        setLoading(false)
    }

    async function loadPermission() {
        if (user?.role !== 'teacher') { setTeacherId(null); setCoordClassIds([]); return }
        const { data: teacher } = await supabase
            .from('teachers').select('teacher_id').eq('user_id', user.user_id).single()
        if (!teacher) { setTeacherId(null); setCoordClassIds([]); return }
        setTeacherId(teacher.teacher_id)
        const { data: cls } = await supabase
            .from('classes').select('class_id').eq('class_teacher_id', teacher.teacher_id)
        setCoordClassIds((cls || []).map((c) => String(c.class_id)))
    }

    // papers available for the chosen class
    const classPapers = papers.filter((p) => String(p.class_id) === String(classId))
    const selectedPaper = papers.find((p) => String(p.id) === String(paperId))

    // can the current user edit the selected class's scores?
    const canEdit = isAdmin || (classId && coordClassIds.includes(String(classId)))

    // when class changes, reset paper + sheet
    function handleClassChange(val) {
        setClassId(val)
        setPaperId('')
        setStudents([])
        setMarks({})
        setMessage(null)
    }

    async function handlePaperChange(val) {
        setPaperId(val)
        setMarks({})
        setStudents([])
        setMessage(null)
        if (!val) return
        await loadSheet(val)
    }

    async function loadSheet(paperIdVal) {
        setSheetLoading(true)
        // roster: students in this class
        const { data: roster } = await supabase
            .from('students')
            .select('student_id, name, roll_no')
            .eq('class_id', classId)
            .order('roll_no')
        setStudents(roster || [])

        // existing scores for this paper
        const { data: existing } = await supabase
            .from('exam_scores')
            .select('student_id, marks_obtained')
            .eq('exam_subject_id', paperIdVal)
        const map = {}
        for (const row of existing || []) {
            map[row.student_id] = String(row.marks_obtained)
        }
        setMarks(map)
        setSheetLoading(false)
    }

    function setMark(studentId, value) {
        setMarks((prev) => ({ ...prev, [studentId]: value }))
    }

    async function handleSaveAll() {
        setMessage(null)
        if (!selectedPaper) return
        const max = parseFloat(selectedPaper.max_marks)

        // build rows only for students with a non-empty mark; validate first
        const rows = []
        for (const s of students) {
            const raw = marks[s.student_id]
            if (raw === undefined || raw === '') continue
            const val = parseFloat(raw)
            if (Number.isNaN(val)) {
                setMessage({ type: 'err', text: `Invalid mark for ${s.name}.` }); return
            }
            if (val < 0 || val > max) {
                setMessage({ type: 'err', text: `${s.name}: marks must be between 0 and ${max}.` }); return
            }
            const row = {
                exam_subject_id: selectedPaper.id,
                student_id: s.student_id,
                marks_obtained: val,
            }
            if (teacherId) row.uploaded_by = teacherId
            rows.push(row)
        }

        if (rows.length === 0) {
            setMessage({ type: 'err', text: 'Enter at least one mark before saving.' }); return
        }

        setSaving(true)
        const { error } = await supabase
            .from('exam_scores')
            .upsert(rows, { onConflict: 'exam_subject_id,student_id' })
        setSaving(false)
        if (error) {
            setMessage({ type: 'err', text: 'Could not save scores: ' + error.message }); return
        }
        setMessage({ type: 'ok', text: `Saved ${rows.length} mark${rows.length === 1 ? '' : 's'}.` })
    }

    if (loading) {
        return <div className={styles.card}><div className={styles.cardBody}><div className={styles.empty}>Loading…</div></div></div>
    }

    return (
        <div className={styles.card}>
            <div className={styles.cardBody}>
                {/* pickers */}
                <div className={styles.scorePickers}>
                    <div className={styles.formRow}>
                        <label>Class</label>
                        <select value={classId} onChange={(e) => handleClassChange(e.target.value)}>
                            <option value="">Select class…</option>
                            {examClasses.map((ec) => (
                                <option key={ec.class_id} value={ec.class_id}>{classText(ec.classes)}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.formRow}>
                        <label>Subject</label>
                        <select value={paperId} onChange={(e) => handlePaperChange(e.target.value)} disabled={!classId}>
                            <option value="">
                                {!classId ? 'Pick a class first' : (classPapers.length ? 'Select subject…' : 'No subjects for this class')}
                            </option>
                            {classPapers.map((p) => (
                                <option key={p.id} value={p.id}>{p.subjects?.subject_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {message && (
                    <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                        {message.text}
                    </div>
                )}

                {/* sheet */}
                {!paperId ? (
                    <div className={styles.empty}>Pick a class and subject to enter marks.</div>
                ) : sheetLoading ? (
                    <div className={styles.empty}>Loading students…</div>
                ) : students.length === 0 ? (
                    <div className={styles.empty}>No students are enrolled in this class.</div>
                ) : (
                    <>
                        {!canEdit && (
                            <div className={styles.hint}>
                                You have read-only access. Only an admin or this class's coordinator can edit these marks.
                            </div>
                        )}
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>Roll no</th>
                                    <th>Student</th>
                                    <th>Marks (out of {selectedPaper?.max_marks})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((s) => (
                                    <tr key={s.student_id}>
                                        <td>{s.roll_no || '—'}</td>
                                        <td className={styles.strong}>{s.name}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className={styles.markInput}
                                                value={marks[s.student_id] ?? ''}
                                                onChange={(e) => setMark(s.student_id, e.target.value)}
                                                disabled={!canEdit}
                                                min="0"
                                                max={selectedPaper?.max_marks}
                                                placeholder="—"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {canEdit && (
                            <button className={styles.submitBtn} onClick={handleSaveAll} disabled={saving}>
                                {saving ? 'Saving…' : 'Save marks'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/* ======================================================================
   RESULTS VIEW  (whole-class result sheet: grid + per-subject summary)
   ====================================================================== */
function ResultsView({ exam, user, message, setMessage }) {
    const [examClasses, setExamClasses] = useState([])
    const [loading, setLoading] = useState(true)

    const [classId, setClassId] = useState('')
    const [papers, setPapers] = useState([])         // papers for chosen class
    const [students, setStudents] = useState([])     // roster for chosen class
    const [scores, setScores] = useState({})         // { `${paperId}:${studentId}`: marks }
    const [sheetLoading, setSheetLoading] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState(null)

    const isAdmin = user?.role === 'admin'

    useEffect(() => {
        loadClasses()
        // eslint-disable-next-line
    }, [exam.exam_id])

    async function loadClasses() {
        setLoading(true)
        // all classes in this exam
        const { data: ec } = await supabase
            .from('exam_classes')
            .select('id, class_id, classes ( class_id, program, semester, section )')
            .eq('exam_id', exam.exam_id)
        let visible = ec || []

        // teachers: restrict to coordinated classes
        if (user?.role === 'teacher') {
            const { data: teacher } = await supabase
                .from('teachers').select('teacher_id').eq('user_id', user.user_id).single()
            if (teacher) {
                const { data: cls } = await supabase
                    .from('classes').select('class_id').eq('class_teacher_id', teacher.teacher_id)
                const coord = (cls || []).map((c) => String(c.class_id))
                visible = visible.filter((e) => coord.includes(String(e.class_id)))
            } else {
                visible = []
            }
        }
        setExamClasses(visible)
        setLoading(false)
    }

    async function handleClassChange(val) {
        setClassId(val)
        setSelectedStudent(null)
        setPapers([])
        setStudents([])
        setScores({})
        setMessage(null)
        if (!val) return
        await loadSheet(val)
    }

    async function loadSheet(clsId) {
        setSheetLoading(true)

        const { data: ps } = await supabase
            .from('exam_subjects')
            .select('id, subject_id, max_marks, pass_marks, subjects ( subject_name )')
            .eq('exam_id', exam.exam_id)
            .eq('class_id', clsId)
            .order('exam_date')
        const paperList = ps || []
        setPapers(paperList)

        const { data: roster } = await supabase
            .from('students')
            .select('student_id, name, roll_no')
            .eq('class_id', clsId)
            .order('roll_no')
        setStudents(roster || [])

        // all scores for these papers, in one query
        const paperIds = paperList.map((p) => p.id)
        let scoreMap = {}
        if (paperIds.length) {
            const { data: sc } = await supabase
                .from('exam_scores')
                .select('exam_subject_id, student_id, marks_obtained')
                .in('exam_subject_id', paperIds)
            for (const row of sc || []) {
                scoreMap[`${row.exam_subject_id}:${row.student_id}`] = Number(row.marks_obtained)
            }
        }
        setScores(scoreMap)
        setSheetLoading(false)
    }

    function markFor(paperId, studentId) {
        const v = scores[`${paperId}:${studentId}`]
        return v === undefined ? null : v
    }

    // per-student overall status: 'pass' | 'fail' | 'incomplete'
    function studentStatus(studentId) {
        if (papers.length === 0) return 'incomplete'
        let anyMissing = false
        let anyFail = false
        for (const p of papers) {
            const m = markFor(p.id, studentId)
            if (m === null) { anyMissing = true; continue }
            const pass = p.pass_marks != null ? Number(p.pass_marks) : 0
            if (m < pass) anyFail = true
        }
        if (anyFail) return 'fail'
        if (anyMissing) return 'incomplete'
        return 'pass'
    }

    // per-student total of entered marks
    function studentTotal(studentId) {
        let total = 0
        for (const p of papers) {
            const m = markFor(p.id, studentId)
            if (m !== null) total += m
        }
        return total
    }

    // per-subject summary computed only over students who have a mark
    function subjectSummary(paper) {
        const pass = paper.pass_marks != null ? Number(paper.pass_marks) : 0
        let passed = 0, failed = 0, highest = null, sum = 0, count = 0
        for (const s of students) {
            const m = markFor(paper.id, s.student_id)
            if (m === null) continue
            count++
            sum += m
            if (highest === null || m > highest) highest = m
            if (m >= pass) passed++; else failed++
        }
        return {
            passed, failed,
            highest: highest === null ? '—' : highest,
            average: count ? (sum / count).toFixed(1) : '—',
        }
    }

    const statusDot = (status) => {
        const cls = status === 'pass' ? styles.dotPass
            : status === 'fail' ? styles.dotFail : styles.dotIncomplete
        return <span className={`${styles.statusDot} ${cls}`} />
    }

    if (loading) {
        return <div className={styles.card}><div className={styles.cardBody}><div className={styles.empty}>Loading…</div></div></div>
    }

    return (
        <div className={styles.card}>
            <div className={styles.cardBody}>
                <div className={styles.formRow}>
                    <label>Class</label>
                    <select value={classId} onChange={(e) => handleClassChange(e.target.value)}>
                        <option value="">
                            {examClasses.length ? 'Select class…' : 'No classes available to you'}
                        </option>
                        {examClasses.map((ec) => (
                            <option key={ec.class_id} value={ec.class_id}>{classText(ec.classes)}</option>
                        ))}
                    </select>
                </div>

                {message && (
                    <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
                        {message.text}
                    </div>
                )}

                {!classId ? (
                    <div className={styles.empty}>Pick a class to view its result sheet.</div>
                ) : sheetLoading ? (
                    <div className={styles.empty}>Loading result sheet…</div>
                ) : papers.length === 0 ? (
                    <div className={styles.empty}>No subjects scheduled for this class.</div>
                ) : students.length === 0 ? (
                    <div className={styles.empty}>No students enrolled in this class.</div>
                ) : (
                    <>
                        {/* legend */}
                        <div className={styles.legend}>
                            <span>{statusDot('pass')} Passed all</span>
                            <span>{statusDot('fail')} Failed a subject</span>
                            <span>{statusDot('incomplete')} Incomplete</span>
                        </div>

                        <div className={styles.resultScroll}>
                            <table className={styles.resultTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.stickyCol}>Student</th>
                                        {papers.map((p) => (
                                            <th key={p.id} title={`Pass ${p.pass_marks ?? '—'} / Max ${p.max_marks}`}>
                                                {p.subjects?.subject_name}
                                                <span className={styles.thSub}>/{p.max_marks}</span>
                                            </th>
                                        ))}
                                        <th>Total</th>
                                        <th>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((s) => {
                                        const status = studentStatus(s.student_id)
                                        const isSel = String(selectedStudent) === String(s.student_id)
                                        return (
                                            <tr
                                                key={s.student_id}
                                                className={isSel ? styles.rowSelected : ''}
                                                onClick={() => setSelectedStudent(isSel ? null : s.student_id)}
                                            >
                                                <td className={styles.stickyCol}>
                                                    <span className={styles.rollNo}>{s.roll_no || '—'}</span> {s.name}
                                                </td>
                                                {papers.map((p) => {
                                                    const m = markFor(p.id, s.student_id)
                                                    if (m === null) return <td key={p.id} className={styles.blankCell}>—</td>
                                                    const pass = p.pass_marks != null ? Number(p.pass_marks) : 0
                                                    const failed = m < pass
                                                    return (
                                                        <td key={p.id} className={failed ? styles.cellFail : styles.cellPass}>
                                                            {m}
                                                        </td>
                                                    )
                                                })}
                                                <td className={styles.strong}>{studentTotal(s.student_id)}</td>
                                                <td>{statusDot(status)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className={styles.summaryRow}>
                                        <td className={styles.stickyCol}>Passed / Failed</td>
                                        {papers.map((p) => {
                                            const sum = subjectSummary(p)
                                            return <td key={p.id}>{sum.passed} / {sum.failed}</td>
                                        })}
                                        <td colSpan={2}></td>
                                    </tr>
                                    <tr className={styles.summaryRow}>
                                        <td className={styles.stickyCol}>Highest</td>
                                        {papers.map((p) => <td key={p.id}>{subjectSummary(p).highest}</td>)}
                                        <td colSpan={2}></td>
                                    </tr>
                                    <tr className={styles.summaryRow}>
                                        <td className={styles.stickyCol}>Average</td>
                                        {papers.map((p) => <td key={p.id}>{subjectSummary(p).average}</td>)}
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default Exams