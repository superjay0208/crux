import { LevelData, ProfileId } from '../../core/data/schema';
import { modeSwitch } from './ModeSwitch';
import { SaveStore } from '../../persist/SaveStore';

export class MenuCrux {
  private container: HTMLElement;
  constructor(parent: HTMLElement, levels: LevelData[], saves: SaveStore, callbacks: { onSelectLevel: (id: string) => void; onHome?: () => void; onMode?: (id: ProfileId) => void }, profileId: ProfileId = 'original_browser') {
    this.container = document.createElement('section');
    this.container.className = 'menu-crux-container';
    this.container.innerHTML = `<header class="menu-header"><div class="brand-mark">C<span>↗</span></div><div><p class="eyebrow">A CLIMBING PUZZLE</p><h1>CRUX</h1></div><div class="menu-actions"><p class="menu-intro">Read the wall. Make your move.</p><div class="practice-slot"></div></div></header><div class="menu-grid"></div><footer class="menu-footer"><span>DRAG LIMBS · Q / E CRIMP · SPACE SWAP</span><span>12 ROUTES / ONE MOVE AT A TIME</span></footer>`;
    const grid = this.container.querySelector('.menu-grid')!;
    this.container.querySelector('.menu-actions')!.prepend(modeSwitch(profileId, id=>callbacks.onMode?.(id)));
    if (profileId === 'realism') this.container.querySelector('.menu-intro')!.textContent = 'Place your feet. Find your rests.';
    const home=document.createElement('button');home.className='menu-home';home.textContent='← HOME';home.dataset.testid='menu-home';
    home.addEventListener('click',()=>callbacks.onHome?.());this.container.querySelector('.menu-header')!.prepend(home);
    for (const level of [...levels].sort((a, b) => a.order - b.order)) {
      if (level.group === 'PRACTICE' || level.id === 'lab') continue;
      const unlocked = saves.isLevelUnlocked(profileId, level.id, level.order);
      const record = saves.getLevelRecord(profileId, level.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `menu-card ${record?.completed ? 'completed' : unlocked ? 'unlocked' : 'locked'}`;
      card.disabled = !unlocked;
      card.dataset.levelId = level.id;
      const mechanics = ['JUGS', ...(level.holds.some(h => h.grip === 'crimp') ? ['CRIMPS'] : []), ...(level.goals?.footSwaps ? ['SWAP'] : [])];
      card.innerHTML = `<div class="card-top"><span class="card-number">${String(level.order).padStart(2, '0')}</span><span>${record?.completed ? '✓ SENT' : unlocked ? 'READY ↗' : 'LOCKED'}</span></div><div class="card-map">${this.miniMap(level)}</div><div class="card-name">${level.name}</div><div class="card-mechanics">${mechanics.join(' · ')}</div><div class="card-footer">${record?.bestMoves != null ? `${record.bestMoves} MOVES` : `TARGET ${level.targets.moves}`} <span>${record?.star ? '★' : '◇'}</span></div>`;
      card.addEventListener('click', () => callbacks.onSelectLevel(level.id));
      grid.appendChild(card);
    }
    const practice = levels.find(level => level.id === 'grip_lab');
    if (practice) {
      const button = document.createElement('button');
      button.className = 'menu-practice-btn';
      button.dataset.testid = 'grip-lab-button';
      button.textContent = 'PRACTICE: GRIP LAB ↗';
      button.addEventListener('click', () => callbacks.onSelectLevel(practice.id));
      this.container.querySelector('.practice-slot')!.appendChild(button);
    }
    parent.appendChild(this.container);
  }

  private miniMap(level: LevelData): string {
    const { center, height } = level.camera;
    const dots = level.holds.map(hold => {
      const x = 80 + (hold.pos[0] - center[0]) * 15;
      const y = 43 - (hold.pos[1] - center[1]) * 11;
      const color = hold.finish ? '#f2f4ed' : hold.grip === 'crimp' ? '#ffb86b' : hold.allowHands ? '#8cdec1' : '#90a7be';
      return `<circle cx="${x}" cy="${y}" r="${hold.finish ? 4 : 2.7}" fill="${color}"/>`;
    }).join('');
    return `<svg viewBox="0 0 160 86" aria-hidden="true">${dots}</svg>`;
  }
  destroy(): void { this.container.remove(); }
}
