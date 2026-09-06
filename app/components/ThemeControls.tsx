"use client";
import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentMode = 'blue' | 'pink' | 'gold' | 'green';
export function applyTheme(mode: ThemeMode, accent: AccentMode) {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  Object.assign(document.documentElement.dataset, { theme: dark ? 'dark' : 'light', themeMode: mode, accent });
  try { localStorage.setItem('praxiz-theme', mode); localStorage.setItem('praxiz-accent', accent); } catch { /* Works for this page when device storage is blocked. */ }
  window.dispatchEvent(new Event('praxiz-appearance'));
}
export function ThemeControls({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [accent, setAccent] = useState<AccentMode>('blue');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      const data = document.documentElement.dataset;
      setMode(['light', 'dark'].includes(data.themeMode ?? '') ? data.themeMode as ThemeMode : 'system');
      setAccent(['pink', 'gold', 'green'].includes(data.accent ?? '') ? data.accent as AccentMode : 'blue');
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.contains(document.activeElement)) {
        setOpen(false); root.current?.querySelector('button')?.focus();
      }
    };
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const systemChanged = () => {
      const data = document.documentElement.dataset;
      if (data.themeMode === 'system') applyTheme('system', ['pink', 'gold', 'green'].includes(data.accent ?? '') ? data.accent as AccentMode : 'blue');
    };
    sync(); window.addEventListener('praxiz-appearance', sync); document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape); preference.addEventListener('change', systemChanged);
    return () => { window.removeEventListener('praxiz-appearance', sync); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); preference.removeEventListener('change', systemChanged); };
  }, []);
  return <div ref={root} role="group" aria-label="Appearance preferences" className={compact ? 'theme-popover-wrap' : 'appearance-controls'}>
    {compact && <button className="icon-button" aria-label="Appearance preferences" aria-expanded={open} onClick={() => setOpen(!open)}><Palette size={21} /></button>}
    {(!compact || open) && <div className={compact ? 'theme-popover card' : ''}>
      <label className="field"><span>Color mode</span><select value={mode} onChange={event => applyTheme(event.target.value as ThemeMode, accent)}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <fieldset className="accent-picker"><legend>Accent color</legend>{(['blue','pink','gold','green'] as const).map(color => <label className={`accent-option accent-${color}`} key={color}><input type="radio" name={compact ? 'public-accent' : 'settings-accent'} checked={accent === color} onChange={() => applyTheme(mode, color)} /><span />{color[0].toUpperCase() + color.slice(1)}</label>)}</fieldset>
      <small role="status">Appearance is saved on this device.</small>
    </div>}
  </div>;
}
