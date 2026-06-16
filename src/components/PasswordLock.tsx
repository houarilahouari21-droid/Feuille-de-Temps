/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Unlock, Eye, EyeOff, Shield, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { hashPassword, safeStorage } from '../utils';
import { STORAGE_KEY_PASSWORD_HASH, STORAGE_KEY_PASSWORD_HINT } from '../data';

// Storage key for the security answer hash
const STORAGE_KEY_ANSWER_HASH = 'timesheet_answer_hash';

interface PasswordLockProps {
  onUnlock: () => void;
  onSetToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const PasswordLock: React.FC<PasswordLockProps> = ({ onUnlock, onSetToast }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  // Forgot password flow
  const [showForgot, setShowForgot] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  
  let savedHash: string | null = null;
  let securityQuestion = '';
  let savedAnswerHash = '';
  try {
    savedHash = safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH);
    securityQuestion = safeStorage.getItem(STORAGE_KEY_PASSWORD_HINT) || '';
    savedAnswerHash = safeStorage.getItem(STORAGE_KEY_ANSWER_HASH) || '';
  } catch (e) {
    console.error("Failed to read security configurations from localStorage:", e);
  }

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Saisissez votre mot de passe.');
      return;
    }

    if (hashPassword(password) === savedHash) {
      onSetToast('Déverrouillé avec succès.', 'success');
      onUnlock();
    } else {
      setError('Mot de passe incorrect. Réessayez.');
      setPassword('');
    }
  };

  const handleForgotUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityAnswer) {
      setError('Saisissez la réponse à votre question de sécurité.');
      return;
    }

    const cleanedAnswer = securityAnswer.trim().toLowerCase();
    if (hashPassword(cleanedAnswer) === savedAnswerHash) {
      onSetToast('Réponse correcte ! Veuillez réinitialiser votre mot de passe dans les paramètres.', 'success');
      onUnlock();
    } else {
      setError('Réponse incorrecte. Réessayez.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl border border-slate-700/80 p-8 relative overflow-hidden">
        {/* Decorative background lights */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-full shadow-lg shadow-indigo-500/20 mb-4 animate-pulse">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white text-center">Feuille de Temps Sécurisée</h2>
          <p className="text-slate-400 text-sm text-center mt-1">
            {showForgot ? 'Récupération de l’accès' : 'Le projet est protégé par un mot de passe.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!showForgot ? (
          <form onSubmit={handleUnlock} className="space-y-6 relative z-10">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Mot de passe d'accès
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  autoFocus
                  placeholder="Saisissez le mot de passe..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:zoom text-white text-md font-bold rounded-xl shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Déverrouiller
            </button>

            {securityQuestion && savedAnswerHash && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true);
                    setError('');
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium transition"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleForgotUnlock} className="space-y-6 relative z-10">
            <div className="bg-slate-900/45 p-4 border border-slate-700/50 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Question de sécurité</span>
              <p className="text-slate-200 font-medium text-sm">{securityQuestion}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Votre réponse
              </label>
              <div className="relative">
                <input
                  type={showAnswer ? 'text' : 'password'}
                  value={securityAnswer}
                  onChange={(e) => {
                    setSecurityAnswer(e.target.value);
                    setError('');
                  }}
                  autoFocus
                  placeholder="Écrivez votre réponse..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showAnswer ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setError('');
                  setSecurityAnswer('');
                }}
                className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold rounded-xl transition"
              >
                Retour
              </button>
              <button
                type="submit"
                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-bold rounded-xl shadow-lg transition"
              >
                Vérifier
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-700/60 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Shield className="w-4 h-4 text-slate-500" />
          <span>Données sécurisées localement sur votre navigateur.</span>
        </div>
      </div>
    </div>
  );
};

// Panel component to adjust lock security settings from the main dashboard
interface SecuritySettingsProps {
  onClose: () => void;
  onSetToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ onClose, onSetToast }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'change'>('status');
  
  // Password state
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return !!safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH);
    } catch (e) {
      console.error(e);
      return false;
    }
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Security question state
  const [question, setQuestion] = useState<string>(() => {
    try {
      return safeStorage.getItem(STORAGE_KEY_PASSWORD_HINT) || '';
    } catch (e) {
      console.error(e);
      return '';
    }
  });
  const [answer, setAnswer] = useState('');
  
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    let savedHash: string | null = null;
    try {
      savedHash = safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH);
    } catch (e) {
      console.error(e);
    }

    // If enabling first time, or disabling
    if (!savedHash) {
      // Setup password
      if (!newPassword) {
        setError('Veuillez saisir un mot de passe.');
        return;
      }
      if (newPassword.length < 4) {
        setError('Le mot de passe doit faire au moins 4 caractères.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      if (!question || !answer) {
        setError('Une question et sa réponse de sécurité sont obligatoires.');
        return;
      }

      // Save!
      try {
        safeStorage.setItem(STORAGE_KEY_PASSWORD_HASH, hashPassword(newPassword));
        safeStorage.setItem(STORAGE_KEY_PASSWORD_HINT, question.trim());
        safeStorage.setItem(STORAGE_KEY_ANSWER_HASH, hashPassword(answer.trim().toLowerCase()));
      } catch (e) {
        console.error("Failed to write password hash to safeStorage:", e);
      }
      
      setEnabled(true);
      setSuccess('Protection par mot de passe activée avec succès !');
      onSetToast('Sécurité activée.', 'success');
      // Reset inputs
      setNewPassword('');
      setConfirmPassword('');
      setAnswer('');
    } else {
      // Modify or disable password
      if (!currentPassword) {
        setError('Veuillez saisir votre mot de passe actuel.');
        return;
      }
      if (hashPassword(currentPassword) !== savedHash) {
        setError('Mot de passe actuel incorrect.');
        return;
      }

      if (!enabled) {
        // Disabling security
        try {
          safeStorage.removeItem(STORAGE_KEY_PASSWORD_HASH);
          safeStorage.removeItem(STORAGE_KEY_PASSWORD_HINT);
          safeStorage.removeItem(STORAGE_KEY_ANSWER_HASH);
        } catch (e) {
          console.error("Failed to delete password configuration:", e);
        }
        setEnabled(false);
        setSuccess('Protection par mot de passe désactivée.');
        setCurrentPassword('');
        onSetToast('Sécurité désactivée.', 'info');
      } else {
        // Updating password/security question
        if (newPassword) {
          if (newPassword.length < 4) {
             setError('Le nouveau mot de passe doit faire au moins 4 caractères.');
             return;
          }
          if (newPassword !== confirmPassword) {
            setError('La confirmation ne correspond pas au nouveau mot de passe.');
            return;
          }
          try {
            safeStorage.setItem(STORAGE_KEY_PASSWORD_HASH, hashPassword(newPassword));
          } catch (e) {
            console.error(e);
          }
        }

        if (question) {
          try {
            safeStorage.setItem(STORAGE_KEY_PASSWORD_HINT, question.trim());
            if (answer) {
              safeStorage.setItem(STORAGE_KEY_ANSWER_HASH, hashPassword(answer.trim().toLowerCase()));
            }
          } catch (e) {
            console.error(e);
          }
        }

        setSuccess('Paramètres de sécurité mis à jour.');
        onSetToast('Sécurité configurée.', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setAnswer('');
      }
    }
  };

  let isConfigured = false;
  try {
    isConfigured = !!safeStorage.getItem(STORAGE_KEY_PASSWORD_HASH);
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        <header className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold">🛡️ Paramètres de sécurité</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl font-bold font-sans">&times;</button>
        </header>

        <form onSubmit={handleSaveSecurity} className="flex-grow overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Toggle Button */}
          <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Verrouillage de l'application</h3>
              <p className="text-xs text-slate-400 mt-1">Activer ou désactiver la protection par mot de passe.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {enabled && !isConfigured && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 leading-relaxed">
                Configurez un mot de passe pour protéger votre feuille de temps et vos données de banque d'heures.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mot de passe</label>
                  <input
                    type="password"
                    placeholder="Saisir..."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirmer</label>
                  <input
                    type="password"
                    placeholder="Saisir..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mt-4">🔑 Récupération (Indispensable)</span>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Question secrète</label>
                  <input
                    type="text"
                    placeholder="Ex: Quel est le nom de mon premier chien ?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Réponse à la question</label>
                  <span className="block text-[10px] text-slate-500 mb-2">Note: sensible à la casse et stockée de manière cryptée.</span>
                  <input
                    type="password"
                    placeholder="Saisir la réponse..."
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {isConfigured && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                La sécurité est activée. Saisissez votre mot de passe actuel pour valider toute modification (mise à jour du mot de passe ou désactivation complète).
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mot de passe actuel</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Obligatoire pour valider..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {enabled && (
                <div className="pt-4 border-t border-slate-800/80 space-y-4">
                  <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Changer le mot de passe (Facultatif)</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nouveau mot de passe</label>
                      <input
                        type="password"
                        placeholder="Nouveau..."
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirmer le nouveau</label>
                      <input
                        type="password"
                        placeholder="Confirmer..."
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <span className="block text-xs font-bold text-slate-300 uppercase tracking-wider mt-4">🔑 Modifier la question secrète</span>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Question</label>
                    <input
                      type="text"
                      placeholder="Question..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Nouvelle réponse</label>
                    <span className="block text-[10px] text-slate-500 mb-2">Laisser vide pour ne pas la modifier.</span>
                    <input
                      type="password"
                      placeholder="Nouvelle réponse..."
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        <footer className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3 font-medium">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={handleSaveSecurity}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/10 transition"
          >
            Enregistrer
          </button>
        </footer>
      </div>
    </div>
  );
};
