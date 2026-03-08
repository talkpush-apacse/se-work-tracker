import { createContext, useContext, useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

const GoogleAuthContext = createContext(null);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// localStorage helpers (same pattern as useStore.js)
const STORAGE_KEYS = {
  googleToken: 'gpt-google-token',
  gmailToken:  'gpt-gmail-token',
};

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function GoogleAuthProvider({ children }) {
  // Initialise from localStorage so tokens survive page refresh
  const [googleToken, setGoogleToken] = useState(() => load(STORAGE_KEYS.googleToken));
  const [gmailToken,  setGmailToken]  = useState(() => load(STORAGE_KEYS.gmailToken));

  // Persist to localStorage whenever tokens change
  useEffect(() => {
    if (googleToken) {
      save(STORAGE_KEYS.googleToken, googleToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.googleToken);
    }
  }, [googleToken]);

  useEffect(() => {
    if (gmailToken) {
      save(STORAGE_KEYS.gmailToken, gmailToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.gmailToken);
    }
  }, [gmailToken]);

  const logout      = () => setGoogleToken(null);
  const gmailLogout = () => setGmailToken(null);

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <GoogleAuthContext.Provider
        value={{ googleToken, setGoogleToken, logout, gmailToken, setGmailToken, gmailLogout }}
      >
        {children}
      </GoogleAuthContext.Provider>
    </GoogleOAuthProvider>
  );
}

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}
