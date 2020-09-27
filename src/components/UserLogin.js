import React, { useState } from 'react'
import Modal from './Modal'

const UserLogin = ({ auth }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    auth()
      .signInWithEmailAndPassword(email, password)
      .catch((error) => {
        setError('Error signing in with password and email!')
        console.error('Error signing in with password and email', error)
      })
  }

  const googleAuth = () => auth().signInWithPopup(new auth.GoogleAuthProvider())

  return (
    <Modal>
      <h2>Login</h2>
      <div className="user-login">
        {error !== null && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field field-email">
            <input type="email" name="email" value={email} placeholder="Email Address" aria-label="Email" id="email" onChange={(e) => setEmail(e.currentTarget.value)} />
          </div>
          <div className="field field-email">
            <input type="password" name="password" value={password} placeholder="Password" aria-label="Password" id="password" onChange={(e) => setPassword(e.currentTarget.value)} />
          </div>
          <button type="submit">Sign in</button>
        </form>
        <p>or</p>
        <button className="google" onClick={googleAuth}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 118 120" className="icon">
            <g fill="none" fillRule="evenodd">
              <path fill="#4285F4" d="M117.6 61.4a69 69 0 00-1-12.3H60v23.2h32.3a27.6 27.6 0 01-12 18.1v15h19.4a58.5 58.5 0 0017.9-44z" />
              <path fill="#34A853" d="M60 120c16.2 0 29.8-5.4 39.7-14.5l-19.4-15a36 36 0 01-53.9-19.1h-20v15.5A60 60 0 0060 120z" />
              <path fill="#FBBC05" d="M26.4 71.4a36 36 0 010-22.8V33.1h-20a60 60 0 000 53.8l20-15.5z" />
              <path fill="#EA4335" d="M60 23.9c8.8 0 16.7 3 23 9L100 15.5A60 60 0 006.3 33l20.1 15.6A35.8 35.8 0 0160 23.9z" />
              <path d="M0 0h120v120H0V0z" />
            </g>
          </svg>
          Sign in with Google
        </button>
        <p className="small">
          Don't have an account? <a>Sign up here</a> <br /> <a>Forgot Password?</a>
        </p>
      </div>
    </Modal>
  )
}

export default UserLogin
