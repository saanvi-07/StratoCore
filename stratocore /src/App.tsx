/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Registration } from './screens/Registration';
import { Login } from './screens/Login';
import { ServiceSelection } from './screens/ServiceSelection';
import { ServiceForm } from './screens/ServiceForm';
import { Export } from './screens/Export';
import { Profile } from './screens/Profile';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastNotification } from './components/ToastNotification';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        Loading...
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/register" replace />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/login" element={<Login />} />
            
            <Route element={<Layout />}>
              <Route element={<ProtectedRoute />}>
                <Route path="/select-service" element={<ServiceSelection />} />
                <Route path="/service/:type" element={<ServiceForm />} />
                <Route path="/export" element={<Export />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>
          </Routes>
        </HashRouter>
        <ToastNotification />
      </AuthProvider>
    </ErrorBoundary>
  );
}
