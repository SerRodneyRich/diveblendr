'use client';

import React, { useState, useRef, useCallback } from 'react';
import { FiSettings, FiX, FiDownload, FiUpload, FiTrash2, FiEdit2, FiPlus, FiAlertTriangle } from 'react-icons/fi';
import { usePreferences } from '../contexts/PreferencesContext';
import {
  exportAllPreferences,
  downloadPreferencesFile,
  importAllPreferences,
  getLastExportDate,
  recordExportDate,
} from '../utils/preferencesBackup';
import type { CustomTankSpecification } from '../contexts/PreferencesContext';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

type TabId = 'profile' | 'safety' | 'tanks' | 'backup';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Dive Profile' },
  { id: 'safety', label: 'Safety Limits' },
  { id: 'tanks', label: 'Custom Tanks' },
  { id: 'backup', label: 'Backup / Restore' },
];

// ─── Blank tank form state ────────────────────────────────────────────────────
interface TankFormState {
  name: string;
  commonName: string;
  waterVolumeL: string;
  waterVolumeCuFt: string;
  workingPressureBar: string;
  workingPressurePSI: string;
  material: 'aluminum' | 'steel' | 'carbon';
  type: 'single' | 'twinset';
  region: 'metric' | 'imperial' | 'universal';
  notes: string;
}

const blankTankForm = (): TankFormState => ({
  name: '',
  commonName: '',
  waterVolumeL: '',
  waterVolumeCuFt: '',
  workingPressureBar: '',
  workingPressurePSI: '',
  material: 'steel',
  type: 'single',
  region: 'metric',
  notes: '',
});

// ─── Shared input class helpers ───────────────────────────────────────────────
const inputCls =
  'bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 w-full';

const sliderCls =
  'w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-yellow-500';

// ─── Component ────────────────────────────────────────────────────────────────
export const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose, initialTab }) => {
  const {
    preferences,
    updatePreferences,
    addCustomTank,
    updateCustomTank,
    removeCustomTank,
    resetToDefaults,
  } = usePreferences();

  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'profile');

  // Sync to initialTab whenever the modal is opened
  React.useEffect(() => {
    if (isOpen) setActiveTab(initialTab ?? 'profile');
  }, [isOpen, initialTab]);

  // Custom Tanks tab state
  const [showAddForm, setShowAddForm] = useState(false);
  const [tankForm, setTankForm] = useState<TankFormState>(blankTankForm());
  const [tankErrors, setTankErrors] = useState<{ name?: string; volume?: string }>({});
  const [editingTankId, setEditingTankId] = useState<string | null>(null);

  // Backup tab state
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    sectionsImported: string[];
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers: Dive Profile ──────────────────────────────────────────────────
  const handleDiveMode = (mode: 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix') =>
    updatePreferences({ diveMode: mode });

  const handleGasType = (gasType: 'nitrox' | 'trimix') =>
    updatePreferences({ gasType });

  // ── Handlers: Safety Limits ─────────────────────────────────────────────────
  const handleSafetyNumber =
    (key: keyof typeof preferences) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) updatePreferences({ [key]: val });
    };

  // ── Handlers: Custom Tanks ──────────────────────────────────────────────────
  const handleTankFieldChange =
    (field: keyof TankFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setTankForm(prev => {
        const next = { ...prev, [field]: value };
        // Auto-calculate PSI when bar changes
        if (field === 'workingPressureBar') {
          const bar = parseFloat(value);
          if (!isNaN(bar)) {
            next.workingPressurePSI = String(Math.round(bar * 14.5038));
          } else {
            next.workingPressurePSI = '';
          }
        }
        return next;
      });
    };

  const validateTankForm = (): boolean => {
    const errors: { name?: string; volume?: string } = {};
    if (!tankForm.name.trim()) errors.name = 'Tank name is required.';
    if (!tankForm.waterVolumeL || isNaN(parseFloat(tankForm.waterVolumeL))) {
      errors.volume = 'Water volume (L) is required.';
    }
    setTankErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildTankFromForm = (): Omit<CustomTankSpecification, 'isCustom' | 'createdAt'> => ({
    id: editingTankId ?? `custom-${Date.now()}`,
    name: tankForm.name.trim(),
    commonName: tankForm.commonName.trim() || tankForm.name.trim(),
    waterVolumeL: parseFloat(tankForm.waterVolumeL) || 0,
    waterVolumeCuFt: parseFloat(tankForm.waterVolumeCuFt) || 0,
    workingPressureBar: parseFloat(tankForm.workingPressureBar) || 0,
    workingPressurePSI: parseFloat(tankForm.workingPressurePSI) || 0,
    material: tankForm.material,
    type: tankForm.type,
    region: tankForm.region,
    notes: tankForm.notes.trim() || undefined,
  });

  const handleAddTank = () => {
    if (!validateTankForm()) return;
    addCustomTank(buildTankFromForm());
    setTankForm(blankTankForm());
    setShowAddForm(false);
    setTankErrors({});
  };

  const handleSaveEditTank = () => {
    if (!validateTankForm() || !editingTankId) return;
    updateCustomTank(editingTankId, buildTankFromForm());
    setEditingTankId(null);
    setTankForm(blankTankForm());
    setShowAddForm(false);
    setTankErrors({});
  };

  const handleEditTank = (tank: CustomTankSpecification) => {
    setEditingTankId(tank.id);
    setTankForm({
      name: tank.name,
      commonName: tank.commonName,
      waterVolumeL: String(tank.waterVolumeL),
      waterVolumeCuFt: String(tank.waterVolumeCuFt),
      workingPressureBar: String(tank.workingPressureBar),
      workingPressurePSI: String(tank.workingPressurePSI),
      material: tank.material,
      type: tank.type,
      region: tank.region,
      notes: tank.notes ?? '',
    });
    setShowAddForm(true);
    setTankErrors({});
  };

  const handleCancelTankForm = () => {
    setShowAddForm(false);
    setEditingTankId(null);
    setTankForm(blankTankForm());
    setTankErrors({});
  };

  // ── Handlers: Backup / Restore ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const backup = exportAllPreferences();
    downloadPreferencesFile(backup);
    recordExportDate();
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text !== 'string') return;
      const result = importAllPreferences(text);
      setImportResult(result);
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-selected if needed
    e.target.value = '';
  };

  const lastExportDate = getLastExportDate();
  const formattedLastExport = lastExportDate
    ? new Date(lastExportDate).toLocaleString()
    : null;

  if (!isOpen) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-labelledby="preferences-modal-title"
      aria-modal="true"
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
          <h2
            id="preferences-modal-title"
            className="text-xl font-bold text-white flex items-center gap-2"
          >
            <FiSettings className="w-5 h-5 text-yellow-400" />
            Diver Preferences
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            aria-label="Close preferences"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-700 flex-shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable tab content */}
        <div className="overflow-y-auto flex-1 p-6">
          {/* ── Tab 1: Dive Profile ──────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Default Dive Mode */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-white">Default Dive Mode</label>
                <p className="text-xs text-gray-400">
                  The dive mode pre-selected when you open the calculator.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'oc', label: 'OC Nitrox' },
                      { value: 'oc-trimix', label: 'OC Trimix' },
                      { value: 'ccr', label: 'CCR' },
                      { value: 'ccr-trimix', label: 'CCR Trimix' },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => handleDiveMode(value)}
                      aria-pressed={preferences.diveMode === value}
                      className={`py-2 px-3 text-sm rounded border transition-colors ${
                        preferences.diveMode === value
                          ? 'bg-yellow-600 text-white border-yellow-600'
                          : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Gas Type */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-white">Default Gas Type</label>
                <p className="text-xs text-gray-400">
                  Whether the calculator defaults to a nitrox or trimix blend.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'nitrox', label: 'Nitrox' },
                      { value: 'trimix', label: 'Trimix' },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => handleGasType(value)}
                      aria-pressed={preferences.gasType === value}
                      className={`py-2 px-3 text-sm rounded border transition-colors ${
                        preferences.gasType === value
                          ? 'bg-yellow-600 text-white border-yellow-600'
                          : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Target MOD */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-white" htmlFor="default-mod">
                  Default Target MOD (m)
                </label>
                <p className="text-xs text-gray-400">
                  The Maximum Operating Depth pre-filled in the MOD calculator (10–100 m).
                </p>
                <input
                  id="default-mod"
                  type="number"
                  min={10}
                  max={100}
                  step={1}
                  value={preferences.defaultTargetMod}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 10 && val <= 100) {
                      updatePreferences({ defaultTargetMod: val });
                    }
                  }}
                  className={inputCls}
                />
              </div>

              {/* Default Desired PPO₂ */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-white" htmlFor="default-ppo2">
                  Default Desired PPO&#8322;
                </label>
                <p className="text-xs text-gray-400">
                  The target partial pressure of oxygen pre-filled when planning a gas mix (0.9–1.6 bar).
                </p>
                <input
                  id="default-ppo2"
                  type="number"
                  min={0.9}
                  max={1.6}
                  step={0.1}
                  value={preferences.defaultDesiredPPO2}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.9 && val <= 1.6) {
                      updatePreferences({ defaultDesiredPPO2: val });
                    }
                  }}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ── Tab 2: Safety Limits ─────────────────────────────────────── */}
          {activeTab === 'safety' && (
            <div className="space-y-6">
              {/* Max PPO₂ Working */}
              <SliderRow
                id="ppo2-work"
                label="Max PPO&#8322; (Working)"
                description="Maximum partial pressure of oxygen during working dives. IANTD/PADI standard is 1.4 bar."
                min={1.2}
                max={1.6}
                step={0.05}
                value={preferences.maxPPO2Work}
                onChange={handleSafetyNumber('maxPPO2Work')}
                unit="bar"
              />

              {/* Max PPO₂ Deco */}
              <SliderRow
                id="ppo2-deco"
                label="Max PPO&#8322; (Deco)"
                description="Maximum partial pressure of oxygen during decompression stops. Most agencies allow up to 1.6 bar."
                min={1.4}
                max={1.6}
                step={0.05}
                value={preferences.maxPPO2Deco}
                onChange={handleSafetyNumber('maxPPO2Deco')}
                unit="bar"
              />

              {/* Max PPO₂ CCR */}
              <SliderRow
                id="ppo2-ccr"
                label="Max PPO&#8322; (CCR)"
                description="Set-point ceiling for closed-circuit rebreather operation. IANTD recommends 1.3 bar."
                min={1.1}
                max={1.4}
                step={0.05}
                value={preferences.maxPPO2CCR}
                onChange={handleSafetyNumber('maxPPO2CCR')}
                unit="bar"
              />

              {/* Max Gas Density */}
              <SliderRow
                id="gas-density"
                label="Max Gas Density (g/L)"
                description="Gas density limit above which breathing effort becomes dangerous. NEDU threshold is 5.7 g/L (caution) and 6.2 g/L (critical)."
                min={4.0}
                max={7.0}
                step={0.1}
                value={preferences.maxGasDensity}
                onChange={handleSafetyNumber('maxGasDensity')}
                unit="g/L"
              />

              {/* Max END */}
              <SliderRow
                id="max-end"
                label="Max END (m)"
                description="Maximum Equivalent Narcotic Depth. Most agencies recommend 30 m for trimix planning."
                min={20}
                max={40}
                step={1}
                value={preferences.maxEND}
                onChange={handleSafetyNumber('maxEND')}
                unit="m"
              />

              {/* Oxygen Narcosis Model */}
              <div className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.oxygenNarcosisModel}
                    onChange={(e) => updatePreferences({ oxygenNarcosisModel: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-yellow-500 flex-shrink-0"
                    id="o2-narcosis"
                  />
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      Oxygen Narcosis Model
                    </span>
                    <span className="text-xs text-gray-400 block mt-0.5">
                      When <strong className="text-gray-300">enabled</strong>: O&#8322; is treated as narcotic in END
                      calculations (NOAA / DCIEM model — more conservative).<br />
                      When <strong className="text-gray-300">disabled</strong>: only N&#8322; contributes to narcosis
                      (IANTD / GUE standard — industry default).
                    </span>
                  </div>
                </label>
              </div>

              {/* Reset to defaults */}
              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={() => {
                    if (window.confirm('Reset all preferences to factory defaults? This cannot be undone.')) {
                      resetToDefaults();
                    }
                  }}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded transition-colors"
                >
                  Reset All Preferences to Defaults
                </button>
              </div>
            </div>
          )}

          {/* ── Tab 3: Custom Tanks ──────────────────────────────────────── */}
          {activeTab === 'tanks' && (
            <div className="space-y-4">
              {preferences.customTanks.length === 0 && !showAddForm && (
                <p className="text-sm text-gray-400">
                  No custom tanks yet. Add a tank below to use it in the calculator.
                </p>
              )}

              {/* Tank table */}
              {preferences.customTanks.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
                      <tr>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Volume (L)</th>
                        <th className="py-2 pr-3">Pressure (bar)</th>
                        <th className="py-2 pr-3">Material</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {preferences.customTanks.map((tank) => (
                        <tr key={tank.id} className="hover:bg-gray-750">
                          <td className="py-2 pr-3 font-medium text-white">{tank.name}</td>
                          <td className="py-2 pr-3">{tank.waterVolumeL}</td>
                          <td className="py-2 pr-3">{tank.workingPressureBar}</td>
                          <td className="py-2 pr-3 capitalize">{tank.material}</td>
                          <td className="py-2 pr-3 capitalize">{tank.type}</td>
                          <td className="py-2 flex items-center gap-2">
                            <button
                              onClick={() => handleEditTank(tank)}
                              className="p-1.5 rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors"
                              aria-label={`Edit ${tank.name}`}
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete "${tank.name}"?`)) {
                                  removeCustomTank(tank.id);
                                }
                              }}
                              className="p-1.5 rounded bg-red-700 hover:bg-red-600 text-white transition-colors"
                              aria-label={`Delete ${tank.name}`}
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add / Edit form */}
              {showAddForm ? (
                <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-750">
                  <h3 className="text-sm font-semibold text-white">
                    {editingTankId ? 'Edit Tank' : 'Add New Tank'}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Name */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-name">
                        Tank Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="tank-name"
                        type="text"
                        placeholder="e.g. AL80"
                        value={tankForm.name}
                        onChange={handleTankFieldChange('name')}
                        className={inputCls}
                      />
                      {tankErrors.name && (
                        <p className="text-xs text-red-400">{tankErrors.name}</p>
                      )}
                    </div>

                    {/* Common Name */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-common-name">
                        Common Name
                      </label>
                      <input
                        id="tank-common-name"
                        type="text"
                        placeholder="e.g. Aluminum 80"
                        value={tankForm.commonName}
                        onChange={handleTankFieldChange('commonName')}
                        className={inputCls}
                      />
                    </div>

                    {/* Water Volume L */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-vol-l">
                        Water Volume (L) <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="tank-vol-l"
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="11.1"
                        value={tankForm.waterVolumeL}
                        onChange={handleTankFieldChange('waterVolumeL')}
                        className={inputCls}
                      />
                      {tankErrors.volume && (
                        <p className="text-xs text-red-400">{tankErrors.volume}</p>
                      )}
                    </div>

                    {/* Water Volume CuFt */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-vol-cuft">
                        Water Volume (cu ft)
                      </label>
                      <input
                        id="tank-vol-cuft"
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="0.392"
                        value={tankForm.waterVolumeCuFt}
                        onChange={handleTankFieldChange('waterVolumeCuFt')}
                        className={inputCls}
                      />
                    </div>

                    {/* Working Pressure Bar */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-bar">
                        Working Pressure (bar)
                      </label>
                      <input
                        id="tank-bar"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="207"
                        value={tankForm.workingPressureBar}
                        onChange={handleTankFieldChange('workingPressureBar')}
                        className={inputCls}
                      />
                    </div>

                    {/* Working Pressure PSI (auto-calc) */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-psi">
                        Working Pressure (PSI) — auto
                      </label>
                      <input
                        id="tank-psi"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="3000"
                        value={tankForm.workingPressurePSI}
                        onChange={handleTankFieldChange('workingPressurePSI')}
                        className={inputCls}
                      />
                    </div>

                    {/* Material */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-material">
                        Material
                      </label>
                      <select
                        id="tank-material"
                        value={tankForm.material}
                        onChange={handleTankFieldChange('material')}
                        className={inputCls}
                      >
                        <option value="aluminum">Aluminum</option>
                        <option value="steel">Steel</option>
                        <option value="carbon">Carbon</option>
                      </select>
                    </div>

                    {/* Type */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-type">
                        Type
                      </label>
                      <select
                        id="tank-type"
                        value={tankForm.type}
                        onChange={handleTankFieldChange('type')}
                        className={inputCls}
                      >
                        <option value="single">Single</option>
                        <option value="twinset">Twinset</option>
                      </select>
                    </div>

                    {/* Region */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-region">
                        Region
                      </label>
                      <select
                        id="tank-region"
                        value={tankForm.region}
                        onChange={handleTankFieldChange('region')}
                        className={inputCls}
                      >
                        <option value="metric">Metric</option>
                        <option value="imperial">Imperial</option>
                        <option value="universal">Universal</option>
                      </select>
                    </div>

                    {/* Notes */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-gray-400" htmlFor="tank-notes">
                        Notes (optional)
                      </label>
                      <input
                        id="tank-notes"
                        type="text"
                        placeholder="Any additional info"
                        value={tankForm.notes}
                        onChange={handleTankFieldChange('notes')}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={editingTankId ? handleSaveEditTank : handleAddTank}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors font-medium"
                    >
                      {editingTankId ? 'Save Changes' : 'Add Tank'}
                    </button>
                    <button
                      onClick={handleCancelTankForm}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingTankId(null);
                    setTankForm(blankTankForm());
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors font-medium"
                >
                  <FiPlus className="w-4 h-4" />
                  Add Tank
                </button>
              )}
            </div>
          )}

          {/* ── Tab 4: Backup / Restore ──────────────────────────────────── */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* Export section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Backup your preferences</h3>
                <p className="text-xs text-gray-400">
                  Download a JSON file containing all your preferences, custom tanks, and saved
                  settings. Keep this file somewhere safe so you can restore them later.
                </p>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors font-medium"
                >
                  <FiDownload className="w-4 h-4" />
                  Export Preferences
                </button>
                {exportSuccess && (
                  <p className="text-sm text-green-400">Preferences exported successfully.</p>
                )}
                {formattedLastExport && (
                  <p className="text-xs text-gray-400">
                    Last exported: <span className="text-gray-300">{formattedLastExport}</span>
                  </p>
                )}
              </div>

              <div className="border-t border-gray-700" />

              {/* Import section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Restore from backup</h3>

                {/* Warning */}
                <div className="flex items-start gap-2 p-3 bg-yellow-900 bg-opacity-40 border border-yellow-700 rounded-lg">
                  <FiAlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-200">
                    Importing will <strong>overwrite</strong> your current preferences. A page
                    reload may be required for some settings to take full effect.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-label="Select preferences backup file"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors font-medium"
                >
                  <FiUpload className="w-4 h-4" />
                  Import Preferences
                </button>

                {/* Import result feedback */}
                {importResult && (
                  <div
                    className={`p-3 rounded-lg text-sm space-y-1 border ${
                      importResult.success
                        ? 'bg-green-900 bg-opacity-40 border-green-700 text-green-200'
                        : 'bg-red-900 bg-opacity-40 border-red-700 text-red-200'
                    }`}
                  >
                    {importResult.success ? (
                      <p>
                        Import successful. Sections restored:{' '}
                        <strong>{importResult.sectionsImported.join(', ')}</strong>.
                        {importResult.sectionsImported.length > 0 &&
                          ' Reload the page to apply all changes.'}
                      </p>
                    ) : (
                      <p>Import failed.</p>
                    )}
                    {importResult.errors.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer close button */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SliderRow sub-component ──────────────────────────────────────────────────
interface SliderRowProps {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit: string;
}

const SliderRow: React.FC<SliderRowProps> = ({
  id,
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
  unit,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-sm font-semibold text-white">
        {/* Use dangerouslySetInnerHTML to render HTML entities in label prop */}
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm w-20 text-right focus:outline-none focus:ring-2 focus:ring-yellow-500"
          aria-label={`${label} value`}
        />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
    </div>
    <p className="text-xs text-gray-400">{description}</p>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={sliderCls}
      aria-label={label}
    />
    <div className="flex justify-between text-xs text-gray-500">
      <span>{min} {unit}</span>
      <span>{max} {unit}</span>
    </div>
  </div>
);
