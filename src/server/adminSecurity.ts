import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SECURITY_FILE = path.join(process.cwd(), 'data', 'admin_security.json');

interface AdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

interface RateRecord {
  count: number;
  lockedUntil?: number;
  resetAt?: number;
}

interface SecurityStorage {
  pinHash?: string;
  pinSalt?: string;
  updatedAt?: string;
  sessions: Record<string, AdminSession>;
  loginAttempts: Record<string, RateRecord>;
}

const state: SecurityStorage = {
  sessions: {},
  loginAttempts: {},
};

function ensureDir() {
  const dir = path.dirname(SECURITY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSecurityFile() {
  ensureDir();
  try {
    if (fs.existsSync(SECURITY_FILE)) {
      const raw = fs.readFileSync(SECURITY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.pinHash) state.pinHash = parsed.pinHash;
      if (parsed.pinSalt) state.pinSalt = parsed.pinSalt;
      if (parsed.sessions) state.sessions = parsed.sessions;
      if (parsed.loginAttempts) state.loginAttempts = parsed.loginAttempts;
    }
  } catch (err) {
    console.warn('[Security] Notice loading security file:', err);
  }
}

function saveSecurityFile() {
  ensureDir();
  try {
    // Purge expired sessions before saving
    const now = Date.now();
    for (const [token, session] of Object.entries(state.sessions)) {
      if (session.expiresAt <= now) {
        delete state.sessions[token];
      }
    }
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Security] Notice saving security file:', err);
  }
}

export function hashPin(pin: string, salt: string): string {
  return crypto.pbkdf2Sync(pin.trim(), salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * Initialize Admin PIN:
 * - If process.env.ADMIN_PIN is provided (min 6 chars), hash and persist.
 * - Otherwise, load from admin_security.json.
 * - If neither exists, PIN login is disabled (NO DEFAULT 1383!).
 */
export function initAdminSecurity() {
  loadSecurityFile();

  const envPin = process.env.ADMIN_PIN?.trim();
  if (envPin) {
    if (envPin.length >= 4) {
      const salt = crypto.randomBytes(32).toString('hex');
      state.pinSalt = salt;
      state.pinHash = hashPin(envPin, salt);
      state.updatedAt = new Date().toISOString();
      saveSecurityFile();
      console.log('[Security] Admin PIN successfully initialized from environment variable.');
    } else {
      console.warn('[Security] ADMIN_PIN environment variable is too short (minimum 4 characters required).');
    }
  } else if (state.pinHash) {
    console.log('[Security] Admin PIN loaded from secure persistent storage.');
  } else {
    console.warn('[Security] No ADMIN_PIN configured. PIN authentication is disabled until set by verified owner.');
  }
}

export function isPinConfigured(): boolean {
  return Boolean(state.pinHash && state.pinSalt);
}

export function verifyAdminPin(pin: string, clientIp: string): { success: boolean; token?: string; error?: string; status: number } {
  const now = Date.now();
  const attempt = state.loginAttempts[clientIp] || { count: 0, lockedUntil: 0, resetAt: now + 15 * 60 * 1000 };

  // Check IP lockout
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
    return {
      success: false,
      status: 429,
      error: `تعداد تلاش‌های ناموفق بیش از حد مجاز است. دسترسی موقتاً مسدود شد. لطفاً ${remainingMinutes} دقیقه دیگر تلاش فرمایید.`
    };
  }

  if (!isPinConfigured()) {
    return {
      success: false,
      status: 403,
      error: 'ورود با PIN در سرور پیکربندی نشده است. لطفاً از طریق حساب گوگل وارد شوید یا متغیر محیطی ADMIN_PIN را تنظیم فرمایید.'
    };
  }

  if (!pin || typeof pin !== 'string' || pin.trim().length > 32) {
    return { success: false, status: 400, error: 'رمز عبور مدیریت الزامی و حداکثر ۳۲ کاراکتر است.' };
  }

  const computedHash = hashPin(pin, state.pinSalt!);
  let isMatch = false;
  try {
    isMatch = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(state.pinHash!, 'hex')
    );
  } catch {
    isMatch = false;
  }

  if (isMatch) {
    delete state.loginAttempts[clientIp];
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const session: AdminSession = {
      token: sessionToken,
      createdAt: now,
      expiresAt: now + 12 * 3600 * 1000 // 12 hours
    };
    state.sessions[sessionToken] = session;
    saveSecurityFile();
    return { success: true, token: sessionToken, status: 200 };
  }

  // Failed attempt
  if (now > (attempt.resetAt || 0)) {
    attempt.count = 0;
    attempt.resetAt = now + 15 * 60 * 1000;
  }
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
  }
  state.loginAttempts[clientIp] = attempt;
  saveSecurityFile();

  return {
    success: false,
    status: 401,
    error: attempt.count >= 5
      ? 'به دلیل تلاش‌های متوالی نادرست، دسترسی شما موقتاً به مدت ۱۵ دقیقه مسدود شد.'
      : 'رمز عبور مدیریت نادرست است.'
  };
}

export function validateSessionToken(token: string): boolean {
  if (!token) return false;
  const session = state.sessions[token];
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    delete state.sessions[token];
    saveSecurityFile();
    return false;
  }
  return true;
}

export function revokeSession(token: string): boolean {
  if (!token) return false;
  if (state.sessions[token]) {
    delete state.sessions[token];
    saveSecurityFile();
    return true;
  }
  return false;
}

export function revokeAllSessions() {
  state.sessions = {};
  saveSecurityFile();
}

export function changeAdminPin(
  currentPin: string | undefined, 
  newPin: string, 
  isVerifiedOwnerByGoogle: boolean
): { success: boolean; token?: string; error?: string; status: number } {
  if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4 || newPin.trim().length > 32) {
    return { success: false, status: 400, error: 'رمز عبور جدید باید بین ۴ تا ۳۲ کاراکتر باشد.' };
  }

  // If already configured and not overridden by verified Google owner, check current pin
  if (isPinConfigured() && !isVerifiedOwnerByGoogle) {
    if (!currentPin) {
      return { success: false, status: 400, error: 'رمز عبور فعلی الزامی است.' };
    }
    const computedCurrent = hashPin(currentPin, state.pinSalt!);
    let currentMatch = false;
    try {
      currentMatch = crypto.timingSafeEqual(
        Buffer.from(computedCurrent, 'hex'),
        Buffer.from(state.pinHash!, 'hex')
      );
    } catch {
      currentMatch = false;
    }
    if (!currentMatch) {
      return { success: false, status: 400, error: 'رمز عبور فعلی نادرست است.' };
    }
  }

  // Update PIN with fresh salt
  const salt = crypto.randomBytes(32).toString('hex');
  state.pinSalt = salt;
  state.pinHash = hashPin(newPin, salt);
  state.updatedAt = new Date().toISOString();

  // Invalidate all older sessions
  state.sessions = {};

  // Issue fresh session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  state.sessions[sessionToken] = {
    token: sessionToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 12 * 3600 * 1000
  };

  saveSecurityFile();
  return {
    success: true,
    status: 200,
    token: sessionToken
  };
}
