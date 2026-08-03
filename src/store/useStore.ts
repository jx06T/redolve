import { create } from 'zustand';
import { Item, TaxonomyNode } from '../types';

interface StoreState {
  // Navigation & Filter State
  selectedTopicId: string | null;
  selectedStatus: 'all' | 'unsolved' | 'resolved';
  searchQuery: string;
  darkMode: boolean;

  // Problem Items State
  problems: Item[];
  nextCursor: string | null;
  isLoading: boolean;

  // Active Drawing Tool State
  tool: 'pen' | 'highlighter' | 'eraser';
  penColor: string;
  penWidth: number;
  eraserActive: boolean; // Left hand spring FAB hold

  // Taxonomy Cache
  taxonomies: TaxonomyNode[];

  // Actions
  setSelectedTopicId: (topicId: string | null) => void;
  setSelectedStatus: (status: 'all' | 'unsolved' | 'resolved') => void;
  setSearchQuery: (query: string) => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
  setProblems: (problems: Item[], nextCursor: string | null) => void;
  appendProblems: (problems: Item[], nextCursor: string | null) => void;
  updateProblemInStore: (id: string, updates: Partial<Item>) => void;
  removeProblemFromStore: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setTool: (tool: 'pen' | 'highlighter' | 'eraser') => void;
  setPenColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  setEraserActive: (active: boolean) => void;
  setTaxonomies: (tree: TaxonomyNode[]) => void;
}

export const useStore = create<StoreState>((set) => ({
  selectedTopicId: null,
  selectedStatus: 'all',
  searchQuery: '',
  darkMode: false,

  problems: [],
  nextCursor: null,
  isLoading: false,

  tool: 'pen',
  penColor: '#6366F1', // Primary low-contrast indigo
  penWidth: 2,
  eraserActive: false,

  taxonomies: [],

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
  setPenWidth: (penWidth) => set({ penWidth }),
  setEraserActive: (eraserActive) => set({ eraserActive }),
  setTaxonomies: (taxonomies) => set({ taxonomies }),
}));
