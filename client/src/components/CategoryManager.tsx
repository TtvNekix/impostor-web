import { useState } from 'react';
import { useCategoryStore } from '../stores/categoryStore';
import es from '../i18n/es';

interface CategoryManagerProps {
  onClose: () => void;
  /** Hooks to send the actual server events. */
  addCategory: (payload: { name: string; displayName?: string; words: string }) => void;
  addWords: (payload: { category: string; words: string }) => void;
}

/**
 * Modal for the host to manage word-bank categories:
 *  - Create a new custom category (kebab-case name + ; separated words)
 *  - Append words to any existing category (built-in or custom)
 *
 * The host can run these actions from the lobby before the match starts.
 * New categories become available to all rooms on the server immediately.
 */
export function CategoryManager({ onClose, addCategory, addWords }: CategoryManagerProps) {
  const categories = useCategoryStore((s) => s.categories);
  const getDisplayName = useCategoryStore((s) => s.getDisplayName);

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newWords, setNewWords] = useState('');

  const [targetCategory, setTargetCategory] = useState<string>(categories[0]?.name ?? '');
  const [extraWords, setExtraWords] = useState('');

  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !newWords.trim()) {
      setStatus({ type: 'err', text: 'Completá el nombre y al menos una palabra' });
      return;
    }
    addCategory({
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      words: newWords,
    });
    setName('');
    setDisplayName('');
    setNewWords('');
    setStatus({ type: 'ok', text: 'Categoría creada' });
  };

  const handleAddWords = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategory || !extraWords.trim()) {
      setStatus({ type: 'err', text: 'Elegí una categoría y al menos una palabra' });
      return;
    }
    addWords({ category: targetCategory, words: extraWords });
    setExtraWords('');
    setStatus({ type: 'ok', text: es.lobby.wordsAdded.replace('{added}', '?').replace('{total}', '?') });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">{es.lobby.manageCategories}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="modal__body">
          {status && (
            <p
              className={`modal__status modal__status--${status.type}`}
              role={status.type === 'err' ? 'alert' : 'status'}
            >
              {status.text}
            </p>
          )}

          {/* Create new category */}
          <form onSubmit={handleCreate} className="cat-form">
            <h3 className="cat-form__title">{es.lobby.addCategory}</h3>
            <label className="cat-form__label">
              {es.lobby.categoryName}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: familia"
                maxLength={32}
                className="input"
              />
            </label>
            <label className="cat-form__label">
              {es.lobby.categoryDisplayName}
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={es.lobby.categoryDisplayName}
                maxLength={48}
                className="input"
              />
            </label>
            <label className="cat-form__label">
              {es.lobby.categoryWords}
              <textarea
                value={newWords}
                onChange={(e) => setNewWords(e.target.value)}
                placeholder="hola;adios;fresco"
                rows={3}
                className="input cat-form__textarea"
              />
              <span className="cat-form__hint">Separá con ; (punto y coma)</span>
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              {es.lobby.save}
            </button>
          </form>

          <hr className="modal__divider" />

          {/* Add words to existing */}
          <form onSubmit={handleAddWords} className="cat-form">
            <h3 className="cat-form__title">{es.lobby.addWords}</h3>
            <label className="cat-form__label">
              {es.lobby.category}
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                className="select"
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {getDisplayName(c.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="cat-form__label">
              {es.lobby.addWordsHint}
              <textarea
                value={extraWords}
                onChange={(e) => setExtraWords(e.target.value)}
                placeholder="nuevas palabras;separadas;por;puntoycoma"
                rows={3}
                className="input cat-form__textarea"
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              {es.lobby.save}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
