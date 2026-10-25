import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BiUser, BiLock } from 'react-icons/bi';
import api from './api';
import AuthLayout, { Field, PasswordField, Alert, SubmitButton } from './AuthLayout';
import { saveSession, dropSession, hasToken, apiErrors, sessionIsValid } from './auth';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState((location.state && location.state.identifier) || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notice = (location.state && location.state.notice) || '';
  const addMode = !!(location.state && location.state.addAccount);       // adding a second account from "Switch account"

  // already logged in? skip this page. A token that the server no longer accepts is thrown away.
  useEffect(() => {
    if (addMode || !hasToken()) return undefined;
    let live = true;
    sessionIsValid().then((ok) => {
      if (!live) return;
      if (ok === true) navigate('/home', { replace: true });
      else if (ok === false) dropSession();
    });
    return () => { live = false; };
  }, [navigate, addMode]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Enter your user ID and password.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('login/', { username: identifier.trim(), password });
      saveSession(res.data);
      if (addMode) window.location.assign('/home');       // reload so the whole app starts fresh as the new account
      else navigate('/home', { replace: true });
    } catch (err) {
      setError(apiErrors(err, 'Could not log in. Try again.').general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={addMode ? 'Add account' : 'Welcome back'} subtitle={addMode ? 'Log in to another Secret ID. Your current account stays saved on this phone.' : 'Log in with your user ID, email or mobile number.'}>
      <form onSubmit={onSubmit} noValidate>
        {notice && !error && <Alert tone="ok">{notice}</Alert>}
        {error && <Alert tone="err">{error}</Alert>}

        <Field
          id="login-id"
          label="User ID, email or mobile number"
          icon={BiUser}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <PasswordField
          id="login-password"
          label="Password"
          icon={BiLock}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          show={showPw}
          onToggle={() => setShowPw((s) => !s)}
          autoFocus={!!identifier}
        />
        <div className="au-row">
          <Link className="au-link" to="/forgot-password">Forgot password?</Link>
        </div>

        <SubmitButton busy={busy}>Log in</SubmitButton>
      </form>

      {addMode ? (
        <p className="au-alt"><Link className="au-link" to="/home" replace>Cancel</Link></p>
      ) : (
        <p className="au-alt">
          New here? <Link className="au-link" to="/register">Create an account</Link>
        </p>
      )}
    </AuthLayout>
  );
}
