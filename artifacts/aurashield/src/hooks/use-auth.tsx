import { useState, useEffect } from "react";

export function useAuth() {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("aurashield_user");
    if (stored) {
      setUsername(stored);
    }
    setIsLoading(false);
  }, []);

  const login = (name: string) => {
    localStorage.setItem("aurashield_user", name);
    setUsername(name);
  };

  const logout = () => {
    localStorage.removeItem("aurashield_user");
    setUsername(null);
  };

  return { username, login, logout, isLoading };
}
