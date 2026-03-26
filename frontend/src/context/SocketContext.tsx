import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptMessage, decryptMessage, generateKeyPair, getPublicKey } from '../services/encryption';
import { SOCKET_URL } from '../config/api';

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  encrypted_content?: string;
  message_type: string;
  sent_at: string;
}

interface TypingUser {
  sid: string;
  channel_id: string;
  user_name: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  sendMessage: (channelId: string, content: string, messageType?: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  startTyping: (channelId: string) => void;
  stopTyping: (channelId: string) => void;
  messages: Record<string, Message[]>;
  typingUsers: TypingUser[];
  onlineUsers: string[];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [encryptionKeys, setEncryptionKeys] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    initializeSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initializeSocket = async () => {
    try {
      // Get user ID from storage
      const userId = await AsyncStorage.getItem('user_id') || 'user_' + Date.now();
      await AsyncStorage.setItem('user_id', userId);

      // Generate encryption keys
      await generateKeyPair();
      const publicKey = await getPublicKey();

      // Initialize socket connection
      const newSocket = io(SOCKET_URL, {
        auth: {
          userId,
          publicKey,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
      });

      // Listen for new messages
      newSocket.on('new_message', async (data: Message) => {
        console.log('New message received:', data);
        
        let content = data.content;
        
        // Decrypt if encrypted
        if (data.encrypted_content) {
          try {
            content = await decryptMessage(data.encrypted_content);
          } catch (e) {
            console.error('Failed to decrypt message:', e);
            content = '[Encrypted message]';
          }
        }

        const decryptedMessage: Message = {
          ...data,
          content,
        };

        setMessages(prev => ({
          ...prev,
          [data.channel_id]: [...(prev[data.channel_id] || []), decryptedMessage],
        }));
      });

      // Listen for typing indicators
      newSocket.on('user_typing', (data: TypingUser) => {
        setTypingUsers(prev => {
          const exists = prev.find(u => u.sid === data.sid && u.channel_id === data.channel_id);
          if (exists) return prev;
          return [...prev, data];
        });
      });

      newSocket.on('user_stop_typing', (data: { sid: string; channel_id: string }) => {
        setTypingUsers(prev => prev.filter(u => !(u.sid === data.sid && u.channel_id === data.channel_id)));
      });

      // Listen for user join/leave
      newSocket.on('user_joined', (data: { sid: string; user_id: string }) => {
        console.log('User joined:', data);
        setOnlineUsers(prev => [...prev, data.user_id]);
      });

      newSocket.on('user_left', (data: { sid: string; user_id: string }) => {
        console.log('User left:', data);
        setOnlineUsers(prev => prev.filter(id => id !== data.user_id));
      });

      // Listen for encryption key exchange
      newSocket.on('public_key', (data: { user_id: string; publicKey: string }) => {
        setEncryptionKeys(prev => ({
          ...prev,
          [data.user_id]: data.publicKey,
        }));
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

    } catch (error) {
      console.error('Error initializing socket:', error);
    }
  };

  const sendMessage = async (channelId: string, content: string, messageType: string = 'text') => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.error('Socket not connected');
      return;
    }

    try {
      const userId = await AsyncStorage.getItem('user_id') || 'user_1';
      
      // Encrypt message for E2E encryption
      let encryptedContent: string | undefined;
      try {
        encryptedContent = await encryptMessage(content);
      } catch (e) {
        console.warn('Encryption failed, sending unencrypted:', e);
      }

      const messageData = {
        channel_id: channelId,
        sender_id: userId,
        content: content,
        encrypted_content: encryptedContent,
        message_type: messageType,
        timestamp: new Date().toISOString(),
      };

      socketRef.current.emit('send_message', messageData);

      // Add message to local state immediately (optimistic update)
      const localMessage: Message = {
        id: Date.now().toString(),
        channel_id: channelId,
        sender_id: userId,
        sender_name: 'You',
        content: content,
        message_type: messageType,
        sent_at: new Date().toISOString(),
      };

      setMessages(prev => ({
        ...prev,
        [channelId]: [...(prev[channelId] || []), localMessage],
      }));

    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const joinChannel = (channelId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_channel', { channel_id: channelId });
    }
  };

  const leaveChannel = (channelId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('leave_channel', { channel_id: channelId });
    }
  };

  const startTyping = async (channelId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      const userId = await AsyncStorage.getItem('user_id') || 'user_1';
      socketRef.current.emit('typing_start', { 
        channel_id: channelId, 
        user_id: userId,
        user_name: 'You'
      });
    }
  };

  const stopTyping = async (channelId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      const userId = await AsyncStorage.getItem('user_id') || 'user_1';
      socketRef.current.emit('typing_stop', { 
        channel_id: channelId, 
        user_id: userId 
      });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        sendMessage,
        joinChannel,
        leaveChannel,
        startTyping,
        stopTyping,
        messages,
        typingUsers,
        onlineUsers,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
