import { useT, useLocale, LOCALE_LABELS } from '../i18n/I18nContext';
import { CustomSelect, type CustomSelectOption } from './CustomSelect';
import {
  type PublicRoomLangFilter,
  type PublicRoomFilters as Filters,
} from '../hooks/usePublicRooms';

interface PublicRoomFiltersProps {
  /** Current filter values. */
  filters: Filters;
  /** Update one or more filter fields. */
  onChange: (next: Partial<Filters>) => void;
  /** Manual refresh trigger. */
  onRefresh: () => void;
  /** True when a fetch is in flight (disables the refresh button). */
  loading: boolean;
}

/* Locale list (6 codes + 'all'). We compute the dropdown options from
 * LOCALE_LABELS so adding a new locale only requires touching I18nContext. */
const LANG_OPTIONS: PublicRoomLangFilter[] = ['all', 'en', 'es', 'pt', 'fr', 'it', 'de'];

/**
 * Controls for the public-rooms list:
 *   - Language dropdown (locale filter, 'all' = no filter)
 *   - "With space only" checkbox
 *   - Manual refresh button
 */
export function PublicRoomFiltersComponent({
  filters,
  onChange,
  onRefresh,
  loading,
}: PublicRoomFiltersProps) {
  const t = useT();
  const currentLocale = useLocale();

  const langOptions: CustomSelectOption<PublicRoomLangFilter>[] = LANG_OPTIONS.map((code) => ({
    value: code,
    label: code === 'all' ? 'All' : LOCALE_LABELS[code].code,
  }));

  return (
    <div className="public-rooms-filters" aria-label={t.entry.publicRooms.title}>
      {/* Language filter */}
      <div className="public-rooms-filters__field">
        <label
          htmlFor="public-rooms-lang"
          className="public-rooms-filters__label"
        >
          {t.entry.publicRooms.filterLanguage}
        </label>
        <CustomSelect<PublicRoomLangFilter>
          value={filters.lang}
          options={langOptions}
          onChange={(v) => onChange({ lang: v })}
          ariaLabel={t.entry.publicRooms.filterLanguage}
          className="public-rooms-filters__lang"
        />
      </div>

      {/* "With space only" toggle */}
      <label className="public-rooms-filters__checkbox">
        <input
          type="checkbox"
          checked={filters.hasSpace}
          onChange={(e) => onChange({ hasSpace: e.target.checked })}
        />
        <span>{t.entry.publicRooms.filterHasSpace}</span>
      </label>

      {/* Manual refresh */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="btn btn--ghost btn--sm public-rooms-filters__refresh"
        aria-label={t.entry.publicRooms.refresh}
        title={t.entry.publicRooms.refresh}
      >
        {t.entry.publicRooms.refresh}
      </button>
    </div>
  );
}
