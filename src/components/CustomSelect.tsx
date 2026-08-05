import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '請選擇...',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex items-center justify-between space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] border border-stone-200 dark:border-stone-700/80 hover:bg-stone-200/70 dark:hover:bg-stone-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${buttonClassName}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-1.5 z-50 min-w-[160px] max-h-60 overflow-y-auto rounded-2xl bg-white dark:bg-[#202023] border border-stone-200/80 dark:border-stone-800 p-1.5 shadow-xl shadow-stone-900/10 animate-in fade-in duration-100 ${menuClassName}`}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#9CA3AF] text-center">無可用選項</div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full flex items-center justify-between space-x-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                    isSelected
                      ? 'bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400 font-semibold'
                      : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#6366F1] shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
