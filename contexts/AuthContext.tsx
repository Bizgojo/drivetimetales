'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, User, getUserProfile } from '@/lib/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, firstName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from our users table
  const fetchUserProfile = async (userId: string) => {
    try {
      const profile = await getUserProfile(userId);
      setUser(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, firstName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: firstName,
        },
      },
    });

    if (!error && data.user) {
      // Create user profile in our users table
      await supabase.from('users').insert({
        id: data.user.id,
        email: data.user.email,
        display_name: firstName,
        credits: 2, // Free credits for new users
        subscription_type: 'free',
      });
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const refreshCredits = async () => {
    if (session?.user) {
      await fetchUserProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        refreshCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook for checking if user has unlimited credits (Road Warrior plan)
export function useHasUnlimitedCredits() {
  const { user } = useAuth();
  return user?.subscription_type === 'road_warrior';
}

// Hook for checking if user can afford a story
export function useCanAfford(credits: number) {
  const { user } = useAuth();
  if (!user) return false;
  if (user.subscription_type === 'road_warrior') return true;
  return user.credits >= credits;
}
