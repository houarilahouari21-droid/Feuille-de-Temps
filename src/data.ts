/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const JOURS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi"
];

export const JOURS_ABBR = [
  "Dim",
  "Lun",
  "Mar",
  "Mer",
  "Jeu",
  "Ven",
  "Sam"
];

export const CHANTIERS_INITIAUX = [
  "Entrepôt 2025",
  "Entrepôt 2025 Bromptonville",
  "P1001 Locations",
  "P2501 - Logements modulaires rue Magnus - Gatineau",
  "P2502 - 18 logements - Nicolas Scheib terrain 1",
  "P2503 - Multi St-François - Sherbrooke",
  "P2504 - Medina - Granby",
  "P2505 - Habitation Rivard - Granby",
  "P2506 - 30 logements - Magog",
  "P2507 - Séminaire Salésien - Sherbrooke",
  "P2508 - 16 logements rue Samara - Bromont",
  "P2509 - Logements modulaires boul. Technologie - Gatineau",
  "P2510 - Escaliers Cégep de Sherbrooke - Sherbrooke",
  "P2511 - 22 logements McGregor - Sherbrooke",
  "P2512 - Magotteaux - boul industriel, Magog",
  "P2513 - 64 unités - St-Amable",
  "P2514 - Hôtel Brome-Missisquoi - Cowansville",
  "P2515 - 35 Logements St-Hyacinthe",
  "P2516 - Résidence James-Lemoine OIKOS - Québec",
  "P2517 - 80 Log. - District 55 - Trois-Rivières",
  "P2518 - Habitation Carillon",
  "P2519 - Le St-Jacques - Napierville",
  "P2520 - Cloriacité (Citadin) - Trois-Rivières",
  "P2521 - 15 log. Duvernay",
  "P2522 - CRB Tunnel centre de détention - Québec",
  "P2523 - 36 logements F.Hertel - Magog",
  "P2524 - 32 logement King kennedy - Sherbrooke",
  "P2525 - Maison Lemay mur soutènement",
  "P2526 - 48 Log. Plouffe Ph 1 - Trois-Rivières",
  "P2527 - 48 Log. Plouffe Ph 2 - Trois-Rivières",
  "P2528 - Alexandre-Taché - Gatineau",
  "P2529 - Habitation Rivard Phase 2",
  "P2530 - Multi-logements rue Robitaille - Granby",
  "P2531 - LC04 64 logements Oplex - Sherbrooke",
  "P2532 - 24 log. Haute-Rive (Sherplex-Bloc1) - Magog",
  "P2533 - 24 log. Haute-Rive (Sherplex-Bloc5) - Magog",
  "P2534 - 24 log. Haute-Rive (Tijaro-Bloc6) - Magog",
  "P2535 - Le Next (Alema Const.) - Sherbrooke",
  "P2536 - 255 rue Mill - North Hatley",
  "P2537 - 24 log. Haute-Rive (RPLH-Bloc4) - Magog",
  "P2538 - 32 log - boul des Forges - TR",
  "P2539 - RPA Duplessis - Sherbrooke",
  "P2540 - 24 log. Haute-Rive (Thibaultetfrere-Bloc7) - Magog",
  "P6000 Nouvel Entrepôt EJB",
  "P6001 Construction nouvel entrepôt EJB",
  "Petite job"
].sort((a, b) => a.localeCompare(b));

export const STORAGE_KEY_PREFIX = 'timesheet_';
export const STORAGE_KEY_LAST_VIEWED = 'timesheet_last_viewed_week';
export const STORAGE_KEY_OVERTIME_BANK = 'timesheet_overtime_bank';
export const STORAGE_KEY_OVERTIME_HISTORY = 'timesheet_overtime_history';
export const STORAGE_KEY_PASSWORD_HASH = 'timesheet_password_hash';
export const STORAGE_KEY_PASSWORD_HINT = 'timesheet_password_hint';
