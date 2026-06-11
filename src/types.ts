/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Entry {
  id: string;
  chantier: string;
  type: 'Chantier' | 'Bureau';
  debut: string;
  fin: string;
  pause: number;
  notes: string;
}

export interface DayLog {
  jour: string;
  entries: Entry[];
}

export interface Meta {
  nom: string;
  dateDebut: string;
  dateFin: string;
  heuresSemaineNormales: number;
}

export interface TimesheetData {
  meta: Meta;
  jours: DayLog[];
  chantiers: string[];
}

export interface HistoryItem {
  timestamp: string;
  weekStart: string;
  hours: number;
  action: 'add' | 'clear' | 'adjust';
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
