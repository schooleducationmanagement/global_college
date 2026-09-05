import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import styles from './Substitutes.module.css'

// JS getDay(): 0=Sun,1=Mon... We map to the labels used in the timetable.
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Substitutes() {
    const { user } = useAuth()

    const [classes, setClasses] = useState([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [date, setDate] = useState('')

    const [slots, setSlots] = useState([])          // that day's scheduled class periods
    const [overrides, setOverrides] = useState([])  // existing overrides for that date
    const [teachers, setTeachers] = useState([])    // all teachers (any can cover)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        fetchClasses()
        fetchTeachers()
    }, [])

    async function fetchClasses() {
        const { data } = await supabase.from('classes').select('*').order('program')
        setClasses(data || [])
    }

    async function fetchTeachers() {
        const { data } = await supabase.from('teachers').select('teacher_id, name').order('name')
        setTeachers(data || [])
    }

    // The weekday label for the chosen date (e.g. "Mon")
    const weekday = date ? WEEKDAY[new Date(date + 'T00:00:00').getDay()] : null

    // Load the schedule + overrides whenever class or date changes
    useEffect(() => {
        if (selectedClassId && date) {
            loadDay()
        } else {
            setSlots([])
            setOverrides([])
        }
        // eslint-disable-next-line
    }, [selectedClassId, date])

    async function loadDay() {
        // that class's timetable slots for the weekday of this date
        const { data: slotData } = await supabase
            .from('timetable')
            .select('*, subjects ( subject_name ), teachers ( name )')
            .eq('class_id', selectedClassId)
            .eq('day_of_week', weekday)
            .order('period_no')
        setSlots(slotData || [])

        // overrides already set for this exact date, for these slots
        const slotIds = (slotData || []).map((s) => s.timetable_id)
        if (slotIds.length) {
            const { data: ovData } = await supabase
                .from('timetable_override')
                .select('*, teachers ( name )')
                .eq('date', date)
                .in('timetable_id', slotIds)
            setOverrides(ovData || [])
        } else {
            setOverrides([])
        }
    }

    function overrideFor(timetableId) {
        return overrides.find((o) => o.timetable_id === timetableId)
    }

    async function setSubstitute(slot, substituteTeacherId) {
        setBusy(true)
        const existing = overrideFor(slot.timetable_id)

        let error = null

        if (!substituteTeacherId) {
            // "Regular teacher" chosen → remove any override
            if (existing) {
                ({ error } = await supabase.from('timetable_override')
                    .delete().eq('override_id', existing.override_id))
            }
        } else if (existing) {
            // update existing override
            ({ error } = await supabase
                .from('timetable_override')
                .update({ substitute_teacher_id: substituteTeacherId })
                .eq('override_id', existing.override_id))
        } else {
            // create a new override.
            // Only set created_by when we actually have a valid user_id,
            // so a missing/mismatched id can't trip the created_by FK.
            const row = {
                timetable_id: slot.timetable_id,
                date: date,
                substitute_teacher_id: substituteTeacherId,
                reason: 'Teacher absent',
            }
            if (user?.user_id) row.created_by = user.user_id

                ; ({ error } = await supabase.from('timetable_override').insert(row))
        }

        setBusy(false)

        if (error) {
            // Surface the real reason instead of swallowing the 409
            window.alert(
                `Could not save substitute (${error.code || 'error'}): ${error.message}` +
                (error.details ? `\n${error.details}` : '')
            )
            return
        }

        loadDay()
    }

    async function clearSubstitute(slot) {
        const existing = overrideFor(slot.timetable_id)
        if (!existing) return
        setBusy(true)
        await supabase.from('timetable_override').delete().eq('override_id', existing.override_id)
        setBusy(false)
        loadDay()
    }

    return (
        <div>
            <div className={styles.header}>
                <h2>Substitute teachers</h2>
                <p>Assign a substitute for a specific date without changing the permanent timetable.</p>
            </div>

            <div className={styles.pickerBar}>
                <div className={styles.pickerGroup}>
                    <label>Class</label>
                    <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                        <option value="">Select a class</option>
                        {classes.map((c) => (
                            <option key={c.class_id} value={c.class_id}>
                                {c.program} · Sem {c.semester} · {c.section}
                            </option>
                        ))}
                    </select>
                </div>

                <div className={styles.pickerGroup}>
                    <label>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                {weekday && <span className={styles.weekdayTag}>{weekday}</span>}
            </div>

            {(!selectedClassId || !date) && (
                <div className={styles.placeholder}>Pick a class and a date to see that day's periods.</div>
            )}

            {selectedClassId && date && slots.length === 0 && (
                <div className={styles.placeholder}>
                    No periods scheduled for {weekday} in this class.
                </div>
            )}

            {selectedClassId && date && slots.length > 0 && (
                <div className={styles.card}>
                    <div className={styles.cardHead}>
                        <h3>{weekday}, {date} — {slots.length} period(s)</h3>
                    </div>

                    {slots.map((slot) => {
                        const ov = overrideFor(slot.timetable_id)
                        const isSub = !!ov
                        return (
                            <div key={slot.timetable_id} className={styles.row}>
                                <div className={styles.periodInfo}>
                                    <div className={styles.pName}>Period {slot.period_no}</div>
                                    <div className={styles.pTime}>
                                        {slot.start_time?.slice(0, 5)}–{slot.end_time?.slice(0, 5)}
                                    </div>
                                </div>

                                <div className={styles.subjTeacher}>
                                    <div className={styles.subj}>{slot.subjects?.subject_name}</div>
                                    <div className={`${styles.regular} ${isSub ? styles.regularStruck : ''}`}>
                                        {slot.teachers?.name}
                                    </div>
                                </div>

                                <div>
                                    <select
                                        className={`${styles.subSelect} ${isSub ? styles.subActive : ''}`}
                                        value={ov ? String(ov.substitute_teacher_id) : ''}
                                        onChange={(e) => setSubstitute(slot, e.target.value)}
                                        disabled={busy}
                                    >
                                        <option value="">Regular teacher</option>
                                        {teachers.map((t) => (
                                            <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <span className={`${styles.statusTag} ${isSub ? styles.statusSub : styles.statusNormal}`}>
                                        {isSub ? 'Substituted' : 'Normal'}
                                    </span>
                                    {isSub && (
                                        <button className={styles.clearBtn} onClick={() => clearSubstitute(slot)} disabled={busy}>
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default Substitutes