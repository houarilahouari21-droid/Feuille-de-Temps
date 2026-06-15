/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import * as XLSX from 'xlsx';
import { TimesheetData } from './types';
import { calculateEntryMinutes, safeFixed } from './utils';
import { JOURS, JOURS_ABBR } from './data';

const fetchAndDownloadPdf = async (htmls: string[], filename: string) => {
  try {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ htmls, filename })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erreur serveur (${response.status})`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("Erreur de génération PDF via le serveur Puppeteer:", error);
  }
};


export const exportToExcel = (
  data: TimesheetData,
  summary: {
    totalSemaine: number;
    heuresSupplementaires: number;
    totalChantier: number;
    totalBureau: number;
    joursTravailles: number;
  },
  overtimeBank: number
): void => {
  const rows: any[] = [];
  
  // Title & Metadata
  rows.push({ A: 'FEUILLE DE TEMPS HEBDOMADAIRE', B: '' });
  rows.push({ A: 'Employé', B: data.meta.nom });
  rows.push({ A: 'Période du', B: data.meta.dateDebut, C: 'au', D: data.meta.dateFin });
  rows.push({}); // Spacing
  rows.push({
    A: 'Jour',
    B: 'Chantier',
    C: 'Type',
    D: 'Heure Début',
    E: 'Heure Fin',
    F: 'Pause (min)',
    G: 'Durée nette (heures)',
    H: 'Notes de service'
  });

  data.jours.forEach(day => {
    let dailyTotalMin = 0;
    const hasEntries = day.entries && day.entries.some(e => e.debut || e.fin);
    if (hasEntries) {
      day.entries.forEach((entry, entryIndex) => {
        const totalMin = calculateEntryMinutes(entry);
        dailyTotalMin += totalMin;
        rows.push({
          A: entryIndex === 0 ? day.jour : '',
          B: entry.chantier || '-',
          C: entry.type || 'Chantier',
          D: entry.debut || '-',
          E: entry.fin || '-',
          F: entry.pause,
          G: (totalMin / 60).toFixed(2),
          H: entry.notes || ''
        });
      });
      if (dailyTotalMin > 0) {
        rows.push({
          F: `Sous-total ${day.jour}`,
          G: (dailyTotalMin / 60).toFixed(2)
        });
      }
    }
  });

  rows.push({}, {});
  rows.push({ A: 'RÉSUMÉ ET BANQUE D\'HEURES' });
  rows.push({ A: 'Heures normales hebdomadaires', G: `${data.meta.heuresSemaineNormales}h` });
  rows.push({ A: 'Heures cumulées réelles', G: `${safeFixed(summary.totalSemaine)}h` });
  rows.push({ A: 'Heures supplémentaires (supp.)', G: `${safeFixed(summary.heuresSupplementaires)}h` });
  rows.push({ A: 'Total Heures en Banque', G: `${safeFixed(overtimeBank)}h` });

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });

  // Width adjustments for best readability
  ws['!cols'] = [
    { wch: 15 }, // Day
    { wch: 35 }, // Chantier
    { wch: 12 }, // Type
    { wch: 12 }, // Start
    { wch: 12 }, // End
    { wch: 14 }, // Pause
    { wch: 15 }, // Total
    { wch: 25 }  // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feuille de Temps");

  const cleanedNom = (data.meta.nom || 'Saisie').replace(/\s+/g, '_');
  const filename = `Feuille_Temps_${cleanedNom}_${data.meta.dateDebut}.xlsx`;
  XLSX.writeFile(wb, filename);
};

export const exportToPdf = async (
  data: TimesheetData,
  summary: {
    totalSemaine: number;
    heuresSupplementaires: number;
    totalChantier: number;
    totalBureau: number;
    joursTravailles: number;
  },
  overtimeBank: number,
  options: { summaryOnly?: boolean } = {}
): Promise<void> => {
  // Build grid data
  const chantiersSummary: Record<string, any> = {};
  const dailyTotals: Record<string, number> = JOURS.reduce((acc, jour) => ({ ...acc, [jour]: 0 }), {});
  let grandTotalHours = 0;
  
  data.jours.forEach(day => {
    day.entries.forEach(entry => {
      const entryHours = calculateEntryMinutes(entry) / 60;
      if (entryHours > 0) {
        const type = entry.type || 'Chantier';
        const key = `${entry.chantier}::${type}`;
        if (!chantiersSummary[key]) {
          chantiersSummary[key] = {
            name: entry.chantier,
            type,
            ...JOURS.reduce((acc, j) => ({ ...acc, [j]: 0 }), {}),
            total: 0
          };
        }
        chantiersSummary[key][day.jour] += entryHours;
        chantiersSummary[key].total += entryHours;
        dailyTotals[day.jour] += entryHours;
        grandTotalHours += entryHours;
      }
    });
  });

  const sortedChantierKeys = Object.keys(chantiersSummary).sort();

  // Extract all notes
  const notesList: Array<{ day: string; chantier: string; text: string }> = [];
  data.jours.forEach(day => {
    day.entries.forEach(entry => {
      if (entry.notes && entry.notes.trim()) {
        notesList.push({
          day: day.jour,
          chantier: entry.chantier || 'Général',
          text: entry.notes.trim()
        });
      }
    });
  });

  const rowsHtml = sortedChantierKeys.length > 0 
    ? sortedChantierKeys.map((key, idx) => {
        const item = chantiersSummary[key];
        const categoryBadge = item.type === 'Bureau' 
          ? 'bg-amber-100 text-amber-800 border-amber-200' 
          : 'bg-indigo-50 text-indigo-700 border-indigo-100';

        const dayCells = JOURS.map(j => {
          const val = item[j];
          return val > 0 
            ? `<td class="p-3 text-center border-r border-slate-200 font-extrabold text-slate-800 tabular-nums">${val.toFixed(2)}h</td>`
            : `<td class="p-3 text-center border-r border-slate-200 text-slate-300 font-normal">-</td>`;
        }).join('');

        return `
          <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-200">
            <td class="p-3 text-left font-extrabold text-slate-900 border-r border-slate-200 text-[13px]">${item.name}</td>
            <td class="p-3 text-left border-r border-slate-200 text-[11px] w-24">
              <span class="inline-block px-2.5 py-0.5 rounded-full font-bold border ${categoryBadge}">${item.type}</span>
            </td>
            ${dayCells}
            <td class="p-3 text-center font-black bg-indigo-50/50 text-indigo-800 text-[13px] tabular-nums">${item.total.toFixed(2)}h</td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="10" class="p-8 text-center text-slate-400 italic font-medium text-[13px]">
          Aucune heure enregistrée pour cette semaine.
        </td>
      </tr>
    `;

  const footerCellsHtml = JOURS.map(j => {
    const tot = dailyTotals[j];
    return tot > 0 
      ? `<td class="p-3 text-center border-r border-slate-300 font-black text-slate-900 tabular-nums text-[13px]">${tot.toFixed(2)}h</td>`
      : `<td class="p-3 text-center border-r border-slate-300 text-slate-400 font-normal text-[12px]">-</td>`;
  }).join('');

  const htmlContent = `
    <div class="h-full flex flex-col justify-between py-2 relative">
      <div class="absolute -top-1.5 inset-x-0 h-1.5 bg-indigo-600 rounded-t-xl"></div>
      
      <div>
        <!-- TOP BRAND BANNER -->
        <div class="mb-5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-5 shadow-[0_6px_20px_rgba(79,70,229,0.18)] relative overflow-hidden border border-indigo-700">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_60%)]"></div>
          <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/20"></div>
          <div class="flex justify-between items-center relative z-10">
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/20 text-indigo-100">
                Saisie Hebdomadaire
              </span>
              <h1 class="text-xl font-extrabold text-white tracking-tight mt-1">
                FEUILLE DE TEMPS PROFESSIONNELLE
              </h1>
              <p class="text-[11px] text-indigo-100/90 font-medium mt-0.5">
                Période du <span class="font-bold text-white underline decoration-white/30">${data.meta.dateDebut}</span> au <span class="font-bold text-white underline decoration-white/30">${data.meta.dateFin}</span>
              </p>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">EMPLOYÉ</div>
              <div class="text-lg font-black text-white bg-slate-950/40 px-4 py-1.5 rounded-xl border border-white/10 mt-1 shadow-inner select-all">
                ${data.meta.nom || 'Saisie'}
              </div>
            </div>
          </div>
        </div>

        <!-- MAIN TABLE PORTAL WITH GORGEOUS 3D EMBOSSED EFFECT -->
        <div class="mb-5 rounded-2xl border-2 border-slate-300 bg-white shadow-[6px_6px_0px_#94a3b8] overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-indigo-600 border-b border-indigo-700 text-white select-none">
                <th class="p-3 font-extrabold text-[10.5px] uppercase tracking-wider text-white pl-4">Nom du Chantier</th>
                <th class="p-3 font-extrabold text-[10.5px] uppercase tracking-wider text-white">Catégorie</th>
                ${JOURS_ABBR.map(j => `
                  <th class="p-3 text-center font-extrabold text-[10.5px] uppercase tracking-wider text-white w-18">${j}</th>
                `).join('')}
                <th class="p-3 text-center font-extrabold text-[10.5px] uppercase tracking-wider text-white w-24 bg-indigo-700/50">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot class="bg-slate-100 font-extrabold border-t-2 border-slate-300 text-slate-800">
              <tr class="divide-x divide-slate-200/50">
                <td colspan="2" class="p-3.5 pl-4 font-black text-slate-700 text-xs text-left">TOTAL CUMULÉ PAR JOUR</td>
                ${footerCellsHtml}
                <td class="p-3.5 text-center bg-indigo-600 text-white font-black text-[13px] tabular-nums">${grandTotalHours.toFixed(2)}h</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- CONDITIONAL 3D NOTEBOOK BLOCK FOR NOTES -->
        ${notesList.length > 0 ? `
          <div class="mb-5 p-4 rounded-xl border-2 border-slate-300 bg-amber-50/40 text-amber-950 shadow-[4px_4px_0px_#d97706] text-[10.5px] flex flex-col gap-1.5 relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500"></div>
            <div class="font-extrabold text-[11px] flex items-center gap-1.5 text-amber-900">
              <span>📝</span> NOTES DE SERVICE & REMARQUES DE LA SEMAINE :
            </div>
            <div class="max-h-24 overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-1">
              ${notesList.map(n => `
                <div class="border-b border-slate-200/50 pb-1">
                  <strong>${n.day}</strong> <span class="bg-slate-200 text-slate-700 px-1 py-[1px] rounded text-[9px] font-bold">${n.chantier}</span> :
                  <span class="text-slate-800 italic font-medium">${n.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- BOTTOM BENTO-STYLE 3D CARDS ROW -->
      <div class="grid grid-cols-3 gap-5">
        <!-- CARD 1 -->
        <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-indigo-600 relative overflow-hidden">
          <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/40"></div>
          <div>
            <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">HEURES CUMULÉES</div>
            <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(summary.totalSemaine)}h</div>
          </div>
          <div class="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 font-extrabold text-base flex items-center justify-center select-none shadow-sm border border-indigo-100">
            📊
          </div>
        </div>
        
        <!-- CARD 2 -->
        <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-violet-600 relative overflow-hidden">
          <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/40"></div>
          <div>
            <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">HEURES SUPPLÉMENTAIRES</div>
            <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(summary.heuresSupplementaires)}h</div>
          </div>
          <div class="p-2.5 bg-violet-50 rounded-xl text-violet-600 font-extrabold text-base flex items-center justify-center select-none shadow-sm border border-violet-100">
            ⚡
          </div>
        </div>

        <!-- CARD 3 -->
        <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-teal-600 relative overflow-hidden">
          <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/40"></div>
          <div>
            <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">SOLDE BANQUE D'HEURES</div>
            <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(overtimeBank)}h</div>
          </div>
          <div class="p-2.5 bg-teal-50 rounded-xl text-teal-600 font-extrabold text-base flex items-center justify-center select-none shadow-sm border border-teal-100">
            🏦
          </div>
        </div>
      </div>
    </div>
  `;

  const cleanedNom = (data.meta.nom || 'Saisie').replace(/\s+/g, '_');
  const filename = `Feuille_Temps_${cleanedNom}_${data.meta.dateDebut}.pdf`;

  await fetchAndDownloadPdf([htmlContent], filename);
};

export const exportMultiWeekToPdf = async (
  employeeName: string,
  weeks: Array<{
    data: TimesheetData;
    summary: {
      totalSemaine: number;
      heuresSupplementaires: number;
      totalChantier: number;
      totalBureau: number;
      joursTravailles: number;
    };
    overtimeBank: number;
  }>
): Promise<void> => {
  if (weeks.length === 0) return;
  
  const sortedWeeks = [...weeks].sort((a, b) => 
    new Date(a.data.meta.dateDebut).getTime() - new Date(b.data.meta.dateDebut).getTime()
  );

  const startPeriod = sortedWeeks[0].data.meta.dateDebut;
  const endPeriod = sortedWeeks[sortedWeeks.length - 1].data.meta.dateFin;

  // --- PAGE 1: GLOBAL MASTER SUMMARY ---
  let globalTotalHours = 0;
  let globalOvertimeHours = 0;
  const finalOvertimeBank = sortedWeeks[sortedWeeks.length - 1].overtimeBank; 
  
  sortedWeeks.forEach(w => {
    globalTotalHours += w.summary.totalSemaine;
    globalOvertimeHours += w.summary.heuresSupplementaires;
  });

  const weeksListRowsHtml = sortedWeeks.map((w, idx) => {
    return `
      <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-200">
        <td class="p-3 font-extrabold text-slate-900 border-r border-slate-200 pl-4 text-xs">
          Semaine du ${w.data.meta.dateDebut} au ${w.data.meta.dateFin}
        </td>
        <td class="p-3 text-center border-r border-slate-200 font-bold text-slate-800 tabular-nums text-xs">
          ${w.summary.totalSemaine.toFixed(2)}h
        </td>
        <td class="p-3 text-center border-r border-slate-200 font-bold text-violet-700 tabular-nums text-xs">
          ${w.summary.heuresSupplementaires.toFixed(2)}h
        </td>
        <td class="p-3 text-center font-extrabold bg-teal-50/50 text-teal-800 tabular-nums text-xs">
          ${w.overtimeBank.toFixed(2)}h
        </td>
      </tr>
    `;
  }).join('');

  const globalSummaryPageHtml = `
    <div class="h-full flex flex-col justify-between py-2 relative">
      <div class="absolute -top-1.5 inset-x-0 h-1.5 bg-indigo-600 rounded-t-xl"></div>
      
      <div>
        <!-- TOP BANNER -->
        <div class="mb-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-6 shadow-[0_6px_20px_rgba(79,70,229,0.18)] relative overflow-hidden border border-indigo-700">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_60%)]"></div>
          <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/20"></div>
          <div class="flex justify-between items-center relative z-10">
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-violet-600/40 border border-violet-400/20 text-indigo-100">
                Rapport Consolidé Multi-Semaines
              </span>
              <h1 class="text-2xl font-black text-white tracking-tight mt-1.55">
                RAPPORT COMPTABLE DES TEMPS DE SERVICE
              </h1>
              <p class="text-[11.5px] text-indigo-100/90 font-medium mt-1">
                Période globale : du <span class="font-bold text-white">${startPeriod}</span> au <span class="font-bold text-white">${endPeriod}</span>
              </p>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">SALARIÉ BENEFICIAIRE</div>
              <div class="text-md font-black text-indigo-900 bg-white px-4 py-1.5 rounded-xl border border-white mt-1 shadow-md">
                ${employeeName}
              </div>
            </div>
          </div>
        </div>

        <!-- SUMMARY BREAKDOWN TABLE CARD -->
        <div class="mb-6 rounded-2xl border-2 border-slate-300 bg-white shadow-[6px_6px_0px_#94a3b8] overflow-hidden">
          <div class="bg-slate-50 border-b border-slate-200 px-4 py-3 font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <span>🗓️</span> Évolutions et résumés des périodes exportées
          </div>
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-indigo-600 border-b border-indigo-700 text-white text-[10px] uppercase tracking-wider select-none font-bold">
                <th class="p-3 pl-4 text-white">Semaine d'activité</th>
                <th class="p-3 text-center text-white w-32">Heures Normales</th>
                <th class="p-3 text-center text-white w-32">Heures Supp.</th>
                <th class="p-3 text-center text-white w-44 bg-indigo-700">Solde Banque</th>
              </tr>
            </thead>
            <tbody>
              ${weeksListRowsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- BOTTOM COVER SYNTHESIS BENTO CARDS -->
      <div class="grid grid-cols-4 gap-5">
        <div class="bg-white rounded-xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-slate-600 relative overflow-hidden">
          <div>
            <div class="text-[8.5px] font-black tracking-wider text-slate-400 uppercase">SEMAINES TOTALES</div>
            <div class="text-md font-black text-slate-900 mt-1">${sortedWeeks.length}</div>
          </div>
          <div class="text-lg bg-slate-50 px-2 py-1 rounded">🗓️</div>
        </div>

        <div class="bg-white rounded-xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-indigo-600 relative overflow-hidden">
          <div>
            <div class="text-[8.5px] font-black tracking-wider text-slate-400 uppercase">HEURES CUMULÉES</div>
            <div class="text-md font-black text-slate-900 mt-1">${globalTotalHours.toFixed(2)}h</div>
          </div>
          <div class="text-lg bg-indigo-50 px-2 py-1 rounded">📊</div>
        </div>

        <div class="bg-white rounded-xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-violet-600 relative overflow-hidden">
          <div>
            <div class="text-[8.5px] font-black tracking-wider text-slate-400 uppercase">HEURES SUPP CUMULÉES</div>
            <div class="text-md font-black text-slate-900 mt-1">${globalOvertimeHours.toFixed(2)}h</div>
          </div>
          <div class="text-lg bg-violet-50 px-2 py-1 rounded">⚡</div>
        </div>

        <div class="bg-white rounded-xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-teal-600 relative overflow-hidden">
          <div>
            <div class="text-[8.5px] font-black tracking-wider text-slate-400 uppercase">SOLDE FINAL BANQUE</div>
            <div class="text-md font-black text-slate-900 mt-1">${finalOvertimeBank.toFixed(2)}h</div>
          </div>
          <div class="text-lg bg-teal-50 px-2 py-1 rounded">🏦</div>
        </div>
      </div>
    </div>
  `;

  // --- INDIVIDUAL WEEKS ---
  const weeksPagesHtml: string[] = [];
  
  for (let i = 0; i < sortedWeeks.length; i++) {
    const w = sortedWeeks[i];
    
    const wChantiersSummary: Record<string, any> = {};
    const wDailyTotals: Record<string, number> = JOURS.reduce((acc, jour) => ({ ...acc, [jour]: 0 }), {});
    let wGrandTotalHours = 0;
    
    w.data.jours.forEach(day => {
      day.entries.forEach(entry => {
        const entryHours = calculateEntryMinutes(entry) / 60;
        if (entryHours > 0) {
          const type = entry.type || 'Chantier';
          const key = `${entry.chantier}::${type}`;
          if (!wChantiersSummary[key]) {
            wChantiersSummary[key] = {
              name: entry.chantier,
              type,
              ...JOURS.reduce((acc, j) => ({ ...acc, [j]: 0 }), {}),
              total: 0
            };
          }
          wChantiersSummary[key][day.jour] += entryHours;
          wChantiersSummary[key].total += entryHours;
          wDailyTotals[day.jour] += entryHours;
          wGrandTotalHours += entryHours;
        }
      });
    });

    const wSortedChantierKeys = Object.keys(wChantiersSummary).sort();

    const wNotesList: Array<{ day: string; chantier: string; text: string }> = [];
    w.data.jours.forEach(day => {
      day.entries.forEach(entry => {
        if (entry.notes && entry.notes.trim()) {
          wNotesList.push({
            day: day.jour,
            chantier: entry.chantier || 'Général',
            text: entry.notes.trim()
          });
        }
      });
    });

    const wRowsHtml = wSortedChantierKeys.length > 0 
      ? wSortedChantierKeys.map((key, idx) => {
          const item = wChantiersSummary[key];
          const categoryBadge = item.type === 'Bureau' 
            ? 'bg-amber-100 text-amber-800 border-amber-200' 
            : 'bg-indigo-50 text-indigo-700 border-indigo-100';

          const dayCells = JOURS.map(j => {
            const val = item[j];
            return val > 0 
              ? `<td class="p-3 text-center border-r border-slate-200 font-extrabold text-slate-800 tabular-nums">${val.toFixed(2)}h</td>`
              : `<td class="p-3 text-center border-r border-slate-200 text-slate-300 font-normal">-</td>`;
          }).join('');

          return `
            <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-200">
              <td class="p-3 text-left font-extrabold text-slate-900 border-r border-slate-200 text-[13px]">${item.name}</td>
              <td class="p-3 text-left border-r border-slate-200 text-[11px] w-24">
                <span class="inline-block px-2.5 py-0.5 rounded-full font-bold border ${categoryBadge}">${item.type}</span>
              </td>
              ${dayCells}
              <td class="p-3 text-center font-black bg-indigo-50/50 text-indigo-800 text-[13px] tabular-nums">${item.total.toFixed(2)}h</td>
            </tr>
          `;
        }).join('')
      : `
        <tr>
          <td colspan="10" class="p-8 text-center text-slate-400 italic font-medium text-[13px]">
            Aucune heure enregistrée pour cette semaine d'activité.
          </td>
        </tr>
      `;

    const wFooterCellsHtml = JOURS.map(j => {
      const tot = wDailyTotals[j];
      return tot > 0 
        ? `<td class="p-3 text-center border-r border-slate-300 font-black text-slate-900 tabular-nums text-[13px]">${tot.toFixed(2)}h</td>`
        : `<td class="p-3 text-center border-r border-slate-300 text-slate-400 font-normal text-[12px]">-</td>`;
    }).join('');

    const wPageHtml = `
      <div class="h-full flex flex-col justify-between py-2 relative">
        <div class="absolute -top-1.5 inset-x-0 h-1.5 bg-indigo-600 rounded-t-xl"></div>
        
        <div>
          <!-- WEEK BANNER -->
          <div class="mb-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-700 p-5 shadow-[0_4px_15px_rgba(79,70,229,0.15)] relative overflow-hidden border border-indigo-600">
            <div class="absolute top-0 inset-x-0 h-[1.5px] bg-white/10"></div>
            <div class="flex justify-between items-center relative z-10">
              <div>
                <span class="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/20 text-indigo-50">
                  Saisie d'Activité Individuelle • Page ${i + 2} / ${sortedWeeks.length + 1}
                </span>
                <h2 class="text-lg font-extrabold text-white tracking-tight mt-1">
                  Semaine du ${w.data.meta.dateDebut} au ${w.data.meta.dateFin}
                </h2>
              </div>
              <div class="text-right">
                <div class="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">SALARIÉ</div>
                <div class="text-base font-bold text-white mt-0.5">${employeeName}</div>
              </div>
            </div>
          </div>

          <!-- WEEK GRID -->
          <div class="mb-5 rounded-2xl border-2 border-slate-300 bg-white shadow-[6px_6px_0px_#94a3b8] overflow-hidden">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-indigo-600 border-b border-indigo-700 text-white select-none">
                  <th class="p-3 font-extrabold text-[10.5px] uppercase tracking-wider text-white pl-4">Nom du Chantier</th>
                  <th class="p-3 font-extrabold text-[10.5px] uppercase tracking-wider text-white">Catégorie</th>
                  ${JOURS_ABBR.map(j => `
                    <th class="p-3 text-center font-extrabold text-[10.5px] uppercase tracking-wider text-white w-18">${j}</th>
                  `).join('')}
                  <th class="p-3 text-center font-extrabold text-[10.5px] uppercase tracking-wider text-white w-24 bg-indigo-700/50">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${wRowsHtml}
              </tbody>
              <tfoot class="bg-slate-100 font-extrabold border-t-2 border-slate-300 text-slate-800">
                <tr class="divide-x divide-slate-200/50">
                  <td colspan="2" class="p-3.5 pl-4 font-black text-slate-700 text-xs text-left">TOTAL CUMULÉ DU GROUPE</td>
                  ${wFooterCellsHtml}
                  <td class="p-3.5 text-center bg-indigo-600 text-white font-black text-[13px] tabular-nums">${wGrandTotalHours.toFixed(2)}h</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- NOTES -->
          ${wNotesList.length > 0 ? `
            <div class="mb-5 p-4 rounded-xl border-2 border-slate-300 bg-amber-50/40 text-amber-950 shadow-[4px_4px_0px_#d97706] text-[10.5px] flex flex-col gap-1.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500"></div>
              <div class="font-extrabold text-[11px] flex items-center gap-1.5 text-amber-900">
                <span>📝</span> REMARQUES RECROISÉES :
              </div>
              <div class="max-h-24 overflow-y-auto grid grid-cols-2 gap-x-4 gap-y-1">
                ${wNotesList.map(n => `
                  <div class="border-b border-slate-200/50 pb-1">
                    <strong>${n.day}</strong> <span class="bg-slate-200 text-slate-700 px-1 py-[1px] rounded text-[9px] font-bold">${n.chantier}</span> :
                    <span class="text-slate-800 italic font-medium">${n.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- SUMMARY FOOTER CARDS -->
        <div class="grid grid-cols-3 gap-5">
          <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-indigo-600 relative overflow-hidden">
            <div>
              <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">HEURES SEMAINE</div>
              <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(w.summary.totalSemaine)}h</div>
            </div>
            <div class="text-base">📊</div>
          </div>
          
          <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-violet-600 relative overflow-hidden">
            <div>
              <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">HEURES SUPP. SEMAINE</div>
              <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(w.summary.heuresSupplementaires)}h</div>
            </div>
            <div class="text-base">⚡</div>
          </div>

          <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-[5px_5px_0px_#94a3b8] p-4 flex items-center justify-between border-l-6 border-l-teal-600 relative overflow-hidden">
            <div>
              <div class="text-[9px] font-black tracking-widest text-slate-400 uppercase">BANQUE D'HEURES</div>
              <div class="text-lg font-black text-slate-900 mt-1 tabular-nums">${safeFixed(w.overtimeBank)}h</div>
            </div>
            <div class="text-base">🏦</div>
          </div>
        </div>
      </div>
    `;

    weeksPagesHtml.push(wPageHtml);
  }

  const cleanedNom = employeeName.replace(/\s+/g, '_');
  const filename = `Rapport_Multi_Semaines_${cleanedNom}_du_${startPeriod}_au_${endPeriod}.pdf`;

  await fetchAndDownloadPdf([globalSummaryPageHtml, ...weeksPagesHtml], filename);
};
