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

const drawEmbossedCard = (
  doc: jsPDF, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  accentColor: [number, number, number] = [79, 70, 229]
): void => {
  // 1. Double soft 3D backdrop drop shadow
  doc.setFillColor(241, 245, 249); // slate-100 outer glow
  doc.roundedRect(x + 2.5, y + 2.5, w, h, 4, 4, 'F');
  doc.setFillColor(226, 232, 240); // slate-200 shadow core
  doc.roundedRect(x + 1.2, y + 1.2, w, h, 4, 4, 'F');

  // 2. High density solid core background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 4, 4, 'F');

  // 3. Beveled highlights (Embossed look)
  // Inside Top & Left: light specular outline to appear raised
  doc.setDrawColor(248, 250, 252); // slate-50 bright highlight
  doc.setLineWidth(1.25);
  doc.line(x + 2, y + 1.2, x + w - 2, y + 1.2); // top bevel line
  doc.line(x + 1.2, y + 2, x + 1.2, y + h - 2); // left bevel line

  // Inside Right & Bottom: solid physical shadow line to appear extruded
  doc.setDrawColor(195, 207, 220); // slightly darker than slate-200 core
  doc.setLineWidth(0.85);
  doc.line(x + w, y + 2, x + w, y + h - 2); // right shadow line
  doc.line(x + 2, y + h, x + w - 2, y + h); // bottom shadow line

  // 4. Accent stripe on the left limit
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(x + 0.5, y + 0.5, 4, h - 1, 'F');

  // 5. Hard crisp outer frame
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, w, h, 4, 4, 'D');
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

  // Beautiful modern web banner with top purple accent line and realistic multi-layered drop shadow
  const bannerHeight = 48;
  doc.setFillColor(79, 70, 229); // Indigo/Purple accent bar
  doc.rect(0, 0, width, bannerHeight, 'F');
  
  doc.setFillColor(124, 58, 237); // Light Violet highlight line
  doc.rect(0, bannerHeight - 3, width, 3, 'F');

  // Glassy white reflection highlight at the very top edge of the banner
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, 1.5, 'F');

  // Crisp multi-layered 3D shadow underneath the master header banner
  doc.setFillColor(241, 245, 249);
  doc.rect(0, bannerHeight, width, 4, 'F');
  doc.setFillColor(226, 232, 240);
  doc.rect(0, bannerHeight, width, 2, 'F');
  doc.setFillColor(203, 213, 225);
  doc.rect(0, bannerHeight, width, 0.75, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`RÉSUMÉ HEBDOMADAIRE : Semaine du ${data.meta.dateDebut} au ${data.meta.dateFin}`, width / 2, 26, { align: 'center' });

  const finalY = 68;

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
        fontSize: 9, // Slightly larger for excellent readability
        cellPadding: 7, // Spacious web-like vertical padding
        lineColor: [203, 213, 225], // crisp slate-300 borders instead of light gray
        lineWidth: 0.75, // more defined, clean lines
        textColor: [15, 23, 42], // Deep high-contrast Slate-900 text for superior clarity
      },
      headStyles: { 
        fillColor: [79, 70, 229], // Rich Indigo head
        textColor: 255, 
        fontStyle: 'bold',
        fontSize: 9.5,
        halign: 'center'
      },
      footStyles: { 
        fillColor: [241, 245, 249], // soft slate-100 footer
        textColor: [15, 23, 42],    // Slate-900 bold
        fontStyle: 'bold',
        fontSize: 9.5,
        halign: 'center'
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', textColor: [15, 23, 42] },
        1: { halign: 'left', textColor: [51, 65, 85] },
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
        // Center columns 2 through 9
        if (e.column.index >= 2 && e.column.index <= 9) {
          e.cell.styles.halign = 'center';
        }

        if (e.section === 'body') {
          // Alternative rows for beautiful spreadsheet effect
          if (e.row.index % 2 === 0) {
            e.cell.styles.fillColor = [255, 255, 255];
          } else {
            e.cell.styles.fillColor = [248, 250, 252]; // tailwind slate-50 background
          }

          // Mute empty work cells to keep the focus on active ones
          if (e.cell.raw === '-') {
            e.cell.styles.textColor = [148, 163, 184]; // Muted Slate-400
            e.cell.styles.fontStyle = 'normal';
          } else if (e.column.index >= 2 && e.column.index <= 8) {
            e.cell.styles.fontStyle = 'bold'; // Active hours bold for clarity
            e.cell.styles.textColor = [15, 23, 42];
          }

          // Total column styling
          if (e.column.index === 9) {
            e.cell.styles.fillColor = [238, 242, 255]; // Light Indigo-50 tint
            e.cell.styles.textColor = [67, 56, 202];   // Indigo-700
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
      },
      didDrawCell: (e: any) => {
        // Gorgeous 3D embossed relief for the header cells
        if (e.section === 'head') {
          // Inner light bevel highlight at the top of headers
          doc.setDrawColor(255, 255, 255, 0.45);
          doc.setLineWidth(0.8);
          doc.line(e.cell.x, e.cell.y + 0.8, e.cell.x + e.cell.width, e.cell.y + 0.8);
          
          // Solid physical drop line shadow at the bottom boundary of headers
          doc.setDrawColor(30, 41, 59, 0.55);
          doc.setLineWidth(1.2);
          doc.line(e.cell.x, e.cell.y + e.cell.height - 0.6, e.cell.x + e.cell.width, e.cell.y + e.cell.height - 0.6);
        } else if (e.section === 'foot') {
          // Dual borders for footer cell separation relief
          doc.setDrawColor(71, 85, 105, 0.35);
          doc.setLineWidth(1.25);
          doc.line(e.cell.x, e.cell.y, e.cell.x + e.cell.width, e.cell.y);
          
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(1.0);
          doc.line(e.cell.x, e.cell.y + 1.2, e.cell.x + e.cell.width, e.cell.y + 1.2);
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
    
    // Beautiful 3D Embossed Card wrapper
    drawEmbossedCard(doc, sx, footerY, cardW, cardH, stat.color as [number, number, number]);
    
    // Label text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(stat.title, sx + 14, footerY + 17);
    
    // Stat value
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

  // Let's draw a beautiful global master header banner at the top of Page 1 with drop shadow
  const mainHeaderHeight = 52;
  doc.setFillColor(79, 70, 229); // Royal Indigo background
  doc.rect(0, 0, width, mainHeaderHeight, 'F');
  
  doc.setFillColor(124, 58, 237); // Purple accent border highlight
  doc.rect(0, mainHeaderHeight - 3, width, 3, 'F');

  // Glassy white highlight line at the very top edge
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, 1.5, 'F');

  // Shadow below the global header banner with feather layers
  doc.setFillColor(241, 245, 249);
  doc.rect(0, mainHeaderHeight, width, 4, 'F');
  doc.setFillColor(226, 232, 240);
  doc.rect(0, mainHeaderHeight, width, 2, 'F');
  doc.setFillColor(203, 213, 225);
  doc.rect(0, mainHeaderHeight, width, 0.75, 'F');
  
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

  // Display a beautiful compact global synthesis box with 3D embossed shadow
  drawEmbossedCard(doc, 40, mainHeaderHeight + 10, width - 80, 26, [79, 70, 229]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900 high contrast
  doc.text(`SYNTHÈSE GLOBALE :`, 55, mainHeaderHeight + 26);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  
  const statStrSum = `Total Heures : ${globalTotalHours.toFixed(2)}h   |   Heures Sup Totales : ${globalOvertimeHours.toFixed(2)}h   |   Banque Finale : ${finalOvertimeBank.toFixed(2)}h   |   Semaines Exportées : ${sortedWeeks.length}`;
  doc.text(statStrSum, 175, mainHeaderHeight + 26);

  let currentY = mainHeaderHeight + 54;

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
    
    // Estimate table height (estimated row count times height + margins)
    const numRows = sortedChantierKeys.length > 0 ? sortedChantierKeys.length : 1;
    const estimatedHeight = 55 + (numRows * 22) + 22;

    // Page overflow check
    if (currentY + estimatedHeight > height - 30) {
      doc.addPage();
      currentY = 40; // start near top on manual page break (without repeating master header)
    }

    // Draw a compact card header block with soft shadow for the week title banner using the 3D draw function
    drawEmbossedCard(doc, 40, currentY - 14, width - 80, 24, [124, 58, 237]);

    // Draw localized info inside the container!
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Semaine du ${w.data.meta.dateDebut} au ${w.data.meta.dateFin}`, 54, currentY + 1);

    // Print summary stats aligned on the right inside our beautiful bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(67, 56, 202); // indigo-700
    const wStatsText = `Total Heures : ${w.summary.totalSemaine.toFixed(2)}h    |    Heures Supp : ${w.summary.heuresSupplementaires.toFixed(2)}h    |    Banque : ${w.overtimeBank.toFixed(2)}h`;
    doc.text(wStatsText, width - 54, currentY + 1, { align: 'right' });

    currentY += 16; // Shift Y to space beautifully for the start of the table!

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
          fontSize: 9, // Slightly larger for excellent readability
          cellPadding: 7, // Spacious web-like vertical padding
          lineColor: [203, 213, 225], // crisp slate-300 borders instead of light gray
          lineWidth: 0.75, // more defined, clean lines
          textColor: [15, 23, 42], // Deep high-contrast Slate-900 text for superior clarity
        },
        headStyles: { 
          fillColor: [79, 70, 229], // brand Indigo
          textColor: 255, 
          fontStyle: 'bold',
          fontSize: 9.5,
          halign: 'center'
        },
        footStyles: { 
          fillColor: [241, 245, 249], // soft slate-100 footer
          textColor: [15, 23, 42],    // Slate-900
          fontStyle: 'bold',
          fontSize: 9.5,
          halign: 'center'
        },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left', textColor: [15, 23, 42] },
          1: { halign: 'left', textColor: [51, 65, 85] },
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
          // Enforce center positioning for coordinates columns
          if (e.column.index >= 2 && e.column.index <= 9) {
            e.cell.styles.halign = 'center';
          }

          if (e.section === 'body') {
            // Alternating rows styling
            if (e.row.index % 2 === 0) {
              e.cell.styles.fillColor = [255, 255, 255];
            } else {
              e.cell.styles.fillColor = [248, 250, 252]; // soft background
            }

            // Quiet/Mute empty dashes so active working entries stand out
            if (e.cell.raw === '-') {
              e.cell.styles.textColor = [148, 163, 184]; // Slate-400
              e.cell.styles.fontStyle = 'normal';
            } else if (e.column.index >= 2 && e.column.index <= 8) {
              e.cell.styles.fontStyle = 'bold'; // Active hours bold for clarity
              e.cell.styles.textColor = [15, 23, 42];
            }

            // Highlight total column
            if (e.column.index === 9) {
              e.cell.styles.fillColor = [238, 242, 255]; // Soft Indigo-50
              e.cell.styles.textColor = [67, 56, 202];   // Indigo-700
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
        },
        didDrawCell: (e: any) => {
          // Gorgeous 3D embossed relief for the header cells in master tables
          if (e.section === 'head') {
            // Inner light bevel highlight at the top of headers
            doc.setDrawColor(255, 255, 255, 0.45);
            doc.setLineWidth(0.8);
            doc.line(e.cell.x, e.cell.y + 0.8, e.cell.x + e.cell.width, e.cell.y + 0.8);
            
            // Solid physical drop line shadow at the bottom boundary of headers
            doc.setDrawColor(30, 41, 59, 0.55);
            doc.setLineWidth(1.2);
            doc.line(e.cell.x, e.cell.y + e.cell.height - 0.6, e.cell.x + e.cell.width, e.cell.y + e.cell.height - 0.6);
          } else if (e.section === 'foot') {
            // Dual borders for footer cell separation relief
            doc.setDrawColor(71, 85, 105, 0.35);
            doc.setLineWidth(1.25);
            doc.line(e.cell.x, e.cell.y, e.cell.x + e.cell.width, e.cell.y);
            
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(1.0);
            doc.line(e.cell.x, e.cell.y + 1.2, e.cell.x + e.cell.width, e.cell.y + 1.2);
          }
        }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 28; // Update Y for the next block
    } else {
      // Empty week message inside a beautifully bordered card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(40, currentY, width - 80, 26, 4, 4, 'FD');
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Aucun chantier ou activité enregistré pour cette semaine.", 54, currentY + 16);
      currentY += 40;
    }
  });

  const cleanedNom = employeeName.replace(/\s+/g, '_');
  const filename = `Rapport_Multi_Semaines_${cleanedNom}_du_${startPeriod}_au_${endPeriod}.pdf`;
  doc.save(filename);
};
