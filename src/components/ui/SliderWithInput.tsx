'use client';

import React from 'react';

interface SliderWithInputProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  description?: string;
  tabIndexSlider?: number;
  tabIndexInput?: number;
}

export default function SliderWithInput({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit,
  description,
  tabIndexSlider,
  tabIndexInput,
}: SliderWithInputProps) {
  const clamp = (val: number) => Math.min(max, Math.max(min, val));

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (isNaN(parsed)) {
      onChange(min);
    } else {
      onChange(clamp(parsed));
    }
  };

  return (
    <div>
      <label htmlFor={`${id}-range`} className="block text-yellow-400 font-semibold mb-2 text-sm sm:text-base">
        {label}
      </label>
      <input
        type="range"
        id={`${id}-range`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        className="w-full mb-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
        tabIndex={tabIndexSlider}
        aria-label={`${label} slider`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={unit ? `${value} ${unit}` : `${value}`}
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          id={`${id}-input`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className="w-full bg-gray-900 border-2 border-yellow-400 rounded px-2 py-1.5 text-yellow-400 font-bold text-center text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none"
          tabIndex={tabIndexInput}
          aria-label={`${label} input`}
        />
        {unit && (
          <span className="text-gray-400 text-sm flex-shrink-0">{unit}</span>
        )}
      </div>
      {description && (
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      )}
    </div>
  );
}
