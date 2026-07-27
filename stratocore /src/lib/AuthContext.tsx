import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  cityAddress: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginCustom: (profile: UserProfile) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (email: string) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snapshot: any = await Promise.race([
        getDocs(q),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as UserProfile;
      }
      return null;
    } catch (err: any) {
      console.warn("Firestore error in AuthContext, falling back to localStorage", err.message);
      const localUsers = JSON.parse(localStorage.getItem('users') || '[]');
      const user = localUsers.find((u: any) => u.email === email);
      if (user) {
        return { id: `local_${Date.now()}`, ...user } as UserProfile;
      }
      return null;
    }
  };

  const refreshUser = async () => {
    if (user?.email) {
      const updated = await fetchProfile(user.email);
      if (updated) {
        if (localStorage.getItem('customUser')) {
          localStorage.setItem('customUser', JSON.stringify(updated));
        }
        setUser(updated);
      }
    }
  };

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser && firebaseUser.email) {
            // Check if exists in DB
            let profile = await fetchProfile(firebaseUser.email);
            if (!profile) {
              // Create default profile for Google/Firebase authenticated user
              profile = {
                id: firebaseUser.uid || `goog_${Date.now()}`,
                name: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'Google User',
                email: firebaseUser.email,
                phone: firebaseUser.phoneNumber || '',
                country: 'India',
                state: 'Maharashtra',
                cityAddress: '',
              };
              localStorage.setItem('customUser', JSON.stringify(profile));
            }
            setUser(profile);
          } else {
            // Fallback to local storage for custom login
            const localUser = localStorage.getItem('customUser');
            if (localUser) {
              setUser(JSON.parse(localUser));
            } else {
              setUser(null);
            }
          }
        } catch (e) {
          console.warn("Auth listener inner error:", e);
        } finally {
          setLoading(false);
        }
      }, (err) => {
        console.warn("onAuthStateChanged error:", err);
        const localUser = localStorage.getItem('customUser');
        if (localUser) {
          try { setUser(JSON.parse(localUser)); } catch {}
        }
        setLoading(false);
      });
    } catch (err) {
      console.warn("onAuthStateChanged init error:", err);
      const localUser = localStorage.getItem('customUser');
      if (localUser) {
        try { setUser(JSON.parse(localUser)); } catch {}
      }
      setLoading(false);
    }
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const loginCustom = (profile: UserProfile) => {
    localStorage.setItem('customUser', JSON.stringify(profile));
    setUser(profile);
  };

  const logout = async () => {
    localStorage.removeItem('customUser');
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn("SignOut error:", err);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginCustom, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
