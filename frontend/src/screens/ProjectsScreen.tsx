import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  TextInput, 
  KeyboardAvoidingView, 
  Platform,
  Modal,
  Alert,
  Linking,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { API_V1 } from '../config/api';

// API base URL
const API_BASE_URL = API_V1.replace('/api/v1', '');

// Simple E2E encryption utilities (Base64 encoding for demo - use proper crypto library in production)
const encryptMessage = (text: string, key: string): string => {
  // In production, use proper E2E encryption like Signal Protocol
  // This is a simple XOR-based demo implementation
  let encrypted = '';
  for (let i = 0; i < text.length; i++) {
    encrypted += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted); // Base64 encode
};

const decryptMessage = (encryptedText: string, key: string): string => {
  try {
    const decoded = atob(encryptedText); // Base64 decode
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
  } catch {
    return encryptedText; // Return original if decryption fails
  }
};

const ENCRYPTION_KEY = 'zorbyo_e2e_key_2026'; // In production, use key exchange

// Types
interface Project {
  id: string;
  title: string;
  client: string;
  budget: number;
  domain: string;
  proposals: number;
  description?: string;
  deadline?: string;
  skills?: string[];
  status?: string;
}

interface Channel {
  id: string;
  name: string;
  type: 'community' | 'group' | 'direct';
  unread: number;
  members: string[];
  description?: string;
  createdAt?: string;
}

interface Message {
  id: string;
  sender: string;
  sender_id: string;
  text: string;
  time: string;
  liked?: boolean;
  fileType?: string;
  fileName?: string;
  edited?: boolean;
  fileContent?: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read'; // For tick indicators
}

interface User {
  id: string;
  name: string;
  email: string;
  user_type: string;
  connection_status: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  type: 'meeting' | 'deadline' | 'reminder';
}

type ChannelMemberRole = 'admin' | 'member';

// Initial data - empty, will be fetched from API
const initialProjects: Project[] = [];

export default function ProjectsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { 
    isConnected, 
    sendMessage: socketSendMessage, 
    joinChannel, 
    leaveChannel,
    messages: socketMessages,
    typingUsers,
    onlineUsers
  } = useSocket();
  
  const [mainTab, setMainTab] = useState<'projects' | 'chat' | 'connections'>('projects');
  const [projectTab, setProjectTab] = useState<'available' | 'ongoing' | 'applied' | 'completed'>('available');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [newMessage, setNewMessage] = useState('');
  const [unreadCountByChannel, setUnreadCountByChannel] = useState<Record<string, number>>({});
  const flatListRef = useRef<FlatList>(null);
  const isClient = user?.userType === 'client';
  

  
  // Channel creation state
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'community' | 'group'>('group');

  // Channel member management state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [channelMemberRoles, setChannelMemberRoles] = useState<Record<string, Record<string, ChannelMemberRole>>>({});
  
  // Calendar state - per channel calendars + main calendar
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [channelCalendarEvents, setChannelCalendarEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [calendarChannelFilter, setCalendarChannelFilter] = useState<string | 'all'>('all');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventType, setNewEventType] = useState<'meeting' | 'deadline' | 'reminder'>('meeting');
  
  // Connections state
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Project details state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const [showApplySuccess, setShowApplySuccess] = useState(false);
  const [appliedProjectName, setAppliedProjectName] = useState('');
  
  // Post Project modal state
  const [showPostProject, setShowPostProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectBudget, setNewProjectBudget] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectDomain, setNewProjectDomain] = useState('');
  const [newProjectCompanyInfo, setNewProjectCompanyInfo] = useState('');
  const [postProjectLoading, setPostProjectLoading] = useState(false);
  
  // Message options state
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [localMessages, setLocalMessages] = useState<Record<string, Message[]>>({});
  
  // File attachment state
  const [attachedFile, setAttachedFile] = useState<{name: string, uri: string, type: string} | null>(null);
  
  // Forward message state
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  
  // Network requests state
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  
  // Applied projects state
  const [appliedProjects, setAppliedProjects] = useState<Project[]>([]);
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // E2E encryption indicator
  const [isEncrypted, setIsEncrypted] = useState(true);
  
  // Project details page state
  const [showFullProjectDetails, setShowFullProjectDetails] = useState(false);
  
  // Chat sidebar visibility
  const [showChatSidebar, setShowChatSidebar] = useState(false);
  
  // Channel description state for creation modal
  const [newChannelDescription, setNewChannelDescription] = useState('');
  
  // Sidebar animation
  const sidebarAnim = useRef(new Animated.Value(-280)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // Load persisted data on mount
  useEffect(() => {
    loadPersistedData();
  }, []);

  const loadPersistedData = async () => {
    try {
      const savedChannels = await AsyncStorage.getItem('zorbyo_channels');
      const savedMessages = await AsyncStorage.getItem('zorbyo_messages');
      const savedEvents = await AsyncStorage.getItem('zorbyo_calendar_events');
      const savedChannelEvents = await AsyncStorage.getItem('zorbyo_channel_events');
      const savedAppliedProjects = await AsyncStorage.getItem('zorbyo_applied_projects');
      const savedChannelMemberRoles = await AsyncStorage.getItem('zorbyo_channel_member_roles');
      
      if (savedChannels) {
        const parsed = JSON.parse(savedChannels);
        if (parsed.length > 0) setChannels(parsed);
      }
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Object.keys(parsed).length > 0) setLocalMessages(parsed);
      }
      if (savedEvents) {
        setCalendarEvents(JSON.parse(savedEvents));
      }
      if (savedChannelEvents) {
        setChannelCalendarEvents(JSON.parse(savedChannelEvents));
      }
      if (savedAppliedProjects) {
        const parsed = JSON.parse(savedAppliedProjects);
        if (parsed.length > 0) {
          setAppliedProjects(parsed);
          const appliedIds = new Set(parsed.map((p: Project) => p.id));
          setProjects(prev => prev.filter(p => !appliedIds.has(p.id)));
        }
      }
      if (savedChannelMemberRoles) {
        setChannelMemberRoles(JSON.parse(savedChannelMemberRoles));
      }
    } catch (error) {
      console.error('Error loading persisted data:', error);
    }
  };

  // Save channels when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_channels', JSON.stringify(channels)).catch(() => {});
  }, [channels]);

  // Save local messages when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_messages', JSON.stringify(localMessages)).catch(() => {});
  }, [localMessages]);

  // Save calendar events when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_calendar_events', JSON.stringify(calendarEvents)).catch(() => {});
  }, [calendarEvents]);

  // Save channel calendar events when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_channel_events', JSON.stringify(channelCalendarEvents)).catch(() => {});
  }, [channelCalendarEvents]);

  // Save applied projects when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_applied_projects', JSON.stringify(appliedProjects)).catch(() => {});
  }, [appliedProjects]);

  // Save channel member roles when they change
  useEffect(() => {
    AsyncStorage.setItem('zorbyo_channel_member_roles', JSON.stringify(channelMemberRoles)).catch(() => {});
  }, [channelMemberRoles]);

  // Animate sidebar open/close
  useEffect(() => {
    Animated.parallel([
      Animated.timing(sidebarAnim, {
        toValue: showChatSidebar ? 0 : -280,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: showChatSidebar ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showChatSidebar]);

  // Join channel when selected
  useEffect(() => {
    if (selectedChannel && isConnected) {
      joinChannel(selectedChannel);
    }
    if (selectedChannel) {
      fetchChannelMessages(selectedChannel);
    }
    return () => {
      if (selectedChannel && isConnected) {
        leaveChannel(selectedChannel);
      }
    };
  }, [selectedChannel, isConnected]);

  // Fetch users from backend
  useEffect(() => {
    fetchUsers();
    fetchPendingRequests();
    fetchSentRequests();
    fetchChannels();
    fetchProjects();
  }, []);

  const fetchChannels = async () => {
    try {
      const userId = user?.id || '';
      if (!userId) return;
      
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/channels?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const transformedChannels: Channel[] = data.map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          unread: ch.unread_count || 0,
          members: ch.members || [],
          description: ch.description,
          createdAt: ch.created_at,
        }));

        const unreadMap: Record<string, number> = {};
        transformedChannels.forEach((channel) => {
          unreadMap[channel.id] = channel.unread;
        });

        setChannels(transformedChannels);
        setUnreadCountByChannel(unreadMap);

        setChannelMemberRoles(prev => {
          const next = { ...prev };
          transformedChannels.forEach(channel => {
            if (!next[channel.id]) {
              const roles: Record<string, ChannelMemberRole> = {};
              channel.members.forEach((memberId, index) => {
                roles[memberId] = index === 0 ? 'admin' : 'member';
              });
              next[channel.id] = roles;
            }
          });
          return next;
        });
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchChannelMessages = async (channelId: string) => {
    try {
      const userId = user?.id || '';
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/channels/${channelId}/messages?user_id=${userId}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const transformedMessages: Message[] = data.map((msg: any) => ({
            id: msg.id,
            sender: msg.sender_id === userId ? 'You' : (msg.sender_name || msg.sender_id),
            sender_id: msg.sender_id,
            text: msg.content,
            time: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fileType: msg.message_type === 'file' ? 'application/octet-stream' : undefined,
            deliveryStatus: msg.delivery_status,
          }));
          
          // Only update if we don't already have local messages for this channel
          // or if local messages are empty
          setLocalMessages(prev => {
            if (prev[channelId] && prev[channelId].length > 0) {
              // Merge: add backend messages that aren't already in local
              const existingIds = new Set(prev[channelId].map(m => m.id));
              const newMessages = transformedMessages.filter(m => !existingIds.has(m.id));
              if (newMessages.length > 0) {
                return {
                  ...prev,
                  [channelId]: [...prev[channelId], ...newMessages].sort((a, b) => 
                    a.time.localeCompare(b.time)
                  ),
                };
              }
              return prev;
            }
            return {
              ...prev,
              [channelId]: transformedMessages,
            };
          });
        }
      }
    } catch (error) {
      console.error('Error fetching channel messages:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const userId = user?.id || '';
      
      if (isClient) {
        // Clients fetch their own projects
        const response = await fetch(
          `${API_BASE_URL}/api/v1/projects/?client_id=${userId}`
        );
        if (response.ok) {
          const data = await response.json();
          const transformedProjects: Project[] = data.map((p: any) => ({
            id: p.id,
            title: p.title,
            client: p.client_name || user?.name || 'Client',
            budget: p.budget || 0,
            domain: p.domain || 'General',
            proposals: p.proposals_count || 0,
            description: p.description,
            deadline: p.deadline,
            skills: p.skills || [],
            status: p.status || 'open',
          }));
          setProjects(transformedProjects);
        }
      } else {
        // Freelancers see all open projects
        const response = await fetch(
          `${API_BASE_URL}/api/v1/projects/?status=open`
        );
        if (response.ok) {
          const data = await response.json();
          const transformedProjects: Project[] = data.map((p: any) => ({
            id: p.id,
            title: p.title,
            client: p.client_name || 'Client',
            budget: p.budget || 0,
            domain: p.domain || 'General',
            proposals: p.proposals_count || 0,
            description: p.description,
            deadline: p.deadline,
            skills: p.skills || [],
            status: p.status || 'open',
          }));
          // Filter out already applied projects
          const appliedIds = new Set(appliedProjects.map(p => p.id));
          setProjects(transformedProjects.filter(p => !appliedIds.has(p.id)));
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        // Transform backend data to match our User interface
        const transformedUsers = data.map((u: any) => ({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          user_type: u.user_type || 'freelancer',
          connection_status: 'none'
        }));
        setUsers(transformedUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      // Keep using initial users if fetch fails
    }
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachedFile) || !selectedChannel) return;
    
    const messageText = newMessage.trim() || (attachedFile ? `📎 ${attachedFile.name}` : '');
    
    // Encrypt message for E2E encryption
    const encryptedText = isEncrypted ? encryptMessage(messageText, ENCRYPTION_KEY) : messageText;
    
    const senderId = user?.id || 'user_1';
    
    if (isConnected) {
      // Send via Socket.io with E2E encryption
      socketSendMessage(selectedChannel, encryptedText);
    }
    
    // Persist message to backend database
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/channels/${selectedChannel}/messages?sender_id=${senderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageText,
          message_type: attachedFile ? 'file' : 'text',
        }),
      });
      
      if (response.ok) {
        const savedMessage = await response.json();
        // Use the backend-generated message ID for consistency
        const newMsg: Message = {
          id: savedMessage.id,
          sender: 'You',
          sender_id: senderId,
          text: messageText,
          time: new Date(savedMessage.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fileType: attachedFile?.type,
          fileName: attachedFile?.name,
          deliveryStatus: savedMessage.delivery_status || 'sent',
        };
        
        setLocalMessages(prev => ({
          ...prev,
          [selectedChannel]: [...(prev[selectedChannel] || []), newMsg]
        }));
      } else {
        // Fallback: add message locally even if backend fails
        const newMsg: Message = {
          id: Date.now().toString(),
          sender: 'You',
          sender_id: senderId,
          text: messageText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fileType: attachedFile?.type,
          fileName: attachedFile?.name,
          deliveryStatus: 'sent',
        };
        
        setLocalMessages(prev => ({
          ...prev,
          [selectedChannel]: [...(prev[selectedChannel] || []), newMsg]
        }));
      }
    } catch (error) {
      // Fallback: add message locally even if backend fails
      const newMsg: Message = {
        id: Date.now().toString(),
        sender: 'You',
        sender_id: senderId,
        text: messageText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fileType: attachedFile?.type,
        fileName: attachedFile?.name,
        deliveryStatus: 'sent',
      };
      
      setLocalMessages(prev => ({
        ...prev,
        [selectedChannel]: [...(prev[selectedChannel] || []), newMsg]
      }));
    }
    
    setNewMessage('');
    setAttachedFile(null);
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) {
      Alert.alert('Error', 'Please enter a channel name');
      return;
    }
    const creatorId = user?.id || '';
    if (!creatorId) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/channels?creator_id=${creatorId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newChannelName.trim(),
          type: newChannelType,
          members: [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || 'Failed to create channel');
      }

      const created = await response.json();
      const newChannel: Channel = {
        id: created.id,
        name: created.name,
        type: created.type,
        unread: created.unread_count || 0,
        members: created.members || [creatorId],
        description: newChannelDescription.trim() || undefined,
        createdAt: created.created_at,
      };

      setChannels(prev => [newChannel, ...prev.filter(ch => ch.id !== newChannel.id)]);
      setUnreadCountByChannel(prev => ({ ...prev, [newChannel.id]: newChannel.unread }));
      setChannelMemberRoles(prev => ({
        ...prev,
        [newChannel.id]: (prev[newChannel.id] || newChannel.members.reduce((acc, memberId, index) => {
          acc[memberId] = index === 0 ? 'admin' : 'member';
          return acc;
        }, {} as Record<string, ChannelMemberRole>)),
      }));

      setChannelCalendarEvents(prev => ({
        ...prev,
        [newChannel.id]: prev[newChannel.id] || []
      }));

      setNewChannelName('');
      setNewChannelDescription('');
      setShowCreateChannel(false);
      setSelectedChannel(newChannel.id);

      Alert.alert('Success', `${newChannelType.charAt(0).toUpperCase() + newChannelType.slice(1)} "${newChannel.name}" created successfully!`);

      if (isConnected) {
        joinChannel(newChannel.id);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to create channel');
    }
  };

  const openMembersModal = () => {
    if (!selectedChannel) return;
    setShowMembersModal(true);
  };

  const updateMemberRole = (memberId: string, role: ChannelMemberRole) => {
    if (!selectedChannel) return;
    setChannelMemberRoles(prev => ({
      ...prev,
      [selectedChannel]: {
        ...(prev[selectedChannel] || {}),
        [memberId]: role,
      },
    }));
  };

  const addMemberToChannel = () => {
    if (!selectedChannel) return;
    const memberId = newMemberId.trim();
    if (!memberId) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }

    const channel = channels.find(c => c.id === selectedChannel);
    if (!channel) return;

    if (channel.members.includes(memberId)) {
      Alert.alert('Info', 'Member already exists in this channel');
      return;
    }

    setChannels(prev => prev.map(c =>
      c.id === selectedChannel
        ? { ...c, members: [...c.members, memberId] }
        : c
    ));

    setChannelMemberRoles(prev => ({
      ...prev,
      [selectedChannel]: {
        ...(prev[selectedChannel] || {}),
        [memberId]: 'member',
      },
    }));

    setNewMemberId('');
  };

  const removeMemberFromChannel = (memberId: string) => {
    if (!selectedChannel) return;

    setChannels(prev => prev.map(c =>
      c.id === selectedChannel
        ? { ...c, members: c.members.filter(id => id !== memberId) }
        : c
    ));

    setChannelMemberRoles(prev => {
      const current = { ...(prev[selectedChannel] || {}) };
      delete current[memberId];
      return {
        ...prev,
        [selectedChannel]: current,
      };
    });
  };

  const sendConnectionRequest = async (userId: string) => {
    try {
      const senderId = user?.id || '';
      if (!senderId) {
        Alert.alert('Error', 'User not found. Please login again.');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/connections/request?sender_id=${senderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: userId, message: '' }),
      });
      if (response.ok) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, connection_status: 'pending' } : u
        ));
        Alert.alert('Success', 'Connection request sent!');
      } else {
        const err = await response.json().catch(() => ({}));
        Alert.alert('Error', err?.detail || 'Failed to send connection request');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send connection request');
    }
  };

  const acceptConnectionRequest = async (requestId: string) => {
    try {
      const userId = user?.id || '';
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/connections/${requestId}/accept?user_id=${userId}`, {
        method: 'PUT',
      });
      if (response.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        fetchUsers();
        Alert.alert('Success', 'Connection request accepted!');
      } else {
        Alert.alert('Error', 'Failed to accept connection request');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to accept connection request');
    }
  };

  const rejectConnectionRequest = async (requestId: string) => {
    try {
      const userId = user?.id || '';
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/connections/${requestId}/reject?user_id=${userId}`, {
        method: 'PUT',
      });
      if (response.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        Alert.alert('Rejected', 'Connection request rejected');
      } else {
        Alert.alert('Error', 'Failed to reject connection request');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to reject connection request');
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/connections/requests/pending?user_id=${user?.id || 'user_1'}`);
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data);
      }
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/connections/requests/sent?user_id=${user?.id || 'user_1'}`);
      if (response.ok) {
        const data = await response.json();
        setSentRequests(data);
      }
    } catch (error) {
      console.error('Error fetching sent requests:', error);
    }
  };

  // Project functions
  const viewProjectDetails = (project: Project) => {
    setSelectedProject(project);
    setShowProjectDetails(true);
  };

  const applyToProject = async (project: Project) => {
    // Check if already applied
    if (appliedProjects.find(p => p.id === project.id)) {
      Alert.alert('Already Applied', 'You have already applied to this project');
      return;
    }
    
    const userId = user?.id || '';
    
    // Call backend API
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/projects/${project.id}/apply?freelancer_id=${userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bid_amount: project.budget,
            proposal: `I am interested in working on ${project.title}. I have the required skills and experience.`,
          }),
        }
      );

      if (response.ok) {
        setAppliedProjectName(project.title);
        setShowApplySuccess(true);
        setAppliedProjects(prev => [...prev, { ...project, status: 'applied' }]);
        setProjects(prev => prev.filter(p => p.id !== project.id));
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to apply to project');
      }
    } catch (error) {
      console.error('Error applying to project:', error);
      Alert.alert('Error', 'Failed to apply to project. Please try again.');
    }
  };

  const createProject = async () => {
    if (!newProjectTitle.trim()) {
      Alert.alert('Error', 'Please enter a project name');
      return;
    }
    if (!newProjectBudget.trim() || isNaN(Number(newProjectBudget))) {
      Alert.alert('Error', 'Please enter a valid budget');
      return;
    }
    if (!newProjectDescription.trim()) {
      Alert.alert('Error', 'Please enter project details');
      return;
    }

    setPostProjectLoading(true);
    const userId = user?.id || '';

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/projects/?client_id=${userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newProjectTitle.trim(),
            description: newProjectDescription.trim(),
            domain: newProjectDomain.trim() || 'General',
            budget: Number(newProjectBudget),
            company_info: newProjectCompanyInfo.trim() || null,
          }),
        }
      );

      if (response.ok) {
        const newProject = await response.json();
        const transformedProject: Project = {
          id: newProject.id,
          title: newProject.title,
          client: newProject.client_name || user?.name || 'Client',
          budget: newProject.budget,
          domain: newProject.domain,
          proposals: 0,
          description: newProject.description,
          deadline: newProject.deadline,
          status: newProject.status,
        };
        setProjects(prev => [transformedProject, ...prev]);
        
        // Reset form and close modal
        setNewProjectTitle('');
        setNewProjectBudget('');
        setNewProjectDescription('');
        setNewProjectDomain('');
        setNewProjectCompanyInfo('');
        setShowPostProject(false);
        
        Alert.alert('Success', 'Project posted successfully!');
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to post project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Error', 'Failed to post project. Please try again.');
    } finally {
      setPostProjectLoading(false);
    }
  };

  const closeApplySuccess = () => {
    setShowApplySuccess(false);
    setShowProjectDetails(false);
  };

  // Message functions
  const openMessageOptions = (message: Message) => {
    setSelectedMessage(message);
    setShowMessageOptions(true);
  };

  const likeMessage = () => {
    if (!selectedMessage || !selectedChannel) return;
    
    setLocalMessages(prev => {
      const channelMessages = prev[selectedChannel] || [];
      return {
        ...prev,
        [selectedChannel]: channelMessages.map(m => 
          m.id === selectedMessage.id ? { ...m, liked: !m.liked } : m
        )
      };
    });
    setShowMessageOptions(false);
  };

  const startEditMessage = () => {
    if (!selectedMessage) return;
    setEditingMessage(selectedMessage);
    setEditText(selectedMessage.text);
    setShowMessageOptions(false);
  };

  const saveEditMessage = () => {
    if (!editingMessage || !selectedChannel || !editText.trim()) return;
    
    setLocalMessages(prev => {
      const channelMessages = prev[selectedChannel] || [];
      return {
        ...prev,
        [selectedChannel]: channelMessages.map(m => 
          m.id === editingMessage.id ? { ...m, text: editText.trim(), edited: true } : m
        )
      };
    });
    setEditingMessage(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const deleteMessage = () => {
    if (!selectedMessage || !selectedChannel) return;
    
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setLocalMessages(prev => {
              const channelMessages = prev[selectedChannel] || [];
              return {
                ...prev,
                [selectedChannel]: channelMessages.filter(m => m.id !== selectedMessage.id)
              };
            });
            setShowMessageOptions(false);
          }
        }
      ]
    );
  };

  // File attachment function
  const attachFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setAttachedFile({
          name: file.name,
          uri: file.uri,
          type: file.mimeType || 'application/octet-stream'
        });
        Alert.alert('File Attached', `${file.name} is ready to send`);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to attach file');
    }
  };

  const removeAttachment = () => {
    setAttachedFile(null);
  };

  const forwardMessage = (targetChannelId: string) => {
    if (!forwardingMessage || !targetChannelId) return;
    
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'You',
      sender_id: 'user_1',
      text: `Forwarded: ${forwardingMessage.text}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fileType: forwardingMessage.fileType,
      fileName: forwardingMessage.fileName,
    };
    
    setLocalMessages(prev => ({
      ...prev,
      [targetChannelId]: [...(prev[targetChannelId] || []), newMsg]
    }));
    
    setForwardingMessage(null);
    setShowForwardModal(false);
    Alert.alert('Success', 'Message forwarded successfully');
  };

  // Video call function - opens Jitsi
  const startVideoCall = async () => {
    if (!selectedChannel) {
      Alert.alert('No Channel Selected', 'Please select a channel first to start a video call.');
      return;
    }
    
    const channelInfo = channels.find(c => c.id === selectedChannel);
    const roomName = `zorbyo-${selectedChannel}-${Date.now()}`;
    const jitsiUrl = `https://meet.jit.si/${roomName}`;
    
    try {
      const supported = await Linking.canOpenURL(jitsiUrl);
      if (supported) {
        await Linking.openURL(jitsiUrl);
        
        // Notify via socket if connected
        if (isConnected) {
          // Socket notification would go here
        }
      } else {
        Alert.alert('Error', 'Cannot open video call');
      }
    } catch (error) {
      console.error('Error opening video call:', error);
      Alert.alert('Error', 'Failed to start video call');
    }
  };

  // Calendar functions
  const openCalendar = () => {
    setShowCalendar(true);
  };

  const addCalendarEvent = () => {
    if (!newEventTitle.trim() || !newEventDate.trim()) {
      Alert.alert('Error', 'Please enter event title and date');
      return;
    }

    const newEvent: CalendarEvent = {
      id: `event_${Date.now()}`,
      title: newEventTitle.trim(),
      date: newEventDate.trim(),
      time: newEventTime.trim() || '12:00',
      type: newEventType,
    };

    // Add to main calendar
    setCalendarEvents(prev => [...prev, newEvent]);
    
    // If a channel is selected, also add to that channel's calendar
    if (selectedChannel) {
      setChannelCalendarEvents(prev => ({
        ...prev,
        [selectedChannel]: [...(prev[selectedChannel] || []), newEvent]
      }));
    }
    
    setNewEventTitle('');
    setNewEventDate('');
    setNewEventTime('');
    setNewEventType('meeting');
    Alert.alert('Success', 'Event added to calendar');
  };

  const deleteCalendarEvent = (eventId: string) => {
    // Remove from main calendar
    setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
    
    // Also remove from all channel calendars
    setChannelCalendarEvents(prev => {
      const updated: Record<string, CalendarEvent[]> = {};
      for (const channelId of Object.keys(prev)) {
        updated[channelId] = prev[channelId].filter(e => e.id !== eventId);
      }
      return updated;
    });
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    // Add empty cells to complete the last week
    while (currentWeek.length < 7 && currentWeek.length > 0) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return weeks;
  };

  const getChannelMessages = (channelId: string): Message[] => {
    // Use local messages if available
    if (localMessages[channelId]) {
      return localMessages[channelId];
    }
    
    // Use socket messages if available
    if (socketMessages[channelId]) {
      return socketMessages[channelId].map(msg => ({
        id: msg.id,
        sender: msg.sender_name || msg.sender_id,
        sender_id: msg.sender_id,
        text: msg.content,
        time: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
    }
    
    // Return empty array for new channels
    return [];
  };

  const getTypingIndicator = (channelId: string): string | null => {
    const typingInChannel = typingUsers.filter(t => t.channel_id === channelId);
    if (typingInChannel.length === 0) return null;
    if (typingInChannel.length === 1) return `${typingInChannel[0].user_name} is typing...`;
    return `${typingInChannel.length} people are typing...`;
  };

  const renderChannelList = () => (
    <View style={styles.sidebarContainer}>
      <View style={styles.sidebarHeader}>
        <View style={styles.sidebarHeaderLeft}>
          <Text style={styles.sidebarHeaderTitle}>Messages</Text>
          <View style={[styles.connectionStatus, isConnected ? styles.connected : styles.disconnected]}>
            <Text style={styles.connectionStatusText}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={styles.sidebarHeaderRight}>
          <TouchableOpacity onPress={() => setShowCreateChannel(true)} style={styles.sidebarAddBtn}>
            <Ionicons name="add-circle" size={24} color="#E5493D" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowChatSidebar(false)} style={styles.sidebarCloseBtn}>
            <Ionicons name="close-circle" size={24} color="#999" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Sidebar sections */}
      <ScrollView style={styles.sidebarContent} showsVerticalScrollIndicator={false}>
        {/* Communities Section */}
        {channels.filter(c => c.type === 'community').length > 0 && (
          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarSectionTitle}>Communities</Text>
            {channels.filter(c => c.type === 'community').map(item => (
              <TouchableOpacity 
                key={item.id}
                style={[styles.sidebarItem, selectedChannel === item.id && styles.sidebarItemActive]}
                onPress={() => { setSelectedChannel(item.id); setShowChatSidebar(false); }}
              >
                <Ionicons name="people-outline" size={18} color={selectedChannel === item.id ? '#E5493D' : '#666'} />
                <View style={styles.sidebarItemInfo}>
                  <Text style={[styles.sidebarItemName, selectedChannel === item.id && styles.sidebarItemNameActive]}>
                    # {item.name}
                  </Text>
                  {item.description && (
                    <Text style={styles.sidebarItemDescription} numberOfLines={1}>
                      {item.description}
                    </Text>
                  )}
                </View>
                {(unreadCountByChannel[item.id] || 0) > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCountByChannel[item.id]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        {/* Groups Section */}
        {channels.filter(c => c.type === 'group').length > 0 && (
          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarSectionTitle}>Groups</Text>
            {channels.filter(c => c.type === 'group').map(item => (
              <TouchableOpacity 
                key={item.id}
                style={[styles.sidebarItem, selectedChannel === item.id && styles.sidebarItemActive]}
                onPress={() => { setSelectedChannel(item.id); setShowChatSidebar(false); }}
              >
                <Ionicons name="chatbubbles-outline" size={18} color={selectedChannel === item.id ? '#E5493D' : '#666'} />
                <View style={styles.sidebarItemInfo}>
                  <Text style={[styles.sidebarItemName, selectedChannel === item.id && styles.sidebarItemNameActive]}>
                    # {item.name}
                  </Text>
                  {item.description && (
                    <Text style={styles.sidebarItemDescription} numberOfLines={1}>
                      {item.description}
                    </Text>
                  )}
                </View>
                {(unreadCountByChannel[item.id] || 0) > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCountByChannel[item.id]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        {/* Direct Messages Section */}
        {channels.filter(c => c.type === 'direct').length > 0 && (
          <View style={styles.sidebarSection}>
            <Text style={styles.sidebarSectionTitle}>Direct Messages</Text>
            {channels.filter(c => c.type === 'direct').map(item => (
              <TouchableOpacity 
                key={item.id}
                style={[styles.sidebarItem, selectedChannel === item.id && styles.sidebarItemActive]}
                onPress={() => { setSelectedChannel(item.id); setShowChatSidebar(false); }}
              >
                <Ionicons name="person-circle-outline" size={18} color={selectedChannel === item.id ? '#E5493D' : '#666'} />
                <View style={styles.sidebarItemInfo}>
                  <Text style={[styles.sidebarItemName, selectedChannel === item.id && styles.sidebarItemNameActive]}>
                    {item.name}
                  </Text>
                </View>
                {(unreadCountByChannel[item.id] || 0) > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCountByChannel[item.id]}</Text>
                  </View>
                )}
                {item.type === 'direct' && onlineUsers.includes(item.id) && (
                  <View style={styles.onlineIndicator} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {channels.length === 0 && (
          <View style={styles.emptySidebarContent}>
            <Ionicons name="chatbubbles-outline" size={48} color="#ddd" />
            <Text style={styles.emptySidebarText}>No channels yet</Text>
            <Text style={styles.emptySidebarSubtext}>Tap + to create a channel</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.sidebarActions}>
        <TouchableOpacity style={styles.sidebarActionBtn} onPress={() => { startVideoCall(); setShowChatSidebar(false); }}>
          <Ionicons name="videocam-outline" size={20} color="#E5493D" />
          <Text style={styles.sidebarActionText}>Video Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarActionBtn} onPress={() => { openCalendar(); setShowChatSidebar(false); }}>
          <Ionicons name="calendar-outline" size={20} color="#E5493D" />
          <Text style={styles.sidebarActionText}>Calendar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderChat = () => {
    const channelMessages = selectedChannel ? getChannelMessages(selectedChannel) : [];
    const channelInfo = channels.find(c => c.id === selectedChannel);
    const typingIndicator = selectedChannel ? getTypingIndicator(selectedChannel) : null;

    return (
      <View style={styles.chatWithSidebar}>
        {/* Sidebar Modal with Blur Overlay */}
        <Modal
          visible={showChatSidebar}
          transparent
          animationType="none"
          onRequestClose={() => setShowChatSidebar(false)}
        >
          <View style={styles.sidebarModalRoot}>
            {/* Blur overlay */}
            <Animated.View 
              style={[
                styles.sidebarBlurOverlay,
                { opacity: overlayAnim }
              ]}
            >
              <TouchableOpacity 
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setShowChatSidebar(false)}
              />
            </Animated.View>
            
            {/* Sidebar panel */}
            <Animated.View 
              style={[
                styles.sidebarOverlayContainer,
                { transform: [{ translateX: sidebarAnim }] }
              ]}
            >
              {renderChannelList()}
            </Animated.View>
          </View>
        </Modal>
        
        {/* Chat Main Area */}
        <KeyboardAvoidingView 
          style={styles.chatContainer} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setShowChatSidebar(true)} style={styles.menuBtn}>
              <Ionicons name="menu-outline" size={20} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chatHeaderInfo} onPress={openMembersModal} activeOpacity={0.8}>
              <Text style={styles.chatHeaderName}>
                {channelInfo?.type === 'direct' ? channelInfo.name : `# ${channelInfo?.name}`}
              </Text>
              <Text style={styles.chatHeaderType}>
                {channelInfo?.type} • {channelInfo?.members.length} members
                {isEncrypted && ' • '}
                {isEncrypted && (
                  <Ionicons name="lock-closed" size={10} color="#4CAF50" />
                )}
              </Text>
            </TouchableOpacity>
            <View style={styles.chatHeaderActions}>
              <TouchableOpacity style={styles.headerActionBtn} onPress={startVideoCall}>
                <Ionicons name="videocam-outline" size={20} color="#E5493D" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerActionBtn} onPress={openCalendar}>
                <Ionicons name="calendar-outline" size={20} color="#E5493D" />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            ref={flatListRef}
            data={channelMessages}
            keyExtractor={i => i.id}
            style={styles.messagesList}
            contentContainerStyle={{ padding: 12 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.messageBubble, item.sender === 'You' && styles.messageBubbleSelf]}
                onPress={() => openMessageOptions(item)}
                onLongPress={() => {
                  setForwardingMessage(item);
                  setShowForwardModal(true);
                }}
                activeOpacity={0.8}
              >
                {item.sender !== 'You' && item.sender !== 'System' && (
                  <Text style={styles.messageSender}>{item.sender}</Text>
                )}
                {item.sender === 'System' && (
                  <Text style={styles.systemMessageText}>{item.text}</Text>
                )}
                {item.sender !== 'System' && (
                  <>
                    {item.fileType && (
                      <View style={styles.fileAttachment}>
                        <Ionicons 
                          name={item.fileType.includes('image') ? 'image-outline' : 'document-outline'} 
                          size={16} 
                          color={item.sender === 'You' ? '#FFF' : '#E5493D'} 
                        />
                        <Text style={[styles.fileName, item.sender === 'You' && styles.fileNameSelf]}>
                          {item.fileName}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.messageText, item.sender === 'You' && styles.messageTextSelf]}>
                      {item.text}
                    </Text>
                    {item.edited && (
                      <Text style={[styles.editedIndicator, item.sender === 'You' && styles.editedIndicatorSelf]}>
                        edited
                      </Text>
                    )}
                    <View style={styles.messageFooter}>
                      <Text style={[styles.messageTime, item.sender === 'You' && styles.messageTimeSelf]}>
                        {item.time}
                      </Text>
                      {/* Delivery Status Ticks */}
                      {item.sender === 'You' && (
                        <View style={styles.tickContainer}>
                          {item.deliveryStatus === 'sent' || !item.deliveryStatus ? (
                            <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
                          ) : item.deliveryStatus === 'delivered' ? (
                            <View style={styles.doubleTick}>
                              <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" style={styles.tickOverlap} />
                              <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
                            </View>
                          ) : (
                            <View style={styles.doubleTick}>
                              <Ionicons name="checkmark" size={14} color="#2196F3" style={styles.tickOverlap} />
                              <Ionicons name="checkmark" size={14} color="#2196F3" />
                            </View>
                          )}
                        </View>
                      )}
                      {item.liked && (
                        <Ionicons name="heart" size={12} color="#E5493D" style={styles.likedIcon} />
                      )}
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-outline" size={40} color="#ddd" />
                <Text style={styles.emptyChatText}>Start a conversation</Text>
              </View>
            }
          />

          {typingIndicator && (
            <View style={styles.typingIndicator}>
              <Text style={styles.typingText}>{typingIndicator}</Text>
            </View>
          )}

          {attachedFile && (
            <View style={styles.attachedFileContainer}>
              <View style={styles.attachedFilePreview}>
                {attachedFile.type.includes('image') ? (
                  <View style={styles.imagePreview}>
                    <Ionicons name="image-outline" size={32} color="#E5493D" />
                    <Text style={styles.imagePreviewText}>Image</Text>
                  </View>
                ) : (
                  <View style={styles.documentPreview}>
                    <Ionicons name="document-outline" size={32} color="#E5493D" />
                    <Text style={styles.documentPreviewText}>
                      {attachedFile.type.includes('pdf') ? 'PDF' : 
                       attachedFile.type.includes('word') ? 'Word' : 
                       attachedFile.type.includes('excel') ? 'Excel' : 
                       attachedFile.type.includes('text') ? 'Text' : 'Document'}
                    </Text>
                  </View>
                )}
                <View style={styles.attachedFileInfo}>
                  <Text style={styles.attachedFileName} numberOfLines={1}>{attachedFile.name}</Text>
                  <Text style={styles.attachedFileType}>{attachedFile.type}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={removeAttachment} style={styles.removeAttachmentBtn}>
                <Ionicons name="close-circle" size={20} color="#F44336" />
              </TouchableOpacity>
            </View>
          )}

          {editingMessage && (
            <View style={styles.editingContainer}>
              <Text style={styles.editingLabel}>Editing message</Text>
              <TouchableOpacity onPress={cancelEdit}>
                <Ionicons name="close-circle" size={20} color="#E5493D" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachBtn} onPress={attachFile}>
              <Ionicons name="attach-outline" size={20} color="#999" />
            </TouchableOpacity>
            <TextInput
              style={styles.messageInput}
              placeholder={editingMessage ? "Edit message..." : "Type a message..."}
              placeholderTextColor="#bbb"
              value={editingMessage ? editText : newMessage}
              onChangeText={editingMessage ? setEditText : setNewMessage}
              onSubmitEditing={editingMessage ? saveEditMessage : sendMessage}
            />
            <TouchableOpacity 
              style={styles.sendBtn} 
              onPress={editingMessage ? saveEditMessage : sendMessage}
            >
              <Ionicons name={editingMessage ? "checkmark" : "send"} size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  };

  const renderProjects = () => (
    <>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#999" />
        <TextInput style={styles.searchInput} placeholder="Search projects..." placeholderTextColor="#bbb" />
      </View>

      <View style={styles.tabsRow}>
        {['available', 'ongoing', 'applied', 'completed'].map(t => (
          <TouchableOpacity 
            key={t} 
            style={[styles.tab, projectTab === t && styles.tabActive]} 
            onPress={() => setProjectTab(t as any)}
          >
            <Text style={[styles.tabText, projectTab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={projectTab === 'applied' ? appliedProjects : projects}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.domain}</Text>
              </View>
              <Text style={styles.budget}>₹{item.budget.toLocaleString()}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.cardBottom}>
              <View style={styles.clientRow}>
                <Ionicons name="business-outline" size={12} color="#999" />
                <Text style={styles.client}>{item.client}</Text>
              </View>
              <View style={styles.proposalsRow}>
                <Ionicons name="people-outline" size={12} color="#999" />
                <Text style={styles.proposals}>{item.proposals}</Text>
              </View>
              <TouchableOpacity 
                style={styles.moreDetailsBtn}
                onPress={() => {
                  setSelectedProject(item);
                  setShowFullProjectDetails(true);
                }}
              >
                <Text style={styles.moreDetailsBtnText}>More Details</Text>
              </TouchableOpacity>
              {projectTab !== 'applied' && !isClient && !appliedProjects.find(p => p.id === item.id) && (
                <TouchableOpacity 
                  style={styles.applyBtn}
                  onPress={() => applyToProject(item)}
                >
                  <Text style={styles.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              )}
              {(projectTab === 'applied' || appliedProjects.find(p => p.id === item.id)) && (
                <View style={styles.appliedBadge}>
                  <Text style={styles.appliedBadgeText}>Applied</Text>
                </View>
              )}
              {isClient && projectTab !== 'applied' && (
                <TouchableOpacity 
                  style={styles.applyBtn}
                  onPress={() => viewProjectDetails(item)}
                >
                  <Text style={styles.applyBtnText}>View</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyProjects}>
            <Ionicons name="briefcase-outline" size={48} color="#ddd" />
            <Text style={styles.emptyProjectsText}>
              {projectTab === 'applied' ? 'No applied projects yet' : 'No projects available'}
            </Text>
          </View>
        }
      />

      {isClient && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowPostProject(true)}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      )}
    </>
  );

  const renderConnections = () => (
    <ScrollView style={styles.connectionsContainer}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#999" />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Search users..." 
          placeholderTextColor="#bbb"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Pending Requests Section */}
      {pendingRequests.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionTitle}>Pending Requests ({pendingRequests.length})</Text>
          {pendingRequests.map((req: any) => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{(req.sender_name || 'U').charAt(0)}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{req.sender_name || 'Unknown User'}</Text>
                {req.message && <Text style={styles.requestMessage} numberOfLines={1}>{req.message}</Text>}
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity 
                  style={styles.acceptBtn}
                  onPress={() => acceptConnectionRequest(req.id)}
                >
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.rejectBtn}
                  onPress={() => rejectConnectionRequest(req.id)}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sent Requests Section */}
      {sentRequests.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionTitle}>Sent Requests ({sentRequests.length})</Text>
          {sentRequests.map((req: any) => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{(req.receiver_name || 'U').charAt(0)}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{req.receiver_name || 'Unknown User'}</Text>
                <Text style={styles.requestStatus}>Pending</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Waiting</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Connected Section */}
      <Text style={styles.sectionTitle}>People You May Know</Text>
      
      {users.filter(u => 
        searchQuery ? u.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
      ).map(item => (
        <View key={item.id} style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{item.name.charAt(0)}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userType}>{item.user_type}</Text>
          </View>
          {item.connection_status === 'none' && (
            <TouchableOpacity 
              style={styles.connectBtn}
              onPress={() => sendConnectionRequest(item.id)}
            >
              <Ionicons name="person-add-outline" size={16} color="#E5493D" />
              <Text style={styles.connectBtnText}>Connect</Text>
            </TouchableOpacity>
          )}
          {item.connection_status === 'pending' && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>Pending</Text>
            </View>
          )}
          {item.connection_status === 'connected' && (
            <TouchableOpacity style={styles.messageBtn}>
              <Ionicons name="chatbubble-outline" size={16} color="#4CAF50" />
              <Text style={styles.messageBtnText}>Message</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {mainTab === 'chat' ? 'Messages' : mainTab === 'connections' ? 'Network' : isClient ? 'My Projects' : 'Projects'}
        </Text>
      </View>

      <View style={styles.mainTabs}>
        <TouchableOpacity 
          style={[styles.mainTab, mainTab === 'projects' && styles.mainTabActive]}
          onPress={() => { setMainTab('projects'); setSelectedChannel(null); }}
        >
          <Ionicons name="briefcase-outline" size={16} color={mainTab === 'projects' ? '#E5493D' : '#999'} />
          <Text style={[styles.mainTabText, mainTab === 'projects' && styles.mainTabTextActive]}>Projects</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, mainTab === 'chat' && styles.mainTabActive]}
          onPress={() => setMainTab('chat')}
        >
          <Ionicons name="chatbubbles-outline" size={16} color={mainTab === 'chat' ? '#E5493D' : '#999'} />
          <Text style={[styles.mainTabText, mainTab === 'chat' && styles.mainTabTextActive]}>Chat</Text>
          {Object.values(unreadCountByChannel).reduce((sum, count) => sum + count, 0) > 0 && (
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText}>{Object.values(unreadCountByChannel).reduce((sum, count) => sum + count, 0)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, mainTab === 'connections' && styles.mainTabActive]}
          onPress={() => setMainTab('connections')}
        >
          <Ionicons name="people-outline" size={16} color={mainTab === 'connections' ? '#E5493D' : '#999'} />
          <Text style={[styles.mainTabText, mainTab === 'connections' && styles.mainTabTextActive]}>Network</Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'projects' ? renderProjects() : 
       mainTab === 'connections' ? renderConnections() :
       selectedChannel ? renderChat() : renderChannelList()}



      {/* Create Channel Modal */}
      <Modal visible={showCreateChannel} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1}
          onPress={() => setShowCreateChannel(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Create Channel</Text>
                <TouchableOpacity onPress={() => setShowCreateChannel(false)}>
                  <Ionicons name="close-circle" size={22} color="#999" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.modalLabel}>Channel Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter channel name..."
                placeholderTextColor="#999"
                value={newChannelName}
                onChangeText={setNewChannelName}
                autoCapitalize="none"
              />
              
              <Text style={styles.modalLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextArea]}
                placeholder="What is this channel about?"
                placeholderTextColor="#999"
                value={newChannelDescription}
                onChangeText={setNewChannelDescription}
                multiline
                numberOfLines={2}
              />
              
              <Text style={styles.modalLabel}>Channel Type</Text>
              <View style={styles.channelTypeSelector}>
                {(['community', 'group'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.channelTypeOption,
                      newChannelType === type && styles.channelTypeOptionSelected
                    ]}
                    onPress={() => setNewChannelType(type)}
                  >
                    <Ionicons 
                      name={
                        type === 'community' ? 'people-outline' :
                        'chatbubbles-outline'
                      }
                      size={18}
                      color={newChannelType === type ? '#E5493D' : '#999'}
                    />
                    <Text style={[
                      styles.channelTypeText,
                      newChannelType === type && styles.channelTypeTextSelected
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TouchableOpacity style={styles.createBtn} onPress={createChannel}>
                <Ionicons name="add-circle" size={18} color="#FFF" />
                <Text style={styles.createBtnText}>Create Channel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Members Management Modal */}
      <Modal visible={showMembersModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMembersModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalContent, styles.membersModalContent]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Members</Text>
                <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                  <Ionicons name="close-circle" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Add Member by User ID</Text>
              <View style={styles.membersAddRow}>
                <TextInput
                  style={[styles.modalInput, styles.membersInput]}
                  placeholder="Enter user ID"
                  placeholderTextColor="#999"
                  value={newMemberId}
                  onChangeText={setNewMemberId}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.membersAddBtn} onPress={addMemberToChannel}>
                  <Ionicons name="person-add" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
                {(channels.find(c => c.id === selectedChannel)?.members || []).map(memberId => {
                  const role = channelMemberRoles[selectedChannel || '']?.[memberId] || 'member';
                  return (
                    <View key={memberId} style={styles.memberRow}>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberIdText}>{memberId}</Text>
                        <Text style={styles.memberRoleText}>{role}</Text>
                      </View>

                      <View style={styles.roleSelector}>
                        <TouchableOpacity
                          style={[styles.roleChip, role === 'admin' && styles.roleChipActive]}
                          onPress={() => updateMemberRole(memberId, 'admin')}
                        >
                          <Text style={[styles.roleChipText, role === 'admin' && styles.roleChipTextActive]}>Admin</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.roleChip, role === 'member' && styles.roleChipActive]}
                          onPress={() => updateMemberRole(memberId, 'member')}
                        >
                          <Text style={[styles.roleChipText, role === 'member' && styles.roleChipTextActive]}>Member</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeMemberBtn}
                          onPress={() => removeMemberFromChannel(memberId)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#F44336" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>






      {/* Project Details Modal */}
      <Modal visible={showProjectDetails} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.projectDetailsContainer}>
          <View style={styles.projectDetailsHeader}>
            <Text style={styles.projectDetailsTitle}>Project Details</Text>
            <TouchableOpacity onPress={() => setShowProjectDetails(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {selectedProject && (
            <ScrollView style={styles.projectDetailsContent}>
              <View style={styles.projectDetailsCard}>
                <View style={styles.projectDetailsBadge}>
                  <Text style={styles.projectDetailsBadgeText}>{selectedProject.domain}</Text>
                </View>
                
                <Text style={styles.projectDetailsName}>{selectedProject.title}</Text>
                
                <View style={styles.projectDetailsRow}>
                  <Ionicons name="business-outline" size={16} color="#666" />
                  <Text style={styles.projectDetailsClient}>{selectedProject.client}</Text>
                </View>

                <View style={styles.projectDetailsStats}>
                  <View style={styles.projectDetailsStat}>
                    <Text style={styles.projectDetailsStatValue}>₹{selectedProject.budget.toLocaleString()}</Text>
                    <Text style={styles.projectDetailsStatLabel}>Budget</Text>
                  </View>
                  <View style={styles.projectDetailsStat}>
                    <Text style={styles.projectDetailsStatValue}>{selectedProject.proposals}</Text>
                    <Text style={styles.projectDetailsStatLabel}>Proposals</Text>
                  </View>
                  <View style={styles.projectDetailsStat}>
                    <Text style={styles.projectDetailsStatValue}>{selectedProject.status || 'Open'}</Text>
                    <Text style={styles.projectDetailsStatLabel}>Status</Text>
                  </View>
                </View>

                {selectedProject.description && (
                  <View style={styles.projectDetailsSection}>
                    <Text style={styles.projectDetailsSectionTitle}>Description</Text>
                    <Text style={styles.projectDetailsDescription}>{selectedProject.description}</Text>
                  </View>
                )}

                {selectedProject.deadline && (
                  <View style={styles.projectDetailsSection}>
                    <Text style={styles.projectDetailsSectionTitle}>Deadline</Text>
                    <View style={styles.projectDetailsDeadline}>
                      <Ionicons name="calendar-outline" size={16} color="#E5493D" />
                      <Text style={styles.projectDetailsDeadlineText}>{selectedProject.deadline}</Text>
                    </View>
                  </View>
                )}

                {selectedProject.skills && selectedProject.skills.length > 0 && (
                  <View style={styles.projectDetailsSection}>
                    <Text style={styles.projectDetailsSectionTitle}>Required Skills</Text>
                    <View style={styles.projectDetailsSkills}>
                      {selectedProject.skills.map((skill, index) => (
                        <View key={index} style={styles.projectDetailsSkillChip}>
                          <Text style={styles.projectDetailsSkillText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {!isClient && (
                <TouchableOpacity 
                  style={styles.projectDetailsApplyBtn}
                  onPress={() => applyToProject(selectedProject)}
                >
                  <Ionicons name="paper-plane-outline" size={20} color="#FFF" />
                  <Text style={styles.projectDetailsApplyBtnText}>Apply to this Project</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Apply Success Modal */}
      <Modal visible={showApplySuccess} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            </View>
            <Text style={styles.successTitle}>Successfully Applied!</Text>
            <Text style={styles.successMessage}>
              You have successfully applied to the project "{appliedProjectName}"
            </Text>
            <TouchableOpacity style={styles.successBtn} onPress={closeApplySuccess}>
              <Text style={styles.successBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Post Project Modal */}
      <Modal visible={showPostProject} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.postProjectContainer}>
          <View style={styles.postProjectHeader}>
            <Text style={styles.postProjectTitle}>Post a Project</Text>
            <TouchableOpacity onPress={() => setShowPostProject(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.postProjectContent} showsVerticalScrollIndicator={false}>
            <View style={styles.postProjectForm}>
              <Text style={styles.formLabel}>Project Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter project name"
                placeholderTextColor="#bbb"
                value={newProjectTitle}
                onChangeText={setNewProjectTitle}
              />

              <Text style={styles.formLabel}>Budget (INR) *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter budget amount"
                placeholderTextColor="#bbb"
                value={newProjectBudget}
                onChangeText={setNewProjectBudget}
                keyboardType="numeric"
              />

              <Text style={styles.formLabel}>Domain</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., Web Development, Mobile, Design"
                placeholderTextColor="#bbb"
                value={newProjectDomain}
                onChangeText={setNewProjectDomain}
              />

              <Text style={styles.formLabel}>Project Details *</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Describe the project requirements, scope, and expectations..."
                placeholderTextColor="#bbb"
                value={newProjectDescription}
                onChangeText={setNewProjectDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <Text style={styles.formLabel}>Company / User Info</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                placeholder="Information about your company or yourself (name, background, etc.)"
                placeholderTextColor="#bbb"
                value={newProjectCompanyInfo}
                onChangeText={setNewProjectCompanyInfo}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.postProjectBtn, postProjectLoading && styles.postProjectBtnDisabled]}
                onPress={createProject}
                disabled={postProjectLoading}
              >
                {postProjectLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
                    <Text style={styles.postProjectBtnText}>Post Project</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Message Options Modal */}
      <Modal visible={showMessageOptions} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.messageOptionsOverlay}
          activeOpacity={1}
          onPress={() => setShowMessageOptions(false)}
        >
          <View style={styles.messageOptionsModal}>
            {/* Forward Option - First */}
            <TouchableOpacity 
              style={styles.messageOption} 
              onPress={() => {
                setShowMessageOptions(false);
                if (selectedMessage) {
                  setForwardingMessage(selectedMessage);
                  setShowForwardModal(true);
                }
              }}
            >
              <Ionicons name="share-outline" size={20} color="#E5493D" />
              <Text style={styles.messageOptionText}>Forward</Text>
            </TouchableOpacity>
            
            {selectedMessage?.sender === 'You' && (
              <>
                <TouchableOpacity style={styles.messageOption} onPress={startEditMessage}>
                  <Ionicons name="create-outline" size={20} color="#2196F3" />
                  <Text style={styles.messageOptionText}>Edit</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.messageOption} onPress={deleteMessage}>
                  <Ionicons name="trash-outline" size={20} color="#F44336" />
                  <Text style={[styles.messageOptionText, { color: '#F44336' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
            
            <TouchableOpacity 
              style={styles.messageOption}
              onPress={() => {
                setShowMessageOptions(false);
                Alert.alert('Copied', 'Message copied to clipboard');
              }}
            >
              <Ionicons name="copy-outline" size={20} color="#666" />
              <Text style={styles.messageOptionText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward Message Modal */}
      <Modal visible={showForwardModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.forwardContainer}>
          <View style={styles.forwardHeader}>
            <Text style={styles.forwardTitle}>Forward Message</Text>
            <TouchableOpacity onPress={() => {
              setShowForwardModal(false);
              setForwardingMessage(null);
            }}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.forwardContent}>
            <Text style={styles.forwardLabel}>Select channel to forward to:</Text>
            
            <FlatList
              data={channels.filter(c => c.id !== selectedChannel)}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.forwardChannelItem}
                  onPress={() => forwardMessage(item.id)}
                >
                  <Ionicons 
                    name={
                      item.type === 'direct' ? 'person-circle-outline' : 
                      item.type === 'community' ? 'people-outline' : 
                      'chatbubbles-outline'
                    } 
                    size={24} 
                    color="#E5493D" 
                  />
                  <View style={styles.forwardChannelInfo}>
                    <Text style={styles.forwardChannelName}>
                      {item.type === 'direct' ? item.name : `# ${item.name}`}
                    </Text>
                    <Text style={styles.forwardChannelType}>{item.type}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.forwardEmpty}>
                  <Ionicons name="chatbubble-outline" size={40} color="#ddd" />
                  <Text style={styles.forwardEmptyText}>No other channels available</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
      {/* Full Project Details Page Modal */}
      <Modal visible={showFullProjectDetails} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.fullProjectContainer}>
          <View style={styles.fullProjectHeader}>
            <TouchableOpacity onPress={() => setShowFullProjectDetails(false)}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.fullProjectHeaderTitle}>Project Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedProject && (
            <ScrollView style={styles.fullProjectContent}>
              {/* Project Header */}
              <View style={styles.fullProjectHero}>
                <View style={styles.fullProjectBadge}>
                  <Text style={styles.fullProjectBadgeText}>{selectedProject.domain}</Text>
                </View>
                <Text style={styles.fullProjectTitle}>{selectedProject.title}</Text>
                <View style={styles.fullProjectMeta}>
                  <View style={styles.fullProjectMetaItem}>
                    <Ionicons name="business-outline" size={16} color="#666" />
                    <Text style={styles.fullProjectMetaText}>{selectedProject.client}</Text>
                  </View>
                  <View style={styles.fullProjectMetaItem}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <Text style={styles.fullProjectMetaText}>{selectedProject.deadline || 'Flexible'}</Text>
                  </View>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.fullProjectStats}>
                <View style={styles.fullProjectStatCard}>
                  <Text style={styles.fullProjectStatValue}>₹{selectedProject.budget.toLocaleString()}</Text>
                  <Text style={styles.fullProjectStatLabel}>Budget</Text>
                </View>
                <View style={styles.fullProjectStatCard}>
                  <Text style={styles.fullProjectStatValue}>{selectedProject.proposals}</Text>
                  <Text style={styles.fullProjectStatLabel}>Proposals</Text>
                </View>
                <View style={styles.fullProjectStatCard}>
                  <Text style={styles.fullProjectStatValue}>{selectedProject.status || 'Open'}</Text>
                  <Text style={styles.fullProjectStatLabel}>Status</Text>
                </View>
              </View>

              {/* Description */}
              <View style={styles.fullProjectSection}>
                <Text style={styles.fullProjectSectionTitle}>Description</Text>
                <Text style={styles.fullProjectDescription}>
                  {selectedProject.description || 'No description provided for this project.'}
                </Text>
              </View>

              {/* Skills */}
              {selectedProject.skills && selectedProject.skills.length > 0 && (
                <View style={styles.fullProjectSection}>
                  <Text style={styles.fullProjectSectionTitle}>Required Skills</Text>
                  <View style={styles.fullProjectSkills}>
                    {selectedProject.skills.map((skill, index) => (
                      <View key={index} style={styles.fullProjectSkillChip}>
                        <Text style={styles.fullProjectSkillText}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Apply Button */}
              {!isClient && !appliedProjects.find(p => p.id === selectedProject.id) && (
                <TouchableOpacity 
                  style={styles.fullProjectApplyBtn}
                  onPress={() => {
                    applyToProject(selectedProject);
                    setShowFullProjectDetails(false);
                  }}
                >
                  <Ionicons name="paper-plane-outline" size={20} color="#FFF" />
                  <Text style={styles.fullProjectApplyBtnText}>Apply to this Project</Text>
                </TouchableOpacity>
              )}
              {!isClient && appliedProjects.find(p => p.id === selectedProject.id) && (
                <View style={styles.fullProjectAppliedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={styles.fullProjectAppliedText}>Applied</Text>
                </View>
              )}

              {/* Client: View Applicants */}
              {isClient && (
                <View style={styles.fullProjectSection}>
                  <Text style={styles.fullProjectSectionTitle}>Applicants ({selectedProject.proposals})</Text>
                  <TouchableOpacity style={styles.viewApplicantsBtn}>
                    <Ionicons name="people-outline" size={20} color="#E5493D" />
                    <Text style={styles.viewApplicantsBtnText}>View All Applicants</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Complete Calendar Modal */}
      <Modal visible={showCalendar} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.completeCalendarContainer}>
          <View style={styles.completeCalendarHeader}>
            <TouchableOpacity onPress={() => setShowCalendar(false)}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.completeCalendarTitle}>Calendar</Text>
            <TouchableOpacity onPress={() => {
              // Toggle add event form visibility
              setSelectedDate(new Date());
            }}>
              <Ionicons name="add-circle-outline" size={24} color="#E5493D" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.completeCalendarContent}>
            {/* Channel Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelFilterScroll}>
              <TouchableOpacity 
                style={[styles.channelFilterChip, calendarChannelFilter === 'all' && styles.channelFilterChipActive]}
                onPress={() => setCalendarChannelFilter('all')}
              >
                <Text style={[styles.channelFilterText, calendarChannelFilter === 'all' && styles.channelFilterTextActive]}>
                  All Calendars
                </Text>
              </TouchableOpacity>
              {channels.map(channel => (
                <TouchableOpacity 
                  key={channel.id}
                  style={[styles.channelFilterChip, calendarChannelFilter === channel.id && styles.channelFilterChipActive]}
                  onPress={() => setCalendarChannelFilter(channel.id)}
                >
                  <Ionicons 
                    name={channel.type === 'direct' ? 'person' : channel.type === 'community' ? 'people' : 'chatbubbles'} 
                    size={14} 
                    color={calendarChannelFilter === channel.id ? '#FFF' : '#666'} 
                  />
                  <Text style={[styles.channelFilterText, calendarChannelFilter === channel.id && styles.channelFilterTextActive]}>
                    {channel.type === 'direct' ? channel.name : `# ${channel.name}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Month Navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => {
                const prevMonth = new Date(currentMonth);
                prevMonth.setMonth(prevMonth.getMonth() - 1);
                setCurrentMonth(prevMonth);
              }}>
                <Ionicons name="chevron-back" size={24} color="#E5493D" />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => {
                const nextMonth = new Date(currentMonth);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                setCurrentMonth(nextMonth);
              }}>
                <Ionicons name="chevron-forward" size={24} color="#E5493D" />
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={styles.weekDaysHeader}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <View key={day} style={styles.weekDayCell}>
                  <Text style={styles.weekDayText}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {generateCalendarDays().map((week, weekIndex) => (
                <View key={weekIndex} style={styles.calendarWeek}>
                  {week.map((day, dayIndex) => {
                    // Get all events (main + channel-specific based on filter)
                    const allEvents = calendarChannelFilter === 'all' 
                      ? [...calendarEvents, ...Object.values(channelCalendarEvents).flat()]
                      : calendarChannelFilter === 'main'
                      ? calendarEvents
                      : (channelCalendarEvents[calendarChannelFilter] || []);
                    
                    const hasEvent = day && allEvents.some(e => {
                      const eventDate = new Date(e.date);
                      return eventDate.getDate() === day && 
                             eventDate.getMonth() === currentMonth.getMonth() &&
                             eventDate.getFullYear() === currentMonth.getFullYear();
                    });
                    const isToday = day && 
                      day === new Date().getDate() && 
                      currentMonth.getMonth() === new Date().getMonth() &&
                      currentMonth.getFullYear() === new Date().getFullYear();
                    const isSelected = day && selectedDate && 
                      day === selectedDate.getDate() && 
                      currentMonth.getMonth() === selectedDate.getMonth() &&
                      currentMonth.getFullYear() === selectedDate.getFullYear();
                    
                    return (
                      <TouchableOpacity 
                        key={dayIndex} 
                        style={[
                          styles.calendarDay,
                          isToday ? styles.calendarDayToday : null,
                          isSelected ? styles.calendarDaySelected : null,
                          hasEvent ? styles.calendarDayWithEvent : null
                        ]}
                        onPress={() => day && setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                        disabled={!day}
                      >
                        <Text style={[
                          styles.calendarDayText,
                          isToday ? styles.calendarDayTextToday : null,
                          isSelected ? styles.calendarDayTextSelected : null
                        ]}>
                          {day || ''}
                        </Text>
                        {hasEvent && <View style={styles.eventDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Add Event Form */}
            <View style={styles.addEventForm}>
              <Text style={styles.formTitle}>Add New Event</Text>
              
              <TextInput
                style={styles.eventInput}
                placeholder="Event title"
                placeholderTextColor="#999"
                value={newEventTitle}
                onChangeText={setNewEventTitle}
              />
              
              <View style={styles.dateTimeRow}>
                <TextInput
                  style={[styles.eventInput, styles.dateInput]}
                  placeholder="Date (YYYY-MM-DD)"
                  placeholderTextColor="#999"
                  value={newEventDate}
                  onChangeText={setNewEventDate}
                />
                <TextInput
                  style={[styles.eventInput, styles.timeInput]}
                  placeholder="Time (HH:MM)"
                  placeholderTextColor="#999"
                  value={newEventTime}
                  onChangeText={setNewEventTime}
                />
              </View>

              <View style={styles.eventTypeSelector}>
                {(['meeting', 'deadline', 'reminder'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.eventTypeOption,
                      newEventType === type && styles.eventTypeOptionSelected
                    ]}
                    onPress={() => setNewEventType(type)}
                  >
                    <Text style={[
                      styles.eventTypeText,
                      newEventType === type && styles.eventTypeTextSelected
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.addEventBtn} onPress={addCalendarEvent}>
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.addEventBtnText}>Add Event</Text>
              </TouchableOpacity>
            </View>

            {/* Events for Selected Date */}
            {selectedDate && (
              <View style={styles.selectedDateEvents}>
                <Text style={styles.selectedDateTitle}>
                  Events for {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
                {(() => {
                  const allEvents = calendarChannelFilter === 'all' 
                    ? [...calendarEvents, ...Object.values(channelCalendarEvents).flat()]
                    : calendarChannelFilter === 'main'
                    ? calendarEvents
                    : (channelCalendarEvents[calendarChannelFilter] || []);
                  
                  const filteredEvents = allEvents.filter(e => {
                    const eventDate = new Date(e.date);
                    return eventDate.getDate() === selectedDate.getDate() && 
                           eventDate.getMonth() === selectedDate.getMonth() &&
                           eventDate.getFullYear() === selectedDate.getFullYear();
                  });
                  
                  if (filteredEvents.length === 0) {
                    return <Text style={styles.noEventsText}>No events for this date</Text>;
                  }
                  
                  return filteredEvents.map(event => (
                    <View key={event.id} style={styles.eventCard}>
                      <View style={styles.eventIcon}>
                        <Ionicons 
                          name={
                            event.type === 'meeting' ? 'videocam-outline' :
                            event.type === 'deadline' ? 'alarm-outline' :
                            'notifications-outline'
                          } 
                          size={20} 
                          color="#E5493D" 
                        />
                      </View>
                      <View style={styles.eventInfo}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventDateTime}>{event.time}</Text>
                        <Text style={styles.eventType}>{event.type}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.deleteEventBtn}
                        onPress={() => deleteCalendarEvent(event.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#E5493D" />
                      </TouchableOpacity>
                    </View>
                  ));
                })()}
              </View>
            )}

            {/* All Events List */}
            <View style={styles.upcomingEventsSection}>
              <Text style={styles.upcomingEventsTitle}>
                {calendarChannelFilter === 'all' ? 'All Events' : `${channels.find(c => c.id === calendarChannelFilter)?.name || 'Channel'} Events`}
              </Text>
              {(() => {
                const allEvents = calendarChannelFilter === 'all' 
                  ? [...calendarEvents, ...Object.values(channelCalendarEvents).flat()]
                  : calendarChannelFilter === 'main'
                  ? calendarEvents
                  : (channelCalendarEvents[calendarChannelFilter] || []);
                
                if (allEvents.length === 0) {
                  return (
                    <View style={styles.emptyEvents}>
                      <Ionicons name="calendar-outline" size={40} color="#ddd" />
                      <Text style={styles.emptyEventsText}>No events scheduled</Text>
                    </View>
                  );
                }
                
                return allEvents.map(event => (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventIcon}>
                      <Ionicons 
                        name={
                          event.type === 'meeting' ? 'videocam-outline' :
                          event.type === 'deadline' ? 'alarm-outline' :
                          'notifications-outline'
                        } 
                        size={20} 
                        color="#E5493D" 
                      />
                    </View>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventDateTime}>{event.date} at {event.time}</Text>
                      <Text style={styles.eventType}>{event.type}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteEventBtn}
                      onPress={() => deleteCalendarEvent(event.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#E5493D" />
                    </TouchableOpacity>
                  </View>
                ));
              })()}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  mainTabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#F5F5F5', gap: 6 },
  mainTabActive: { backgroundColor: '#FFF0ED' },
  mainTabText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#999' },
  mainTabTextActive: { color: '#E5493D' },
  chatBadge: { backgroundColor: '#E5493D', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chatBadgeText: { fontSize: 10, fontFamily: 'Geist_700Bold', color: '#FFF' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', marginHorizontal: 12, paddingHorizontal: 10, borderRadius: 8, marginBottom: 10, height: 36 },
  searchInput: { flex: 1, paddingLeft: 6, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#333' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 6, backgroundColor: '#F5F5F5', alignItems: 'center' },
  tabActive: { backgroundColor: '#FFF0ED' },
  tabText: { fontSize: 11, fontFamily: 'Geist_500Medium', color: '#999' },
  tabTextActive: { color: '#E5493D' },
  card: { backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { backgroundColor: '#E3F2FD', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#1976D2' },
  budget: { fontSize: 14, fontFamily: 'Geist_700Bold', color: '#4CAF50' },
  cardTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a', marginBottom: 8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  client: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },
  proposalsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  proposals: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },
  applyBtn: { marginLeft: 'auto', backgroundColor: '#E5493D', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  applyBtnText: { color: '#FFF', fontSize: 11, fontFamily: 'Geist_600SemiBold' },
  fab: { position: 'absolute', bottom: 90, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5493D', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  channelContainer: { flex: 1 },
  channelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  channelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  channelHeaderTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333' },
  connectionStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  connected: { backgroundColor: '#E8F5E9' },
  disconnected: { backgroundColor: '#FFEBEE' },
  connectionStatusText: { fontSize: 9, fontFamily: 'Geist_500Medium' },
  channelFilters: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F5F5F5' },
  filterChipText: { fontSize: 11, fontFamily: 'Geist_500Medium', color: '#666' },
  channelItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  channelItemActive: { backgroundColor: '#FFF0ED' },
  channelInfo: { flex: 1 },
  channelName: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#333' },
  channelNameActive: { color: '#E5493D' },
  channelType: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', textTransform: 'capitalize' },
  unreadBadge: { backgroundColor: '#E5493D', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadText: { fontSize: 10, fontFamily: 'Geist_700Bold', color: '#FFF' },
  onlineIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  channelActions: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  actionBtn: { padding: 8 },
  chatContainer: { flex: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { padding: 4, marginRight: 8 },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  chatHeaderType: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', textTransform: 'capitalize' },
  callBtn: { padding: 4 },
  messagesList: { flex: 1, backgroundColor: '#FAFAFA' },
  messageBubble: { maxWidth: '80%', backgroundColor: '#FFF', borderRadius: 12, borderBottomLeftRadius: 4, padding: 10, marginBottom: 8, alignSelf: 'flex-start' },
  messageBubbleSelf: { backgroundColor: '#E5493D', borderBottomLeftRadius: 12, borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  messageSender: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#E5493D', marginBottom: 2 },
  messageText: { fontSize: 13, fontFamily: 'Geist_400Regular', color: '#333' },
  messageTextSelf: { color: '#FFF' },
  messageTime: { fontSize: 9, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  messageTimeSelf: { color: 'rgba(255,255,255,0.7)' },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  emptyChatText: { marginTop: 8, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#ccc' },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FAFAFA' },
  typingText: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 8 },
  attachBtn: { padding: 4 },
  messageInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#333' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5493D', alignItems: 'center', justifyContent: 'center' },
  // Connections styles
  connectionsContainer: { flex: 1 },
  sectionTitle: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5493D', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#FFF' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  userType: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', textTransform: 'capitalize' },
  connectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF0ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  connectBtnText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#E5493D' },
  pendingBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  pendingText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#FF9800' },
  messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  messageBtnText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#4CAF50' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 24, width: '85%', maxWidth: 340 },
  modalTitle: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  modalInput: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#333', marginBottom: 12 },
  channelTypeSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  channelTypeOption: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', gap: 4 },
  channelTypeOptionSelected: { backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#E5493D' },
  channelTypeText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#666' },
  channelTypeTextSelected: { color: '#E5493D' },
  createBtn: { backgroundColor: '#E5493D', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  createBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },

  // Calendar modal
  calendarContainer: { flex: 1, backgroundColor: '#FFF' },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  calendarTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  calendarContent: { flex: 1, padding: 16 },
  addEventForm: { backgroundColor: '#F8F8F8', borderRadius: 12, padding: 16, marginBottom: 20 },
  formTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 12 },
  eventInput: { backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#333', marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  dateInput: { flex: 1 },
  timeInput: { flex: 1 },
  eventTypeSelector: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  eventTypeOption: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  eventTypeOptionSelected: { backgroundColor: '#FFF0ED', borderColor: '#E5493D' },
  eventTypeText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#666' },
  eventTypeTextSelected: { color: '#E5493D' },
  addEventBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5493D', paddingVertical: 12, borderRadius: 8, gap: 8 },
  addEventBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },
  eventsList: { flex: 1 },
  eventsListTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 12 },
  emptyEvents: { alignItems: 'center', paddingVertical: 40 },
  emptyEventsText: { marginTop: 8, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#ccc' },
  eventCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  eventIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  eventDateTime: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666', marginTop: 2 },
  eventType: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#E5493D', textTransform: 'capitalize', marginTop: 2 },
  deleteEventBtn: { padding: 8 },
  // Project card styles
  detailsBtn: { backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginRight: 8 },
  detailsBtnText: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#666' },
  // Message styles
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  likedIcon: { marginLeft: 6 },
  editedIndicator: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2, fontStyle: 'italic' },
  editedIndicatorSelf: { color: 'rgba(255,255,255,0.7)' },
  messageActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 6 },
  messageActionIcon: { padding: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.05)' },
  fileAttachment: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, padding: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 6 },
  fileName: { fontSize: 11, fontFamily: 'Geist_500Medium', color: '#E5493D' },
  fileNameSelf: { color: '#FFF' },
  attachedFileContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF0ED', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  attachedFilePreview: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  imagePreview: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#FFE5E0', alignItems: 'center', justifyContent: 'center' },
  imagePreviewText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#E5493D', marginTop: 2 },
  documentPreview: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#FFE5E0', alignItems: 'center', justifyContent: 'center' },
  documentPreviewText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#E5493D', marginTop: 2 },
  attachedFileInfo: { flex: 1 },
  attachedFileName: { fontSize: 13, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  attachedFileType: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },
  removeAttachmentBtn: { padding: 8 },
  editingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#E3F2FD', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  editingLabel: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#2196F3' },
  // Project Details Modal
  projectDetailsContainer: { flex: 1, backgroundColor: '#FFF' },
  projectDetailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  projectDetailsTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  projectDetailsContent: { flex: 1, padding: 16 },
  projectDetailsCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 16 },
  projectDetailsBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 12 },
  projectDetailsBadgeText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#1976D2' },
  projectDetailsName: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a', marginBottom: 8 },
  projectDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  projectDetailsClient: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666' },
  projectDetailsStats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F0F0F0', marginBottom: 16 },
  projectDetailsStat: { alignItems: 'center' },
  projectDetailsStatValue: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  projectDetailsStatLabel: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 4 },
  projectDetailsSection: { marginBottom: 16 },
  projectDetailsSectionTitle: { fontSize: 13, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 8 },
  projectDetailsDescription: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666', lineHeight: 20 },
  projectDetailsDeadline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectDetailsDeadlineText: { fontSize: 14, fontFamily: 'Geist_500Medium', color: '#333' },
  projectDetailsSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  projectDetailsSkillChip: { backgroundColor: '#FFF0ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  projectDetailsSkillText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#E5493D' },
  projectDetailsApplyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5493D', paddingVertical: 16, borderRadius: 10, gap: 8, marginTop: 8 },
  projectDetailsApplyBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Geist_600SemiBold' },
  // Success Modal
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  successModal: { backgroundColor: '#FFF', borderRadius: 20, padding: 32, width: '80%', maxWidth: 320, alignItems: 'center' },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#333', marginBottom: 8 },
  successMessage: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666', textAlign: 'center', marginBottom: 24 },
  successBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  successBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },
  // Post Project Modal
  postProjectContainer: { flex: 1, backgroundColor: '#FFF' },
  postProjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  postProjectTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  postProjectContent: { flex: 1 },
  postProjectForm: { padding: 16, paddingBottom: 40 },
  formLabel: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#666', marginBottom: 6, marginTop: 16 },
  formInput: { backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#333', borderWidth: 1, borderColor: '#E8E8E8' },
  formTextArea: { minHeight: 100, paddingTop: 12 },
  postProjectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E5493D', borderRadius: 10, paddingVertical: 14, marginTop: 24 },
  postProjectBtnDisabled: { backgroundColor: '#CCC' },
  postProjectBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Geist_600SemiBold' },
  // Message Options Modal
  messageOptionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  messageOptionsModal: { backgroundColor: '#FFF', borderRadius: 12, padding: 8, width: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  messageOption: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  messageOptionText: { fontSize: 14, fontFamily: 'Geist_500Medium', color: '#333' },
  // Forward Modal
  forwardContainer: { flex: 1, backgroundColor: '#FFF' },
  forwardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  forwardTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  forwardContent: { flex: 1, padding: 16 },
  forwardLabel: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 16 },
  forwardChannelItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  forwardChannelInfo: { flex: 1, marginLeft: 12 },
  forwardChannelName: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  forwardChannelType: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999', textTransform: 'capitalize' },
  forwardEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  forwardEmptyText: { marginTop: 8, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#ccc' },
  
  // Sidebar styles
  sidebarContainer: { flex: 1, backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#F0F0F0' },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sidebarHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sidebarHeaderTitle: { fontSize: 16, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  sidebarContent: { flex: 1 },
  sidebarSection: { paddingTop: 8 },
  sidebarSectionTitle: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 8 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  sidebarItemActive: { backgroundColor: '#FFF0ED' },
  sidebarItemInfo: { flex: 1 },
  sidebarItemName: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#333' },
  sidebarItemNameActive: { color: '#E5493D' },
  sidebarActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  sidebarActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  sidebarActionText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#E5493D' },
  
  // Chat with sidebar
  chatWithSidebar: { flex: 1, flexDirection: 'row' },
  chatSidebar: { width: 240, borderRightWidth: 1, borderRightColor: '#F0F0F0' },
  menuBtn: { padding: 4, marginRight: 8 },
  
  // Delivery ticks
  tickContainer: { marginLeft: 4 },
  doubleTick: { flexDirection: 'row' },
  tickOverlap: { marginRight: -8 },
  
  // Connection requests
  requestsSection: { marginBottom: 16 },
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  requestMessage: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },
  requestStatus: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  
  // Projects
  moreDetailsBtn: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginRight: 8 },
  moreDetailsBtnText: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#1976D2' },
  appliedBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  appliedBadgeText: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#4CAF50' },
  emptyProjects: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyProjectsText: { marginTop: 12, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#ccc' },
  
  // Full Project Details
  fullProjectContainer: { flex: 1, backgroundColor: '#FFF' },
  fullProjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  fullProjectHeaderTitle: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  fullProjectContent: { flex: 1 },
  fullProjectHero: { padding: 20, backgroundColor: '#FAFAFA' },
  fullProjectBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start', marginBottom: 12 },
  fullProjectBadgeText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#1976D2' },
  fullProjectTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a', marginBottom: 12 },
  fullProjectMeta: { gap: 8 },
  fullProjectMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fullProjectMetaText: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666' },
  fullProjectStats: { flexDirection: 'row', padding: 16, gap: 12 },
  fullProjectStatCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0', alignItems: 'center' },
  fullProjectStatValue: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  fullProjectStatLabel: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 4 },
  fullProjectSection: { padding: 20, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  fullProjectSectionTitle: { fontSize: 16, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 12 },
  fullProjectDescription: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666', lineHeight: 22 },
  fullProjectSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fullProjectSkillChip: { backgroundColor: '#FFF0ED', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  fullProjectSkillText: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#E5493D' },
  fullProjectApplyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5493D', paddingVertical: 16, borderRadius: 12, gap: 8, margin: 20 },
  fullProjectApplyBtnText: { color: '#FFF', fontSize: 16, fontFamily: 'Geist_600SemiBold' },
  viewApplicantsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0ED', paddingVertical: 14, borderRadius: 10, gap: 8, borderWidth: 1, borderColor: '#E5493D' },
  viewApplicantsBtnText: { color: '#E5493D', fontSize: 14, fontFamily: 'Geist_600SemiBold' },
  fullProjectAppliedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9', paddingVertical: 16, borderRadius: 12, gap: 8, margin: 20, borderWidth: 1, borderColor: '#4CAF50' },
  fullProjectAppliedText: { color: '#4CAF50', fontSize: 16, fontFamily: 'Geist_600SemiBold' },
  
  // Complete Calendar
  completeCalendarContainer: { flex: 1, backgroundColor: '#FFF' },
  completeCalendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  completeCalendarTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  completeCalendarContent: { flex: 1 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  monthTitle: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  weekDaysHeader: { flexDirection: 'row', paddingHorizontal: 12, backgroundColor: '#F8F8F8', paddingVertical: 10 },
  weekDayCell: { flex: 1, alignItems: 'center' },
  weekDayText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#999' },
  calendarGrid: { paddingHorizontal: 12 },
  calendarWeek: { flexDirection: 'row' },
  calendarDay: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 2 },
  calendarDayToday: { backgroundColor: '#FFF0ED' },
  calendarDaySelected: { backgroundColor: '#E5493D' },
  calendarDayWithEvent: { borderWidth: 1, borderColor: '#E5493D' },
  calendarDayText: { fontSize: 14, fontFamily: 'Geist_500Medium', color: '#333' },
  calendarDayTextToday: { color: '#E5493D' },
  calendarDayTextSelected: { color: '#FFF' },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#E5493D', marginTop: 2 },
  selectedDateEvents: { padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0', marginTop: 8 },
  selectedDateTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 12 },
  noEventsText: { fontSize: 13, fontFamily: 'Geist_400Regular', color: '#999', textAlign: 'center', paddingVertical: 20 },
  upcomingEventsSection: { padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0', marginTop: 8 },
  upcomingEventsTitle: { fontSize: 16, fontFamily: 'Geist_600SemiBold', color: '#333', marginBottom: 12 },
  
  // Sidebar Overlay
  sidebarModalRoot: { 
    flex: 1, 
    flexDirection: 'row' 
  },
  sidebarBlurOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sidebarOverlayContainer: { 
    width: 280, 
    backgroundColor: '#FFF', 
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    zIndex: 10,
  },
  
  // Chat Header Actions
  chatHeaderActions: { flexDirection: 'row', gap: 8 },
  headerActionBtn: { padding: 6 },
  
  // Channel Filter in Calendar
  channelFilterScroll: { paddingHorizontal: 16, paddingVertical: 12 },
  channelFilterChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#F5F5F5',
    marginRight: 8
  },
  channelFilterChipActive: { backgroundColor: '#E5493D' },
  channelFilterText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#666' },
  channelFilterTextActive: { color: '#FFF' },
  
  // System message
  systemMessageText: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  
  // Sidebar improvements
  sidebarHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sidebarAddBtn: { padding: 2 },
  sidebarCloseBtn: { padding: 2 },
  sidebarItemDescription: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 1 },
  emptySidebarContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptySidebarText: { fontSize: 14, fontFamily: 'Geist_500Medium', color: '#999', marginTop: 12 },
  emptySidebarSubtext: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#bbb', marginTop: 4 },
  
  // Create Channel Modal improvements
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#666', marginBottom: 6 },
  modalTextArea: { height: 60, textAlignVertical: 'top' },

  // Members modal
  membersModalContent: { maxHeight: '80%' },
  membersAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  membersInput: { flex: 1, marginBottom: 0 },
  membersAddBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#E5493D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  membersList: { maxHeight: 320 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
    gap: 8,
  },
  memberInfo: { flex: 1 },
  memberIdText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  memberRoleText: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#777', textTransform: 'capitalize' },
  roleSelector: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
  },
  roleChipActive: { backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#E5493D' },
  roleChipText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#666' },
  roleChipTextActive: { color: '#E5493D' },
  removeMemberBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F1',
  },
});
