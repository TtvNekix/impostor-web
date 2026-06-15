import { describe, it, expect } from 'vitest';
import { WordBank } from '../words/WordBank';

function createSampleBank(): WordBank {
  return new WordBank({
    categories: [
      {
        name: 'videojuegos',
        displayName: 'Videojuegos',
        words: ['speedrun', 'headshot', 'respawn', 'grindear', 'nerfeo'],
      },
      {
        name: 'internet',
        displayName: 'Internet',
        words: ['meme', 'trolear', 'stremear', 'moderador', 'baneado'],
      },
    ],
  });
}

describe('WordBank', () => {
  describe('randomWord', () => {
    it('returns a valid word with a category from a non-empty bank', () => {
      const bank = createSampleBank();
      const result = bank.randomWord();

      expect(result).not.toBeNull();
      expect(result!.word).toBeTruthy();
      expect(typeof result!.word).toBe('string');
      expect(result!.category).toBeTruthy();
      expect(typeof result!.category).toBe('string');
    });

    it('returns null when the bank is empty', () => {
      const bank = new WordBank({ categories: [] });
      expect(bank.randomWord()).toBeNull();
    });

    it('returns null when all categories have empty word arrays', () => {
      const bank = new WordBank({
        categories: [
          { name: 'empty1', displayName: 'E1', words: [] },
          { name: 'empty2', displayName: 'E2', words: [] },
        ],
      });
      expect(bank.randomWord()).toBeNull();
    });

    it('returns words from the correct categories', () => {
      const bank = createSampleBank();
      const categories = bank.getCategories().map((c) => c.name);
      const results = new Set<string>();

      // Get 50 random words — all should come from known categories
      for (let i = 0; i < 50; i++) {
        const r = bank.randomWord();
        expect(r).not.toBeNull();
        expect(categories).toContain(r!.category);
        results.add(r!.word);
      }

      // With 50 draws from 10 words, we should see at least 5 unique words
      expect(results.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe('randomWordFromCategory', () => {
    it('returns a word from a specific category', () => {
      const bank = createSampleBank();
      const word = bank.randomWordFromCategory('videojuegos');
      const validWords = [
        'speedrun',
        'headshot',
        'respawn',
        'grindear',
        'nerfeo',
      ];

      expect(word).not.toBeNull();
      expect(validWords).toContain(word);
    });

    it('returns null for a missing category', () => {
      const bank = createSampleBank();
      expect(bank.randomWordFromCategory('nonexistent')).toBeNull();
    });

    it('returns null for an empty category', () => {
      const bank = new WordBank({
        categories: [{ name: 'vacia', displayName: 'Vacía', words: [] }],
      });
      expect(bank.randomWordFromCategory('vacia')).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('returns all category names with display names', () => {
      const bank = createSampleBank();
      expect(bank.getCategories()).toEqual([
        { name: 'videojuegos', displayName: 'Videojuegos' },
        { name: 'internet', displayName: 'Internet' },
      ]);
    });

    it('returns the human-readable display name', () => {
      const bank = createSampleBank();
      expect(bank.getDisplayName('videojuegos')).toBe('Videojuegos');
      expect(bank.getDisplayName('unknown')).toBe('unknown');
    });
  });

  describe('isEmpty', () => {
    it('returns false when the bank has words', () => {
      const bank = createSampleBank();
      expect(bank.isEmpty()).toBe(false);
    });

    it('returns true when the bank has no categories', () => {
      const bank = new WordBank({ categories: [] });
      expect(bank.isEmpty()).toBe(true);
    });

    it('returns true when all categories are empty', () => {
      const bank = new WordBank({
        categories: [{ name: 'vacia', displayName: 'Vacía', words: [] }],
      });
      expect(bank.isEmpty()).toBe(true);
    });
  });

  describe('addCategory', () => {
    it('creates a new category with the provided words', () => {
      const bank = createSampleBank();
      const created = bank.addCategory('mi-categoria', 'Mi categoría', ['a', 'b', 'c']);
      expect(created.name).toBe('mi-categoria');
      expect(created.displayName).toBe('Mi categoría');
      expect(bank.getWords('mi-categoria')).toEqual(['a', 'b', 'c']);
    });

    it('derives a display name when none is provided', () => {
      const bank = createSampleBank();
      const created = bank.addCategory('familia', undefined, ['mama', 'papa']);
      expect(created.displayName).toBe('Familia');
    });

    it('rejects a name that already exists', () => {
      const bank = createSampleBank();
      expect(() => bank.addCategory('videojuegos', undefined, ['x']))
        .toThrow(/ya existe/);
    });

    it('rejects an empty word list', () => {
      const bank = createSampleBank();
      expect(() => bank.addCategory('vacia', undefined, []))
        .toThrow(/al menos una palabra/);
    });

    it('normalizes the name to kebab-case ASCII', () => {
      const bank = createSampleBank();
      const created = bank.addCategory('Mi Categoría Nueva!', undefined, ['a']);
      expect(created.name).toBe('mi-categoria-nueva');
    });

    it('deduplicates and trims words', () => {
      const bank = createSampleBank();
      bank.addCategory('test', undefined, [' a ', 'b', 'a', '  c']);
      expect(bank.getWords('test')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('addWords', () => {
    it('appends new words to an existing built-in category', () => {
      const bank = createSampleBank();
      const before = bank.getWords('videojuegos').length;
      const result = bank.addWords('videojuegos', ['mod1', 'mod2']);
      expect(result.added).toBe(2);
      expect(bank.getWords('videojuegos').length).toBe(before + 2);
    });

    it('skips words that already exist (case-insensitive)', () => {
      const bank = createSampleBank();
      const result = bank.addWords('videojuegos', ['speedrun', 'SPEEDRUN', 'nuevo']);
      expect(result.added).toBe(1);
    });

    it('throws on a missing category', () => {
      const bank = createSampleBank();
      expect(() => bank.addWords('no-existe', ['a'])).toThrow(/no encontrada/);
    });

    it('throws when no new words are provided', () => {
      const bank = createSampleBank();
      expect(() => bank.addWords('videojuegos', [])).toThrow(/palabras/i);
    });
  });

  describe('isBuiltIn', () => {
    it('returns true for loaded categories', () => {
      const bank = createSampleBank();
      expect(bank.isBuiltIn('videojuegos')).toBe(true);
    });

    it('returns false for custom categories', () => {
      const bank = createSampleBank();
      bank.addCategory('custom', undefined, ['a']);
      expect(bank.isBuiltIn('custom')).toBe(false);
    });
  });
});
