import './index.css';
import { useWebSocket } from './hooks/useWebSocket';
import { Dashboard } from './components/Dashboard';

function App() {
  const {
    state, mqtt, heishamonOnline, wsConnected, lastUpdate,
    zigbeeDevices, zigbeeConnected,
  } = useWebSocket();

  return (
    <Dashboard
      state={state}
      mqtt={mqtt}
      heishamonOnline={heishamonOnline}
      wsConnected={wsConnected}
      lastUpdate={lastUpdate}
      zigbeeDevices={zigbeeDevices}
      zigbeeConnected={zigbeeConnected}
    />
  );
}

export default App;
