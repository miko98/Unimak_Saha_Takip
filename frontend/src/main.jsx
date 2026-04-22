import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext'
import { installAuthFetchPatch } from './api/patchFetch'
import { RemoteConfigProvider, useRemoteConfig } from './remote/RemoteConfigContext'

function AppBootstrap() {
  const { initRemoteConfig, setRuntimeSignals } = useRemoteConfig()
  React.useEffect(() => {
    installAuthFetchPatch(setRuntimeSignals)
    initRemoteConfig()
  }, [initRemoteConfig, setRuntimeSignals])
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RemoteConfigProvider>
          <AppBootstrap />
        </RemoteConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
