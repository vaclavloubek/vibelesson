'use client';

import { useId } from 'react';
import type { GradingStrictness } from '@/lib/schema';

type Props = {
  value: GradingStrictness;
  onChange: (value: GradingStrictness) => void;
  disabled?: boolean;
  compact?: boolean;
};

const OPTIONS: Array<{
  value: GradingStrictness;
  label: string;
  description: string;
}> = [
  {
    value: 'lenient',
    label: 'Mírná',
    description: 'V hraničních případech dává větší prostor rozumné interpretaci a částečným bodům.',
  },
  {
    value: 'neutral',
    label: 'Neutrální',
    description: 'Vyváženě posuzuje, zda odpověď významově splnila požadavky rubriky.',
  },
  {
    value: 'strict',
    label: 'Přísná',
    description: 'Plný počet vyžaduje jasné a úplné splnění všech částí hodnoticího kritéria.',
  },
];

export default function GradingStrictnessControl({ value, onChange, disabled = false, compact = false }: Props) {
  const id = useId();
  const selected = OPTIONS.find((option) => option.value === value) ?? OPTIONS[1];

  return (
    <fieldset
      className={`grading-strictness-control${compact ? ' grading-strictness-control--compact' : ''}`}
      disabled={disabled}
      aria-describedby={`${id}-description ${id}-selected`}
    >
      <legend>Přísnost AI hodnocení</legend>
      <p id={`${id}-description`} className="grading-strictness-help">
        Ovlivňuje pouze AI hodnocení bodovaných otevřených a týmových odpovědí. Učitel může výsledek vždy upravit.
      </p>

      <div className="grading-strictness-scale" data-value={value}>
        <div className="grading-strictness-track-shell" aria-hidden="true">
          <div className="grading-strictness-track">
            <span className="grading-strictness-thumb" />
          </div>
        </div>

        <div className="grading-strictness-options">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className="grading-strictness-option"
              data-active={option.value === value ? 'true' : 'false'}
            >
              <input
                className="grading-strictness-radio"
                type="radio"
                name={`${id}-grading-strictness`}
                value={option.value}
                checked={option.value === value}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      <p id={`${id}-selected`} className="grading-strictness-selected" aria-live="polite">
        <strong>{selected.label}:</strong> {selected.description}
      </p>
    </fieldset>
  );
}
