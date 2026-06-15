export interface WordBankCategory {
  /** Stable machine-readable identifier (kebab-case). */
  name: string;
  /** Human-readable label for the UI. */
  displayName: string;
  words: string[];
}

export interface WordBankData {
  categories: WordBankCategory[];
}

export interface CategoryInfo {
  name: string;
  displayName: string;
}

export class WordBank {
  private categories: Map<string, WordBankCategory> = new Map();

  constructor(data: WordBankData) {
    for (const cat of data.categories) {
      this.categories.set(cat.name, cat);
    }
  }

  /** Returns a random word from a random category. */
  randomWord(): { word: string; category: string } | null {
    if (this.categories.size === 0) return null;
    const cats = Array.from(this.categories.values());
    const cat = cats[Math.floor(Math.random() * cats.length)];
    if (!cat || cat.words.length === 0) return null;
    return {
      word: cat.words[Math.floor(Math.random() * cat.words.length)],
      category: cat.name,
    };
  }

  /** Returns a random word from a specific category, or null if empty/missing. */
  randomWordFromCategory(category: string): string | null {
    const cat = this.categories.get(category);
    if (!cat || cat.words.length === 0) return null;
    return cat.words[Math.floor(Math.random() * cat.words.length)];
  }

  /** Returns the display name for a category, falling back to the raw name. */
  getDisplayName(category: string): string {
    return this.categories.get(category)?.displayName ?? category;
  }

  /** Returns all available categories with their display names. */
  getCategories(): CategoryInfo[] {
    return Array.from(this.categories.values()).map((c) => ({
      name: c.name,
      displayName: c.displayName,
    }));
  }

  /** Returns true when no words are available in any category. */
  isEmpty(): boolean {
    for (const cat of this.categories.values()) {
      if (cat.words.length > 0) return false;
    }
    return true;
  }
}
