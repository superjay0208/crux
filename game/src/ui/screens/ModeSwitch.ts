import { ProfileId } from '../../core/data/schema';

export function modeSwitch(profile: ProfileId, select: (profile: ProfileId) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'mode-switch';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Climbing mode');
  for (const [id, label, testid] of [['original_browser','Standard','standard'],['realism','Realism','realism']] as const) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = label; button.dataset.testid = `mode-${testid}`;
    button.setAttribute('aria-pressed', String(id === profile || (id === 'original_browser' && profile === 'desktop')));
    button.addEventListener('click', () => select(id)); group.appendChild(button);
  }
  return group;
}
