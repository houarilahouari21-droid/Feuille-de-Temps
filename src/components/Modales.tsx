/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, FolderOpen, AlertOctagon, Printer, 
  Copy, History, Trash2
} from 'lucide-react';
import { HistoryItem } from '../types';
import { 
  STORAGE_KEY_PREFIX, STORAGE_KEY_LAST_VIEWED, 
  STORAGE_KEY_OVERTIME_BANK, STORAGE_KEY_OVERTIME_HISTORY,
  STORAGE_KEY_PASSWORD_HASH, STORAGE_KEY_PASSWORD_HINT 
} from '../data';
import { 
  safeLocalStorageGet, calculateEntryMinutes, 
  safeFixed, formatDateTime, safeStorage
} from '../utils';

// ================= ARCHIVE MODAL =================
interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadWeek: (week: any) => void;
  onDeleteWeek: (weekKey: string, weekLabel: string, callback: () => void) => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({ 
  isOpen, onClose, onLoadWeek, onDeleteWeek 
}) => {
  const [archivedWeeks, setArchivedWeeks] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchArchives = useCallback(() => {
    setIsLoading(true);
    const allWeeks: any[] = [];
    
    // Scan all keys looking for timesheets
    try {
      for (let i = 0; i < safeStorage.length; i++) {
        const key = safeStorage.key(i);
        if (
          key && 
          key.startsWith(STORAGE_KEY_PREFIX) && 
          key !== STORAGE_KEY_LAST_VIEWED && 
          key !== STORAGE_KEY_OVERTIME_BANK && 
          key !== STORAGE_KEY_OVERTIME_HISTORY &&
          key !== STORAGE_KEY_PASSWORD_HASH &&
          key !== STORAGE_KEY_PASSWORD_HINT &&
          key !== 'timesheet_answer_hash'
        ) {
          const data = safeLocalStorageGet(key, null);
          if (data && data.meta && data.meta.dateDebut) {
            let totalMinutes = 0;
            if (data.jours && Array.isArray(data.jours)) {
              data.jours.forEach((day: any) => {
                if (day.entries && Array.isArray(day.entries)) {
                  day.entries.forEach((entry: any) => {
                    totalMinutes += calculateEntryMinutes(entry);
                  });
                }
              });
            }
            data.totalHours = (totalMinutes / 60).toFixed(2);
            allWeeks.push(data);
          }
        }
      }
    } catch (e) {
      console.error("Failed to scan localStorage for archives:", e);
    }
    
    // Sort chronological descending
    allWeeks.sort((a, b) => new Date(b.meta.dateDebut).getTime() - new Date(a.meta.dateDebut).getTime());
    setArchivedWeeks(allWeeks);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchArchives();
    }
  }, [isOpen, fetchArchives]);

  const filteredWeeks = useMemo(() => {
    if (!searchTerm) return archivedWeeks;
    const lowercasedFilter = searchTerm.toLowerCase();
    return archivedWeeks.filter(week =>
      (week.meta.nom || '').toLowerCase().includes(lowercasedFilter) ||
      week.meta.dateDebut.includes(lowercasedFilter) ||
      week.meta.dateFin.includes(lowercasedFilter)
    );
  }, [searchTerm, archivedWeeks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">🗂️ Archives des feuilles de temps</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 border-b border-slate-100">
          <input 
            type="text" 
            placeholder="Rechercher par nom ou par date de début (AAAA-MM-JJ)..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-inner text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex-grow overflow-y-auto p-5">
          {isLoading ? (
            <p className="text-center text-slate-500 p-8">Chargement des archives...</p>
          ) : filteredWeeks.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Employé</th>
                    <th className="p-3">Période de travail</th>
                    <th className="p-3 text-center">Heures Total</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWeeks.map((week, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-medium text-slate-800">{week.meta.nom}</td>
                      <td className="p-3 text-slate-600">Semaine du {week.meta.dateDebut} au {week.meta.dateFin}</td>
                      <td className="p-3 text-center font-bold text-indigo-600 tabular-nums">{week.totalHours}h</td>
                      <td className="p-3 text-right flex justify-end gap-2">
                        <button 
                          onClick={() => onLoadWeek(week)} 
                          className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-sm"
                        >
                          Charger
                        </button>
                        <button 
                          onClick={() => onDeleteWeek(week.meta.dateDebut, week.meta.dateDebut, fetchArchives)} 
                          className="px-3 py-1.5 text-xs font-semibold text-red-650 hover:bg-red-50 text-red-600 border border-red-200 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-12">
              <FolderOpen className="w-12 h-12 mx-auto text-slate-300 stroke-1 mb-3" />
              <p className="text-md">Aucune feuille d'heures archivée trouvée.</p>
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl text-right">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-semibold bg-slate-200 hover:bg-slate-300 text-slate-850 rounded-xl transition"
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
};


// ================= CONFIRM MODAL =================
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'red' | 'indigo';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen, title, message, onConfirm, onCancel, 
  confirmText = 'Confirmer', cancelText = 'Annuler', confirmColor = 'red'
}) => {
  if (!isOpen) return null;

  const btnBg = confirmColor === 'red' 
    ? 'bg-red-650 hover:bg-red-750 focus:ring-red-500' 
    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex items-center gap-3 bg-red-500/5">
          <div className={`p-2 rounded-full ${confirmColor === 'red' ? 'bg-red-1050/10 text-red-600' : 'bg-indigo-1100/10 text-indigo-600'}`}>
            <AlertOctagon className="w-5 h-5" />
          </div>
          <h2 className="text-md font-extrabold text-slate-805">{title}</h2>
        </header>
        <div className="p-6">
          <p className="text-slate-600 text-sm leading-relaxed">{message}</p>
        </div>
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 font-semibold">
          <button 
            onClick={onCancel} 
            className="px-4 py-2 text-sm border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl transition"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm} 
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl shadow-lg transition duration-200 ${btnBg}`}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
};


// ================= EXPORT OPTIONS MODAL =================
interface ExportOptionsModalProps {
  isOpen: boolean;
  type: 'pdf' | 'print' | null;
  onClose: () => void;
  onConfirm: (scope: 'full' | 'summary' | 'multi') => void;
}

export const ExportOptionsModal: React.FC<ExportOptionsModalProps> = ({
  isOpen, type, onClose, onConfirm
}) => {
  if (!isOpen || !type) return null;

  const isPDF = type === 'pdf';
  const titleText = isPDF ? "Options d'exportation PDF" : "Options d'impression papier";

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/20">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600" />
            <h2 className="text-md font-bold text-slate-800">{titleText}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">Choisissez le format d'export adapté à vos besoins :</p>
          
          <button 
            onClick={() => onConfirm('full')}
            className="w-full text-left p-4 bg-slate-50 hover:bg-indigo-50/50 border border-slate-100 hover:border-indigo-200 rounded-xl transition group duration-200"
          >
            <span className="block font-bold text-slate-800 group-hover:text-indigo-800 text-sm">📋 Rapport Complet</span>
            <span className="block text-xs text-slate-400 group-hover:text-indigo-600 mt-1">Génère la grille journalière détaillée ainsi que la récapitulation globale et sa banque d'heures.</span>
          </button>

          <button 
            onClick={() => onConfirm('summary')}
            className="w-full text-left p-4 bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-xl transition group duration-200"
          >
            <span className="block font-bold text-slate-800 group-hover:text-amber-800 text-sm">📊 Résumé Hebdomadaire uniquement</span>
            <span className="block text-xs text-slate-400 group-hover:text-amber-600 mt-1">Génère uniquement le tableau de synthèse des chantiers (idéal pour la paie et la consultation rapide).</span>
          </button>

          {isPDF && (
            <button 
              onClick={() => onConfirm('multi')}
              className="w-full text-left p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-xl transition group duration-200"
            >
              <span className="block font-bold text-slate-800 group-hover:text-emerald-800 text-sm">🗓️ Rapport Multi-Semaines (Période)</span>
              <span className="block text-xs text-slate-400 group-hover:text-emerald-600 mt-1">Choisissez une période de plusieurs semaines archivées pour générer un grand rapport PDF regroupé.</span>
            </button>
          )}
        </div>
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl transition"
          >
            Annuler
          </button>
        </footer>
      </div>
    </div>
  );
};


// ================= COPY DAY MODAL =================
interface CopyDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (sourceDay: string) => void;
  days: string[];
}

export const CopyDayModal: React.FC<CopyDayModalProps> = ({
  isOpen, onClose, onCopy, days
}) => {
  const [selectedDay, setSelectedDay] = useState('');

  if (!isOpen) return null;

  const handleCopySubmit = () => {
    if (selectedDay) {
      onCopy(selectedDay);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/10">
          <div className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-indigo-600" />
            <h2 className="text-md font-bold text-slate-850">📋 Copier une journée de travail</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Cette option permet de copier tous les chantiers et notes d'un jour vers <b>toutes les autres journées de la semaine</b> d'un seul clic. Les horaires restent vierges.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Choisir le jour modèle</label>
            <select 
              value={selectedDay} 
              onChange={e => setSelectedDay(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-indigo-500"
            >
              <option value="">-- Choisir un jour type --</option>
              {days.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
        </div>
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 font-semibold">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-850 rounded-xl transition"
          >
            Annuler
          </button>
          <button 
            onClick={handleCopySubmit}
            disabled={!selectedDay}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Uniformiser la semaine
          </button>
        </footer>
      </div>
    </div>
  );
};


// ================= OVERTIME HISTORY MODAL =================
interface OvertimeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onClearHistory: () => void;
}

export const OvertimeHistoryModal: React.FC<OvertimeHistoryModalProps> = ({
  isOpen, onClose, history, onClearHistory
}) => {
  if (!isOpen) return null;

  const totalBanked = history.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">📊 Historique des heures en banque</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-5 space-y-6">
          <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wider block">Solde accumulé par transaction</span>
              <strong className="text-3xl font-extrabold text-indigo-900 tabular-nums">{safeFixed(totalBanked)}h</strong>
            </div>
            <div className="p-3 bg-white rounded-xl shadow-sm border border-indigo-100/50">
              <CalendarCode className="w-6 h-6 text-indigo-500" />
            </div>
          </div>

          {history.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm border-collapse text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Horodatage</th>
                    <th className="p-3">Référence Semaine</th>
                    <th className="p-3 text-center">Opération</th>
                    <th className="p-3 text-right">Variation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-105">
                  {[...history].reverse().map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 text-slate-600 text-xs tabular-nums">{formatDateTime(new Date(entry.timestamp))}</td>
                      <td className="p-3 font-medium text-slate-700">Semaine du {entry.weekStart}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold leading-normal ${
                          entry.action === 'add' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 
                          entry.action === 'clear' ? 'bg-red-50 text-red-700 border border-red-150' : 
                          'bg-sky-50 text-sky-700 border border-sky-150'
                        }`}>
                          {entry.action === 'add' ? 'Ajout' : entry.action === 'clear' ? 'Paiement' : 'Ajustement'}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-extrabold tabular-nums ${
                        entry.hours > 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {entry.hours > 0 ? `+${safeFixed(entry.hours)}` : safeFixed(entry.hours)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-12">
              <History className="w-12 h-12 mx-auto text-slate-300 stroke-1 mb-3" />
              <p className="text-sm">Aucun historique disponible dans cette banque.</p>
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-between">
          <button 
            onClick={onClearHistory} 
            disabled={history.length === 0}
            className="px-4 py-2 text-sm font-semibold border border-red-200 hover:bg-red-50 text-red-600 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white rounded-xl transition"
          >
            Vider l'historique
          </button>
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-semibold bg-slate-200 hover:bg-slate-300 text-slate-850 rounded-xl transition"
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
};

interface CalendarCodeProps {
  className?: string;
}

export const MultiWeekExportModal: React.FC<MultiWeekExportModalProps> = ({
  isOpen,
  onClose,
  currentWeeksData,
  onExport
}) => {
  const [weeksList, setWeeksList] = useState<any[]>([]);
  const [startWeek, setStartWeek] = useState('');
  const [endWeek, setEndWeek] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    // 1. Gather all weeks from localStorage and also active state
    const loaded: any[] = [];
    const datesAdded = new Set<string>();

    // Add current week
    if (currentWeeksData && currentWeeksData.meta && currentWeeksData.meta.dateDebut) {
      loaded.push({
        key: 'current',
        dateDebut: currentWeeksData.meta.dateDebut,
        dateFin: currentWeeksData.meta.dateFin,
        nom: currentWeeksData.meta.nom,
        totalHours: currentWeeksData.summary?.totalSemaine || 0
      });
      datesAdded.add(currentWeeksData.meta.dateDebut);
    }

    // Scan localStorage
    try {
      for (let i = 0; i < safeStorage.length; i++) {
        const key = safeStorage.key(i);
        if (
          key && 
          key.startsWith(STORAGE_KEY_PREFIX) && 
          key !== STORAGE_KEY_LAST_VIEWED && 
          key !== STORAGE_KEY_OVERTIME_BANK && 
          key !== STORAGE_KEY_OVERTIME_HISTORY &&
          key !== STORAGE_KEY_PASSWORD_HASH &&
          key !== STORAGE_KEY_PASSWORD_HINT &&
          key !== 'timesheet_answer_hash'
        ) {
          const data = safeLocalStorageGet(key, null);
          if (data && data.meta && data.meta.dateDebut) {
            if (!datesAdded.has(data.meta.dateDebut)) {
              // Find total hours
              let totalMinutes = 0;
              if (data.jours && Array.isArray(data.jours)) {
                data.jours.forEach((day: any) => {
                  if (day.entries && Array.isArray(day.entries)) {
                    day.entries.forEach((entry: any) => {
                      totalMinutes += calculateEntryMinutes(entry);
                    });
                  }
                });
              }
              loaded.push({
                key,
                dateDebut: data.meta.dateDebut,
                dateFin: data.meta.dateFin,
                nom: data.meta.nom,
                totalHours: totalMinutes / 60
              });
              datesAdded.add(data.meta.dateDebut);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to scan localStorage for multi-export:", e);
    }

    // Sort chronologically ascending (older weeks first) for easier selection
    loaded.sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime());
    setWeeksList(loaded);

    // Default select start & end
    if (loaded.length > 0) {
      setStartWeek(loaded[0].dateDebut);
      setEndWeek(loaded[loaded.length - 1].dateDebut);
    }
  }, [isOpen, currentWeeksData]);

  // Handle select changes and auto-correct/validate
  useEffect(() => {
    if (!startWeek || !endWeek) return;
    const startT = new Date(startWeek).getTime();
    const endT = new Date(endWeek).getTime();
    if (startT > endT) {
      setError("La date de début de la période doit être antérieure ou égale à la date de fin.");
    } else {
      setError('');
    }
  }, [startWeek, endWeek]);

  if (!isOpen) return null;

  const handleGenerate = () => {
    if (error) return;
    onExport(startWeek, endWeek);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/20">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="text-md font-bold text-slate-800">Export Multi-Semaines (Période)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </header>
        
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-500">
            Sélectionnez une période de plusieurs semaines pour regrouper leurs résumés analytiques de chantiers dans un unique rapport PDF.
          </p>

          {weeksList.length < 2 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700 leading-relaxed font-semibold">
              ⚠️ Pour exporter sur plusieurs semaines, vous devez avoir enregistré des archives de semaines précédentes (bouton "Archives" pour voir vos semaines enregistrées).
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Semaine de Début :</label>
              <select
                value={startWeek}
                onChange={e => setStartWeek(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {weeksList.map(week => (
                  <option key={week.dateDebut} value={week.dateDebut}>
                    Du {week.dateDebut} ({week.totalHours.toFixed(1)}h)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Semaine de Fin :</label>
              <select
                value={endWeek}
                onChange={e => setEndWeek(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {weeksList.map(week => (
                  <option key={week.dateDebut} value={week.dateDebut}>
                    Au {week.dateFin} ({week.totalHours.toFixed(1)}h)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-150 text-xs text-red-600 font-semibold flex items-start gap-1.5">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {!error && startWeek && endWeek && (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Période sélectionnée :</span>
                <span className="text-indigo-600">Du {startWeek} au {weeksList.find(w => w.dateDebut === endWeek)?.dateFin}</span>
              </div>
              <div className="flex justify-between">
                <span>Semaines incluses :</span>
                <span className="font-bold text-slate-800">
                  {weeksList.filter(w => {
                    const t = new Date(w.dateDebut).getTime();
                    return t >= new Date(startWeek).getTime() && t <= new Date(endWeek).getTime();
                  }).length} semaine(s)
                </span>
              </div>
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2.5">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-semibold bg-slate-200 hover:bg-slate-300 text-slate-805 rounded-xl transition"
          >
            Annuler
          </button>
          <button 
            onClick={handleGenerate}
            disabled={!!error || !startWeek || !endWeek}
            className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-md transition"
          >
            Générer le PDF 📥
          </button>
        </footer>
      </div>
    </div>
  );
};

interface MultiWeekExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWeeksData: {
    meta: any;
    jours: any[];
    chantiers: string[];
    summary: any;
    overtimeBank: number;
  };
  onExport: (startWeekDebut: string, endWeekDebut: string) => void;
}

const CalendarCode: React.FC<CalendarCodeProps> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M8 2v4"/>
    <path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
    <path d="m10 14 2 2 4-4"/>
  </svg>
);
