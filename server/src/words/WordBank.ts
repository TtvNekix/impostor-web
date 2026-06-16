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
  /** Built-in categories loaded from disk; protected from removal. */
  private builtIn: Set<string> = new Set();

  constructor(data: WordBankData) {
    for (const cat of data.categories) {
      this.categories.set(cat.name, cat);
      this.builtIn.add(cat.name);
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

  /** Returns the word list of a category. */
  getWords(category: string): string[] {
    return [...(this.categories.get(category)?.words ?? [])];
  }

  /** Returns true when no words are available in any category. */
  isEmpty(): boolean {
    for (const cat of this.categories.values()) {
      if (cat.words.length > 0) return false;
    }
    return true;
  }

  /** Returns true if the category is one of the originals loaded from disk. */
  isBuiltIn(name: string): boolean {
    return this.builtIn.has(name);
  }

  /**
   * Create a new custom category. Throws if a category with the same name
   * already exists. The name is normalized to kebab-case.
   */
  addCategory(rawName: string, rawDisplayName: string | undefined, words: string[]): CategoryInfo {
    const name = this.normalizeName(rawName);
    if (!name) throw new Error('Nombre de categoría inválido');
    if (this.categories.has(name)) {
      throw new Error(`La categoría "${name}" ya existe`);
    }
    const displayName = (rawDisplayName?.trim()) || this.titleCase(name);
    const cleanWords = this.cleanWords(words);
    if (cleanWords.length === 0) {
      throw new Error('La categoría debe tener al menos una palabra');
    }
    this.categories.set(name, { name, displayName, words: cleanWords });
    return { name, displayName };
  }

  /**
   * Append words to an existing category (built-in or custom). New words
   * are deduplicated against the existing list. Returns the new word count.
   * Throws if the category doesn't exist or no new words are provided.
   */
  addWords(category: string, words: string[]): { added: number; total: number } {
    const cat = this.categories.get(category);
    if (!cat) throw new Error(`Categoría "${category}" no encontrada`);
    const incoming = this.cleanWords(words);
    if (incoming.length === 0) {
      throw new Error('No hay palabras nuevas para añadir');
    }
    const existing = new Set(cat.words.map((w) => w.toLowerCase()));
    let added = 0;
    for (const w of incoming) {
      if (!existing.has(w.toLowerCase())) {
        cat.words.push(w);
        existing.add(w.toLowerCase());
        added++;
      }
    }
    if (added === 0) {
      throw new Error('Todas las palabras ya estaban en la categoría');
    }
    return { added, total: cat.words.length };
  }

  /** Normalize a category name to kebab-case ASCII. */
  private normalizeName(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
  }

  /** Title-case a kebab-case name (capitalize each word, replace hyphens with spaces). */
  private titleCase(name: string): string {
    return name
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /** Trim, lowercase-dedupe, drop empty strings, cap length. */
  private cleanWords(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of raw) {
      const trimmed = w.trim();
      if (!trimmed) continue;
      if (trimmed.length > 32) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
      if (out.length >= 200) break;
    }
    return out;
  }
}
