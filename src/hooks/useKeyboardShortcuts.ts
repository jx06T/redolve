import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { PEN_COLORS, PEN_WIDTHS } from '../config/constants';

interface KeyboardShortcutsOptions {
  onToggleShortcutsModal?: () => void;
  onResolveActiveProblem?: () => void;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutsOptions) {
  const {
    setTool,
    setPenColor,
    setPenWidth,
    penWidth,
    showToast,
    toggleDarkMode,
  } = useStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      // Allow Escape even in inputs
      if (e.key === 'Escape') {
        return;
      }

      if (isInput) return;

      // Handle shortcuts
      const key = e.key.toLowerCase();

      // Tool Switching
      if (key === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setTool('pen');
      } else if (key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setTool('highlighter');
      } else if (key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setTool('eraser');
      }
      // Color Presets (1-4)
      else if (['1', '2', '3', '4'].includes(e.key) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const colorIndex = parseInt(e.key, 10) - 1;
        if (PEN_COLORS[colorIndex]) {
          setPenColor(PEN_COLORS[colorIndex]);
        }
      }
      // Stroke Width Presets ([ or ])
      else if (e.key === '[') {
        e.preventDefault();
        const currentIdx = PEN_WIDTHS.indexOf(penWidth);
        const nextIdx = Math.max(0, currentIdx - 1);
        setPenWidth(PEN_WIDTHS[nextIdx]);
      } else if (e.key === ']') {
        e.preventDefault();
        const currentIdx = PEN_WIDTHS.indexOf(penWidth);
        const nextIdx = Math.min(PEN_WIDTHS.length - 1, currentIdx + 1);
        setPenWidth(PEN_WIDTHS[nextIdx]);
      }
      // Dark Mode (Cmd+D or Alt+D)
      else if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault();
        toggleDarkMode();
      }
      // Help Modal (? or Shift+/)
      else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        if (options?.onToggleShortcutsModal) {
          options.onToggleShortcutsModal();
        }
      }
      // Smart Resolve (Cmd+Enter or Ctrl+Enter)
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (options?.onResolveActiveProblem) {
          options.onResolveActiveProblem();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTool, setPenColor, setPenWidth, penWidth, showToast, toggleDarkMode, options]);
}
