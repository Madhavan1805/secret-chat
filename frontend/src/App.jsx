import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useInRouterContext } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';
import Home from './Home';
import ChatView from './ChatView';
import CallManager from './CallManager';
import GlobalEvents from './GlobalEvents';
import { getToken } from './config';

// pages that need a logged-in user: no token -> back to the login page
function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/" replace />;
}

export default function App() {
  // If main.jsx already wraps <App /> in a router, don't add a second one.
  const alreadyInRouter = useInRouterContext();
  const Shell = alreadyInRouter ? React.Fragment : BrowserRouter;

  return (
    <Shell>
      <CallManager />
      <GlobalEvents />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/chat/:contactName" element={<RequireAuth><ChatView /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
