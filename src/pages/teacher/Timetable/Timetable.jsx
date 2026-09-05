import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import styles from './Timetable.module.css'

const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DEFAULT_STRUCTURE = [
    { label: 'Period 1', type: 'class', period_no: 1, start_time: '09:00', end_time: '09:50' },
    { label: 'Period 2', type: 'class', period_no: 2, start_time: '09:50', end_time: '10:40' },
    { label: 'Break', type: 'break', period_no: null, start_time: '10:40', end_time: '11:00' },
    { label: 'Period 3', type: 'class', period_no: 3, start_time: '11:00', end_time: '11:50' },
    { label: 'Period 4', type: 'class', period_no: 4, start_time: '11:50', end_time: '12:40' },
    { label: 'Lunch', type: 'lunch', period_no: null, start_time: '12:40', end_time: '13:30' },
    { label: 'Period 5', type: 'class', period_no: 5, start_time: '13:30', end_time: '14:20' },
]

function Timetable() {
    const [classes, setClasses] = useState([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [selectedClass, setSelectedClass] = useState(null)

    const [periods, setPeriods] = useState([])
    const [days, setDays] = useState([])
    const [slots, setSlots] = useState([])
    const [subjects, setSubjects] = useState([])
    const [busy, setBusy] = useState(false)

    // cell popup
    const [editingCell, setEditingCell] = useState(null) // { day, periodNo }
    const [assignedTeachers, setAssignedTeachers] = useState([])
    const [pickSubject, setPickSubject] = useState('')
    const [pickTeacher, setPickTeacher] = useState('')
    const [cellMsg, setCellMsg] = useState('')

    // structure popup
    const [editingPeriod, setEditingPeriod] = useState(null)
    const [pLabel, setPLabel] = useState('')
    const [pType, setPType] = useState('class')
    const [pStart, setPStart] = useState('09:00')
    const [pEnd, setPEnd] = useState('09:50')

    // add-day popup
    const [addingDay, setAddingDay] = useState(false)
    const [newDayLabel, setNewDayLabel] = useState('')

    useEffect(() => { fetchClasses() }, [])

    async function fetchClasses() {
        const { data } = await supabase.from('classes').select('*').order('program')
        setClasses(data || [])
    }

    async function handleClassChange(classId) {
        setSelectedClassId(classId)
        if (!classId) {
            setSelectedClass(null); setPeriods([]); setDays([]); setSlots([]); setSubjects([])
            return
        }
        const cls = classes.find((c) => String(c.class_id) === String(classId))
        setSelectedClass(cls)
        await refresh(classId, cls)
    }

    async function refresh(classId, cls) {
        const { data: periodData } = await supabase
            .from('periods').select('*').eq('class_id', classId).order('sort_order')
        setPeriods(periodData || [])

        const { data: dayData } = await supabase
            .from('days').select('*').eq('class_id', classId).order('sort_order')
        setDays(dayData || [])

        const { data: slotData } = await supabase
            .from('timetable')
            .select('*, subjects ( subject_name ), teachers ( name )')
            .eq('class_id', classId)
        setSlots(slotData || [])

        const useCls = cls || selectedClass
        if (useCls) {
            const { data: subjData } = await supabase
                .from('subjects').select('*')
                .eq('program', useCls.program).eq('semester', useCls.semester)
                .order('subject_name')
            setSubjects(subjData || [])
        }
    }

    // Create default: both days and periods
    async function createDefaultStructure() {
        setBusy(true)
        const periodRows = DEFAULT_STRUCTURE.map((r, i) => ({ class_id: selectedClassId, ...r, sort_order: i + 1 }))
        const dayRows = DEFAULT_DAYS.map((d, i) => ({ class_id: selectedClassId, label: d, sort_order: i + 1 }))
        await supabase.from('periods').insert(periodRows)
        await supabase.from('days').insert(dayRows)
        setBusy(false)
        refresh(selectedClassId)
    }

    // ---------- DAY actions ----------

    async function addDay() {
        const label = newDayLabel.trim()
        if (!label) return
        setBusy(true)
        const nextOrder = days.length ? Math.max(...days.map((d) => d.sort_order)) + 1 : 1
        const { error } = await supabase.from('days').insert({
            class_id: selectedClassId, label, sort_order: nextOrder,
        })
        setBusy(false)
        if (error) { window.alert(error.message); return }
        setAddingDay(false); setNewDayLabel('')
        refresh(selectedClassId)
    }

    async function removeDay(day) {
        const filled = slots.filter((s) => s.day_of_week === day.label).length
        const warn = filled > 0
            ? `Remove ${day.label}? This will also delete ${filled} filled cell(s) on that day. This cannot be undone.`
            : `Remove ${day.label} from this class?`
        if (!window.confirm(warn)) return

        setBusy(true)
        // delete that day's timetable cells, then the day itself
        await supabase.from('timetable')
            .delete().eq('class_id', selectedClassId).eq('day_of_week', day.label)
        await supabase.from('days').delete().eq('day_id', day.day_id)
        setBusy(false)
        refresh(selectedClassId)
    }

    // ---------- PERIOD structure popup ----------

    function openNewPeriod(type) {
        setEditingPeriod('new')
        setPType(type); setPStart('00:00'); setPEnd('00:00')
        if (type === 'class') {
            const nos = periods.filter((p) => p.type === 'class' && p.period_no).map((p) => p.period_no)
            setPLabel(`Period ${nos.length ? Math.max(...nos) + 1 : 1}`)
        } else {
            setPLabel(type === 'break' ? 'Break' : 'Lunch')
        }
    }

    function openEditPeriod(p) {
        setEditingPeriod(p)
        setPLabel(p.label); setPType(p.type)
        setPStart(p.start_time?.slice(0, 5) || '00:00')
        setPEnd(p.end_time?.slice(0, 5) || '00:00')
    }

    function filledCountForPeriod(periodNo) {
        if (!periodNo) return 0
        return slots.filter((s) => s.period_no === periodNo).length
    }

    async function savePeriod() {
        setBusy(true)
        if (editingPeriod === 'new') {
            const nextOrder = periods.length ? Math.max(...periods.map((p) => p.sort_order)) + 1 : 1
            let periodNo = null
            if (pType === 'class') {
                const nos = periods.filter((p) => p.type === 'class' && p.period_no).map((p) => p.period_no)
                periodNo = nos.length ? Math.max(...nos) + 1 : 1
            }
            await supabase.from('periods').insert({
                class_id: selectedClassId, label: pLabel, type: pType, period_no: periodNo,
                start_time: pStart, end_time: pEnd, sort_order: nextOrder,
            })
        } else {
            const p = editingPeriod
            const convertingAway = p.type === 'class' && pType !== 'class'
            if (convertingAway && filledCountForPeriod(p.period_no) > 0) {
                await supabase.from('timetable')
                    .delete().eq('class_id', selectedClassId).eq('period_no', p.period_no)
            }
            await supabase.from('periods').update({
                label: pLabel, type: pType,
                period_no: pType === 'class' ? p.period_no : null,
                start_time: pStart, end_time: pEnd,
            }).eq('period_id', p.period_id)
            if (pType === 'class') {
                await supabase.from('timetable')
                    .update({ start_time: pStart, end_time: pEnd })
                    .eq('class_id', selectedClassId).eq('period_no', p.period_no)
            }
        }
        setBusy(false); setEditingPeriod(null); refresh(selectedClassId)
    }

    async function deletePeriod() {
        const p = editingPeriod
        const filled = filledCountForPeriod(p.period_no)
        const warn = filled > 0
            ? `This period has ${filled} filled cell(s). Deleting it will remove them. Continue?`
            : 'Delete this period column?'
        if (!window.confirm(warn)) return
        setBusy(true)
        if (p.type === 'class' && p.period_no) {
            await supabase.from('timetable')
                .delete().eq('class_id', selectedClassId).eq('period_no', p.period_no)
        }
        await supabase.from('periods').delete().eq('period_id', p.period_id)
        setBusy(false); setEditingPeriod(null); refresh(selectedClassId)
    }

    async function movePeriod(dir) {
        const p = editingPeriod
        const idx = periods.findIndex((x) => x.period_id === p.period_id)
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= periods.length) return

        // Build the new order by swapping the two items in the array
        const reordered = [...periods]
            ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

        setBusy(true)
        // Rewrite sort_order for every row (1,2,3...) so it's always clean
        for (let i = 0; i < reordered.length; i++) {
            await supabase
                .from('periods')
                .update({ sort_order: i + 1 })
                .eq('period_id', reordered[i].period_id)
        }
        setBusy(false)
        setEditingPeriod(null)
        await refresh(selectedClassId)
    }

    // ---------- CELL popup ----------

    function findSlot(dayLabel, periodNo) {
        return slots.find((s) => s.day_of_week === dayLabel && s.period_no === periodNo)
    }

    function openCell(dayLabel, periodNo) {
        const existing = findSlot(dayLabel, periodNo)
        setEditingCell({ day: dayLabel, periodNo })
        setCellMsg('')
        setPickSubject(existing ? String(existing.subject_id) : '')
        setAssignedTeachers([])
        setPickTeacher(existing ? String(existing.teacher_id) : '')
        if (existing) loadTeachers(existing.subject_id)
    }

    async function loadTeachers(subjectId) {
        if (!subjectId) { setAssignedTeachers([]); return }
        const { data } = await supabase
            .from('teacher_subject_class')
            .select('teachers ( teacher_id, name )')
            .eq('class_id', selectedClassId).eq('subject_id', subjectId)
        setAssignedTeachers((data || []).map((r) => r.teachers).filter(Boolean))
    }

    function onSubjectChange(id) { setPickSubject(id); setPickTeacher(''); loadTeachers(id) }

    async function saveCell() {
        setCellMsg('')
        if (!pickSubject || !pickTeacher) { setCellMsg('Choose both a subject and a teacher.'); return }
        setBusy(true)
        const existing = findSlot(editingCell.day, editingCell.periodNo)
        const periodRow = periods.find((p) => p.type === 'class' && p.period_no === editingCell.periodNo)
        if (existing) {
            await supabase.from('timetable')
                .update({ subject_id: pickSubject, teacher_id: pickTeacher })
                .eq('timetable_id', existing.timetable_id)
        } else {
            await supabase.from('timetable').insert({
                class_id: selectedClassId, subject_id: pickSubject, teacher_id: pickTeacher,
                day_of_week: editingCell.day, period_no: editingCell.periodNo,
                start_time: periodRow?.start_time || '00:00',
                end_time: periodRow?.end_time || '00:00',
                period_type: 'class',
            })
        }
        setBusy(false); setEditingCell(null); refresh(selectedClassId)
    }

    async function clearCell() {
        const existing = findSlot(editingCell.day, editingCell.periodNo)
        if (existing) await supabase.from('timetable').delete().eq('timetable_id', existing.timetable_id)
        setEditingCell(null); refresh(selectedClassId)
    }

    const periodIdx = editingPeriod && editingPeriod !== 'new'
        ? periods.findIndex((p) => p.period_id === editingPeriod.period_id)
        : -1

    return (
        <div>
            <div className={styles.header}>
                <h2>Timetable</h2>
                <p>Click a period header to edit it, a day (left) to remove it, or a cell to set subject and teacher.</p>
            </div>

            <div className={styles.pickerBar}>
                <label>Class</label>
                <select value={selectedClassId} onChange={(e) => handleClassChange(e.target.value)}>
                    <option value="">Select a class</option>
                    {classes.map((c) => (
                        <option key={c.class_id} value={c.class_id}>
                            {c.program} · Sem {c.semester} · {c.section}
                        </option>
                    ))}
                </select>
            </div>

            {!selectedClassId && (
                <div className={styles.placeholder}>Select a class above to begin.</div>
            )}

            {selectedClassId && (periods.length === 0 || days.length === 0) && (
                <div className={styles.placeholder}>
                    This class isn't set up yet.
                    <br />
                    <button className={styles.setupBtn} onClick={createDefaultStructure} disabled={busy}>
                        {busy ? 'Creating…' : 'Create default structure'}
                    </button>
                </div>
            )}

            {selectedClassId && periods.length > 0 && days.length > 0 && (
                <>
                    <div className={styles.gridWrap}>
                        <table className={styles.grid}>
                            <thead>
                                <tr>
                                    <th>Day</th>
                                    {periods.map((p) => (
                                        <th
                                            key={p.period_id}
                                            className={`${styles.periodHeader} ${p.type !== 'class' ? styles.breakHeader : ''}`}
                                            onClick={() => openEditPeriod(p)}
                                            title="Edit this period"
                                        >
                                            <div className={styles.periodHeaderInner}>
                                                <span className={styles.periodHeaderLabel}>{p.label}</span>
                                                <span className={styles.periodHeaderTime}>
                                                    {p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((day) => (
                                    <tr key={day.day_id}>
                                        <td className={styles.dayCellClickable} onClick={() => removeDay(day)} title="Remove this day">
                                            <div className={styles.dayName}>{day.label}</div>
                                            <div className={styles.dayHint}>remove</div>
                                        </td>
                                        {periods.map((p) => {
                                            if (p.type !== 'class') {
                                                return <td key={p.period_id} className={styles.breakColCell}>·</td>
                                            }
                                            const slot = findSlot(day.label, p.period_no)
                                            return (
                                                <td
                                                    key={p.period_id}
                                                    className={`${styles.slot} ${slot ? styles.slotFilled : ''}`}
                                                    onClick={() => openCell(day.label, p.period_no)}
                                                >
                                                    {slot ? (
                                                        <>
                                                            <div className={styles.slotSubject}>{slot.subjects?.subject_name}</div>
                                                            <div className={styles.slotTeacher}>{slot.teachers?.name}</div>
                                                        </>
                                                    ) : (
                                                        <div className={styles.slotEmpty}>+</div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.addRowBar}>
                        <button className={styles.addBtn} onClick={() => setAddingDay(true)}>+ Day</button>
                        <button className={styles.addBtn} onClick={() => openNewPeriod('class')}>+ Period</button>
                        <button className={styles.addBtn} onClick={() => openNewPeriod('break')}>+ Break</button>
                        <button className={styles.addBtn} onClick={() => openNewPeriod('lunch')}>+ Lunch</button>
                    </div>
                </>
            )}

            {/* ADD DAY POPUP */}
            {addingDay && (
                <div className={styles.overlay} onClick={() => setAddingDay(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHead}><h3>Add day</h3></div>
                        <div className={styles.modalBody}>
                            <label>Day label</label>
                            <input
                                className={styles.modalInput}
                                value={newDayLabel}
                                onChange={(e) => setNewDayLabel(e.target.value)}
                                placeholder="e.g. Sun"
                                onKeyDown={(e) => e.key === 'Enter' && addDay()}
                            />
                        </div>
                        <div className={styles.modalFoot}>
                            <button className={styles.btnPrimary} onClick={addDay} disabled={busy}>
                                {busy ? 'Adding…' : 'Add day'}
                            </button>
                            <button className={styles.btnGhost} onClick={() => setAddingDay(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* STRUCTURE POPUP */}
            {editingPeriod && (
                <div className={styles.overlay} onClick={() => setEditingPeriod(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHead}>
                            <h3>{editingPeriod === 'new' ? 'Add column' : 'Edit period'}</h3>
                            <p>{selectedClass?.program} · Sem {selectedClass?.semester} · {selectedClass?.section}</p>
                        </div>
                        <div className={styles.modalBody}>
                            <label>Type</label>
                            <div className={styles.typeRow}>
                                {['class', 'break', 'lunch'].map((t) => (
                                    <div key={t}
                                        className={`${styles.typeOption} ${pType === t ? styles.typeOptionActive : ''}`}
                                        onClick={() => setPType(t)}>
                                        {t === 'class' ? 'Period' : t.charAt(0).toUpperCase() + t.slice(1)}
                                    </div>
                                ))}
                            </div>

                            <label>Label</label>
                            <input className={styles.modalInput} value={pLabel} onChange={(e) => setPLabel(e.target.value)} />

                            <div className={styles.timeRow}>
                                <div>
                                    <label>Start</label>
                                    <input className={styles.modalInput} type="time" value={pStart} onChange={(e) => setPStart(e.target.value)} />
                                </div>
                                <div>
                                    <label>End</label>
                                    <input className={styles.modalInput} type="time" value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
                                </div>
                            </div>

                            {editingPeriod !== 'new' && (
                                <>
                                    <label>Reorder</label>
                                    <div className={styles.orderControls}>
                                        <button onClick={() => movePeriod('up')} disabled={periodIdx <= 0}>◀ Move left</button>
                                        <button onClick={() => movePeriod('down')} disabled={periodIdx === periods.length - 1}>Move right ▶</button>
                                    </div>
                                </>
                            )}

                            {editingPeriod !== 'new' && editingPeriod.type === 'class' &&
                                pType !== 'class' && filledCountForPeriod(editingPeriod.period_no) > 0 && (
                                    <div className={styles.warnText}>
                                        Changing this to {pType} will remove {filledCountForPeriod(editingPeriod.period_no)} filled cell(s).
                                    </div>
                                )}
                        </div>
                        <div className={styles.modalFoot}>
                            <button className={styles.btnPrimary} onClick={savePeriod} disabled={busy}>
                                {busy ? 'Saving…' : 'Save'}
                            </button>
                            {editingPeriod !== 'new' && (
                                <button className={styles.btnClear} onClick={deletePeriod}>Delete</button>
                            )}
                            <button className={styles.btnGhost} onClick={() => setEditingPeriod(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CELL POPUP */}
            {editingCell && (
                <div className={styles.overlay} onClick={() => setEditingCell(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHead}>
                            <h3>{editingCell.day} · Period {editingCell.periodNo}</h3>
                            <p>{selectedClass?.program} · Sem {selectedClass?.semester} · {selectedClass?.section}</p>
                        </div>
                        <div className={styles.modalBody}>
                            <label>Subject</label>
                            <select value={pickSubject} onChange={(e) => onSubjectChange(e.target.value)}>
                                <option value="">Select a subject</option>
                                {subjects.map((s) => (
                                    <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
                                ))}
                            </select>

                            <label>Teacher</label>
                            <select value={pickTeacher} onChange={(e) => setPickTeacher(e.target.value)} disabled={!pickSubject}>
                                <option value="">{!pickSubject ? 'Pick a subject first' : 'Select a teacher'}</option>
                                {assignedTeachers.map((t) => (
                                    <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>
                                ))}
                            </select>

                            {pickSubject && assignedTeachers.length === 0 && (
                                <div className={styles.modalMsg}>
                                    No teacher is assigned this subject for this class. Add one in Teacher Assignments.
                                </div>
                            )}
                            {cellMsg && <div className={styles.modalMsg}>{cellMsg}</div>}
                        </div>
                        <div className={styles.modalFoot}>
                            <button className={styles.btnPrimary} onClick={saveCell} disabled={busy}>
                                {busy ? 'Saving…' : 'Save'}
                            </button>
                            {findSlot(editingCell.day, editingCell.periodNo) && (
                                <button className={styles.btnClear} onClick={clearCell}>Clear</button>
                            )}
                            <button className={styles.btnGhost} onClick={() => setEditingCell(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Timetable