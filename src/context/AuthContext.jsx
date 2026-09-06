import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext()

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    // On first load, restore the saved login (if any) — but only trust it if
    // that user still exists (and is active) in the database. This prevents a
    // stale session (e.g. after a DB reseed) from carrying a user_id that no
    // longer exists, which otherwise fails every write with a foreign-key 409.
    useEffect(() => {
        let cancelled = false

        async function restore() {
            const saved = localStorage.getItem('user')
            if (!saved) {
                setLoading(false)
                return
            }

            let parsed
            try {
                parsed = JSON.parse(saved)
            } catch {
                localStorage.removeItem('user')
                setLoading(false)
                return
            }

            // Re-check this user against the DB.
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('user_id', parsed.user_id)
                .single()

            if (cancelled) return

            if (error || !data || !data.is_active) {
                // Gone or disabled → drop the stale session.
                localStorage.removeItem('user')
                setUser(null)
            } else {
                // For teachers, attach their profile (rank, department, teacher_id)
                // so pages can scope what they see by the hierarchy.
                const enriched = await attachTeacherProfile(data)
                setUser(enriched)
                localStorage.setItem('user', JSON.stringify(enriched))
            }

            setLoading(false)
        }

        restore()
        return () => { cancelled = true }
    }, [])

    // Look up the teacher row for a user and merge in rank/department/teacher_id.
    async function attachTeacherProfile(userRow) {
        if (userRow.role !== 'teacher') return userRow
        const { data: t } = await supabase
            .from('teachers')
            .select('teacher_id, name, rank, department')
            .eq('user_id', userRow.user_id)
            .single()
        if (!t) return userRow
        return {
            ...userRow,
            teacher_id: t.teacher_id,
            teacher_name: t.name,
            rank: t.rank || 'class_teacher',
            department: t.department || null,
        }
    }

    const login = async (userData) => {
        const enriched = await attachTeacherProfile(userData)
        setUser(enriched)
        localStorage.setItem('user', JSON.stringify(enriched))
        return enriched
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('user')
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}