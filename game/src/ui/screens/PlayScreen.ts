import { GameFacade } from '../../app/GameFacade';
import { LevelData, ProfileConfig } from '../../core/data/schema';

export class PlayScreen {
  private facade: GameFacade | null = null;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas;
  }

  startLevel(level: LevelData, profile: ProfileConfig, onBack: () => void): GameFacade {
    if (this.facade) {
      this.facade.destroy();
      this.facade = null;
    }

    this.facade = new GameFacade({
      canvas: this.canvas,
      container: this.container,
      level,
      profile,
      onBack,
    });

    this.facade.start();
    return this.facade;
  }

  getFacade(): GameFacade | null {
    return this.facade;
  }

  destroy(): void {
    if (this.facade) {
      this.facade.destroy();
      this.facade = null;
    }
  }
}

