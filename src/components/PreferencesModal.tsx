'use client';

import React, { useState, useRef, useCallback } from 'react';
import { FiDownload, FiUpload, FiTrash2, FiEdit2, FiPlus, FiAlertTriangle } from 'react-icons/fi';
import { Modal, SegmentedControl, Tabs } from '@/components/ui';
import { usePreferences } from '../contexts/PreferencesContext';
import {
  exportAllPreferences,
  downloadPreferencesFile,
  importAllPreferences,
  getLastExportDate,
  recordExportDate,
} from '../utils/preferencesBackup';
import { SAFETY_LIMIT_RANGES } from '@/lib/limits';
import type { CustomTankSpecification } from '../contexts/PreferencesContext';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

type TabId = 'profile' | 'safety' | 'tanks' | 'backup';

const TABS: { value: TabId; label: string }[] = [
  { value: 'profile', label: 'Dive profile' },
  { value: 'safety', label: 'Safety limits' },
  { value: 'tanks', label: 'Custom tanks' },
  { value: 'backup', label: 'Backup' },
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
  'bg-surface-2 border border-border-strong rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-2 focus:ring-brand w-full';

const sliderCls =
  'w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-brand';

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

  // ── Render ──────────────────────────────────────────────────────────────────
  // The shell is the shared Modal + Tabs primitives. It was previously a
  // hand-rolled `fixed inset-0 bg-black bg-opacity-50` dialog on gray-800 with
  // yellow-600 tabs — the pre-rebuild palette, with no focus trap, no Escape
  // handling and no restore of focus on close. Every one of those comes from
  // Modal for free, and the surfaces now follow the same tokens as the rest of
  // the app rather than a second, unrelated theme.
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Diver preferences"
      description="Defaults and safety limits. Every tool reads these."
      size="lg"
      bodyClassName="p-0"
    >
      <Tabs
        items={TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Preference sections"
        variant="pill"
        className="px-4 pt-1"
      />

      {/* Scrollable tab content */}
      <div className="p-4 sm:p-6">
          {/* ── Tab 1: Dive Profile ──────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Dive mode is not repeated here. It lives in the sidebar
                  footer (and the mobile More sheet) as live app-wide state,
                  and a second control for the same preference — one labelled
                  "default", one not — left divers unsure which one the tools
                  were actually reading. There is one value; it has one home. */}

              {/* Default Gas Type */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-text">Default gas type</label>
                <p className="text-xs text-text-muted">
                  Whether the calculator defaults to a nitrox or trimix blend.
                </p>
                <SegmentedControl<'nitrox' | 'trimix'>
                  ariaLabel="Default gas type"
                  value={preferences.gasType}
                  onChange={handleGasType}
                  fullWidth
                  options={[
                    { value: 'nitrox', label: 'Nitrox' },
                    { value: 'trimix', label: 'Trimix' },
                  ]}
                />
              </div>

              {/* Default Target MOD */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-text" htmlFor="default-mod">
                  Default Target MOD (m)
                </label>
                <p className="text-xs text-text-muted">
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
                <label className="block text-sm font-semibold text-text" htmlFor="default-ppo2">
                  Default Desired PPO&#8322;
                </label>
                <p className="text-xs text-text-muted">
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
              {/* Every range comes from SAFETY_LIMIT_RANGES rather than being
                  restated here. Hand-copied bounds had drifted: the density
                  slider reached 7.0 g/L where the library caps it at 6.2, so
                  the modal offered a value its own validator rejects. */}
              <SliderRow
                id="ppo2-work"
                label="Max ppO₂ (working)"
                description="Oxygen partial pressure ceiling for the working portion of a dive. 1.4 bar is the limit essentially every technical agency teaches (NOAA, TDI, IANTD, GUE)."
                {...SAFETY_LIMIT_RANGES.maxPPO2Work}
                value={preferences.maxPPO2Work}
                onChange={handleSafetyNumber('maxPPO2Work')}
              />

              <SliderRow
                id="ppo2-deco"
                label="Max ppO₂ (deco)"
                description="Ceiling on decompression stops, where the higher exposure is accepted at rest. 1.6 bar is the accepted contingency ceiling."
                {...SAFETY_LIMIT_RANGES.maxPPO2Deco}
                value={preferences.maxPPO2Deco}
                onChange={handleSafetyNumber('maxPPO2Deco')}
              />

              <SliderRow
                id="ppo2-ccr"
                label="Max ppO₂ (CCR setpoint)"
                description="Working setpoint ceiling on a rebreather. 1.3 bar is standard TDI/IANTD CCR practice."
                {...SAFETY_LIMIT_RANGES.maxPPO2CCR}
                value={preferences.maxPPO2CCR}
                onChange={handleSafetyNumber('maxPPO2CCR')}
              />

              <SliderRow
                id="gas-density"
                label="Gas density — target"
                description="Where the app starts warning about work of breathing. Anthony & Mitchell (2016) give 5.2 g/L as the ideal target; the default here is 5.7."
                {...SAFETY_LIMIT_RANGES.maxGasDensity}
                value={preferences.maxGasDensity}
                onChange={handleSafetyNumber('maxGasDensity')}
              />

              {/* The critical threshold had no control at all, so the target
                  could be raised above it and the two would invert. */}
              <SliderRow
                id="gas-density-critical"
                label="Gas density — do not exceed"
                description="The hard ceiling. Anthony & Mitchell (2016) give 6.2 g/L, adopted by NEDU and widely taught. Never below the target above."
                {...SAFETY_LIMIT_RANGES.maxGasDensityCritical}
                value={preferences.maxGasDensityCritical}
                onChange={handleSafetyNumber('maxGasDensityCritical')}
              />

              <SliderRow
                id="max-end"
                label="Max END"
                description="Equivalent narcotic depth ceiling for a bottom mix. 30 m is the conventional working limit (IANTD, GUE, TDI)."
                {...SAFETY_LIMIT_RANGES.maxEND}
                value={preferences.maxEND}
                onChange={handleSafetyNumber('maxEND')}
              />

              {/* Oxygen Narcosis Model */}
              <div className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.oxygenNarcosisModel}
                    onChange={(e) => updatePreferences({ oxygenNarcosisModel: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-brand flex-shrink-0"
                    id="o2-narcosis"
                  />
                  <div>
                    <span className="text-sm font-semibold text-text block">
                      Oxygen Narcosis Model
                    </span>
                    <span className="text-xs text-text-muted block mt-0.5">
                      When <strong className="text-text">enabled</strong>: O&#8322; is treated as narcotic in END
                      calculations (NOAA / DCIEM model — more conservative).<br />
                      When <strong className="text-text">disabled</strong>: only N&#8322; contributes to narcosis
                      (IANTD / GUE standard — industry default).
                    </span>
                  </div>
                </label>
              </div>

              {/* Reset to defaults */}
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => {
                    if (window.confirm('Reset all preferences to factory defaults? This cannot be undone.')) {
                      resetToDefaults();
                    }
                  }}
                  className="px-4 py-2 bg-danger hover:bg-danger text-text text-sm rounded transition-colors"
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
                <p className="text-sm text-text-muted">
                  No custom tanks yet. Add a tank below to use it in the calculator.
                </p>
              )}

              {/* Tank table */}
              {preferences.customTanks.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-text">
                    <thead className="text-xs text-text-muted uppercase border-b border-border">
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
                        <tr key={tank.id} className="hover:bg-surface-2">
                          <td className="py-2 pr-3 font-medium text-text">{tank.name}</td>
                          <td className="py-2 pr-3">{tank.waterVolumeL}</td>
                          <td className="py-2 pr-3">{tank.workingPressureBar}</td>
                          <td className="py-2 pr-3 capitalize">{tank.material}</td>
                          <td className="py-2 pr-3 capitalize">{tank.type}</td>
                          <td className="py-2 flex items-center gap-2">
                            <button
                              onClick={() => handleEditTank(tank)}
                              className="p-1.5 rounded bg-surface-3 hover:bg-surface-3 text-text transition-colors"
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
                              className="p-1.5 rounded bg-danger hover:bg-danger text-text transition-colors"
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
                <div className="border border-border rounded-lg p-4 space-y-4 bg-surface-1">
                  <h3 className="text-sm font-semibold text-text">
                    {editingTankId ? 'Edit Tank' : 'Add New Tank'}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Name */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-text-muted" htmlFor="tank-name">
                        Tank Name <span className="text-danger">*</span>
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
                        <p className="text-xs text-danger">{tankErrors.name}</p>
                      )}
                    </div>

                    {/* Common Name */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-text-muted" htmlFor="tank-common-name">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-vol-l">
                        Water Volume (L) <span className="text-danger">*</span>
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
                        <p className="text-xs text-danger">{tankErrors.volume}</p>
                      )}
                    </div>

                    {/* Water Volume CuFt */}
                    <div className="space-y-1">
                      <label className="text-xs text-text-muted" htmlFor="tank-vol-cuft">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-bar">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-psi">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-material">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-type">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-region">
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
                      <label className="text-xs text-text-muted" htmlFor="tank-notes">
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
                      className="px-4 py-2 bg-brand hover:bg-brand-strong text-text text-sm rounded transition-colors font-medium"
                    >
                      {editingTankId ? 'Save Changes' : 'Add Tank'}
                    </button>
                    <button
                      onClick={handleCancelTankForm}
                      className="px-4 py-2 bg-surface-3 hover:bg-surface-3 text-text text-sm rounded transition-colors"
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
                  className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-strong text-text text-sm rounded transition-colors font-medium"
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
                <h3 className="text-sm font-semibold text-text">Backup your preferences</h3>
                <p className="text-xs text-text-muted">
                  Download a JSON file containing all your preferences, custom tanks, and saved
                  settings. Keep this file somewhere safe so you can restore them later.
                </p>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-strong text-text text-sm rounded transition-colors font-medium"
                >
                  <FiDownload className="w-4 h-4" />
                  Export Preferences
                </button>
                {exportSuccess && (
                  <p className="text-sm text-success">Preferences exported successfully.</p>
                )}
                {formattedLastExport && (
                  <p className="text-xs text-text-muted">
                    Last exported: <span className="text-text">{formattedLastExport}</span>
                  </p>
                )}
              </div>

              <div className="border-t border-border" />

              {/* Import section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text">Restore from backup</h3>

                {/* Warning */}
                <div className="flex items-start gap-2 p-3 bg-warning-bg bg-opacity-40 border border-warning-border rounded-lg">
                  <FiAlertTriangle className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">
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
                  className="flex items-center gap-2 px-4 py-2 bg-surface-3 hover:bg-surface-3 text-text text-sm rounded transition-colors font-medium"
                >
                  <FiUpload className="w-4 h-4" />
                  Import Preferences
                </button>

                {/* Import result feedback */}
                {importResult && (
                  <div
                    className={`p-3 rounded-lg text-sm space-y-1 border ${
                      importResult.success
                        ? 'bg-success-bg bg-opacity-40 border-success-border text-success'
                        : 'bg-danger-bg bg-opacity-40 border-danger-border text-danger'
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
    </Modal>
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
      <label htmlFor={id} className="text-sm font-semibold text-text">
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
          className="bg-surface-2 border border-border-strong rounded px-2 py-1 text-text text-sm w-20 text-right focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label={`${label} value`}
        />
        <span className="text-xs text-text-muted">{unit}</span>
      </div>
    </div>
    <p className="text-xs text-text-muted">{description}</p>
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
    <div className="flex justify-between text-xs text-text-subtle">
      <span>{min} {unit}</span>
      <span>{max} {unit}</span>
    </div>
  </div>
);
