import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Item, TaxonomyNode, User } from '../types';
import { DEFAULT_PALETTE_COLORS, PaletteColorItem } from '../config/constants';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { fetchTaxonomyTree } from '../services/api';

export interface ToastNotice {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: () => void;
}

interface StoreState {
  // Toast Notification State
  toast: ToastNotice | null;

  // User Authentication State
  currentUser: User | null;
  authToken: string | null;
  authModalOpen: boolean;

  // Navigation & Filter State
  selectedSubjectId: string | null;
  selectedTopicId: string | null;
  selectedStatus: 'all' | 'unsolved' | 'resolved' | 'archived';
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
  paletteColors: PaletteColorItem[];
  customColors: string[];
  penWidth: number;
  eraserActive: boolean;
  pencilDetected: boolean;
  allowTouchDrawing: boolean;
  toolbarPosition: { x: number; y: number } | null;
  toolbarOrientation: 'vertical' | 'horizontal';

  // Taxonomy Cache
  taxonomies: TaxonomyNode[];
  taxonomyCounts: Record<string, number>;

  // Actions
  showToast: (message: string, type?: 'success' | 'error' | 'info', durationMs?: number, action?: () => void) => void;
  hideToast: () => void;
  setAuthModalOpen: (open: boolean) => void;
  setCurrentUser: (user: User | null, token?: string | null) => void;
  logout: () => void;
  setSelectedSubjectId: (subjectId: string | null) => void;
  setSelectedTopicId: (topicId: string | null) => void;
  setSelectedStatus: (status: 'all' | 'unsolved' | 'resolved' | 'archived') => void;
  setSearchQuery: (query: string) => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
  setActiveProblemId: (problemId: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setProblems: (problems: Item[], nextCursor: string | null) => void;
  appendProblems: (problems: Item[], nextCursor: string | null) => void;
  addProblemToStore: (problem: Item) => void;
  addOptimisticProblem: (problem: Item) => void;
  updateProblemInStore: (id: string, updates: Partial<Item>) => void;
  removeProblemFromStore: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setTool: (tool: 'pen' | 'highlighter' | 'eraser') => void;
  setPenColor: (color: string) => void;
  addPaletteColor: (color: { hex: string; name?: string }) => void;
  removePaletteColor: (hex: string) => void;
  resetPaletteColors: () => void;
  addCustomColor: (hex: string) => void;
  removeCustomColor: (hex: string) => void;
  setPenWidth: (width: number) => void;
  setEraserActive: (active: boolean) => void;
  setPencilDetected: (detected: boolean) => void;
  setAllowTouchDrawing: (allow: boolean) => void;
  toggleAllowTouchDrawing: () => void;
  setToolbarPosition: (pos: { x: number; y: number } | null) => void;
  setToolbarOrientation: (orientation: 'vertical' | 'horizontal') => void;
  setTaxonomies: (tree: TaxonomyNode[]) => void;
  loadTaxonomies: () => Promise<void>;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      toast: null,

      // 只有 Token 保留手動 localStorage，方便 API Client 在外部攔截器讀取
      currentUser: null,
      authToken: typeof window !== 'undefined' ? localStorage.getItem('redolve_auth_token') : null,
      authModalOpen: false,

      selectedSubjectId: 'math',
      selectedTopicId: null,
      selectedStatus: 'all',
      searchQuery: '',
      darkMode: false,
      activeProblemId: null,
      sidebarCollapsed: false,

      problems: [],
      nextCursor: null,
      isLoading: false,

      // 繪圖設定 (預設值，實際會被 persist 覆寫)
      tool: 'pen',
      penColor: '#374151',
      paletteColors: DEFAULT_PALETTE_COLORS,
      customColors: DEFAULT_PALETTE_COLORS.map(c => c.hex),
      penWidth: 2,
      eraserActive: false,
      pencilDetected: false,
      allowTouchDrawing: true,
      toolbarPosition: null,
      toolbarOrientation: 'vertical',

      taxonomies: TAXONOMY_SEED_DATA,
      taxonomyCounts: {},

      showToast: (message, type = 'info', durationMs = 4000, action) => {
        const id = Math.random().toString(36).substring(2, 9);
        set({ toast: { id, message, type, action } });
        setTimeout(() => {
          set((state) => (state.toast?.id === id ? { toast: null } : {}));
        }, durationMs);
      },

      hideToast: () => set({ toast: null }),

      setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),
      setCurrentUser: (user, token) => {
        if (token !== undefined) {
          if (token) {
            localStorage.setItem('redolve_auth_token', token);
          } else {
            localStorage.removeItem('redolve_auth_token');
          }
          set({ currentUser: user, authToken: token });
        } else {
          set({ currentUser: user });
        }
      },
      logout: () => {
        localStorage.removeItem('redolve_auth_token');
        set({ currentUser: null, authToken: null });
      },

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
      addProblemToStore: (problem) =>
        set((state) => ({
          problems: [...state.problems, problem],
        })),
      addOptimisticProblem: (problem) =>
        set((state) => ({
          problems: [problem, ...state.problems],
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

      addPaletteColor: (color) =>
        set((state) => {
          const normalizedHex = color.hex.toUpperCase();
          const existing = state.paletteColors.find((c) => c.hex.toUpperCase() === normalizedHex);
          if (existing) {
            return { penColor: normalizedHex };
          }
          const newEntry: PaletteColorItem = {
            hex: normalizedHex,
            name: color.name || `自訂顏色 ${normalizedHex}`,
          };
          const updated = [...state.paletteColors, newEntry];
          return {
            paletteColors: updated,
            customColors: updated.map(c => c.hex),
            penColor: normalizedHex
          };
        }),

      removePaletteColor: (hex) =>
        set((state) => {
          const targetHex = hex.toUpperCase();
          const updated = state.paletteColors.filter((c) => c.hex.toUpperCase() !== targetHex);
          const nextPenColor =
            state.penColor.toUpperCase() === targetHex
              ? (updated[0]?.hex ?? '#374151')
              : state.penColor;
          return {
            paletteColors: updated,
            customColors: updated.map(c => c.hex),
            penColor: nextPenColor
          };
        }),

      resetPaletteColors: () =>
        set(() => ({
          paletteColors: DEFAULT_PALETTE_COLORS,
          customColors: DEFAULT_PALETTE_COLORS.map(c => c.hex),
          penColor: DEFAULT_PALETTE_COLORS[0].hex,
        })),

      addCustomColor: (hex) => {
        useStore.getState().addPaletteColor({ hex });
      },
      removeCustomColor: (hex) => {
        useStore.getState().removePaletteColor(hex);
      },

      setPenWidth: (penWidth) => set({ penWidth }),
      setEraserActive: (eraserActive) => set({ eraserActive }),

      setPencilDetected: (detected) => {
        set((state) => {
          const isFirstPencilDetection = !state.pencilDetected && detected;
          if (isFirstPencilDetection && state.allowTouchDrawing) {
            state.showToast('偵測到 Apple Pencil，已自動開啟防誤觸（暫停手指繪圖）', 'info', 3000);
            return { pencilDetected: detected, allowTouchDrawing: false };
          }
          return { pencilDetected: detected };
        });
      },

      setAllowTouchDrawing: (allow) => set({ allowTouchDrawing: allow }),

      toggleAllowTouchDrawing: () => {
        set((state) => {
          const next = !state.allowTouchDrawing;
          state.showToast(
            next ? '已開啟手指繪圖' : '已鎖定僅限 Pencil 繪圖（防手掌誤觸）',
            next ? 'success' : 'info',
            2500
          );
          return { allowTouchDrawing: next };
        });
      },

      setToolbarPosition: (toolbarPosition) => set({ toolbarPosition }),
      setToolbarOrientation: (toolbarOrientation) => set({ toolbarOrientation }),
      setTaxonomies: (taxonomies) => set({ taxonomies }),
      loadTaxonomies: async () => {
        try {
          const data = await fetchTaxonomyTree();
          if (data.tree && data.tree.length > 0) {
            set({
              taxonomies: data.tree,
              taxonomyCounts: data.counts || {},
            });
          }
        } catch (err) {
          console.error('Failed to sync taxonomies from server:', err);
        }
      },
    }),
    {
      name: 'redolve-preferences',
      // 指定哪些狀態要被存入 localStorage（完全交由 Zustand Persist 管理）
      partialize: (state) => ({
        selectedSubjectId: state.selectedSubjectId,
        selectedStatus: state.selectedStatus,
        sidebarCollapsed: state.sidebarCollapsed,
        darkMode: state.darkMode,
        toolbarPosition: state.toolbarPosition,
        toolbarOrientation: state.toolbarOrientation,
        tool: state.tool,
        penColor: state.penColor,
        penWidth: state.penWidth,
        paletteColors: state.paletteColors,
        customColors: state.customColors,
        allowTouchDrawing: state.allowTouchDrawing,
        pencilDetected: state.pencilDetected,
      }),
    }
  )
);