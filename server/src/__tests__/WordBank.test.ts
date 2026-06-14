import { describe, it, expect } from 'vitest';
import { WordBank } from '../words/WordBank';

function createSampleBank(): WordBank {
  return new WordBank({
    categories: [
      {
        name: 'videojuegos',
        words: ['speedrun', 'headshot', 'respawn', 'grindear', 'nerfeo'],
      },
      {
        name: 'internet',
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
          { name: 'empty1', words: [] },
          { name: 'empty2', words: [] },
        ],
      });
      expect(bank.randomWord()).toBeNull();
    });

    it('returns words from the correct categories', () => {
      const bank = createSampleBank();
      const categories = bank.getCategories();
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
        categories: [{ name: 'vacia', words: [] }],
      });
      expect(bank.randomWordFromCategory('vacia')).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('returns all category names', () => {
      const bank = createSampleBank();
      expect(bank.getCategories()).toEqual(['videojuegos', 'internet']);
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
        categories: [{ name: 'vacia', words: [] }],
      });
      expect(bank.isEmpty()).toBe(true);
    });
  });
});
