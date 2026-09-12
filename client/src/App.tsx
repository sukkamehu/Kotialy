import './index.css';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuth } from './hooks/useAuth';
import { Dashboard } from './components/Dashboard';
import { LoginView } from './components/LoginView';

function App() {
  const { isLocal, authenticated, username, role, loading, login, logout } = useAuth();
  const {
    state, mqtt, heishamonOnline, wsConnected, lastUpdate,
    zigbeeDevices, zigbeeConnected,
  } = useWebSocket();

  // If remote and unauthenticated, show login view
  if (!loading && !isLocal && !authenticated) {
    return <LoginView onLogin={login} />;
  }

  return (
    <Dashboard
      state={state}
      mqtt={mqtt}
      heishamonOnline={heishamonOnline}
      wsConnected={wsConnected}
      lastUpdate={lastUpdate}
      zigbeeDevices={zigbeeDevices}
      zigbeeConnected={zigbeeConnected}
      isLocal={isLocal}
      authenticated={authenticated}
      username={username}
      role={role}
      onLogout={logout}
    />
  );
}

export default App;

