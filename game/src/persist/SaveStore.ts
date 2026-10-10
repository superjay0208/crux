import { ProfileId } from '../core/data/schema';

export interface LevelRecord {
  bestMoves: number | null;
  bestTimeSeconds: number | null;
  star: boolean;
  completed: boolean;
}

export interface SaveData {
  schemaVersion: number;
  profiles: {
    realism: { levels: Record<string, LevelRecord> };
    original_browser: {
      levels: Record<string, LevelRecord>;
    };
    desktop: {
      levels: Record<string, LevelRecord & { moveStar?: boolean; timeStar?: boolean; elimStar?: boolean | null }>;
      customRoutes?: any[];
    };
  };
  settings: {
    master: number;
    sfx: number;
    profile: string;
    reducedMotion: boolean;
  };
}

const STORAGE_KEY = 'crux.save.v2';

export class SaveStore {
  private data: SaveData;
  private campaignIds: string[] = [];

  setCampaign(levels: Array<{ id: string; order: number; group: string | null }>): void {
    this.campaignIds = levels.filter(level => level.group !== 'PRACTICE' && level.id !== 'lab')
      .sort((a, b) => a.order - b.order).map(level => level.id);
  }

  constructor() {
    this.data = this.loadFromStorage();
  }

  private getDefaultData(): SaveData {
    return {
      schemaVersion: 2,
      profiles: {
        realism: { levels: {} },
        original_browser: {
          levels: {
            threp: {
              bestMoves: null,
              bestTimeSeconds: null,
              star: false,
              completed: false,
            },
            lab: {
              bestMoves: null,
              bestTimeSeconds: null,
              star: false,
              completed: false,
            },
          },
        },
        desktop: {
          levels: {},
          customRoutes: [],
        },
      },
      settings: {
        master: 0.8,
        sfx: 1.0,
        profile: 'original_browser',
        reducedMotion: false,
      },
    };
  }

  private loadFromStorage(): SaveData {
    try {
      if (typeof localStorage === 'undefined') {
        return this.getDefaultData();
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getDefaultData();

      const parsed = JSON.parse(raw);
      return this.migrate(parsed);
    } catch {
      return this.getDefaultData();
    }
  }

  migrate(raw: any): SaveData {
    if (!raw || typeof raw !== 'object') {
      return this.getDefaultData();
    }
    // Migration from v0 to v1 if schemaVersion missing
    if (!raw.schemaVersion || raw.schemaVersion < 1) {
      raw.schemaVersion = 1;
      if (!raw.profiles) raw.profiles = this.getDefaultData().profiles;
      if (!raw.settings) raw.settings = this.getDefaultData().settings;
    }
    const defaults = this.getDefaultData();
    return { schemaVersion: 2, profiles: {
      original_browser: { levels: raw.profiles?.original_browser?.levels ?? defaults.profiles.original_browser.levels },
      desktop: { ...defaults.profiles.desktop, ...raw.profiles?.desktop, levels: raw.profiles?.desktop?.levels ?? {} },
      realism: { levels: raw.profiles?.realism?.levels ?? {} },
    }, settings: { ...defaults.settings, ...raw.settings } };
  }

  save(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  getLevelRecord(profileId: ProfileId, levelId: string): LevelRecord | null {
    const profileLevels = this.data.profiles[profileId]?.levels;
    return profileLevels ? profileLevels[levelId] ?? null : null;
  }

  isLevelUnlocked(profileId: ProfileId, levelId: string, levelOrder: number): boolean {
    if (profileId === 'desktop') return true; // All groups open in desktop
    if (levelId === 'lab' || levelOrder <= 1) return true;

    // Progression is supplied from the loaded campaign, so authoring order is authoritative.
    const orderedIds = this.campaignIds;
    const idx = orderedIds.indexOf(levelId);
    if (idx < 0) return levelId === 'grip_lab' || levelId === 'lab';
    if (idx === 0) return true;

    const prevLevelId = orderedIds[idx - 1];
    const prevRecord = this.getLevelRecord(profileId, prevLevelId);
    return prevRecord ? prevRecord.completed : false;
  }

  recordCompletion(
    profileId: ProfileId,
    levelId: string,
    moves: number,
    timeSeconds: number,
    star: boolean
  ): void {
    const profile = this.data.profiles[profileId];
    if (!profile) return;

    const prev = profile.levels[levelId] || {
      bestMoves: null,
      bestTimeSeconds: null,
      star: false,
      completed: false,
    };

    const bestMoves = prev.bestMoves === null ? moves : Math.min(prev.bestMoves, moves);
    const bestTimeSeconds = prev.bestTimeSeconds === null ? timeSeconds : Math.min(prev.bestTimeSeconds, timeSeconds);

    profile.levels[levelId] = {
      bestMoves,
      bestTimeSeconds,
      star: prev.star || star,
      completed: true,
    };

    this.save();
  }

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  getSelectedProfile(): ProfileId { return this.data.settings.profile === 'realism' ? 'realism' : 'original_browser'; }
  setSelectedProfile(profile: ProfileId): void { this.data.settings.profile = profile; this.save(); }

  importJson(jsonText: string): boolean {
    try {
      const parsed = JSON.parse(jsonText);
      this.data = this.migrate(parsed);
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.data = this.getDefaultData();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
