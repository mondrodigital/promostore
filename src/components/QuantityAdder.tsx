import { useEffect, useRef, useState } from 'react';

interface QuantityAdderProps {
  max: number;
  label: string;
  disabled?: boolean;
  buttonClassName: string;
  onAdd: (quantity: number) => void;
}

export default function QuantityAdder({
  max,
  label,
  disabled = false,
  buttonClassName,
  onAdd,
}: QuantityAdderProps) {
  const [quantityText, setQuantityText] = useState('1');
  const [locked, setLocked] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    if (max < 1) {
      setQuantityText('');
      return;
    }
    setQuantityText((current) => {
      if (!/^\d+$/.test(current)) return '1';
      const value = Number(current);
      if (value < 1) return '1';
      if (value > max) return String(max);
      return current;
    });
  }, [max]);

  const parsed = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN;
  const valid = max >= 1 && Number.isInteger(parsed) && parsed >= 1 && parsed <= max;

  function handleChange(value: string) {
    const digits = value.replace(/\D/g, '');
    if (digits === '') {
      setQuantityText('');
      return;
    }
    if (max < 1) {
      setQuantityText('');
      return;
    }
    const next = Math.min(Math.max(parseInt(digits, 10), 1), max);
    setQuantityText(String(next));
  }

  function handleAdd() {
    if (lockRef.current || locked || !valid) return;
    lockRef.current = true;
    setLocked(true);
    onAdd(parsed);
    setQuantityText('1');
    window.setTimeout(() => {
      lockRef.current = false;
      setLocked(false);
    }, 500);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(max, 1)}
        step={1}
        value={max < 1 ? '' : quantityText}
        disabled={disabled || max < 1}
        onChange={(event) => handleChange(event.target.value)}
        aria-label="Quantity"
        className="w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      <button
        type="button"
        disabled={disabled || locked || !valid}
        onClick={handleAdd}
        className={buttonClassName}
      >
        {label}
      </button>
    </div>
  );
}
