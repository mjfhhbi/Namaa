/**
 * Google Cloud Firestore REST API Client for Cloudflare Pages Functions
 * Built 100% on standard Web APIs (fetch, crypto.subtle, TextEncoder, atob, btoa)
 * Zero Node.js modules, zero Firebase Admin SDK
 */

export interface FirestoreConfig {
  projectId: string;
  databaseId?: string;
  clientEmail?: string;
  privateKeyPem?: string; // Service Account RSA Private Key (PEM format)
  accessToken?: string;   // Optional pre-configured access token
}

export interface FirestoreFieldMap {
  [key: string]: any;
}

// Convert native JS values to Firestore REST API typed values
export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue)
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Convert Firestore REST typed value back to native JS
export function fromFirestoreValue(valObj: any): any {
  if (!valObj || typeof valObj !== 'object') return null;
  if ('nullValue' in valObj) return null;
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('timestampValue' in valObj) return valObj.timestampValue;
  if ('arrayValue' in valObj) {
    return (valObj.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in valObj) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(valObj.mapValue?.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  if (!fields) return result;
  for (const [k, v] of Object.entries(fields)) {
    result[k] = fromFirestoreValue(v);
  }
  return result;
}

// Web Crypto RS256 JWT Generator for Google OAuth2 Service Account
export async function createGoogleServiceAccountJwt(
  clientEmail: string,
  privateKeyPem: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const enc = new TextEncoder();
  const b64Header = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64Payload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dataToSign = `${b64Header}.${b64Payload}`;

  // Strip PEM headers and newlines
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  const binaryDer = atob(pemContents);
  const derBytes = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derBytes[i] = binaryDer.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(dataToSign));
  const sigBytes = new Uint8Array(signature);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.length; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]);
  }
  const b64Signature = btoa(sigBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${dataToSign}.${b64Signature}`;
}

export interface FirestoreClientInterface {
  beginTransaction(): Promise<string>;
  getDocument(path: string, transactionId?: string): Promise<{ exists: boolean; data?: any; updateTime?: string; path: string }>;
  commit(transactionId: string, writes: any[]): Promise<boolean>;
  rollback(transactionId: string): Promise<void>;
}

/**
 * Production Firestore REST API Client
 */
export class FirestoreRestClient implements FirestoreClientInterface {
  private config: FirestoreConfig;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(config: FirestoreConfig) {
    this.config = config;
  }

  private get databasePath(): string {
    const db = this.config.databaseId || '(default)';
    return `projects/${this.config.projectId}/databases/${db}`;
  }

  private async getAuthToken(): Promise<string> {
    if (this.config.accessToken) return this.config.accessToken;
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 300 * 1000) {
      return this.cachedToken.token;
    }

    if (!this.config.clientEmail || !this.config.privateKeyPem) {
      throw new Error('Firestore credentials not configured. Service Account email and private key are required for server-side writes.');
    }

    const jwt = await createGoogleServiceAccountJwt(
      this.config.clientEmail,
      this.config.privateKeyPem,
      'https://www.googleapis.com/auth/datastore'
    );

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!res.ok) {
      throw new Error('Failed to obtain Google Cloud OAuth2 access token for Firestore REST API.');
    }

    const data = await res.json() as any;
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000
    };
    return this.cachedToken.token;
  }

  async beginTransaction(): Promise<string> {
    const token = await this.getAuthToken();
    const url = `https://firestore.googleapis.com/v1/${this.databasePath}/documents:beginTransaction`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        options: {
          readWrite: {}
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Firestore beginTransaction failed with status ${res.status}`);
    }

    const data = await res.json() as any;
    return data.transaction;
  }

  async getDocument(path: string, transactionId?: string): Promise<{ exists: boolean; data?: any; updateTime?: string; path: string }> {
    const token = await this.getAuthToken();
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const docUrl = `https://firestore.googleapis.com/v1/${this.databasePath}/documents/${cleanPath}`;

    const body: Record<string, any> = {
      documents: [`${this.databasePath}/documents/${cleanPath}`]
    };
    if (transactionId) {
      body.transaction = transactionId;
    }

    const batchUrl = `https://firestore.googleapis.com/v1/${this.databasePath}/documents:batchGet`;
    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Firestore batchGet failed with status ${res.status}`);
    }

    const results = await res.json() as any[];
    const first = Array.isArray(results) ? results[0] : results;
    if (first && first.found) {
      return {
        exists: true,
        path: cleanPath,
        updateTime: first.found.updateTime,
        data: fromFirestoreFields(first.found.fields)
      };
    }

    return { exists: false, path: cleanPath };
  }

  async commit(transactionId: string, writes: any[]): Promise<boolean> {
    const token = await this.getAuthToken();
    const url = `https://firestore.googleapis.com/v1/${this.databasePath}/documents:commit`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction: transactionId,
        writes
      })
    });

    if (res.status === 409) {
      // Aborted due to concurrency contention
      return false;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(`Firestore commit failed: ${err?.error?.message || res.status}`);
    }

    return true;
  }

  async rollback(transactionId: string): Promise<void> {
    try {
      const token = await this.getAuthToken();
      const url = `https://firestore.googleapis.com/v1/${this.databasePath}/documents:rollback`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transaction: transactionId })
      });
    } catch {
      // Ignore rollback failure
    }
  }
}
