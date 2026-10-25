import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext'
import s from './StudyMaterials.module.css'

const TYPES = ['Notes', 'Assignment', 'Question Paper', 'Reference Material']
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg']

function classLabel(c) {
  if (!c) return 'Class'
  return [c.program, c.semester ? `Sem ${c.semester}` : null, c.section].filter(Boolean).join(' · ')
}
function extension(name = '') { return name.split('.').pop().toLowerCase() }
function prettyDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function StudyMaterials() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [form, setForm] = useState({ title: '', description: '', class_id: '', subject_id: '', material_type: 'Notes', file: null })

  useEffect(() => { loadPage() }, [user?.teacher_id])

  async function loadPage() {
    if (!user?.teacher_id) {
      setError('Your teacher profile is not linked to this account. Please sign in again or contact the administrator.')
      setLoading(false)
      return
    }
    setLoading(true); setError('')
    const { data: assigned, error: assignError } = await supabase
      .from('teacher_subject_class')
      .select('id, teacher_id, subject_id, class_id, subjects(subject_id, subject_name), classes(class_id, program, semester, section, academic_year)')
      .eq('teacher_id', user.teacher_id)
      .order('id')
    if (assignError) {
      setError(`Could not load your class/subject assignments: ${assignError.message}`)
      setLoading(false); return
    }
    setAssignments(assigned || [])
    const { data: rows, error: materialError } = await supabase
      .from('study_materials')
      .select('id, title, description, class_id, subject_id, teacher_id, material_type, file_name, file_path, file_type, created_at, classes(program, semester, section), subjects(subject_name)')
      .eq('teacher_id', user.teacher_id)
      .order('created_at', { ascending: false })
    if (materialError) setError(`Could not load materials: ${materialError.message}`)
    else setMaterials(rows || [])
    setLoading(false)
  }

  const uniqueClasses = useMemo(() => {
    const map = new Map()
    assignments.forEach(a => { if (a.classes) map.set(String(a.class_id), a.classes) })
    return [...map.entries()].map(([id, c]) => ({ ...c, class_id: id }))
  }, [assignments])

  const availableSubjects = useMemo(() => {
    const map = new Map()
    assignments.filter(a => !form.class_id || String(a.class_id) === String(form.class_id)).forEach(a => {
      if (a.subjects) map.set(String(a.subject_id), a.subjects)
    })
    return [...map.entries()].map(([id, sub]) => ({ ...sub, subject_id: id }))
  }, [assignments, form.class_id])

  const visibleMaterials = useMemo(() => materials.filter(m => {
    const q = search.trim().toLowerCase()
    return (!q || m.title.toLowerCase().includes(q) || (m.file_name || '').toLowerCase().includes(q))
      && (!typeFilter || m.material_type === typeFilter)
      && (!classFilter || String(m.class_id) === classFilter)
      && (!subjectFilter || String(m.subject_id) === subjectFilter)
  }), [materials, search, typeFilter, classFilter, subjectFilter])

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value, ...(key === 'class_id' ? { subject_id: '' } : {}) }))
  }
  function resetForm() {
    setForm({ title: '', description: '', class_id: '', subject_id: '', material_type: 'Notes', file: null })
    setShowForm(false); setError('')
  }

  async function uploadMaterial(e) {
    e.preventDefault(); setError(''); setNotice('')
    if (!form.title.trim() || !form.class_id || !form.subject_id || !form.file) {
      setError('Please complete the title, class, subject, and file fields.'); return
    }
    const ext = extension(form.file.name)
    if (!ALLOWED_EXT.includes(ext)) {
      setError('Unsupported file type. Upload PDF, DOC, DOCX, PPT, PPTX, PNG, JPG, or JPEG.'); return
    }
    if (form.file.size > MAX_BYTES) { setError('File size must be 10 MB or less.'); return }
    const isAssigned = assignments.some(a => String(a.class_id) === form.class_id && String(a.subject_id) === form.subject_id)
    if (!isAssigned) { setError('That class and subject are not assigned to your teacher profile.'); return }

    setSaving(true)
    const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.teacher_id}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('study-materials').upload(path, form.file, {
      contentType: form.file.type || undefined,
      upsert: false,
    })
    if (uploadError) {
      setSaving(false); setError(`File upload failed: ${uploadError.message}`); return
    }

    const { error: insertError } = await supabase.from('study_materials').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      class_id: Number(form.class_id),
      subject_id: Number(form.subject_id),
      teacher_id: user.teacher_id,
      material_type: form.material_type,
      file_name: form.file.name,
      file_path: path,
      file_type: form.file.type || ext,
    })
    if (insertError) {
      // Keep the file in Storage if metadata insertion fails so the error can be investigated;
      // it is safer than deleting a file when the upload result may need manual recovery.
      setSaving(false); setError(`File uploaded, but saving its details failed: ${insertError.message}`); return
    }
    setSaving(false); setNotice('Study material uploaded successfully.'); resetForm()
    await loadPage()
  }

  async function openFile(material) {
    setError('');
    const { data, error: urlError } = await supabase.storage.from('study-materials').createSignedUrl(material.file_path, 60)
    if (urlError || !data?.signedUrl) {
      setError(`Could not open file: ${urlError?.message || 'No download URL returned'}. Check the Storage SELECT policy for this bucket.`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div><p className={s.eyebrow}>TEACHING RESOURCES</p><h1>Study Materials</h1><p className={s.subtitle}>Upload and organize resources for your assigned classes and subjects.</p></div>
        <button className={s.primaryButton} onClick={() => { setShowForm(v => !v); setError(''); setNotice('') }}>{showForm ? 'Close form' : '+ Upload Material'}</button>
      </div>

      {notice && <div className={s.success}>{notice}</div>}
      {error && <div className={s.error}>{error}</div>}

      {showForm && <form className={s.formCard} onSubmit={uploadMaterial}>
        <h2>Upload study material</h2>
        <div className={s.formGrid}>
          <label className={s.field}><span>Material title *</span><input value={form.title} onChange={e => updateForm('title', e.target.value)} maxLength={255} placeholder="e.g. Unit 1 Notes" /></label>
          <label className={s.field}><span>Material type *</span><select value={form.material_type} onChange={e => updateForm('material_type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className={s.field}><span>Class / Section *</span><select value={form.class_id} onChange={e => updateForm('class_id', e.target.value)}><option value="">Select class</option>{uniqueClasses.map(c => <option key={c.class_id} value={c.class_id}>{classLabel(c)}</option>)}</select></label>
          <label className={s.field}><span>Subject *</span><select value={form.subject_id} onChange={e => updateForm('subject_id', e.target.value)} disabled={!form.class_id}><option value="">Select subject</option>{availableSubjects.map(sub => <option key={sub.subject_id} value={sub.subject_id}>{sub.subject_name}</option>)}</select></label>
          <label className={`${s.field} ${s.fullWidth}`}><span>Description (optional)</span><textarea rows="3" value={form.description} onChange={e => updateForm('description', e.target.value)} placeholder="Briefly describe this material" /></label>
          <label className={`${s.field} ${s.fullWidth}`}><span>File * (max 10 MB)</span><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg" onChange={e => updateForm('file', e.target.files?.[0] || null)} />{form.file && <small>{form.file.name} · {(form.file.size / 1024 / 1024).toFixed(2)} MB</small>}</label>
        </div>
        <div className={s.formActions}><button type="button" className={s.secondaryButton} onClick={resetForm} disabled={saving}>Cancel</button><button type="submit" className={s.primaryButton} disabled={saving}>{saving ? 'Uploading…' : 'Upload Material'}</button></div>
      </form>}

      <section className={s.listCard}>
        <div className={s.listHeading}><div><h2>Your materials</h2><p>{visibleMaterials.length} material{visibleMaterials.length === 1 ? '' : 's'}</p></div><button className={s.secondaryButton} onClick={loadPage} disabled={loading}>Refresh</button></div>
        <div className={s.filters}>
          <input aria-label="Search materials" placeholder="Search title or file name" value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label="Filter by class" value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">All classes</option>{uniqueClasses.map(c => <option key={c.class_id} value={c.class_id}>{classLabel(c)}</option>)}</select>
          <select aria-label="Filter by subject" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}><option value="">All subjects</option>{[...new Map(assignments.filter(a => a.subjects).map(a => [String(a.subject_id), a.subjects])).entries()].map(([id, sub]) => <option key={id} value={id}>{sub.subject_name}</option>)}</select>
          <select aria-label="Filter by material type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        </div>
        {loading ? <div className={s.empty}>Loading study materials…</div> : visibleMaterials.length === 0 ? <div className={s.empty}><div className={s.emptyIcon}>📚</div><strong>No study materials found</strong><span>Upload a material or adjust your filters.</span></div> : <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Material</th><th>Class</th><th>Subject</th><th>Type</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>{visibleMaterials.map(m => <tr key={m.id}><td><div className={s.materialTitle}>{m.title}</div><div className={s.fileName}>{m.file_name}</div>{m.description && <div className={s.description}>{m.description}</div>}</td><td>{classLabel(m.classes)}</td><td>{m.subjects?.subject_name || '—'}</td><td><span className={s.badge}>{m.material_type}</span></td><td>{prettyDate(m.created_at)}</td><td><button className={s.linkButton} onClick={() => openFile(m)}>Open file</button></td></tr>)}</tbody></table></div>}
      </section>
      <p className={s.note}>Materials are saved to Supabase Storage and indexed in your study_materials table. File access depends on your Storage policies.</p>
    </div>
  )
}
