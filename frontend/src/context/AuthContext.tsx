import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  userType: 'student' | 'freelancer' | 'client' | 'investor' | null;
  name: string;
  createdAt: string;
  verified?: boolean;
  level?: number;
  xp?: number;
  accessToken?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  login: (userData: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
  setUserType: (type: User['userType']) => Promise<void>;
  checkLockout: () => boolean;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Restore session from Supabase on app start
    supabase.auth.getSession().then(({ data: { session: restoredSession } }) => {
      if (restoredSession) {
        setSession(restoredSession);
        syncUserFromSession(restoredSession);
      } else {
        // Fallback: load from AsyncStorage
        loadCachedUser();
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          syncUserFromSession(newSession);
        } else {
          setUser(null);
          AsyncStorage.removeItem('user');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const syncUserFromSession = async (sess: Session) => {
    const supaUser = sess.user;
    const cachedData = await AsyncStorage.getItem('user');
    const cached = cachedData ? JSON.parse(cachedData) : {};

    const userData: User = {
      id: supaUser.id,
      email: supaUser.email || '',
      name: supaUser.user_metadata?.full_name
        || supaUser.user_metadata?.name
        || cached.name
        || supaUser.email?.split('@')[0]
        || 'User',
      userType: cached.userType || null,
      createdAt: supaUser.created_at || new Date().toISOString(),
      verified: cached.verified ?? false,
      level: cached.level ?? 1,
      xp: cached.xp ?? 0,
      accessToken: sess.access_token,
    };

    await AsyncStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const loadCachedUser = async () => {
    try {
      const data = await AsyncStorage.getItem('user');
      if (data) setUser(JSON.parse(data));
    } catch (e) {
      console.error('Error loading cached user:', e);
    }
  };

  const login = async (userData: Partial<User>) => {
    const newUser: User = {
      id: userData.id || Date.now().toString(),
      email: userData.email || '',
      userType: userData.userType || null,
      name: userData.name || 'User',
      createdAt: new Date().toISOString(),
      verified: userData.verified ?? false,
      level: userData.level ?? 1,
      xp: userData.xp ?? 0,
    };
    await AsyncStorage.setItem('user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem('user');
    setUser(null);
    setSession(null);
  };

  const setUserType = async (type: User['userType']) => {
    if (user) {
      const updated = { ...user, userType: type };
      await AsyncStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      await AsyncStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
    }
  };

  const checkLockout = () => {
    if (!user) return true;
    const hours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
    return hours < 72;
  };

  return (
    <AuthContext.Provider value={{ user, session, isAuthenticated: !!user?.userType, login, logout, setUserType, checkLockout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
