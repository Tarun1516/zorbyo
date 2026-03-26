import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import WelcomeScreen from './src/screens/WelcomeScreen';
import AuthScreen from './src/screens/AuthScreen';
import UserTypeScreen from './src/screens/UserTypeScreen';
import LearnScreen from './src/screens/LearnScreen';
import CoursePlayerScreen from './src/screens/CoursePlayerScreen';
import FinalExamScreen from './src/screens/FinalExamScreen';
import CertificateScreen from './src/screens/CertificateScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import BugBountyScreen from './src/screens/BugBountyScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            Learn: focused ? 'book' : 'book-outline',
            Practice: focused ? 'code-slash' : 'code-slash-outline',
            Projects: focused ? 'briefcase' : 'briefcase-outline',
            BugBounty: focused ? 'bug' : 'bug-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#E5493D',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { backgroundColor: '#FFF', borderTopColor: '#E0E0E0' },
        tabBarLabelStyle: { fontFamily: 'Geist_500Medium', fontSize: 11 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Learn" component={LearnScreen} />
      <Tab.Screen name="Practice" component={PracticeScreen} />
      <Tab.Screen name="Projects" component={ProjectsScreen} />
      <Tab.Screen name="BugBounty" component={BugBountyScreen} options={{ tabBarLabel: 'Bug Bounty' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="UserType" component={UserTypeScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen 
            name="CoursePlayer" 
            component={CoursePlayerScreen}
            options={{ 
              presentation: 'modal',
              animation: 'slide_from_bottom'
            }}
          />
          <Stack.Screen
            name="FinalExam"
            component={FinalExamScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_right'
            }}
          />
          <Stack.Screen
            name="Certificate"
            component={CertificateScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_right'
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' }}>
        <ActivityIndicator size="large" color="#E5493D" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <SocketProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <AppNavigator />
        </NavigationContainer>
      </SocketProvider>
    </AuthProvider>
  );
}
