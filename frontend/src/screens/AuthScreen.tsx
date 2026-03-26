import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Required for Expo web browser auth to work properly
WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen({ navigation }: any) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleAuth = async (provider: 'github' | 'google') => {
    setLoading(true);
    setLoadingProvider(provider);
    try {
      // Create redirect URI - this must match what's configured in Supabase
      const redirectTo = AuthSession.makeRedirectUri({
        scheme: 'zorbyo',
        path: 'auth/callback',
      });

      console.log('Redirect URI:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          // Request specific scopes
          scopes: provider === 'github' ? 'read:user user:email' : 'email profile',
        },
      });

      if (error) throw error;

      // Open the OAuth URL in an in-app browser
      if (data?.url) {
        console.log('Opening OAuth URL:', data.url);
        
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
          {
            // Show title for better UX
            showInRecents: true,
          }
        );

        console.log('Auth result:', result);

        if (result.type === 'success' && result.url) {
          // Extract tokens from the callback URL
          // Supabase returns tokens in the URL fragment (#), not query params
          const url = new URL(result.url);
          
          // Check both hash fragment and query params
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const queryParams = url.searchParams;
          
          const access_token = hashParams.get('access_token') || queryParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token') || queryParams.get('refresh_token');

          if (access_token && refresh_token) {
            // Set the session in Supabase
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (sessionError) throw sessionError;

            // Get user data
            const { data: { user: supaUser } } = await supabase.auth.getUser();
            if (supaUser) {
              await login({
                id: supaUser.id,
                email: supaUser.email || '',
                name: supaUser.user_metadata?.full_name
                  || supaUser.user_metadata?.name
                  || supaUser.email?.split('@')[0]
                  || 'User',
              });
              navigation.navigate('UserType');
            }
          } else {
            // Try to get session directly (Supabase might have set it)
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const supaUser = session.user;
              await login({
                id: supaUser.id,
                email: supaUser.email || '',
                name: supaUser.user_metadata?.full_name
                  || supaUser.user_metadata?.name
                  || supaUser.email?.split('@')[0]
                  || 'User',
              });
              navigation.navigate('UserType');
            } else {
              throw new Error('No tokens received from authentication');
            }
          }
        } else if (result.type === 'cancel') {
          // User cancelled - no action needed
          console.log('User cancelled auth');
        } else if (result.type === 'dismiss') {
          console.log('Auth dismissed');
        }
      }
    } catch (e: any) {
      console.error('Auth error:', e);
      Alert.alert(
        'Authentication Error',
        e.message || 'Authentication failed. Please try again.'
      );
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Image source={require('../../assets/Mini-logo-zorbyo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Welcome to ZORBYO</Text>
        <Text style={styles.subtitle}>Sign in to access freelancing & learning</Text>

        <View style={styles.buttons}>
          <TouchableOpacity 
            style={[styles.authBtn, { backgroundColor: '#24292e' }]} 
            onPress={() => handleAuth('github')} 
            disabled={loading}
          >
            {loadingProvider === 'github' ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="logo-github" size={24} color="#FFF" />
            )}
            <Text style={styles.authBtnText}>Continue with GitHub</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.authBtn, { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#ddd' }]} 
            onPress={() => handleAuth('google')} 
            disabled={loading}
          >
            {loadingProvider === 'google' ? (
              <ActivityIndicator size="small" color="#333" />
            ) : (
              <Ionicons name="logo-google" size={24} color="#4285F4" />
            )}
            <Text style={[styles.authBtnText, { color: '#333' }]}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          By continuing, you agree to ZORBYO's Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  back: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  content: { flex: 1, paddingHorizontal: 32, alignItems: 'center' },
  logo: { width: 100, height: 100, marginBottom: 24 },
  title: { fontSize: 28, fontFamily: 'Geist_700Bold', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: 'Geist_400Regular', color: '#666', textAlign: 'center', marginBottom: 40 },
  buttons: { width: '100%', gap: 16 },
  authBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 12 },
  authBtnText: { fontSize: 16, fontFamily: 'Geist_600SemiBold', color: '#FFF' },
  terms: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', textAlign: 'center', marginTop: 32, paddingHorizontal: 20 },
});
