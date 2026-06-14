export interface WordBankCategory {
  name: string;
  words: string[];
}

export interface WordBankData {
  categories: WordBankCategory[];
}

export class WordBank {
  private categories: Map<string, string[]> = new Map();

  constructor(data: WordBankData) {
    for (const cat of data.categories) {
      this.categories.set(cat.name, [...cat.words]);
    }
  }

  /** Returns a random word from a random category. */
  randomWord(): { word: string; category: string } | null {
    if (this.categories.size === 0) return null;
    const catNames = Array.from(this.categories.keys());
    const catName = catNames[Math.floor(Math.random() * catNames.length)];
    const word = this.randomWordFromCategory(catName);
    if (!word) return null;
    return { word, category: catName };
  }

  /** Returns a random word from a specific category, or null if empty/missing. */
  randomWordFromCategory(category: string): string | null {
    const words = this.categories.get(category);
    if (!words || words.length === 0) return null;
    return words[Math.floor(Math.random() * words.length)];
  }

  /** Returns all category names. */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /** Returns true when no words are available in any category. */
  isEmpty(): boolean {
    for (const words of this.categories.values()) {
      if (words.length > 0) return false;
    }
    return true;
  }
}
