import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "../api";
import type { UserRole } from "../types";

interface AuthState {
  token: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
  userId: string | null;
  userRole: UserRole | null;
}

interface AuthCtx extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = localStorage.getItem("sievege_auth");
    const s = saved
      ? JSON.parse(saved)
      : { token: null, hospitalId: null, hospitalName: null, userId: null, userRole: null };
    api.setToken(s.token);
    return s;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.setToken(state.token);
    if (state.token) {
      localStorage.setItem("sievege_auth", JSON.stringify(state));
    } else {
      localStorage.removeItem("sievege_auth");
    }
  }, [state]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setState({
        token: res.token,
        hospitalId: res.hospital_id,
        hospitalName: res.name,
        userId: res.user_id || null,
        userRole: (res.role as UserRole) || null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.register(name, email, password);
      setState({
        token: res.api_key,
        hospitalId: res.hospital_id,
        hospitalName: res.name,
        userId: null,
        userRole: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, hospitalId: null, hospitalName: null, userId: null, userRole: null });
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!state.userRole) return false;
      return roles.includes(state.userRole);
    },
    [state.userRole]
  );

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, loading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
