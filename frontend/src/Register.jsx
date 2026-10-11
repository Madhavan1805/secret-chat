import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BiUser, BiLock, BiEnvelope, BiPhone } from 'react-icons/bi';
import api from './api';
import AuthLayout, { Field, PasswordField, StrengthMeter, Alert, SubmitButton } from './AuthLayout';
import {
  validateUsername, validateEmail, validatePhone, validatePassword,
  passwordStrength, normalizePhone, apiErrors,
} from './auth';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [contactType, setContactType] = useState('email');     // 'email' | 'phone'
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [general, setGeneral] = useState('');
  const [serverErr, setServerErr] = useState({});
  const [avail, setAvail] = useState('idle');                  // idle | checking | free | taken

  const shown = (k) => touched[k] || submitted;
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const edit = (setter, ...keys) => (e) => {
    setter(e.target.value);
    if (keys.length) setServerErr((s) => { const n = { ...s }; keys.forEach((k) => delete n[k]); return n; });
  };

  // live "is this user ID free?" check, 0.45 s after the last key press
  useEffect(() => {
    const name = username.trim();
    if (validateUsername(name)) { setAvail('idle'); return undefined; }
    setAvail('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.get('auth/check/', { params: { username: name } });
        if (!cancelled) setAvail(res.data.username_taken ? 'taken' : 'free');
      } catch (e) {
        if (!cancelled) setAvail('idle');
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username]);

  // ---- messages
  const nameFormat = validateUsername(username);
  let nameMsg = 'Letters, numbers, dots and underscores. 3 to 30 characters.';
  let nameTone = '';
  if (serverErr.username) { nameMsg = serverErr.username; nameTone = 'err'; }
  else if (nameFormat && shown('username')) { nameMsg = nameFormat; nameTone = 'err'; }
  else if (!nameFormat && avail === 'taken') { nameMsg = 'This user ID is taken.'; nameTone = 'err'; }
  else if (!nameFormat && avail === 'free') { nameMsg = 'This user ID is available.'; nameTone = 'ok'; }
  else if (!nameFormat && avail === 'checking') { nameMsg = 'Checking...'; }

  const contactFormat = contactType === 'email' ? validateEmail(contact) : validatePhone(contact);
  const contactServer = serverErr.email || serverErr.phone_number || serverErr.contact || '';
  let contactMsg = contactType === 'email'
    ? 'We use it to send a code if you forget your password.'
    : "Use email if you want to reset a forgotten password. Codes aren't sent to mobile numbers yet.";
  let contactTone = '';
  if (contactServer) { contactMsg = contactServer; contactTone = 'err'; }
  else if (contactFormat && shown('contact')) { contactMsg = contactFormat; contactTone = 'err'; }

  const pwFormat = validatePassword(password);
  const strength = passwordStrength(password);
  let pwMsg = 'At least 8 characters, with letters and numbers.';
  let pwTone = '';
  if (serverErr.password) { pwMsg = serverErr.password; pwTone = 'err'; }
  else if (pwFormat && shown('password')) { pwMsg = pwFormat; pwTone = 'err'; }
  else if (password) { pwMsg = `Password strength: ${strength.label}`; }

  const confirmFormat = !confirm ? 'Enter your password again.' : (confirm !== password ? "Passwords don't match." : '');
  let confirmMsg = '';
  let confirmTone = '';
  if (serverErr.confirm_password) { confirmMsg = serverErr.confirm_password; confirmTone = 'err'; }
  else if (confirmFormat && shown('confirm')) { confirmMsg = confirmFormat; confirmTone = 'err'; }
  else if (confirm && confirm === password) { confirmMsg = 'Passwords match.'; confirmTone = 'ok'; }

  const switchContact = (type) => {
    setContactType(type);
    setContact('');
    setServerErr((s) => ({ ...s, email: '', phone_number: '', contact: '' }));
    setTouched((t) => ({ ...t, contact: false }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setGeneral('');
    setServerErr({});
    if (nameFormat || contactFormat || pwFormat || confirmFormat || avail === 'taken') return;

    setBusy(true);
    try {
      const body = { username: username.trim(), password, confirm_password: confirm };
      if (contactType === 'email') body.email = contact.trim();
      else body.phone_number = normalizePhone(contact);
      await api.post('auth/register/', body);
      navigate('/', { replace: true, state: { notice: 'Account created. Log in to continue.', identifier: username.trim() } });
    } catch (err) {
      const { fields, general: g } = apiErrors(err);
      setServerErr(fields);
      setGeneral(g);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Choose a user ID and add an email or mobile number, so you can get back in if you forget your password."
    >
      <form onSubmit={onSubmit} noValidate>
        {general && <Alert tone="err">{general}</Alert>}

        <Field
          id="reg-username"
          label="User ID"
          icon={BiUser}
          value={username}
          onChange={edit(setUsername, 'username')}
          onBlur={blur('username')}
          message={nameMsg}
          tone={nameTone}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
        />

        <div className="au-seg" role="group" aria-label="How should we reach you?">
          <button type="button" aria-pressed={contactType === 'email'} onClick={() => switchContact('email')}>Email</button>
          <button type="button" aria-pressed={contactType === 'phone'} onClick={() => switchContact('phone')}>Mobile number</button>
        </div>

        {contactType === 'email' ? (
          <Field
            id="reg-email"
            label="Email address"
            icon={BiEnvelope}
            type="email"
            inputMode="email"
            value={contact}
            onChange={edit(setContact, 'email', 'contact')}
            onBlur={blur('contact')}
            message={contactMsg}
            tone={contactTone}
            placeholder="you@gmail.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        ) : (
          <Field
            id="reg-phone"
            label="Mobile number"
            icon={BiPhone}
            type="tel"
            inputMode="tel"
            value={contact}
            onChange={edit(setContact, 'phone_number', 'contact')}
            onBlur={blur('contact')}
            message={contactMsg}
            tone={contactTone}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        )}

        <PasswordField
          id="reg-password"
          label="Password"
          icon={BiLock}
          value={password}
          onChange={edit(setPassword, 'password')}
          onBlur={blur('password')}
          message={pwMsg}
          tone={pwTone}
          autoComplete="new-password"
          show={showPw}
          onToggle={() => setShowPw((s) => !s)}
        >
          <StrengthMeter password={password} />
        </PasswordField>

        <PasswordField
          id="reg-confirm"
          label="Confirm password"
          icon={BiLock}
          value={confirm}
          onChange={edit(setConfirm, 'confirm_password')}
          onBlur={blur('confirm')}
          message={confirmMsg}
          tone={confirmTone}
          autoComplete="new-password"
          show={showPw}
          onToggle={() => setShowPw((s) => !s)}
        />

        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>

      <p className="au-alt">
        Already have an account? <Link className="au-link" to="/">Log in</Link>
      </p>
    </AuthLayout>
  );
}
