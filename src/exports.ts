/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  const doc = new jsPDF('l', 'pt', 'a4');
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Banner
  doc.setFillColor(79, 70, 229); // Indigo background
  doc.rect(0, 0, width, 45, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`RÉSUMÉ HEBDOMADAIRE : Semaine du ${data.meta.dateDebut} au ${data.meta.dateFin}`, width / 2, 27, { align: 'center' });

  const finalY = 65;

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
      { content: 'TOTAL HEURES / JOUR', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } as any },
      ...JOURS.map(j => dailyTotals[j] > 0 ? dailyTotals[j].toFixed(2) : '-'),
      grandTotalHours.toFixed(2)
    ]];

    autoTable(doc, {
      startY: finalY,
      margin: { left: 40, right: 40 },
      head: gridHead,
      body: gridBody,
      foot: gridFoot,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 6,
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.5,
      },
      headStyles: { 
        fillColor: [79, 70, 229], // Slate Indigo
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'center'
      },
      footStyles: { 
        fillColor: [241, 245, 249], // Soft gray table footer
        textColor: [15, 23, 42],    // Slate-900
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left' },
        1: { halign: 'left' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
        9: { fontStyle: 'bold', halign: 'center' }
      },
      didParseCell: (e: any) => {
        // Enforce horizontal centering for columns 2 through 9 across all sections (head/body/foot)
        if (e.column.index >= 2 && e.column.index <= 9) {
          e.cell.styles.halign = 'center';
        }

        if (e.section === 'body') {
          // Alternating row styling
          if (e.row.index % 2 === 0) {
            e.cell.styles.fillColor = [255, 255, 255];
          } else {
            e.cell.styles.fillColor = [248, 250, 252]; // Soft slate-50 background like raw web pages
          }

          // Quiet/Mute empty dashes so active working entries stand out
          if (e.cell.raw === '-') {
            e.cell.styles.textColor = [164, 174, 191]; // Slate-400 equivalent for softer look
            e.cell.styles.fontStyle = 'normal';
          }

          // Highlight total column
          if (e.column.index === 9) {
            e.cell.styles.fillColor = [238, 242, 255]; // Soft Indigo tint (Indigo-50)
            e.cell.styles.textColor = [67, 56, 202];   // Dark Indigo text
            e.cell.styles.fontStyle = 'bold';
          }
        } else if (e.section === 'foot') {
          if (e.column.index === 0) {
            e.cell.styles.halign = 'left';
          }
          if (e.column.index === 9) {
            e.cell.styles.fillColor = [224, 231, 255]; // Indigo-100 grand total box
            e.cell.styles.textColor = [67, 56, 202];   // Indigo-700
          }
        }
      }
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text("Aucune heure enregistrée pour cette semaine.", width / 2, finalY + 50, { align: 'center' });
  }

  let footerY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 30 : finalY + 100;
  if (footerY + 60 > height) {
    doc.addPage();
    footerY = 50;
  }

  // --- STATS CARDS FOOTER ---
  const cardW = 160;
  const cardH = 45;
  const cardGap = 20;
  const totW = (cardW * 3) + (cardGap * 2);
  const startX = (width - totW) / 2;

  const stats = [
    { title: 'HEURES TOTALES', val: `${safeFixed(summary.totalSemaine)}h`, color: [79, 70, 229] },
    { title: 'HEURES SUPP.', val: `${safeFixed(summary.heuresSupplementaires)}h`, color: [124, 58, 237] },
    { title: 'SOLDE EN BANQUE', val: `${safeFixed(overtimeBank)}h`, color: [13, 148, 136] }
  ];

  stats.forEach((stat, idx) => {
    const sx = startX + idx * (cardW + cardGap);
    
    // Smooth container box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(sx, footerY, cardW, cardH, 4, 4, 'FD');
    
    // Left decorative brand bar like modern web dashboards
    doc.setFillColor(stat.color[0], stat.color[1], stat.color[2]);
    doc.rect(sx, footerY, 4, cardH, 'F');
    
    // Label text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(stat.title, sx + 14, footerY + 16);
    
    // Stat val
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(stat.val, sx + 14, footerY + 36);
  });

  const cleanedNom = (data.meta.nom || 'Saisie').replace(/\s+/g, '_');
  const filename = `Feuille_Temps_${cleanedNom}_${data.meta.dateDebut}.pdf`;
  doc.save(filename);
};

export const exportMultiWeekToPdf = (
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
): void => {
  if (weeks.length === 0) return;
  
  // Sort weeks chronologically ascending
  const sortedWeeks = [...weeks].sort((a, b) => 
    new Date(a.data.meta.dateDebut).getTime() - new Date(b.data.meta.dateDebut).getTime()
  );

  const doc = new jsPDF('l', 'pt', 'a4');
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  
  const startPeriod = sortedWeeks[0].data.meta.dateDebut;
  const endPeriod = sortedWeeks[sortedWeeks.length - 1].data.meta.dateFin;

  // Let's draw a beautiful global master header banner at the top of Page 1
  const mainHeaderHeight = 55;
  doc.setFillColor(79, 70, 229); // Indigo background
  doc.rect(0, 0, width, mainHeaderHeight, 'F');
  
  doc.setFillColor(124, 58, 237); // Purple accent border
  doc.rect(0, mainHeaderHeight - 3, width, 3, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("RAPPORT SYNTHÉTIQUE MULTI-SEMAINES", 40, 22);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Employé : ${employeeName}   |   Période : du ${startPeriod} au ${endPeriod}`, 40, 38);

  // Calculate global summary stats
  let globalTotalHours = 0;
  let globalOvertimeHours = 0;
  const finalOvertimeBank = sortedWeeks[sortedWeeks.length - 1].overtimeBank; // bank of the last week
  sortedWeeks.forEach(w => {
    globalTotalHours += w.summary.totalSemaine;
    globalOvertimeHours += w.summary.heuresSupplementaires;
  });

  // Display a beautiful compact global synthesis box
  doc.setFillColor(248, 250, 252); // extremely soft slate
  doc.rect(40, mainHeaderHeight + 10, width - 80, 24, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(40, mainHeaderHeight + 10, width - 80, 24, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`SYNTHÈSE GLOBALE :   Total Heures : ${globalTotalHours.toFixed(2)}h   |   Heures Sup Totale : ${globalOvertimeHours.toFixed(2)}h   |   Banque Finale : ${finalOvertimeBank.toFixed(2)}h   |   Semaines Exportées : ${sortedWeeks.length}`, 50, mainHeaderHeight + 25);

  let currentY = mainHeaderHeight + 50;

  sortedWeeks.forEach((w) => {
    // Build grid data for this week
    const chantiersSummary: Record<string, any> = {};
    const dailyTotals: Record<string, number> = JOURS.reduce((acc, jour) => ({ ...acc, [jour]: 0 }), {});
    let grandTotalHours = 0;
    
    w.data.jours.forEach(day => {
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
    
    // Estimate table height
    const numRows = sortedChantierKeys.length > 0 ? sortedChantierKeys.length : 1;
    // Header row + data rows + foot row.
    const estimatedHeight = 50 + (numRows * 18) + 20;

    // Page overflow check
    if (currentY + estimatedHeight > height - 30) {
      doc.addPage();
      currentY = 40; // start near top on manual page break (without repeating master header)
    }

    // Draw the week section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // deep slate
    doc.text(`Semaine du ${w.data.meta.dateDebut} au ${w.data.meta.dateFin}`, 40, currentY);

    // Print summary stats next to the header on the right aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    const wStatsText = `Total Heures : ${w.summary.totalSemaine.toFixed(2)}h   |   Heures Supp : ${w.summary.heuresSupplementaires.toFixed(2)}h   |   Banque : ${w.overtimeBank.toFixed(2)}h`;
    doc.text(wStatsText, width - 40, currentY, { align: 'right' });

    currentY += 8; // small gap before the table

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
        { content: 'TOTAL HEURES / JOUR', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } as any },
        ...JOURS.map(j => dailyTotals[j] > 0 ? dailyTotals[j].toFixed(2) : '-'),
        grandTotalHours.toFixed(2)
      ]];

      autoTable(doc, {
        startY: currentY,
        margin: { left: 40, right: 40 },
        head: gridHead,
        body: gridBody,
        foot: gridFoot,
        theme: 'striped',
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 6,
          lineColor: [226, 232, 240], // slate-200
          lineWidth: 0.5,
        },
        headStyles: { 
          fillColor: [79, 70, 229], // brand indigo
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'center'
        },
        footStyles: { 
          fillColor: [241, 245, 249], // soft gray footer
          textColor: [15, 23, 42],    // Slate-900
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left' },
          1: { halign: 'left' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center' },
          8: { halign: 'center' },
          9: { fontStyle: 'bold', halign: 'center' }
        },
        didParseCell: (e: any) => {
          // Enforce horizontal centering for columns 2 through 9 across all sections (head/body/foot)
          if (e.column.index >= 2 && e.column.index <= 9) {
            e.cell.styles.halign = 'center';
          }

          if (e.section === 'body') {
            // Alternating row styling
            if (e.row.index % 2 === 0) {
              e.cell.styles.fillColor = [255, 255, 255];
            } else {
              e.cell.styles.fillColor = [248, 250, 252]; // Soft slate-50 background like raw web pages
            }

            // Quiet/Mute empty dashes so active working entries stand out
            if (e.cell.raw === '-') {
              e.cell.styles.textColor = [164, 174, 191]; // Slate-400 equivalent for softer look
              e.cell.styles.fontStyle = 'normal';
            }

            // Highlight total column
            if (e.column.index === 9) {
              e.cell.styles.fillColor = [238, 242, 255]; // Soft Indigo tint (Indigo-50)
              e.cell.styles.textColor = [67, 56, 202];   // Dark Indigo text
              e.cell.styles.fontStyle = 'bold';
            }
          } else if (e.section === 'foot') {
            if (e.column.index === 0) {
              e.cell.styles.halign = 'left';
            }
            if (e.column.index === 9) {
              e.cell.styles.fillColor = [224, 231, 255]; // Indigo-100 grand total box
              e.cell.styles.textColor = [67, 56, 202];   // Indigo-700
            }
          }
        }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 25; // Update Y for the next block
    } else {
      // Empty week message
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Aucun chantier ou activité enregistré pour cette semaine.", 40, currentY + 12);
      currentY += 30;
    }
  });

  const cleanedNom = employeeName.replace(/\s+/g, '_');
  const filename = `Rapport_Multi_Semaines_${cleanedNom}_du_${startPeriod}_au_${endPeriod}.pdf`;
  doc.save(filename);
};
