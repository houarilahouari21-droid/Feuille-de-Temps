/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { JOURS, JOURS_ABBR } from '../data';

interface SummaryGridProps {
  data: {
    chantiers: Record<string, { name: string; type: string; total: number } & Record<string, number>>;
    dailyTotals: Record<string, number>;
  };
  grandTotal: number;
}

export const SummaryGrid: React.FC<SummaryGridProps> = ({ data, grandTotal }) => {
  const { chantiers, dailyTotals } = data;
  const sortedChantierKeys = Object.keys(chantiers).sort();

  if (sortedChantierKeys.length === 0) {
    return (
      <section className="p-5 sm:p-6 bg-slate-50 border-t border-slate-200" aria-labelledby="summary-grid-title">
        <h3 id="summary-grid-title" className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>📊</span> Résumé analytique de la semaine
        </h3>
        <p className="text-slate-400 text-center py-8 bg-white border border-slate-100 rounded-2xl text-sm italic">
          Aucune heure enregistrée pour cette période.
        </p>
      </section>
    );
  }

  return (
    <section className="p-5 sm:p-6 bg-slate-50 border-t border-slate-200" aria-labelledby="summary-grid-title">
      <h3 id="summary-grid-title" className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>📊</span> Résumé analytique de la semaine
      </h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-lg bg-white">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200/60">
            <tr>
              <th className="p-3 text-left font-semibold text-slate-600">Nom du Chantier</th>
              <th className="p-3 text-left font-semibold text-slate-600">Catégorie</th>
              {JOURS_ABBR.map(jour => (
                <th key={jour} className="p-3 w-20 text-center font-semibold text-slate-600">
                  {jour}
                </th>
              ))}
              <th className="p-3 w-24 text-center font-bold bg-indigo-50/50 text-indigo-900 border-l border-slate-100">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedChantierKeys.map((key, index) => {
              const item = chantiers[key];
              return (
                <tr key={key} className={`hover:bg-slate-50/40 transition-colors ${index % 2 === 0 ? 'bg-slate-55/20' : ''}`}>
                  <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      item.type === 'Bureau' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-700 border border-slate-100'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  {JOURS.map(jour => (
                    <td key={jour} className="p-3 text-center tabular-nums text-slate-600">
                      {item[jour] > 0 ? (
                        <span className="font-medium text-slate-700">{item[jour].toFixed(2)}h</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-center font-extrabold bg-indigo-50/30 text-indigo-800 border-l border-slate-100 tabular-nums">
                    {item.total.toFixed(2)}h
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50/80 border-t border-slate-200 text-slate-705 font-bold">
            <tr className="divide-x divide-slate-100/50">
              <td colSpan={2} className="p-3 text-left font-bold text-slate-700">TOTAL Cumulé / jour</td>
              {JOURS.map(jour => (
                <td key={jour} className="p-3 text-center tabular-nums text-slate-800">
                  {dailyTotals[jour] > 0 ? (
                    <span className="font-extrabold text-slate-900">{dailyTotals[jour].toFixed(2)}h</span>
                  ) : (
                    <span className="text-slate-400 font-normal">-</span>
                  )}
                </td>
              ))}
              <td className="p-3 text-center bg-indigo-600 text-white font-extrabold tabular-nums">
                {grandTotal.toFixed(2)}h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
