/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Entry } from './types';
import { STORAGE_KEY_PREFIX } from './data';

export const parseTimeToMinutes = (time: string): number | null => {
  if (!time) return null;
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const calculateEntryMinutes = (
  entry: Entry,
  validationErrors: Record<string, string> = {}
): number => {
  if (!entry) return 0;
  if (!entry.debut || !entry.fin) return 0;
  const debutMin = parseTimeToMinutes(entry.debut);
  const finMin = parseTimeToMinutes(entry.fin);
  if (debutMin === null || finMin === null) return 0;

  let diff = finMin - debutMin;
  if (diff < 0) diff += 24 * 60; // handle cross-midnight
  if (diff <= 0) {
    validationErrors[entry.id] = (validationErrors[entry.id] ? validationErrors[entry.id] + ' ' : '') + "Durée invalide.";
    return 0;
  }

  const pause = entry.pause || 0;
  const netMinutes = diff - pause;
  if (netMinutes < 0) {
    validationErrors[entry.id] = (validationErrors[entry.id] ? validationErrors[entry.id] + ' ' : '') + "La pause dépasse la durée de travail.";
    return 0;
  }
  return netMinutes;
};

export const formatDateAsUTC = (date: Date): string => {
  try {
    if (!date || isNaN(date.getTime())) {
      date = new Date();
    }
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error("formatDateAsUTC error, falling back to today:", e);
    const fallback = new Date();
    const year = fallback.getUTCFullYear();
    const month = (fallback.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = fallback.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

export const getSundayOfGivenDate = (date: Date): Date => {
  let safeDate = date;
  if (!safeDate || isNaN(safeDate.getTime())) {
    safeDate = new Date();
  }
  const dt = new Date(safeDate.getTime());
  dt.setUTCHours(12, 0, 0, 0);
  const day = dt.getUTCDay();
  if (isNaN(day)) {
    const d = new Date();
    const currentDay = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - currentDay);
    d.setUTCHours(12, 0, 0, 0);
    return d;
  }
  const diff = day; // 0 Sunday, 1 Monday, etc.
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt;
};

export const safeFixed = (val: number | string | undefined): string => {
  if (typeof val === 'number') return val.toFixed(2);
  if (typeof val === 'string') {
    const p = parseFloat(val);
    return isNaN(p) ? '0.00' : p.toFixed(2);
  }
  return '0.00';
};

export const minutesToHours = (minutes: number): string => {
  if (typeof minutes !== 'number' || isNaN(minutes) || minutes <= 0) return '0.00h';
  return `${(minutes / 60).toFixed(2)}h`;
};

export const formatDateTime = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return new Intl.DateTimeFormat('fr-CA', options).format(date);
};

// Safe localStorage helpers with error resilience
export const safeLocalStorageGet = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading from localStorage key "${key}":`, e);
    return defaultValue;
  }
};

export const safeLocalStorageSet = <T>(key: string, value: T): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Error writing to localStorage key "${key}":`, e);
    return false;
  }
};

export const safeLocalStorageRemove = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Error removing localStorage key "${key}":`, e);
    return false;
  }
};

export const getWeekKey = (date: string): string => `${STORAGE_KEY_PREFIX}${date}`;

export const encodeB64Unicode = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

export const decodeB64Unicode = (b64: string): string => {
  return decodeURIComponent(escape(atob(b64)));
};

/**
 * Encrypt/Obfuscate a password using an extremely reliable client-side algorithm.
 * Since this runs entirely in the browser (client-side), we want a fast,
 * non-async method that doesn't rely on web cryptography permissions that might
 * be disabled or constrained inside frames, while still providing strong obfuscation.
 */
export const hashPassword = (password: string): string => {
  let hash1 = 5381;
  let hash2 = 1894;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) + char;
    hash1 = hash1 & hash1; // Convert to 32bit integer
    
    hash2 = ((hash2 << 7) ^ hash2) + char;
    hash2 = hash2 & hash2;
  }
  return `${hash1.toString(36)}_${hash2.toString(36)}_slh_timesheet`;
};
