/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { TimesheetData, HistoryItem } from './types';
import { calculateEntryMinutes, safeFixed } from './utils';
import { JOURS, JOURS_ABBR } from './data';

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

export const exportToPdf = (
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
): void => {
  const { summaryOnly = false } = options;
  const doc = new jsPDF('l', 'pt', 'a4');
  
  const gradColor1 = [79, 70, 229]; // Indigo dark
  const gradColor2 = [124, 58, 237]; // Purple
  
  // Main Header banner
  const headerHeight = 70;
  const width = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(79, 70, 229); // Indigo background
  doc.rect(0, 0, width, headerHeight, 'F');
  
  // Elegant border at the bottom
  doc.setFillColor(124, 58, 237);
  doc.rect(0, headerHeight - 4, width, 4, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("Rapport d'heures et de chantiers - KENNICHE Lahouari", width / 2, 33, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Employé : ${data.meta.nom}  |  Période du ${data.meta.dateDebut} au ${data.meta.dateFin}`, width / 2, 53, { align: 'center' });
  
  let finalY = headerHeight + 15;

  if (!summaryOnly) {
    const head = [['Jour', 'Nom du Chantier', 'Catégorie', 'Heure Début', 'Heure Fin', 'Pause (min)', 'Durée nette', 'Notes']];
    const body: any[] = [];

    data.jours.forEach(day => {
      let dailyTotalMin = 0;
      const nonEmptyEntries = day.entries.filter(e => e.debut || e.fin);
      
      if (nonEmptyEntries.length > 0) {
        nonEmptyEntries.forEach((entry, entryIndex) => {
          const totalMin = calculateEntryMinutes(entry);
          dailyTotalMin += totalMin;
          const rowContent = [
            entry.chantier || '-',
            entry.type || 'Chantier',
            entry.debut || '-',
            entry.fin || '-',
            entry.pause.toString(),
            `${(totalMin / 60).toFixed(2)}h`,
            entry.notes || ''
          ];
          if (entryIndex === 0) {
            body.push([{ content: day.jour, rowSpan: nonEmptyEntries.length }, ...rowContent]);
          } else {
            body.push(rowContent);
          }
        });
        
        // Add summary row for this day
        body.push([
          { 
            content: `Total ${day.jour}`, 
            colSpan: 6, 
            styles: { 
              halign: 'right', 
              fontStyle: 'bold', 
              fillColor: '#f1f5f9', 
              textColor: '#1e293b', 
              cellPadding: 6 
            } 
          },
          { 
            content: `${(dailyTotalMin / 60).toFixed(2)}h`, 
            styles: { 
              fontStyle: 'bold', 
              fillColor: '#e2e8f0', 
              textColor: '#1e293b', 
              halign: 'center',
              cellPadding: 6
            } 
          },
          { 
            content: '', 
            styles: { fillColor: '#f1f5f9' } 
          }
        ]);
      }
    });

    (doc as any).autoTable({
      startY: finalY,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: '#4f46e5', textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'center', valign: 'middle', fillColor: '#e0e7ff' },
        1: { cellWidth: 180 },
        2: { halign: 'center' },
        6: { fontStyle: 'bold', halign: 'center' }
      },
      didParseCell: (tableData: any) => {
        if (tableData.cell.raw && typeof tableData.cell.raw === 'object' && tableData.cell.raw.rowSpan > 1) {
          tableData.cell.styles.valign = 'middle';
        }
      }
    });
    
    finalY = (doc as any).lastAutoTable.finalY + 25;
  }

  // --- SECOND PAGE FOR DETAILED RECAP GRID ---
  doc.addPage();
  
  // Banner for second page
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, width, 40, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Feuille hebdomadaire résumée", width / 2, 25, { align: 'center' });

  finalY = 60;
  
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
  
  if (sortedChantierKeys.length > 0) {
    const gridHead = [['Chantier', 'Type', ...JOURS_ABBR, 'TOTAL']];
    const gridBody = sortedChantierKeys.map(key => {
      const item = chantiersSummary[key];
      const rowData = [item.name, item.type];
      JOURS.forEach(j => rowData.push(item[j] > 0 ? item[j].toFixed(2) : '-'));
      rowData.push(item.total.toFixed(2));
      return rowData;
    });
    const gridFoot = [[
      { content: 'TOTAL HEURES / JOUR', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
      ...JOURS.map(j => dailyTotals[j] > 0 ? dailyTotals[j].toFixed(2) : '-'),
      grandTotalHours.toFixed(2)
    ]];

    (doc as any).autoTable({
      startY: finalY,
      head: gridHead,
      body: gridBody,
      foot: gridFoot,
      theme: 'grid',
      headStyles: { fillColor: '#4f46e5', textColor: 255 },
      footStyles: { fillColor: '#1e1b4b', textColor: 255 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        9: { fontStyle: 'bold', halign: 'center', fillColor: '#e1e1fe' }
      },
      didParseCell: (e: any) => {
        if (e.column.index > 1 && e.section === 'body' && e.cell.raw !== '-') {
          e.cell.styles.halign = 'center';
        }
      }
    });
    
    finalY = (doc as any).lastAutoTable.finalY + 30;
  }

  // --- STATS CARDS FOOTER ---
  const cardW = 160;
  const cardH = 50;
  const cardGap = 20;
  const totW = (cardW * 3) + (cardGap * 2);
  const startX = (width - totW) / 2;

  const stats = [
    { title: 'HEURES TOTALES', val: `${safeFixed(summary.totalSemaine)}h` },
    { title: 'HEURES SUPP.', val: `${safeFixed(summary.heuresSupplementaires)}h` },
    { title: 'SOLDE EN BANQUE', val: `${safeFixed(overtimeBank)}h` }
  ];

  stats.forEach((stat, idx) => {
    const sx = startX + idx * (cardW + cardGap);
    
    // Shadow box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(sx + 2, finalY + 2, cardW, cardH, 6, 6, 'F');
    
    // Actual white Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sx, finalY, cardW, cardH, 6, 6, 'FD');
    
    // Label text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(99, 102, 241);
    doc.text(stat.title, sx + cardW / 2, finalY + 16, { align: 'center' });
    
    // Stat val
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(stat.val, sx + cardW / 2, finalY + 40, { align: 'center' });
  });

  const cleanedNom = (data.meta.nom || 'Saisie').replace(/\s+/g, '_');
  const fileSuffix = summaryOnly ? '_Resume' : '';
  const filename = `Feuille_Temps_${cleanedNom}_${data.meta.dateDebut}${fileSuffix}.pdf`;
  doc.save(filename);
};
