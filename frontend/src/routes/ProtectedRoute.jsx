import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRemoteConfig } from '../remote/RemoteConfigContext';

export default function ProtectedRoute({ children, roles = [] }) {
  const { isAuthenticated, user } = useAuth();
  const { loading, maintenanceMode, updateLevel } = useRemoteConfig();

  if (loading) {
    return <div style={{ padding: 24 }}>Sistem bilgileri yukleniyor...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (updateLevel === 'force') {
    return <Navigate to="/update-required" replace />;
  }
  if (maintenanceMode && user?.rol !== 'Yonetici') {
    return <div style={{ padding: 24 }}>Sistem bakim modunda. Lutfen daha sonra tekrar deneyin.</div>;
  }

  if (roles.length > 0 && !roles.includes(user?.rol)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

