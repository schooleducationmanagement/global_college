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
                // Refresh from the DB so the stored copy stays current.
                setUser(data)
                localStorage.setItem('user', JSON.stringify(data))
            }

            setLoading(false)
        }

        restore()
        return () => { cancelled = true }
    }, [])

    const login = (userData) => {
        setUser(userData)
        localStorage.setItem('user', JSON.stringify(userData))
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