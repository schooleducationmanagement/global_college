import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import s from './StudyMaterials.module.css'

const TYPES = ['Notes', 'Assignment', 'Question Paper', 'Reference Material']

function classLabel(c) {
  if (!c) return '—'
  return [c.program, c.semester ? `Sem ${c.semester}` : null, c.section].filter(Boolean).join(' · ')
}
function prettyDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AdminStudyMaterials() {
  const [materials, setMaterials] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { loadPage() }, [])

  async function loadPage() {
    setLoading(true); setError('')
    const [materialRes, classRes, subjectRes, teacherRes] = await Promise.all([
      supabase.from('study_materials')
        .select('id, title, description, class_id, subject_id, teacher_id, material_type, file_name, file_path, file_type, created_at, classes(class_id, program, semester, section, academic_year), subjects(subject_id, subject_name), teachers(teacher_id, name)')
        .order('created_at', { ascending: false }),
      supabase.from('classes').select('class_id, program, semester, section, academic_year').order('academic_year', { ascending: false }),
      supabase.from('subjects').select('subject_id, subject_name').order('subject_name'),
      supabase.from('teachers').select('teacher_id, name').order('name'),
    ])
    const firstError = materialRes.error || classRes.error || subjectRes.error || teacherRes.error
    if (firstError) setError(`Could not load study materials: ${firstError.message}`)
    setMaterials(materialRes.data || [])
    setClasses(classRes.data || [])
    setSubjects(subjectRes.data || [])
    setTeachers(teacherRes.data || [])
    setLoading(false)
  }

  const visibleMaterials = useMemo(() => materials.filter(m => {
    const q = search.trim().toLowerCase()
    return (!q || (m.title || '').toLowerCase().includes(q) || (m.file_name || '').toLowerCase().includes(q))
      && (!classFilter || String(m.class_id) === classFilter)
      && (!subjectFilter || String(m.subject_id) === subjectFilter)
      && (!teacherFilter || String(m.teacher_id) === teacherFilter)
      && (!typeFilter || m.material_type === typeFilter)
  }), [materials, search, classFilter, subjectFilter, teacherFilter, typeFilter])

  async function openFile(material) {
    setError(''); setNotice('')
    const { data, error: urlError } = await supabase.storage.from('study-materials').createSignedUrl(material.file_path, 60)
    if (urlError || !data?.signedUrl) {
      setError(`Could not open "${material.file_name}": ${urlError?.message || 'No download URL returned'}. Check the Storage SELECT policy and saved file path.`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteMaterial(material) {
    const confirmed = window.confirm(`Delete "${material.title}" and its uploaded file? This cannot be undone.`)
    if (!confirmed) return
    setBusyId(material.id); setError(''); setNotice('')
    const { error: storageError } = await supabase.storage.from('study-materials').remove([material.file_path])
    if (storageError) {
      setBusyId(null); setError(`Could not delete the stored file: ${storageError.message}`); return
    }
    const { error: rowError } = await supabase.from('study_materials').delete().eq('id', material.id)
    if (rowError) {
      setBusyId(null); setError(`The file was deleted, but its database record could not be deleted: ${rowError.message}`); return
    }
    setMaterials(prev => prev.filter(row => row.id !== material.id))
    setBusyId(null); setNotice('Study material deleted successfully.')
  }

  const total = materials.length

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div><p className={s.eyebrow}>ACADEMIC RESOURCES</p><h1>Study Materials</h1><p className={s.subtitle}>View and manage study materials uploaded by teachers across classes.</p></div>
        <button className={s.secondaryButton} onClick={loadPage} disabled={loading}>Refresh</button>
      </header>

      {notice && <div className={s.success}>{notice}</div>}
      {error && <div className={s.error}>{error}</div>}

      <div className={s.summaryRow}>
        <div className={s.summaryCard}><span>Total materials</span><strong>{total}</strong></div>
        <div className={s.summaryCard}><span>Matching filters</span><strong>{visibleMaterials.length}</strong></div>
      </div>

      <section className={s.listCard}>
        <div className={s.listHeading}><div><h2>All uploaded materials</h2><p>Filter resources by class, subject, type, or teacher.</p></div></div>
        <div className={s.filters}>
          <input aria-label="Search materials" placeholder="Search title or file name" value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label="Filter by class" value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">All classes</option>{classes.map(c => <option key={c.class_id} value={c.class_id}>{classLabel(c)}{c.academic_year ? ` · ${c.academic_year}` : ''}</option>)}</select>
          <select aria-label="Filter by subject" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}><option value="">All subjects</option>{subjects.map(sub => <option key={sub.subject_id} value={sub.subject_id}>{sub.subject_name}</option>)}</select>
          <select aria-label="Filter by type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All material types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <select aria-label="Filter by teacher" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}><option value="">All teachers</option>{teachers.map(t => <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>)}</select>
        </div>
        {loading ? <div className={s.empty}>Loading study materials…</div> : visibleMaterials.length === 0 ? <div className={s.empty}><div className={s.emptyIcon}>📚</div><strong>No study materials found</strong><span>Try changing your filters or check whether teachers have uploaded materials.</span></div> : <div className={s.tableWrap}>
          <table className={s.table}><thead><tr><th>Material</th><th>Class</th><th>Subject</th><th>Type</th><th>Uploaded by</th><th>Upload date</th><th>Actions</th></tr></thead>
            <tbody>{visibleMaterials.map(m => <tr key={m.id}>
              <td><div className={s.materialTitle}>{m.title}</div><div className={s.fileName}>{m.file_name}</div>{m.description && <div className={s.description}>{m.description}</div>}</td>
              <td>{classLabel(m.classes)}</td><td>{m.subjects?.subject_name || '—'}</td><td><span className={s.badge}>{m.material_type}</span></td><td>{m.teachers?.name || '—'}</td><td>{prettyDate(m.created_at)}</td>
              <td><div className={s.actions}><button className={s.linkButton} onClick={() => openFile(m)}>Open</button><button className={s.deleteButton} onClick={() => deleteMaterial(m)} disabled={busyId === m.id}>{busyId === m.id ? 'Deleting…' : 'Delete'}</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <p className={s.note}>Deleting a material removes its Storage file and database record. This action cannot be undone.</p>
    </div>
  )
}
