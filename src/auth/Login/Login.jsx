import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import styles from './Login.module.css'

function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async () => {
        setError('')
        setLoading(true)

        // Look up a user with this email + password (plain-text, demo only)
        const { data, error: dbError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single()

        setLoading(false)

        if (dbError || !data) {
            setError('Invalid email or password')
            return
        }
        if (!data.is_active) {
            setError('This account is disabled')
            return
        }

        login(data)          // save the user in context
        navigate('/')        // go to the dashboard
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.box}>
                <h1>School Management</h1>
                <p className={styles.subtitle}>Admin & Teacher Login</p>

                <label>Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.com"
                />

                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />

                {error && <div className={styles.error}>{error}</div>}

                <button onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </div>
        </div>
    )
}

export default Login
