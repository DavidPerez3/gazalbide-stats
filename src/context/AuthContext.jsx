import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function init() {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      if (ignore) return;
      const currentUser = data?.user || null;
      setUser(currentUser);

      if (currentUser) {
        await loadOrCreateProfile(currentUser.id, currentUser.email || null);
      } else {
        setProfile(null);
      }

      setLoading(false);
    }

    init();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user || null;
      setUser(newUser);

      if (newUser) {
        loadOrCreateProfile(newUser.id, newUser.email || null);
      } else {
        setProfile(null);
      }
    });

    const subscription = data?.subscription;

    return () => {
      ignore = true;
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  async function loadOrCreateProfile(userId, email) {
    // 1) intentar leer perfil
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data && !error) {
      setProfile(data);
      return;
    }

    // 2) si no existe, crearlo
    const defaultUsername = email ? email.split("@")[0] : "gazal_user";

    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        email,
        username: defaultUsername,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Error creando profile:", insertError);
      return;
    }

    setProfile(inserted);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  const value = { user, profile, loading, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
