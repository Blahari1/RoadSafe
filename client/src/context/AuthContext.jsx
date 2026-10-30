import { useEffect, useState } from "react";
import AuthContext from "./authContextValue";
import api from "../services/api";
import { connectSocket, disconnectSocket } from "../socket";
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // No saved token means there is no session to restore.
  const [loading, setLoading] = useState(() =>
    Boolean(localStorage.getItem("roadSafeToken")),
  );

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = localStorage.getItem("roadSafeToken");

      if (!token) {
        return;
      }

      try {
        const response = await api.get("/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!cancelled) {
          setUser(response.data.user);
          connectSocket();
        }
      } catch {
        localStorage.removeItem("roadSafeToken");

        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);
const registerMechanic = async (formData) => {
  const response = await api.post("/mechanics/register", formData);

  localStorage.setItem("roadSafeToken", response.data.token);
  setUser(response.data.user);
  connectSocket();

  return response.data;
};
  const login = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    localStorage.setItem("roadSafeToken", response.data.token);
    setUser(response.data.user);
    connectSocket();

    return response.data;
  };

  const register = async (formData) => {
    const response = await api.post("/auth/register", formData);

    localStorage.setItem("roadSafeToken", response.data.token);
    setUser(response.data.user);
connectSocket();
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem("roadSafeToken");
    setUser(null);
    disconnectSocket();
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, registerMechanic, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
  
}
