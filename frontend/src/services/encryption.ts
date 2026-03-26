import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple E2E encryption using symmetric encryption with shared keys
// In production, you would use a more robust solution like Signal Protocol

const KEY_STORAGE_KEY = 'e2e_encryption_key';

// Generate a random encryption key (simple approach without expo-crypto)
function generateRandomKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate random IV
function generateIV(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Store encryption key securely
async function storeKey(key: string): Promise<void> {
  await AsyncStorage.setItem(KEY_STORAGE_KEY, key);
}

// Retrieve encryption key
async function getKey(): Promise<string | null> {
  return await AsyncStorage.getItem(KEY_STORAGE_KEY);
}

// Simple XOR-based encryption (for demo purposes)
// In production, use AES-256-GCM or similar
function xorEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

// Convert string to base64
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    // Fallback for React Native
    return Buffer.from(str, 'utf8').toString('base64');
  }
}

// Convert base64 to string
function fromBase64(base64: string): string {
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch (e) {
    // Fallback for React Native
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}

// Generate key pair for E2E encryption
export async function generateKeyPair(): Promise<void> {
  try {
    let key = await getKey();
    if (!key) {
      key = generateRandomKey();
      await storeKey(key);
      console.log('Generated new encryption key');
    }
  } catch (error) {
    console.error('Error generating key pair:', error);
  }
}

// Get public key (in this simplified version, we use the same key)
export async function getPublicKey(): Promise<string> {
  const key = await getKey();
  if (!key) {
    throw new Error('Encryption key not found');
  }
  return key;
}

// Encrypt message
export async function encryptMessage(message: string): Promise<string> {
  try {
    const key = await getKey();
    if (!key) {
      throw new Error('Encryption key not found');
    }

    // Generate random IV
    const iv = generateIV();

    // Encrypt the message
    const encrypted = xorEncrypt(message, key + iv);

    // Combine IV and encrypted content
    const combined = iv + ':' + toBase64(encrypted);

    return combined;
  } catch (error) {
    console.error('Error encrypting message:', error);
    throw error;
  }
}

// Decrypt message
export async function decryptMessage(encryptedData: string): Promise<string> {
  try {
    const key = await getKey();
    if (!key) {
      throw new Error('Encryption key not found');
    }

    // Split IV and encrypted content
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = parts[0];
    const encrypted = fromBase64(parts[1]);

    // Decrypt the message
    const decrypted = xorEncrypt(encrypted, key + iv);

    return decrypted;
  } catch (error) {
    console.error('Error decrypting message:', error);
    throw error;
  }
}

// Encrypt message for specific recipient (using their public key)
export async function encryptMessageForRecipient(
  message: string,
  recipientPublicKey: string
): Promise<string> {
  try {
    // Generate random IV
    const iv = generateIV();

    // Encrypt the message with recipient's public key
    const encrypted = xorEncrypt(message, recipientPublicKey + iv);

    // Combine IV and encrypted content
    const combined = iv + ':' + toBase64(encrypted);

    return combined;
  } catch (error) {
    console.error('Error encrypting message for recipient:', error);
    throw error;
  }
}

// Decrypt message from specific sender
export async function decryptMessageFromSender(
  encryptedData: string,
  senderPublicKey: string
): Promise<string> {
  try {
    // Split IV and encrypted content
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = parts[0];
    const encrypted = fromBase64(parts[1]);

    // Decrypt the message
    const decrypted = xorEncrypt(encrypted, senderPublicKey + iv);

    return decrypted;
  } catch (error) {
    console.error('Error decrypting message from sender:', error);
    throw error;
  }
}

// Hash message for verification (simple hash)
export async function hashMessage(message: string): Promise<string> {
  try {
    // Simple hash function (in production, use SHA-256)
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  } catch (error) {
    console.error('Error hashing message:', error);
    throw error;
  }
}

// Verify message integrity
export async function verifyMessageIntegrity(
  message: string,
  hash: string
): Promise<boolean> {
  try {
    const computedHash = await hashMessage(message);
    return computedHash === hash;
  } catch (error) {
    console.error('Error verifying message integrity:', error);
    return false;
  }
}
