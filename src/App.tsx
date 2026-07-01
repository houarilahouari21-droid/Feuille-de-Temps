/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Clock, Calendar, ChevronLeft, ChevronRight, Plus, Minus, 
  Settings, KeyRound, Check, FileCode, Share2, FileDown, 
  Printer, Download, RefreshCw, UserCheck, Coins, Copy, 
  ArrowUpRight, ShieldAlert, FolderArchive, Save, HelpCircle, Lock, Undo
} from 'lucide-react';

import { Entry, DayLog, Meta, TimesheetData, HistoryItem, ToastItem } from './types';
import { 
  JOURS, JOURS_ABBR, CHANTIERS_INITIAUX, 
  STORAGE_KEY_PREFIX, STORAGE_KEY_LAST_VIEWED, 
  STORAGE_KEY_OVERTIME_BANK, STORAGE_KEY_OVERTIME_HISTORY,
  STORAGE_KEY_PASSWORD_HASH, STORAGE_KEY_PASSWORD_HINT
} from './data';
import { 
  parseTimeToMinutes, calculateEntryMinutes, formatDateAsUTC, 
  getSundayOfGivenDate, safeFixed, minutesToHours, 
  safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove,
  getWeekKey, generateUUID, encodeB64Unicode, decodeB64Unicode,
  safeStorage
} from './utils';

import { 
  ArchiveModal, ConfirmModal, ExportOptionsModal, 
  CopyDayModal, OvertimeHistoryModal, MultiWeekExportModal
} from './components/Modales';
import { SummaryGrid } from './components/SummaryGrid';
import { PasswordLock, SecuritySettings } from './components/PasswordLock';
import { exportToExcel, exportToPdf, exportMultiWeekToPdf } from './exports';

const createNewEntry = (): Entry => ({ 
  id: generateUUID(), 
  chantier: '', 
  type: 'Chantier', 
  debut: '', 
  fin: '', 
  pause: 0, 
  notes: '' 
});

export default function App() {
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return !!safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH);
    } catch (e) {
      console.error("Failed to read lock state:", e);
      return false;
    }
  });
  
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  const [meta, setMeta] = useState<Meta>({ 
    nom: 'KENNICHE Lahouari', 
    dateDebut: '', 
    dateFin: '', 
    heuresSemaineNormales: 40 
  });
  const [dailyLogs, setDailyLogs] = useState<DayLog[]>([]);
  const [customChantiers, setCustomChantiers] = useState<string[]>(() => {
    return safeLocalStorageGet<string[]>('timesheet_custom_chantiers', []);
  });

  const chantiers = useMemo(() => {
    const combined = Array.from(new Set([...CHANTIERS_INITIAUX, ...customChantiers]));
    return combined.sort((a, b) => a.localeCompare(b));
  }, [customChantiers]);

  const registerNewChantier = useCallback((name: string) => {
    if (!name || !name.trim()) return;
    const clean = name.trim();
    setCustomChantiers(prev => {
      if (prev.includes(clean) || CHANTIERS_INITIAUX.includes(clean)) {
        return prev;
      }
      const updated = [...prev, clean].sort((a, b) => a.localeCompare(b));
      safeLocalStorageSet('timesheet_custom_chantiers', updated);
      return updated;
    });
  }, []);
  const [overtimeBank, setOvertimeBank] = useState<number>(0);
  const [overtimeHistory, setOvertimeHistory] = useState<HistoryItem[]>([]);
  const [hasBankedThisWeek, setHasBankedThisWeek] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // Modal states
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [copyDayModalOpen, setCopyDayModalOpen] = useState(false);
  const [isMultiWeekExportOpen, setIsMultiWeekExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<{ isOpen: boolean; type: 'pdf' | 'print' | null }>({
    isOpen: false,
    type: null
  });
  
  // Central confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmColor?: 'red' | 'indigo';
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  // Printer view trigger
  const [printScope, setPrintScope] = useState<'full' | 'summary'>('full');
  const [isPrinting, setIsPrinting] = useState(false);

  // File system upload references
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // --- NOTIFICATION TOAST HANDLER ---
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = generateUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // --- COMPUTATIONS & SUMMARIES ---
  const { summary, validationErrors } = useMemo(() => {
    let totalWeekMin = 0;
    let totalChantierMin = 0;
    let totalBureauMin = 0;
    const daysWorked = new Set<string>();
    const filledChantiers = new Set<string>();
    const errors: Record<string, string> = {};

    dailyLogs.forEach(day => {
      let totalDayMin = 0;
      day.entries.forEach(entry => {
        const entryTotalMin = calculateEntryMinutes(entry, errors);
        totalDayMin += entryTotalMin;
        if (entry.chantier) {
          if (entry.type === 'Bureau') {
            totalBureauMin += entryTotalMin;
          } else {
            totalChantierMin += entryTotalMin;
          }
          filledChantiers.add(entry.chantier);
        }
      });
      if (totalDayMin > 0) {
        daysWorked.add(day.jour);
      }
      totalWeekMin += totalDayMin;
    });

    const weeklyHours = totalWeekMin / 60;
    const baseHours = meta.heuresSemaineNormales || 40;
    const overtimeHours = Math.max(0, weeklyHours - baseHours);

    return {
      summary: {
        totalSemaine: weeklyHours,
        totalChantier: totalChantierMin / 60, // Convert nicely
        totalBureau: totalBureauMin / 60,
        joursTravailles: daysWorked.size,
        nbChantiers: filledChantiers.size,
        heuresSupplementaires: overtimeHours
      },
      validationErrors: errors
    };
  }, [dailyLogs, meta.heuresSemaineNormales]);

  // Transform data for overview grid
  const summaryGridData = useMemo(() => {
    const chantiersSummary: Record<string, { name: string; type: string; total: number } & Record<string, number>> = {};
    const dailyTotals = JOURS.reduce((acc, j) => ({ ...acc, [j]: 0 }), {} as Record<string, number>);

    dailyLogs.forEach(day => {
      day.entries.forEach(entry => {
        const hours = calculateEntryMinutes(entry) / 60;
        if (hours > 0 && entry.chantier) {
          const type = entry.type || 'Chantier';
          const key = `${entry.chantier}::${type}`;
          if (!chantiersSummary[key]) {
            chantiersSummary[key] = {
              name: entry.chantier,
              type,
              ...JOURS.reduce((acc, j) => ({ ...acc, [j]: 0 }), {} as Record<string, number>),
              total: 0
            };
          }
          chantiersSummary[key][day.jour] += hours;
          chantiersSummary[key].total += hours;
          dailyTotals[day.jour] += hours;
        }
      });
    });

    return { chantiers: chantiersSummary, dailyTotals };
  }, [dailyLogs]);

  // --- LOAD CURRENT DATA STATE ---
  const _loadDataIntoState = useCallback((data: TimesheetData) => {
    setMeta({
      nom: data.meta.nom || 'KENNICHE Lahouari',
      dateDebut: data.meta.dateDebut,
      dateFin: data.meta.dateFin,
      heuresSemaineNormales: data.meta.heuresSemaineNormales || 40
    });
    
    // Add unique IDs to slots to ensure keys render perfectly
    const migratedLogs = data.jours.map(day => ({
      ...day,
      entries: (day.entries || [createNewEntry()]).map(entry => ({
        ...entry,
        id: entry.id || generateUUID(),
        type: entry.type || 'Chantier'
      }))
    }));

    setDailyLogs(migratedLogs);
    
    // Merge any loaded chantiers into customChantiers if they are not in the initial list
    if (data.chantiers && data.chantiers.length > 0) {
      const newCustoms = data.chantiers.filter(c => c && !CHANTIERS_INITIAUX.includes(c));
      if (newCustoms.length > 0) {
        setCustomChantiers(prev => {
          const merged = Array.from(new Set([...prev, ...newCustoms]));
          const sorted = merged.sort((a, b) => a.localeCompare(b));
          safeLocalStorageSet('timesheet_custom_chantiers', sorted);
          return sorted;
        });
      }
    }

    setHasBankedThisWeek(false);
  }, [setCustomChantiers]);

  const loadBlankWeek = useCallback((sundayDate: Date) => {
    let safeSunday = sundayDate;
    if (!safeSunday || isNaN(safeSunday.getTime())) {
      safeSunday = getSundayOfGivenDate(new Date());
    }
    const saturday = new Date(safeSunday.getTime());
    saturday.setUTCDate(safeSunday.getUTCDate() + 6);
    
    setMeta({
      nom: meta.nom || 'KENNICHE Lahouari',
      dateDebut: formatDateAsUTC(safeSunday),
      dateFin: formatDateAsUTC(saturday),
      heuresSemaineNormales: meta.heuresSemaineNormales || 40
    });
    setDailyLogs(JOURS.map(jour => ({ jour, entries: [createNewEntry()] })));
    setHasBankedThisWeek(false);
  }, [meta.nom, meta.heuresSemaineNormales]);

  const loadWeekData = useCallback((sundayStr: string) => {
    let cleanStr = sundayStr;
    const isBadString = !cleanStr || cleanStr === 'undefined' || cleanStr === 'null' || isNaN(Date.parse(cleanStr));
    if (isBadString) {
      cleanStr = formatDateAsUTC(getSundayOfGivenDate(new Date()));
      try {
        safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, cleanStr);
      } catch (e) {
        console.error(e);
      }
    }
    const weekKey = getWeekKey(cleanStr);
    const saved = safeLocalStorageGet<TimesheetData | null>(weekKey, null);
    if (saved) {
      _loadDataIntoState(saved);
      addToast(`Données de la semaine du ${cleanStr} chargées.`, 'info');
    } else {
      loadBlankWeek(new Date(`${cleanStr}T12:00:00.000Z`));
    }
  }, [_loadDataIntoState, loadBlankWeek, addToast]);

  const adjustWeekToSunday = useCallback((data: TimesheetData): TimesheetData => {
    const [year, month, day] = data.meta.dateDebut.split('-').map(Number);
    const origin = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const startDay = origin.getUTCDay();

    const newSunday = getSundayOfGivenDate(origin);
    const reorderedJours = [...data.jours];
    
    if (startDay !== 0 && data.jours.length === 7) {
      const sun = reorderedJours.pop();
      if (sun) reorderedJours.unshift(sun);
    }

    const remapped = reorderedJours.map((dayData, index) => ({
      ...dayData,
      jour: JOURS[index]
    }));

    const newSaturday = new Date(newSunday.getTime());
    newSaturday.setUTCDate(newSunday.getUTCDate() + 6);

    return {
      meta: {
        ...data.meta,
        dateDebut: formatDateAsUTC(newSunday),
        dateFin: formatDateAsUTC(newSaturday)
      },
      jours: remapped,
      chantiers: data.chantiers
    };
  }, []);

  const loadDataObject = useCallback((data: any) => {
    if (!data || !data.meta || !data.meta.dateDebut || !data.jours || data.jours.length !== 7 || !data.chantiers) {
      addToast("Le fichier de données est corrompu ou incomplet.", "error");
      return;
    }

    const date = new Date(`${data.meta.dateDebut}T12:00:00.000Z`);
    if (isNaN(date.getTime())) {
      addToast("Le fichier contient une date de début invalide.", "error");
      return;
    }

    if (date.getUTCDay() !== 0) {
      const adjusted = adjustWeekToSunday(data);
      _loadDataIntoState(adjusted);
      addToast("La période a été alignée sur le dimanche.", "info");
    } else {
      _loadDataIntoState(data);
    }
  }, [addToast, _loadDataIntoState, adjustWeekToSunday]);

  // --- INITIALIZE & EMBEDDED DATACARD LOADER ---
  useEffect(() => {
    // Initialize banks
    try {
      const savedBank = safeStorage.getItem(STORAGE_KEY_OVERTIME_BANK);
      if (savedBank) setOvertimeBank(parseFloat(savedBank) || 0);
    } catch (e) {
      console.error("Failed to read overtime bank:", e);
    }

    const savedHistory = safeLocalStorageGet<HistoryItem[]>(STORAGE_KEY_OVERTIME_HISTORY, []);
    setOvertimeHistory(savedHistory);

    // Look for standalone embedded HTML script tag
    const el = document.getElementById('embeddedData');
    if (el && el.textContent) {
      try {
        const rawB64 = el.textContent.trim();
        const rawJson = decodeB64Unicode(rawB64);
        const embedded = JSON.parse(rawJson);
        loadDataObject(embedded);
        addToast("Fiche embarquée détectée et chargée !", "success");
        el.remove();
      } catch (err) {
        console.error("Failed to parse embedded content :", err);
      }
    } else {
      let lastViewed = null;
      try {
        lastViewed = safeStorage.getItem(STORAGE_KEY_LAST_VIEWED);
      } catch (e) {
        console.error("Failed to read last viewed week:", e);
      }
      const currentSun = formatDateAsUTC(getSundayOfGivenDate(new Date()));
      loadWeekData(lastViewed || currentSun);
    }
  }, []);

  // Sync banks triggers
  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEY_OVERTIME_BANK, overtimeBank.toString());
    } catch (e) {
      console.error("Failed to save overtime bank:", e);
    }
  }, [overtimeBank]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEY_OVERTIME_HISTORY, overtimeHistory);
  }, [overtimeHistory]);

  // Auto-saver trigger
  useEffect(() => {
    if (meta.dateDebut && dailyLogs.length > 0) {
      const weekKey = getWeekKey(meta.dateDebut);
      safeLocalStorageSet(weekKey, { meta, jours: dailyLogs, chantiers });
    }
  }, [meta, dailyLogs, chantiers]);

  // Printing trigger
  useEffect(() => {
    if (!isPrinting) return;
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('afterprint', handleAfterPrint);
    const timeout = setTimeout(() => {
      window.print();
    }, 300);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      clearTimeout(timeout);
    };
  }, [isPrinting]);

  // --- ACTIONS & HANDLERS ---
  const updateEntry = (dayIndex: number, entryId: string, field: keyof Entry, value: any) => {
    setDailyLogs(prev => prev.map((day, dIdx) => {
      if (dIdx !== dayIndex) return day;
      return {
        ...day,
        entries: day.entries.map(e => {
          if (e.id !== entryId) return e;
          return { ...e, [field]: value };
        })
      };
    }));
  };

  const updateEntryMultiple = useCallback((dayIndex: number, entryId: string, updates: Partial<Entry>) => {
    setDailyLogs(prev => prev.map((day, dIdx) => {
      if (dIdx !== dayIndex) return day;
      return {
        ...day,
        entries: day.entries.map(e => {
          if (e.id !== entryId) return e;
          return { ...e, ...updates };
        })
      };
    }));
  }, []);

  const addRowForDay = (dayIndex: number) => {
    setDailyLogs(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      return {
        ...day,
        entries: [...day.entries, createNewEntry()]
      };
    }));
  };

  const removeRowForDay = (dayIndex: number, entryId: string) => {
    setDailyLogs(prev => {
      const targetDay = prev[dayIndex];
      if (targetDay.entries.length > 1) {
        return prev.map((day, idx) => {
          if (idx !== dayIndex) return day;
          return {
            ...day,
            entries: day.entries.filter(e => e.id !== entryId)
          };
        });
      } else {
        addToast("Chaque journée doit posséder au moins une ligne.", 'info');
        return prev;
      }
    });
  };

  const handleNewChantier = (dayIndex: number, entryId: string) => {
    const label = prompt("Saisissez l'identifiant du nouveau chantier :");
    if (label && label.trim()) {
      const clean = label.trim();
      const isBureau = clean.toLowerCase().includes('bureau');
      const updates: Partial<Entry> = {
        chantier: clean,
        type: isBureau ? 'Bureau' : 'Chantier'
      };

      if (!chantiers.includes(clean)) {
        registerNewChantier(clean);
        updateEntryMultiple(dayIndex, entryId, updates);
        addToast(`Nouveau chantier '${clean}' répertorié.`, 'success');
      } else {
        updateEntryMultiple(dayIndex, entryId, updates);
      }
    } else {
      updateEntryMultiple(dayIndex, entryId, { chantier: '' });
    }
  };

  // --- WEEK-TO-WEEK PREVIOUS/NEXT ---
  const handleNavigateWeeks = (offset: number) => {
    if (!meta.dateDebut) return;
    const date = new Date(`${meta.dateDebut}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + (offset * 7));
    const sundayStr = formatDateAsUTC(getSundayOfGivenDate(date));
    try {
      safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, sundayStr);
    } catch (e) {
      console.error(e);
    }
    loadWeekData(sundayStr);
  };

  const jumpToTodayWeek = () => {
    const currentSun = formatDateAsUTC(getSundayOfGivenDate(new Date()));
    try {
      safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, currentSun);
    } catch (e) {
      console.error(e);
    }
    loadWeekData(currentSun);
  };

  const resetCurrentWeekData = () => {
    setConfirmModal({
      isOpen: true,
      title: "Voulez-vous réinitialiser ?",
      message: `Toutes les données de la semaine du ${meta.dateDebut} au ${meta.dateFin} seront vidées complètement. Les éventuelles minutes déclarées seront perdues.`,
      onConfirm: () => {
        safeLocalStorageRemove(getWeekKey(meta.dateDebut));
        loadWeekData(meta.dateDebut);
        addToast("Semaine effacée.", "info");
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });
      },
      onCancel: () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} })
    });
  };

  // --- EXPORT TO STANDALONE HTML WITH EMBEDDED DATAFRAME ---
  const downloadSelfContainedHtml = () => {
    const localData: TimesheetData = { meta, jours: dailyLogs, chantiers };
    const serialized = JSON.stringify(localData);
    const b64 = encodeB64Unicode(serialized);
    const documentHTML = document.documentElement.outerHTML;

    // Craft tags for embedding
    const elId = "embeddedData";
    const dataTag = `<script id="${elId}" type="application/json+base64">${b64}<\/script>`;
    
    // Inject and download
    let parsedHTML = documentHTML;
    // Strip existing embedded script if present
    const existingScriptRegex = /<script[^>]*id=["']embeddedData["'][^>]*>([\s\S]*?)<\/script>/gi;
    parsedHTML = parsedHTML.replace(existingScriptRegex, '');

    const scriptPlaceholder = "</body>";
    const finalHTML = parsedHTML.replace(scriptPlaceholder, `${dataTag}\n${scriptPlaceholder}`);

    const blob = new Blob([finalHTML], { type: 'text/html;charset=utf-8' });
    const filenameNom = (meta.nom || 'Employe').replace(/\s+/g, '_');
    const filename = `Feuille_de_Temps_${filenameNom}_${meta.dateDebut}.html`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast("Feuille de temps déconnectée exportée avec succès.", "success");
  };

  // --- EXPORTS TO FILE DRAG OR SELECT ---
  const handleHTMLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const match = content.match(/<script[^>]*id=["']embeddedData["'][^>]*>([\s\S]*?)<\/script>/i);
      if (match && match[1]) {
        try {
          const rawB64 = match[1].trim();
          const rawJson = decodeB64Unicode(rawB64);
          const parsed = JSON.parse(rawJson);
          loadDataObject(parsed);
          addToast("Fiche importée depuis l'HTML avec succès.", "success");
        } catch (err) {
          addToast("Une erreur s'est produite lors de la conversion.", "error");
        }
      } else {
        addToast("Aucune donnée encodée n'a été détectée dans ce fichier.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJSONBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string);
        
        // Restore all archived items
        if (payload.weeks) {
          Object.entries(payload.weeks).forEach(([key, value]) => {
            safeLocalStorageSet(key, value);
          });
          
          // Sync custom chantiers to state if restored
          const restoredCustoms = safeLocalStorageGet<string[]>('timesheet_custom_chantiers', []);
          setCustomChantiers(restoredCustoms);
        }

        if (payload.overtimeBank !== undefined) {
          const val = parseFloat(payload.overtimeBank) || 0;
          setOvertimeBank(val);
          try {
            safeStorage.setItem(STORAGE_KEY_OVERTIME_BANK, val.toString());
          } catch (e) {
            console.error(e);
          }
        }

        if (payload.overtimeHistory) {
          setOvertimeHistory(payload.overtimeHistory);
        }

        if (payload.lastViewed) {
          try {
            safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, payload.lastViewed);
          } catch (e) {
            console.error(e);
          }
          loadWeekData(payload.lastViewed);
        }

        addToast("Sauvegarde JSON consolidée restaurée !", "success");
      } catch (err) {
        addToast("Erreur lors de l'importation de la base JSON.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJSONBackupExport = () => {
    let lastViewedVal = null;
    try {
      lastViewedVal = safeStorage.getItem(STORAGE_KEY_LAST_VIEWED);
    } catch (e) {
      console.error(e);
    }
    const fullBackup: Record<string, any> = {
      exportDate: new Date().toISOString(),
      overtimeBank,
      overtimeHistory,
      lastViewed: lastViewedVal,
      weeks: {}
    };

    // Pull everything in LocalStorage
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
          key !== 'timesheet_password_hint' &&
          key !== 'timesheet_answer_hash'
        ) {
          fullBackup.weeks[key] = safeLocalStorageGet(key, null);
        }
      }
    } catch (e) {
      console.error(e);
    }

    const payload = JSON.stringify(fullBackup, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const filename = `Feuille_Base_Backup_${new Date().toISOString().split('T')[0]}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast("Fichier JSON de sauvegarde générale exporté.", 'success');
  };

  // --- BANK ACTIONS ---
  const sendOvertimeToBank = () => {
    if (!hasBankedThisWeek && summary.heuresSupplementaires > 0) {
      const added = summary.heuresSupplementaires;
      setOvertimeBank(prev => prev + added);
      setOvertimeHistory(prev => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          weekStart: meta.dateDebut,
          hours: added,
          action: 'add'
        }
      ]);
      setHasBankedThisWeek(true);
      addToast(`Nous avons placé ${safeFixed(added)}h d'Heures Supp. dans votre banque.`, "success");
    }
  };

  const payoutBank = () => {
    setConfirmModal({
      isOpen: true,
      title: "Liquider la banque d'heures (Paiement) ?",
      message: `Cela va remettre le solde actuel de votre banque d'heures (${safeFixed(overtimeBank)}h) à zéro. Cette transaction sera enregistrée dans l'historique de votre banque d'heures.`,
      onConfirm: () => {
        const debit = -overtimeBank;
        setOvertimeHistory(prev => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            weekStart: meta.dateDebut,
            hours: debit,
            action: 'clear'
          }
        ]);
        setOvertimeBank(0);
        addToast("La banque d’heures a été soldée.", "info");
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });
      },
      onCancel: () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} })
    });
  };

  const manualAdjustBank = () => {
    const actual = safeFixed(overtimeBank);
    const input = prompt(`Entrez le nouveau solde pour votre banque d'heures :\n(Solde actuel : ${actual}h)`, actual);
    if (input === null) return;
    const value = parseFloat(input.replace(',', '.'));
    if (!isNaN(value) && value >= 0) {
      const shift = value - overtimeBank;
      setOvertimeHistory(prev => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          weekStart: meta.dateDebut,
          hours: shift,
          action: 'adjust'
        }
      ]);
      setOvertimeBank(value);
      addToast(`Le solde de la banque a été ajusté à ${safeFixed(value)}h.`, 'success');
    } else {
      addToast("Valeur invalide.", 'error');
    }
  };

  const handleDuplicateToNextWeek = () => {
    if (!meta.dateDebut) return;
    const date = new Date(`${meta.dateDebut}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 7);
    const nextSundayStr = formatDateAsUTC(getSundayOfGivenDate(date));

    const nextKey = getWeekKey(nextSundayStr);
    const nextExists = safeLocalStorageGet<any | null>(nextKey, null);

    const performDuplicate = () => {
      const nextSaturday = new Date(`${nextSundayStr}T12:00:00.000Z`);
      nextSaturday.setUTCDate(nextSaturday.getUTCDate() + 6);

      const duplicatedData: TimesheetData = {
        meta: {
          ...meta,
          dateDebut: nextSundayStr,
          dateFin: formatDateAsUTC(nextSaturday)
        },
        jours: dailyLogs.map(day => ({
          ...day,
          entries: day.entries.map(e => ({
            ...e,
            id: generateUUID(),
            debut: '',
            fin: '',
            pause: 0,
            notes: ''
          }))
        })),
        chantiers
      };
      
      safeLocalStorageSet(nextKey, duplicatedData);
      try {
        safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, nextSundayStr);
      } catch (e) {
        console.error(e);
      }
      loadWeekData(nextSundayStr);
      addToast(`Semaine configurée vers le ${nextSundayStr} avec la même liste de chantiers !`, 'success');
    };

    if (nextExists) {
      setConfirmModal({
        isOpen: true,
        title: "Écraser la semaine existante ?",
        message: `Une feuille d'heures est déjà répertoriée pour la semaine du ${nextSundayStr}. Souhaitez-vous la remplacer et dupliquer vos chantiers actuels dessus ?`,
        onConfirm: () => {
          performDuplicate();
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });
        },
        onCancel: () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} })
      });
    } else {
      performDuplicate();
    }
  };

  const processDayModelCopy = (modelDayName: string) => {
    const source = dailyLogs.find(d => d.jour === modelDayName);
    if (!source) return;

    const updated = dailyLogs.map(day => {
      if (day.jour === modelDayName) return day;
      const copies = source.entries.map(e => ({
        ...e,
        id: generateUUID(),
        debut: '',
        fin: '',
        pause: 0
      }));
      return { ...day, entries: copies };
    });

    setDailyLogs(updated);
    addToast(`Les chantiers du jour modèle [${modelDayName}] sont répliqués sur toute la semaine.`, 'success');
  };

  const handleExportModeSelect = (scope: 'full' | 'summary' | 'multi') => {
    const { type } = exportOptions;
    setExportOptions({ isOpen: false, type: null });
    
    const timesheetData: TimesheetData = { meta, jours: dailyLogs, chantiers };

    if (scope === 'multi') {
      setIsMultiWeekExportOpen(true);
      return;
    }

    if (type === 'pdf') {
      exportToPdf(timesheetData, summary, overtimeBank, { summaryOnly: scope === 'summary' });
      addToast("Exportation du rapport PDF terminée.", 'success');
    } else if (type === 'print') {
      setPrintScope(scope);
      setIsPrinting(true);
    }
  };

  const handleExportMultiWeek = (startWeekDebut: string, endWeekDebut: string) => {
    // 1. Gather all weeks from localStorage and active state
    const loadedWeeksMap = new Map<string, any>();

    // Scan safeStorage
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
            loadedWeeksMap.set(data.meta.dateDebut, data);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Include/overwrite with current week (it has latest live state)
    if (meta.dateDebut) {
      loadedWeeksMap.set(meta.dateDebut, { meta, jours: dailyLogs, chantiers });
    }

    // Convert to array and filter inside the selected period
    const startT = new Date(startWeekDebut).getTime();
    const endT = new Date(endWeekDebut).getTime();

    const filteredWeeks: any[] = [];

    loadedWeeksMap.forEach((data, dateDebut) => {
      const weekT = new Date(dateDebut).getTime();
      if (weekT >= startT && weekT <= endT) {
        // Calculate summary for this week
        let totalWeekMin = 0;
        let totalChantierMin = 0;
        let totalBureauMin = 0;
        const daysWorked = new Set<string>();
        const filledChantiers = new Set<string>();

        data.jours.forEach((day: any) => {
          let totalDayMin = 0;
          day.entries.forEach((entry: any) => {
            const entryTotalMin = calculateEntryMinutes(entry);
            totalDayMin += entryTotalMin;
            if (entry.chantier) {
              if (entry.type === 'Bureau') {
                totalBureauMin += entryTotalMin;
              } else {
                totalChantierMin += entryTotalMin;
              }
              filledChantiers.add(entry.chantier);
            }
          });
          if (totalDayMin > 0) {
            daysWorked.add(day.jour);
          }
          totalWeekMin += totalDayMin;
        });

        const weeklyHours = totalWeekMin / 60;
        const baseHours = data.meta.heuresSemaineNormales || 40;
        const overtimeHours = Math.max(0, weeklyHours - baseHours);

        const weekSummary = {
          totalSemaine: weeklyHours,
          totalChantier: totalChantierMin / 60,
          totalBureau: totalBureauMin / 60,
          joursTravailles: daysWorked.size,
          nbChantiers: filledChantiers.size,
          heuresSupplementaires: overtimeHours
        };

        filteredWeeks.push({
          data,
          summary: weekSummary,
          overtimeBank: overtimeBank
        });
      }
    });

    if (filteredWeeks.length === 0) {
      addToast("Aucune donnée de feuille de temps trouvée pour cette période.", "error");
      return;
    }

    // Call PDF generator
    exportMultiWeekToPdf(meta.nom || "KENNICHE Lahouari", filteredWeeks);
    setIsMultiWeekExportOpen(false);
    addToast("Rapport multi-semaines généré avec succès.", "success");
  };

  const triggerLogout = () => {
    setIsLocked(true);
    addToast("Application verrouillée.", "info");
  };

  const clearOvertimeHistoryLogs = () => {
    setConfirmModal({
      isOpen: true,
      title: "Effacer tout l'historique ?",
      message: "Ceci va supprimer définitivement le registre historique des Heures Supp. Le solde d'heures restera inchangé.",
      onConfirm: () => {
        setOvertimeHistory([]);
        addToast("Registre historique vidé.", "info");
        setIsHistoryOpen(false);
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });
      },
      onCancel: () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} })
    });
  };

  // Archive Loader Trigger
  const handleArchiveWeekLoad = (weekData: any) => {
    loadDataObject(weekData);
    try {
      safeStorage.setItem(STORAGE_KEY_LAST_VIEWED, weekData.meta.dateDebut);
    } catch (e) {
      console.error(e);
    }
    addToast(`Données d'archive chargées pour la semaine du ${weekData.meta.dateDebut}.`, 'info');
    setIsArchiveOpen(false);
  };

  const handleArchiveWeekDelete = (weekKey: string, weekLabel: string, callback: () => void) => {
    setConfirmModal({
      isOpen: true,
      title: "Supprimer l'archive ?",
      message: `Voulez-vous vraiment écarter définitivement les rapports de la semaine du ${weekLabel} de votre historique ?`,
      onConfirm: () => {
        safeLocalStorageRemove(getWeekKey(weekKey));
        addToast("Rapport supprimé avec succès.", "success");
        callback();
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });
      },
      onCancel: () => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} })
    });
  };

  const isFutureOrActive = () => {
    if (!meta.dateDebut) return true;
    const currentViewSunday = getSundayOfGivenDate(new Date(`${meta.dateDebut}T12:00:00.000Z`));
    const currentSystemSunday = getSundayOfGivenDate(new Date());
    return currentViewSunday.getTime() >= currentSystemSunday.getTime();
  };

  // --- PASSWORD LOCK SCREEN ---
  if (isLocked) {
    return <PasswordLock onUnlock={() => setIsLocked(false)} onSetToast={addToast} />;
  }

  const errorsCount = Object.keys(validationErrors).length;

  return (
    <div className={`min-h-screen bg-slate-100 p-4 sm:p-6 text-slate-800 ${isPrinting ? 'bg-white p-0' : ''}`}>
      {/* Dynamic modals */}
      <ArchiveModal 
        isOpen={isArchiveOpen} 
        onClose={() => setIsArchiveOpen(false)} 
        onLoadWeek={handleArchiveWeekLoad} 
        onDeleteWeek={handleArchiveWeekDelete} 
      />
      <OvertimeHistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        history={overtimeHistory} 
        onClearHistory={clearOvertimeHistoryLogs} 
      />
      <ConfirmModal {...confirmModal} />
      <ExportOptionsModal 
        isOpen={exportOptions.isOpen} 
        type={exportOptions.type} 
        onClose={() => setExportOptions({ isOpen: false, type: null })} 
        onConfirm={handleExportModeSelect} 
      />
      <MultiWeekExportModal 
        isOpen={isMultiWeekExportOpen}
        onClose={() => setIsMultiWeekExportOpen(false)}
        currentWeeksData={{ meta, jours: dailyLogs, chantiers, summary, overtimeBank }}
        onExport={handleExportMultiWeek}
      />
      <CopyDayModal 
        isOpen={copyDayModalOpen} 
        onClose={() => setCopyDayModalOpen(false)} 
        onCopy={processDayModelCopy} 
        days={JOURS} 
      />
      {showSecuritySettings && (
        <SecuritySettings 
          onClose={() => setShowSecuritySettings(false)} 
          onSetToast={addToast} 
        />
      )}

      <div className={`max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden ${
        isPrinting ? 'shadow-none border-0 p-0' : 'border border-slate-205'
      }`}>
        
        {/* APP BRAND HEADER */}
        {!isPrinting && (
          <header className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-indigo-900/40 relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-505/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10 flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Feuille de Temps — Chantiers</h1>
                <p className="text-xs text-indigo-200 mt-0.5 font-medium">Auto-sauvegarde locale • KENNICHE Lahouari</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 relative z-10">
              <button 
                onClick={() => setShowSecuritySettings(true)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
                title="Configurer le mot de passe"
              >
                <Settings className="w-4 h-4" />
                <span>Sécurité</span>
              </button>
              {safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH) && (
                <button 
                  onClick={triggerLogout}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  title="Verrouiller l'écran maintenant"
                >
                  <Lock className="w-4 h-4" />
                  <span>Verrouiller</span>
                </button>
              )}
            </div>
          </header>
        )}

        {/* PRINT BANNER HERO */}
        {isPrinting && (
          <div className="p-5 border-b-2 border-slate-300 flex justify-between items-center bg-slate-50">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">RAPPORT DE TRAVAIL - FEUILLE D'HEURES</h1>
              <p className="text-sm font-semibold text-slate-650 mt-1">Généré le {new Date().toLocaleDateString('fr-CA')}</p>
            </div>
            <div className="text-right text-sm leading-relaxed">
              <p><b>Nom :</b> {meta.nom}</p>
              <p><b>Période :</b> Semaine du {meta.dateDebut} au {meta.dateFin}</p>
            </div>
          </div>
        )}

        {/* METADATA CONFIG BAR */}
        {!isPrinting && (
          <section className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 border-b border-slate-200">
            <div className="md:col-span-4">
              <label htmlFor="inputNom" className="font-bold text-xs uppercase text-slate-500 block mb-1">Employé :</label>
              <input 
                id="inputNom"
                type="text" 
                value={meta.nom} 
                onChange={e => setMeta(prev => ({ ...prev, nom: e.target.value }))}
                className="p-2.5 w-full bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="inputBase" className="font-bold text-xs uppercase text-slate-500 block mb-1">Base normale (heures) :</label>
              <input 
                id="inputBase"
                type="number" 
                value={meta.heuresSemaineNormales} 
                onChange={e => setMeta(prev => ({ ...prev, heuresSemaineNormales: parseInt(e.target.value, 10) || 40 }))}
                className="p-2.5 w-full bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-850 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-5 flex flex-col justify-end">
              <span className="font-bold text-xs uppercase text-slate-500 block mb-1">Période d'activité :</span>
              <div className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm h-[40px]">
                <button 
                  onClick={() => handleNavigateWeeks(-1)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 transition"
                  title="Reculer d'une semaine"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-grow text-center text-xs font-extrabold text-slate-750">
                  Du <span className="text-indigo-650 tracking-wide">{meta.dateDebut}</span> au <span className="text-indigo-650 tracking-wide">{meta.dateFin}</span>
                </div>
                <button 
                  onClick={() => handleNavigateWeeks(1)}
                  disabled={isFutureOrActive()}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Avancer d'une semaine"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={jumpToTodayWeek}
                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                >
                  Courant
                </button>
              </div>
            </div>
          </section>
        )}

        {/* OPERATIONS ACTIONS COMMAND BAR */}
        {!isPrinting && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1.5 items-center">
            {/* IO Group */}
            <div className="flex flex-wrap gap-1.5">
              <button 
                onClick={downloadSelfContainedHtml}
                className="px-3 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition"
                title="Exporter un fichier HTML indépendant avec vos données intégrées"
              >
                Exporter HTML
              </button>
              <button 
                onClick={handleJSONBackupExport}
                className="px-3 py-2 text-xs font-bold bg-teal-650 text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow transition"
                title="Exporter toutes les semaines sauvegardées en un seul fichier de sauvegarde JSON"
              >
                Sauvegarde JSON
              </button>
              <button 
                onClick={() => jsonInputRef.current?.click()}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition"
                title="Restaurer l'historique complet depuis un fichier JSON"
              >
                Restaurer JSON
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition"
                title="Charger un fichier HTML sauvegardé dans le navigateur"
              >
                Importer HTML
              </button>
            </div>

            {/* Separator */}
            <span className="w-[1px] h-5 bg-slate-200 mx-1"></span>

            {/* Reports Group */}
            <div className="flex flex-wrap gap-1.5">
              <button 
                onClick={() => setIsArchiveOpen(true)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition flex items-center gap-1.5"
                title="Consulter et charger vos précédentes fiches hebdomadaires"
              >
                <FolderArchive className="w-3.5 h-3.5 text-slate-500" />
                <span>Archives</span>
              </button>
              <button 
                onClick={() => exportToExcel({ meta, jours: dailyLogs, chantiers }, summary, overtimeBank)}
                className="px-3 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow transition"
                title="Télécharger la synthèse au format Microsoft Excel (.xlsx)"
              >
                Export Excel
              </button>
              <button 
                onClick={() => setExportOptions({ isOpen: true, type: 'pdf' })}
                className="px-3 py-2 text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 rounded-xl shadow transition"
                title="Exporter le rapport d'activité au format Adobe PDF"
              >
                Export PDF
              </button>
              <button 
                onClick={() => setExportOptions({ isOpen: true, type: 'print' })}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition"
                title="Lancer l'impression de la feuille d'heures"
              >
                Impression
              </button>
            </div>

            {/* Separator */}
            <span className="w-[1px] h-5 bg-slate-200 mx-1"></span>

            {/* Copy/Reset group */}
            <div className="flex flex-wrap gap-1.5">
              <button 
                onClick={() => setCopyDayModalOpen(true)}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition flex items-center gap-1.5"
                title="Répéter la structure d'un modèle de journée sur toute la semaine"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Uniformiser</span>
              </button>
              <button 
                onClick={handleDuplicateToNextWeek}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition"
                title="Générer la semaine suivante avec les mêmes chantiers de départ"
              >
                Préparer semaine suiv.
              </button>
              <button 
                onClick={resetCurrentWeekData}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition ml-auto"
                title="Effacer le contenu déclaré pour la période en cours"
              >
                Réinitialiser
              </button>
            </div>

            {/* Hidden Input Selectors */}
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".html" 
              onChange={handleHTMLUpload} 
              className="hidden" 
            />
            <input 
              ref={jsonInputRef} 
              type="file" 
              accept=".json" 
              onChange={handleJSONBackupImport} 
              className="hidden" 
            />
          </div>
        )}

        {/* ERROR WARNING REGISTER */}
        {!isPrinting && errorsCount > 0 && (
          <div className="m-4 p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-900 rounded-r-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-sm">Remarque importante de validation ({errorsCount} alerte(s)) :</span>
              <p className="text-xs mt-1 leading-normal">
                Certains créneaux horaires sont mal formatés ou incohérents (par exemple la pause excédant le temps de travail). Veuillez adapter ces créneaux pour garantir des totaux justes.
              </p>
            </div>
          </div>
        )}

        {/* THE MAIN DAILYLOG FEED */}
        {(!isPrinting || printScope === 'full') && (
          <div className="p-4 sm:p-5 overflow-x-auto min-w-full">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead className="bg-slate-900 text-white border-b border-indigo-950 text-xs font-extrabold uppercase">
                <tr>
                  <th className="p-3 text-center w-28">Journée</th>
                  <th className="p-3">Projet / Nom du Chantier</th>
                  <th className="p-3 w-36">Catégorie</th>
                  <th className="p-3 w-28 text-center">Début</th>
                  <th className="p-3 w-28 text-center">Fin</th>
                  <th className="p-3 w-24 text-center">Pause</th>
                  <th className="p-3 w-24 text-center">Sous-Total</th>
                  <th className="p-3">Remarques / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyLogs.map((day, dayIndex) => {
                  const dailyTotalMinutes = day.entries.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
                  
                  return (
                    <React.Fragment key={day.jour}>
                      {day.entries.map((entry, entryIndex) => {
                        const rowTotalMinutes = calculateEntryMinutes(entry);
                        const hasErr = !!validationErrors[entry.id];
                        const errText = validationErrors[entry.id];
                        
                        return (
                          <tr 
                            key={entry.id} 
                            className={`group transition-all ${
                              entryIndex === 0 ? 'border-t-2 border-slate-200' : ''
                            } ${hasErr ? 'bg-red-50/70 hover:bg-red-55' : 'hover:bg-slate-50/50'}`}
                          >
                            {/* Day span marker */}
                            {entryIndex === 0 && (
                              <td 
                                rowSpan={day.entries.length + 1} 
                                className="p-3 text-center font-extrabold text-[#4f46e5] bg-indigo-50/50 border-r border-slate-100 align-top text-xs uppercase select-none"
                              >
                                <div className="sticky top-20 pt-3">
                                  <span>{day.jour.slice(0, 3)}.</span>
                                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">{day.jour}</div>
                                </div>
                              </td>
                            )}

                            {/* Chantier chooser */}
                            <td className="p-2">
                              {isPrinting ? (
                                <span className="text-sm font-semibold text-slate-755">{entry.chantier || <span className="text-slate-400 italic">Non déclaré</span>}</span>
                              ) : (
                                <select 
                                  aria-label={`Chantier ${day.jour} ligne ${entryIndex + 1}`}
                                  value={entry.chantier} 
                                  onChange={e => {
                                    if (e.target.value === 'NEW') {
                                      handleNewChantier(dayIndex, entry.id);
                                    } else {
                                      updateEntry(dayIndex, entry.id, 'chantier', e.target.value);
                                    }
                                  }}
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold tracking-wide focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="">Sélectionner un projet...</option>
                                  {chantiers.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                  <option value="NEW">➕ Autre (Formulaire)...</option>
                                </select>
                              )}
                            </td>

                            {/* Type chooser */}
                            <td className="p-2">
                              {isPrinting ? (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-205">{entry.type}</span>
                              ) : (
                                <select 
                                  aria-label={`Type d'heure ${day.jour} ligne ${entryIndex + 1}`}
                                  value={entry.type} 
                                  onChange={e => updateEntry(dayIndex, entry.id, 'type', e.target.value)}
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="Chantier">Heure Chantier</option>
                                  <option value="Bureau">Heure Bureau</option>
                                </select>
                              )}
                            </td>

                            {/* Start Time info */}
                            <td className="p-2 text-center">
                              {isPrinting ? (
                                <span className="font-semibold text-sm tabular-nums">{entry.debut || '-'}</span>
                              ) : (
                                <input 
                                  type="time" 
                                  value={entry.debut} 
                                  onChange={e => updateEntry(dayIndex, entry.id, 'debut', e.target.value)}
                                  className={`p-2 bg-slate-50 border rounded-xl text-xs text-center font-bold tracking-wide w-24 tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                    hasErr ? 'border-red-400 bg-red-100/30' : 'border-slate-200'
                                  }`}
                                />
                              )}
                            </td>

                            {/* End Time info */}
                            <td className="p-2 text-center relative">
                              {isPrinting ? (
                                <span className="font-semibold text-sm tabular-nums">{entry.fin || '-'}</span>
                              ) : (
                                <input 
                                  type="time" 
                                  value={entry.fin} 
                                  onChange={e => updateEntry(dayIndex, entry.id, 'fin', e.target.value)}
                                  className={`p-2 bg-slate-50 border rounded-xl text-xs text-center font-bold tracking-wide w-24 tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                    hasErr ? 'border-red-400 bg-red-100/30' : 'border-slate-200'
                                  }`}
                                />
                              )}
                              
                              {!isPrinting && hasErr && (
                                <span className="absolute bottom-full left-0 right-0 mx-auto w-max max-w-xs bg-slate-900 border border-red-500 text-red-400 text-[10px] font-semibold p-1.5 rounded-lg shadow-xl translate-y-[-4px] z-20">
                                  {errText}
                                </span>
                              )}
                            </td>

                            {/* Pause minutes */}
                            <td className="p-2 text-center">
                              {isPrinting ? (
                                <span className="font-semibold text-sm tabular-nums">{entry.pause ? `${entry.pause} min` : '-'}</span>
                              ) : (
                                <input 
                                  type="number" 
                                  min="0"
                                  step="5"
                                  value={entry.pause || ''} 
                                  placeholder="0"
                                  onChange={e => updateEntry(dayIndex, entry.id, 'pause', parseInt(e.target.value, 10) || 0)}
                                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-center font-bold tracking-wide w-16 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              )}
                            </td>

                            {/* Under Total column */}
                            <td className="p-2 text-center">
                              <span className="font-bold text-slate-800 text-xs tabular-nums bg-amber-50 border border-amber-200/50 px-2 py-1.5 rounded-lg">
                                {minutesToHours(rowTotalMinutes)}
                              </span>
                            </td>

                            {/* Simple line notes */}
                            <td className="p-2">
                              {isPrinting ? (
                                <span className="text-slate-600 text-xs break-all leading-normal">{entry.notes || '-'}</span>
                              ) : (
                                <input 
                                  type="text" 
                                  placeholder="Note de service..."
                                  value={entry.notes} 
                                  onChange={e => updateEntry(dayIndex, entry.id, 'notes', e.target.value)}
                                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Sub-total header and actions row */}
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <td colSpan={5} className="p-3">
                          {!isPrinting && (
                            <div className="flex gap-2">
                              <button 
                                onClick={() => addRowForDay(dayIndex)}
                                className="px-3.5 py-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full transition shadow-sm flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Ajouter une vacation</span>
                              </button>
                              
                              {day.entries.length > 1 && (
                                <button 
                                  onClick={() => removeRowForDay(dayIndex, day.entries[day.entries.length - 1].id)}
                                  className="px-3.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-full transition"
                                >
                                  Retirer la dernière
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-500 text-xs uppercase">Total {day.jour} :</td>
                        <td className="p-3 text-center">
                          <strong className="text-sm font-extrabold text-amber-905 bg-amber-100 border border-amber-201/50 px-2.5 py-1 rounded-lg tabular-nums">
                            {minutesToHours(dailyTotalTotalMin(day))}
                          </strong>
                        </td>
                        <td className="p-3"></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* SUMMARY ANCHOR GRID */}
        {(!isPrinting || printScope === 'summary') && (
          <SummaryGrid data={summaryGridData} grandTotal={summary.totalSemaine} />
        )}

        {/* METRICS METERS COMPILATIONS */}
        {(!isPrinting || printScope === 'full') && (
          <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50/25 border-t border-slate-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-center">
                <span className="text-[10px] font-extrabold uppercase text-indigo-500 tracking-wider">Durée Générale</span>
                <strong className="block mt-2 text-2xl font-extrabold text-indigo-900 tabular-nums">
                  {safeFixed(summary.totalSemaine)}h
                </strong>
              </div>

              <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Heures Chantiers</span>
                <strong className="block mt-2 text-2xl font-bold text-slate-800 tabular-nums">
                  {safeFixed(summary.totalChantier)}h
                </strong>
              </div>

              <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Heures Bureaux</span>
                <strong className="block mt-2 text-2xl font-bold text-slate-800 tabular-nums">
                  {safeFixed(summary.totalBureau)}h
                </strong>
              </div>

              <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm text-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Jours Travaillés / 7</span>
                <strong className="block mt-2 text-2xl font-bold text-slate-800 tabular-nums">
                  {summary.joursTravailles}
                </strong>
              </div>

            </div>
          </div>
        )}

        {/* BANQUE D'HEURES OVERTIME PLATFORM FOOTER */}
        {!isPrinting && (
          <footer className="p-6 bg-slate-900 border-t border-slate-950 text-white flex flex-col lg:flex-row justify-between items-center gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Info label block */}
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold">Banque d'heures supplémentaires</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-sm">
                Consignez vos heures excédentaires hebdomadaires pour des régularisations de paie ou récupérations de congés.
              </p>
              <button 
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="mt-2.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 flex items-center gap-1 transition"
              >
                <span>📊 Consulter le registre de transactions</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Shift weekly calculation */}
            <div className="text-center md:text-right bg-slate-950 p-4 rounded-2xl border border-slate-800 min-w-[200px] flex flex-col justify-center shadow-inner">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wide">Écart Hebdomadaire</span>
              <strong className="text-2xl font-extrabold text-indigo-4 *:: mt-1 block tabular-nums">
                +{safeFixed(summary.heuresSupplementaires)}h
              </strong>
              
              <button 
                onClick={sendOvertimeToBank}
                disabled={hasBankedThisWeek || summary.heuresSupplementaires <= 0 || errorsCount > 0}
                className="mt-2.5 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider rounded-xl shadow bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-755 disabled:opacity-40 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed transition"
                title="Consigner les heures supp. de cette semaine dans la banque"
              >
                {hasBankedThisWeek ? '✔ Enregistré' : '🏦 Mettre en banque'}
              </button>
            </div>

            {/* Bank totals metrics */}
            <div className="text-center md:text-right min-w-[155px]">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wide block">Solde total en banque</span>
              <div className="flex items-center justify-center lg:justify-end mt-1.5 gap-2.5">
                <strong className="text-4xl font-extrabold text-white tracking-tight tabular-nums">
                  {safeFixed(overtimeBank)}h
                </strong>
                <button 
                  onClick={manualAdjustBank}
                  className="p-1 px-2 border border-slate-700 hover:bg-slate-850 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition"
                  title="Ajustement manuel du solde"
                >
                  corriger
                </button>
              </div>
            </div>

            {/* Action payout */}
            <div className="min-w-[180px] flex justify-center lg:justify-end">
              <button 
                onClick={payoutBank}
                disabled={overtimeBank <= 0}
                className="px-4 py-3 text-xs font-bold bg-rose-650 hover:bg-rose-750 disabled:opacity-35 disabled:cursor-not-allowed text-white rounded-xl shadow-lg transition duration-200"
                title="Remettre la banque à zéro suite à un paiement ou rattrapage"
              >
                💸 Liquider la banque (Paiement)
              </button>
            </div>
          </footer>
        )}
      </div>

      {/* FLOATING SYSTEM TOAST MESSAGES */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full font-semibold pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            role="alert" 
            className={`px-4 py-3 text-white text-xs rounded-xl shadow-2xl pointer-events-auto animate-slide-in flex items-center justify-between border ${
              toast.type === 'success' ? 'bg-slate-900 border-emerald-500/30 shadow-emerald-500/10' : 
              toast.type === 'error' ? 'bg-slate-900 border-red-500/30 shadow-red-500/10 text-red-400' : 
              'bg-slate-900 border-indigo-500/30'
            }`}
          >
            <span>{toast.message}</span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-3 ${
              toast.type === 'success' ? 'bg-emerald-400 animate-pulse' : 
              toast.type === 'error' ? 'bg-red-400 animate-pulse' : 
              'bg-indigo-400 animate-pulse'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );

  function dailyTotalTotalMin(day: DayLog): number {
    return day.entries.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  }
}
