import React, { createContext, useContext, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';

const RemoteConfigContext = createContext(null);

export function RemoteConfigProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    maintenanceMode: false,
    updateLevel: 'none',
    minSupportedVersion: '0.0.0',
    featureFlags: {},
    announcement: '',
  });

  const applyBootstrap = (payload = {}) => {
    const policy = payload.policy || {};
    setState((prev) => ({
      ...prev,
      loading: false,
      maintenanceMode: Boolean(policy.maintenance_mode),
      updateLevel: payload.update_level || 'none',
      minSupportedVersion: policy.min_supported_version || '0.0.0',
      featureFlags: policy.feature_flags || {},
      announcement: policy.announcement || '',
    }));
  };

  const initRemoteConfig = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/client/bootstrap?platform=web&app_version=1.0.0`);
      const data = await response.json();
      applyBootstrap(data);
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  const setRuntimeSignals = ({ forceUpdate, maintenance, minVersion }) => {
    setState((prev) => ({
      ...prev,
      updateLevel: forceUpdate ? 'force' : prev.updateLevel,
      maintenanceMode: maintenance ?? prev.maintenanceMode,
      minSupportedVersion: minVersion || prev.minSupportedVersion,
    }));
  };

  const value = useMemo(
    () => ({
      ...state,
      initRemoteConfig,
      setRuntimeSignals,
    }),
    [state]
  );

  return <RemoteConfigContext.Provider value={value}>{children}</RemoteConfigContext.Provider>;
}

export function useRemoteConfig() {
  const ctx = useContext(RemoteConfigContext);
  if (!ctx) {
    throw new Error('useRemoteConfig must be used within RemoteConfigProvider');
  }
  return ctx;
}
