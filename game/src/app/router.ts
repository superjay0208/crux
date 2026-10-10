import { PlayScreen } from '../ui/screens/PlayScreen';
import { GameFacade } from './GameFacade';
import { MenuCrux } from '../ui/screens/MenuCrux';
import { StartScreen } from '../ui/screens/StartScreen';
import { SaveStore } from '../persist/SaveStore';
import { AudioBank } from '../audio/AudioBank';
import { LevelData, ProfileConfig, ProfileId } from '../core/data/schema';
import { GameEvent } from '../core/rules/Session';

export interface RouterOptions {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  profile: ProfileConfig;
  levels: LevelData[];
  saveStore: SaveStore;
  audio: AudioBank;
  modes: Record<string, { profile: ProfileConfig; levels: LevelData[] }>;
}

/** Owns the Crux campaign menu, practice navigation, results and saved progression. */
export class Router {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private profile: ProfileConfig;
  private levels: LevelData[];
  private saveStore: SaveStore;
  private audio: AudioBank;
  private playScreen: PlayScreen;
  private menu: MenuCrux | null = null;
  private startScreen: StartScreen | null = null;
  private modes: RouterOptions['modes'];

  constructor(options: RouterOptions) {
    this.container = options.container;
    this.canvas = options.canvas;
    this.profile = options.profile;
    this.levels = options.levels;
    this.saveStore = options.saveStore;
    this.audio = options.audio;
    this.modes = options.modes;
    this.playScreen = new PlayScreen(this.container, this.canvas);

    // Audio unlock needs a user gesture; the first pointer/click anywhere satisfies it.
    const unlock = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
  }

  getFacade(): GameFacade | null {
    return this.playScreen.getFacade();
  }

  showMenu(): void {
    this.startScreen?.destroy();this.startScreen=null;
    this.playScreen.destroy();
    this.canvas.style.display = 'none';
    this.menu?.destroy();
    this.menu = new MenuCrux(this.container, this.levels, this.saveStore, {
      onSelectLevel: (levelId) => this.showLevel(levelId),
      onHome: () => this.showStart(),
      onMode: profile => this.selectMode(profile, false),
    }, this.profile.id);
  }

  showStart(): void {
    this.playScreen.destroy();this.menu?.destroy();this.menu=null;
    this.startScreen?.destroy();this.canvas.style.display='none';
    this.startScreen=new StartScreen(this.container,this.levels,this.profile,()=>this.showMenu(),profile=>this.selectMode(profile,true));
  }

  getProfile(): ProfileConfig { return this.profile; }
  getLevels(): LevelData[] { return this.levels; }
  private selectMode(id: ProfileId, start: boolean): void {
    const mode = this.modes[id]; if (!mode) return;
    this.profile = mode.profile; this.levels = mode.levels;
    this.saveStore.setSelectedProfile(id); this.saveStore.setCampaign(this.levels);
    if (start) this.showStart(); else this.showMenu();
  }

  showLevel(levelId: string): void {
    this.startScreen?.destroy();this.startScreen=null;
    this.menu?.destroy();
    this.menu = null;
    this.canvas.style.display = 'block';

    const level = this.levels.find((l) => l.id === levelId);
    if (!level) {
      console.error(`Unknown level: ${levelId}`);
      this.showMenu();
      return;
    }

    const facade = this.playScreen.startLevel(level, this.profile, () => this.showMenu());

    facade.getSimulation().session.addListener((event: GameEvent) => {
      switch (event.type) {
        case 'Attached':
          this.audio.play('grab');
          break;
        case 'Released':
          this.audio.play('release');
          break;
        case 'Fell':
          this.audio.play('fall');
          break;
        case 'FootSwapProgress':
          this.audio.play('click');
          break;
        case 'FootSwapCompleted':
          this.audio.play('swap');
          break;
        case 'FootSwapFailed':
          if (event.reason !== 'cancelled') this.audio.play('miss');
          break;
        case 'Finished': {
          this.audio.play('finish');
          this.saveStore.recordCompletion(
            this.profile.id,
            levelId,
            event.result.moves,
            event.result.timeSeconds,
            event.result.star
          );
          // Allow the result to be read before returning to the campaign.
          // Guard with the attempt id too: Retry doesn't replace the facade instance, so without
          // it a Retry during this delay would still get yanked back to the menu (docs/09 J2).
          const attemptId = facade.getAttemptId();
          setTimeout(() => {
            if (this.playScreen.getFacade() === facade && facade.getAttemptId() === attemptId) {
              this.showMenu();
            }
          }, 1800);
          break;
        }
      }
    });
  }
}
