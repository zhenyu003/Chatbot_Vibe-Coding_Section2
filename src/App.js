import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeDownload from './components/YouTubeDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return localStorage.getItem('chatapp_user') || null;
    }
  });

  const [activeTab, setActiveTab] = useState('chat');

  const handleLogin = (userData) => {
    const payload =
      typeof userData === 'string'
        ? { username: userData, firstName: null, lastName: null }
        : userData;
    localStorage.setItem('chatapp_user', JSON.stringify(payload));
    setUser(payload);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
  };

  if (user) {
    const username = typeof user === 'string' ? user : user.username;
    return (
      <div className="app-authenticated">
        <nav className="app-tabs">
          <button
            className={activeTab === 'chat' ? 'active' : ''}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={activeTab === 'youtube' ? 'active' : ''}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </nav>
        {activeTab === 'chat' && (
          <div className="app-tab-content" style={{ flex: 1, overflow: 'hidden' }}>
            <Chat
              username={username}
              firstName={user.firstName}
              lastName={user.lastName}
              onLogout={handleLogout}
            />
          </div>
        )}
        {activeTab === 'youtube' && (
          <div className="app-tab-content" style={{ flex: 1, overflow: 'auto' }}>
            <YouTubeDownload />
          </div>
        )}
      </div>
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
