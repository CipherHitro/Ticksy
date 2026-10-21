import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, UserRole } from '../types';
import { getCurrentUser, loginUser, logoutUser, registerUser } from './api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  register: (name: string, email: string, pass: string, role: UserRole) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  quickLogin: (role: UserRole) => Promise<void>;
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('ticksy_cached_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('ticksy_access_token');
  });
  const [loading, setLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    if (token && !user) {
      getCurrentUser().then(res => {
        if (res.success && res.data) {
          setUser(res.data);
          localStorage.setItem('ticksy_cached_user', JSON.stringify(res.data));
        }
      });
    }
  }, [token, user]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    const res = await loginUser(email, pass);
    setLoading(false);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('ticksy_cached_user', JSON.stringify(res.data.user));
      setIsAuthModalOpen(false);
      return { success: true };
    }
    return { success: false, message: res.message || 'Login failed' };
  };

  const register = async (name: string, email: string, pass: string, role: UserRole) => {
    setLoading(true);
    const res = await registerUser(name, email, pass, role);
    setLoading(false);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('ticksy_cached_user', JSON.stringify(res.data.user));
      setIsAuthModalOpen(false);
      return { success: true };
    }
    return { success: false, message: res.message || 'Registration failed' };
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setToken(null);
  };

  const quickLogin = async (role: UserRole) => {
    const roleCreds: Record<UserRole, { email: string; pass: string }> = {
      ATTENDEE: { email: 'attendee@ticksy.com', pass: 'Attendee123!' },
      ORGANIZER: { email: 'organizer@ticksy.com', pass: 'Organizer123!' },
      ADMIN: { email: 'admin@ticksy.com', pass: 'Admin123!' },
    };
    const target = roleCreds[role];
    setLoading(true);
    const res = await loginUser(target.email, target.pass);
    setLoading(false);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('ticksy_cached_user', JSON.stringify(res.data.user));
      setIsAuthModalOpen(false);
    }
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        quickLogin,
        openAuthModal,
        closeAuthModal,
        isAuthModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
