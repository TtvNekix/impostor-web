import { create } from 'zustand';
import type { CategoryInfo } from '@impostor/shared';

interface CategoryState {
  categories: CategoryInfo[];
  setCategories: (cats: CategoryInfo[]) => void;
  getDisplayName: (name: string | null | undefined) => string;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  setCategories: (categories) => set({ categories }),
  getDisplayName: (name) => {
    if (!name) return 'Aleatoria';
    return get().categories.find((c) => c.name === name)?.displayName ?? name;
  },
}));
