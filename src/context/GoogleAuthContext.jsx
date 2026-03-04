import { createContext, useContext, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

const GoogleAuthContext = createContext(null);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function GoogleAuthProvider({ children }) {
  const [googleToken, setGoogleToken] = useState(null);
  const [gmailToken,  setGmailToken]  = useState(null);
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
