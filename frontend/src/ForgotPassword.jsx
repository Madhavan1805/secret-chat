import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BiUser, BiLock, BiKey } from 'react-icons/bi';
import api from './api';
import AuthLayout, { Field, PasswordField, StrengthMeter, Alert, SubmitButton } from './AuthLayout';
import { validatePassword, passwordStrength, apiErrors } from './auth';

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);                 // 1 = find account, 2 = code + new password
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [general, setGeneral] = useState('');
  const [notice, setNotice] = useState('');
  const [errs, setErrs] = useState({});
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const clear = (k) => setErrs((s) => { const n = { ...s }; delete n[k]; return n; });

  const sendCode = async (again = false) => {
    setGeneral('');
    if (!identifier.trim()) { setErrs({ identifier: 'Enter your user ID, email or mobile number.' }); return; }
    setBusy(true);
    try {
      await api.post('auth/forgot/', { identifier: identifier.trim() });
      setErrs({});
      setStep(2);
      setNotice(again
        ? 'We sent a new code. The old one no longer works.'
        : 'If an account matches, we sent a 6-digit code to it. The code expires in 10 minutes.');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setGeneral(apiErrors(err).general || 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onFind = (e) => { e.preventDefault(); sendCode(false); };

  const onReset = async (e) => {
    e.preventDefault();
    setGeneral('');
    const next = {};
    if (!/^\d{6}$/.test(otp.trim())) next.otp = 'Enter the 6-digit code.';
    const pwProblem = validatePassword(pw);
    if (pwProblem) next.new_password = pwProblem;
    if (!confirm) next.confirm_password = 'Enter your new password again.';
    else if (confirm !== pw) next.confirm_password = "Passwords don't match.";
    if (Object.keys(next).length) { setErrs(next); return; }

    setBusy(true);
    try {
      await api.post('auth/reset/', {
        identifier: identifier.trim(), otp: otp.trim(), new_password: pw, confirm_password: confirm,
      });
      navigate('/', { replace: true, state: { notice: 'Password changed. Log in with your new password.', identifier: identifier.trim() } });
    } catch (err) {
      const { fields, general: g } = apiErrors(err);
      setErrs(fields);
      setGeneral(g);
    } finally {
      setBusy(false);
    }
  };

  const strength = passwordStrength(pw);

  if (step === 1) {
    return (
      <AuthLayout title="Reset your password" subtitle="Enter your user ID, email or mobile number. We'll send a 6-digit code to the email on the account.">
        <form onSubmit={onFind} noValidate>
          {general && <Alert tone="err">{general}</Alert>}
          <Field
            id="fp-id"
            label="User ID, email or mobile number"
            icon={BiUser}
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); clear('identifier'); }}
            message={errs.identifier}
            tone={errs.identifier ? 'err' : ''}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <SubmitButton busy={busy}>Send code</SubmitButton>
        </form>
        <p className="au-alt">
          Remembered it? <Link className="au-link" to="/">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Enter the code from your email and choose a new password. Check your spam folder if it's missing.">
      <form onSubmit={onReset} noValidate>
        {general && <Alert tone="err">{general}</Alert>}
        {notice && !general && <Alert tone="ok">{notice}</Alert>}

        <Field
          id="fp-otp"
          label="6-digit code"
          icon={BiKey}
          value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); clear('otp'); }}
          message={errs.otp}
          tone={errs.otp ? 'err' : ''}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          autoFocus
        />
        <PasswordField
          id="fp-new"
          label="New password"
          icon={BiLock}
          value={pw}
          onChange={(e) => { setPw(e.target.value); clear('new_password'); }}
          message={errs.new_password || (pw ? `Password strength: ${strength.label}` : 'At least 8 characters, with letters and numbers.')}
          tone={errs.new_password ? 'err' : ''}
          autoComplete="new-password"
          show={showPw}
          onToggle={() => setShowPw((s) => !s)}
        >
          <StrengthMeter password={pw} />
        </PasswordField>
        <PasswordField
          id="fp-confirm"
          label="Confirm new password"
          icon={BiLock}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); clear('confirm_password'); }}
          message={errs.confirm_password || (confirm && confirm === pw ? 'Passwords match.' : '')}
          tone={errs.confirm_password ? 'err' : (confirm && confirm === pw ? 'ok' : '')}
          autoComplete="new-password"
          show={showPw}
          onToggle={() => setShowPw((s) => !s)}
        />

        <SubmitButton busy={busy}>Change password</SubmitButton>
      </form>

      <div className="au-split">
        <button type="button" className="au-link" disabled={cooldown > 0 || busy} onClick={() => sendCode(true)}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
        <button type="button" className="au-link" onClick={() => { setStep(1); setNotice(''); setGeneral(''); setErrs({}); setOtp(''); }}>
          Use a different account
        </button>
      </div>
    </AuthLayout>
  );
}
