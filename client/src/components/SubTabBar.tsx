export interface SubTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  badge?: string | number;
  accentColor?: string;
}

interface SubTabBarProps<T extends string> {
  tabs: SubTabItem<T>[];
  activeTab: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
}

/**
 * Unified segmented sub-tab switcher used across all multi-view screens
 * (Trendit & Kulutus, Valot & Pistorasiat, APC-Strategia, Tekniikka & Akku).
 */
export function SubTabBar<T extends string>({
  tabs,
  activeTab,
  onSelect,
  ariaLabel = 'Näkymän alavälilehdet',
}: SubTabBarProps<T>) {
  return (
    <div className="subtab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const accent = tab.accentColor || '#38bdf8';
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={`subtab-btn ${isActive ? 'is-active' : ''}`}
            style={
              isActive
                ? {
                    color: accent,
                    background: `${accent}24`,
                    borderColor: `${accent}55`,
                  }
                : undefined
            }
          >
            {tab.icon && <span className="subtab-icon">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && tab.badge !== '' && (
              <span
                className="subtab-badge"
                style={
                  isActive
                    ? {
                        background: `${accent}33`,
                        color: accent,
                      }
                    : undefined
                }
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
