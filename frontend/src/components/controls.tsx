import { useId, useState } from "react";

import type { DecisionTimePreset } from "../api/types";
import { addDays, formatDateShort, isHhMm, isIsoDate } from "../lib/format";
import type { View } from "../lib/urlState";

export function ViewSwitch({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  const labelId = useId();
  const options: { value: View; label: string }[] = [
    { value: "decision", label: "Decision day" },
    { value: "accuracy", label: "Forecast accuracy" },
  ];
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        View
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface DecisionTimePickerProps {
  presets: DecisionTimePreset[];
  value: string;
  onChange: (time: string) => void;
}

/** Auction gate-closure presets, or any custom time on the day before delivery. */
export function DecisionTimePicker({ presets, value, onChange }: DecisionTimePickerProps) {
  const labelId = useId();
  const [custom, setCustom] = useState(() => !presets.some((p) => p.time === value));
  const [draft, setDraft] = useState(value);

  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        Decision time (UK, day before delivery)
      </span>
      <div className="field-row">
        <div className="segmented" role="group" aria-labelledby={labelId}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              aria-pressed={!custom && value === preset.time}
              onClick={() => {
                setCustom(false);
                onChange(preset.time);
              }}
            >
              {preset.id.toUpperCase()}
              <span className="sub">{preset.time}</span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => {
              setDraft(value);
              setCustom(true);
            }}
          >
            Custom
          </button>
        </div>
        {custom && (
          <input
            type="time"
            className="input"
            step={60}
            value={draft}
            aria-label="Custom decision time"
            aria-invalid={!isHhMm(draft)}
            onChange={(event) => {
              setDraft(event.target.value);
              if (isHhMm(event.target.value)) onChange(event.target.value);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface DecisionDatePickerProps {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
}

export function DecisionDatePicker({ value, min, max, onChange }: DecisionDatePickerProps) {
  const inputId = useId();
  const accept = (date: string) => {
    if (isIsoDate(date) && date >= min && date <= max) onChange(date);
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        Decision date → delivers {formatDateShort(addDays(value, 1))}
      </label>
      <div className="field-row">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous day"
          disabled={value <= min}
          onClick={() => accept(addDays(value, -1))}
        >
          ‹
        </button>
        <input
          id={inputId}
          type="date"
          className="input"
          min={min}
          max={max}
          value={value}
          required
          onChange={(event) => accept(event.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Next day"
          disabled={value >= max}
          onClick={() => accept(addDays(value, 1))}
        >
          ›
        </button>
      </div>
    </div>
  );
}

interface DeliveryRangePickerProps {
  from: string;
  to: string;
  min: string;
  max: string;
  onChange: (range: { from: string; to: string }) => void;
}

function rangePresets(min: string, max: string) {
  const days = Math.round((Date.parse(max) - Date.parse(min)) / 86_400_000) + 1;
  const firstHalfEnd = addDays(min, Math.floor(days / 2) - 1);
  return [
    { id: "all", label: "All days", from: min, to: max },
    { id: "first", label: "First half", from: min, to: firstHalfEnd },
    { id: "second", label: "Second half", from: addDays(firstHalfEnd, 1), to: max },
  ];
}

export function DeliveryRangePicker({ from, to, min, max, onChange }: DeliveryRangePickerProps) {
  const labelId = useId();
  const fromId = useId();
  const toId = useId();
  const presets = rangePresets(min, max);
  const inRange = (date: string) => isIsoDate(date) && date >= min && date <= max;

  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        Delivery days
      </span>
      <div className="field-row" role="group" aria-labelledby={labelId}>
        <div className="segmented">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.from === from && preset.to === to}
              onClick={() => onChange({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="visually-hidden" htmlFor={fromId}>
          First delivery day
        </label>
        <input
          id={fromId}
          type="date"
          className="input"
          min={min}
          max={to}
          value={from}
          onChange={(event) => {
            const value = event.target.value;
            if (inRange(value) && value <= to) onChange({ from: value, to });
          }}
        />
        <span aria-hidden="true">–</span>
        <label className="visually-hidden" htmlFor={toId}>
          Last delivery day
        </label>
        <input
          id={toId}
          type="date"
          className="input"
          min={from}
          max={max}
          value={to}
          onChange={(event) => {
            const value = event.target.value;
            if (inRange(value) && value >= from) onChange({ from, to: value });
          }}
        />
      </div>
    </div>
  );
}
