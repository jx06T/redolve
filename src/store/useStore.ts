import { create } from 'zustand';
import { Item, TaxonomyNode } from '../types';

export interface ToastNotice {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface StoreState {
  // Toast Notification State
  toast: ToastNotice | null;

  // Navigation & Filter State
  selectedSubjectId: string | null;
  selectedTopicId: string | null;
  selectedStatus: 'all' | 'unsolved' | 'resolved';
  searchQuery: string;
  darkMode: boolean;
  activeProblemId: string | null;
  sidebarCollapsed: boolean;

  // Problem Items State
  problems: Item[];
  nextCursor: string | null;
  isLoading: boolean;

  // Active Drawing Tool State
  tool: 'pen' | 'highlighter' | 'eraser';
  penColor: string;
  customColors: string[];
  penWidth: number;
  eraserActive: boolean; // Left hand spring FAB hold

  // Taxonomy Cache
  taxonomies: TaxonomyNode[];

  // Actions
  showToast: (message: string, type?: 'success' | 'error' | 'info', durationMs?: number) => void;
  hideToast: () => void;
  setSelectedSubjectId: (subjectId: string | null) => void;
  setSelectedTopicId: (topicId: string | null) => void;
  setSelectedStatus: (status: 'all' | 'unsolved' | 'resolved') => void;
  setSearchQuery: (query: string) => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
  setActiveProblemId: (problemId: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setProblems: (problems: Item[], nextCursor: string | null) => void;
  appendProblems: (problems: Item[], nextCursor: string | null) => void;
  updateProblemInStore: (id: string, updates: Partial<Item>) => void;
  removeProblemFromStore: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setTool: (tool: 'pen' | 'highlighter' | 'eraser') => void;
  setPenColor: (color: string) => void;
  addCustomColor: (hex: string) => void;
  removeCustomColor: (hex: string) => void;
  setPenWidth: (width: number) => void;
  setEraserActive: (active: boolean) => void;
  setTaxonomies: (tree: TaxonomyNode[]) => void;
}

export const useStore = create<StoreState>((set) => ({
  toast: null,

  selectedSubjectId: null,
  selectedTopicId: null,
  selectedStatus: 'all',
  searchQuery: '',
  darkMode: false,
  activeProblemId: null,
  sidebarCollapsed: false,

  problems: [],
  nextCursor: null,
  isLoading: false,

  tool: 'pen',
  penColor: '#6366F1', // Primary low-contrast indigo
  customColors: (() => {
    try {
      const saved = localStorage.getItem('redolve_custom_colors');
      return saved ? JSON.parse(saved) : ['#10B981', '#F59E0B', '#8B5CF6'];
    } catch {
      return ['#10B981', '#F59E0B', '#8B5CF6'];
    }
  })(),
  penWidth: 2,
  eraserActive: false,

  taxonomies: [],

  showToast: (message, type = 'info', durationMs = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set({ toast: { id, message, type } });
    setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : {}));
    }, durationMs);
  },

  hideToast: () => set({ toast: null }),

  setSelectedSubjectId: (subjectId) => set({ selectedSubjectId: subjectId, selectedTopicId: null }),
  setSelectedTopicId: (topicId) => set({ selectedTopicId: topicId }),
  setSelectedStatus: (status) => set({ selectedStatus: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDarkMode: (darkMode) => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ darkMode });
  },
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { darkMode: next };
    }),

  setActiveProblemId: (activeProblemId) => set({ activeProblemId }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setProblems: (problems, nextCursor) => set({ problems, nextCursor }),
  appendProblems: (newItems, nextCursor) =>
    set((state) => ({
      problems: [...state.problems, ...newItems],
      nextCursor,
    })),

  updateProblemInStore: (id, updates) =>
    set((state) => ({
      problems: state.problems.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  removeProblemFromStore: (id) =>
    set((state) => ({
      problems: state.problems.filter((p) => p.id !== id),
    })),

  setIsLoading: (isLoading) => set({ isLoading }),
  setTool: (tool) => set({ tool }),
  setPenColor: (penColor) => set({ penColor }),
  addCustomColor: (hex) =>
    set((state) => {
      const normalized = hex.toUpperCase();
      if (state.customColors.includes(normalized)) return {};
      const updated = [normalized, ...state.customColors].slice(0, 12);
      try {
        localStorage.setItem('redolve_custom_colors', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to persist custom colors:', err);
      }
      return { customColors: updated, penColor: normalized };
    }),
  removeCustomColor: (hex) =>
    set((state) => {
      const updated = state.customColors.filter((c) => c.toUpperCase() !== hex.toUpperCase());
      try {
        localStorage.setItem('redolve_custom_colors', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to persist custom colors:', err);
      }
      return { customColors: updated };
    }),
  setPenWidth: (penWidth) => set({ penWidth }),
  setEraserActive: (eraserActive) => set({ eraserActive }),
  setTaxonomies: (taxonomies) => set({ taxonomies }),
}));

