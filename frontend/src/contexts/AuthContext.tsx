import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "../api";

interface AuthState {
  token: string | null;
  hospitalId: string | null;
  hospitalName: string | null;
}

interface AuthCtx extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = localStorage.getItem("sievege_auth");
    const s = saved ? JSON.parse(saved) : { token: null, hospitalId: null, hospitalName: null };
    // Set token synchronously so first render has it
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
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, hospitalId: null, hospitalName: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
