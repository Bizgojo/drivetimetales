'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, User, getUserProfile } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
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
    console.log('[DTT Debug] AuthContext: fetchUserProfile() called for userId:', userId);
    try {
      const profile = await getUserProfile(userId);
      console.log('[DTT Debug] AuthContext: fetchUserProfile() SUCCESS:', profile?.email);
      setUser(profile);
    } catch (error) {
      console.error('[DTT Debug] AuthContext: fetchUserProfile() ERROR:', error);
      setUser(null);
    }
  };

  // Initialize auth state
  useEffect(() => {
    console.log('[DTT Debug] AuthContext: useEffect initializing...');
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[DTT Debug] AuthContext: getSession() result:', { 
        hasSession: !!session, 
        userId: session?.user?.id,
        error 
      });
      
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        console.log('[DTT Debug] AuthContext: No session, setting loading=false');
        setLoading(false);
      }
    }).catch(err => {
      console.error('[DTT Debug] AuthContext: getSession() EXCEPTION:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[DTT Debug] AuthContext: onAuthStateChange event:', event);
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
    console.log('[DTT Debug] AuthContext: signIn() called');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('[DTT Debug] AuthContext: signIn() ERROR:', error);
    } else {
      console.log('[DTT Debug] AuthContext: signIn() SUCCESS');
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    console.log('[DTT Debug] AuthContext: signUp() called');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      console.error('[DTT Debug] AuthContext: signUp() auth ERROR:', error);
    }

    if (!error && data.user) {
      console.log('[DTT Debug] AuthContext: signUp() creating user profile...');
      // Create user profile in our users table
      // DB columns: id, email, display_name, credits, subscription_type, subscription_ends_at, stripe_customer_id, stripe_subscription_id, created_at
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        email: data.user.email,
        display_name: displayName,
        credits: 2, // Free credits for new users - matches DB column name
        subscription_type: 'free',
      });
      
      if (insertError) {
        console.error('[DTT Debug] AuthContext: signUp() profile insert ERROR:', insertError);
      } else {
        console.log('[DTT Debug] AuthContext: signUp() profile created successfully');
      }
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    console.log('[DTT Debug] AuthContext: signOut() called');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const refreshCredits = async () => {
    console.log('[DTT Debug] AuthContext: refreshCredits() called');
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
// Uses user.credits which matches DB column name
export function useCanAfford(storyCredits: number) {
  const { user } = useAuth();
  if (!user) return false;
  if (user.subscription_type === 'road_warrior') return true;
  return user.credits >= storyCredits;
}
