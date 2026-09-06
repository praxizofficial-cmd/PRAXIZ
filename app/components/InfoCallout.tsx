import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared, non-interactive guidance; decorative icons never replace the message. */
export function InfoCallout({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <div className="info-callout"><Icon size={20} aria-hidden="true" /><div>{children}</div></div>;
}
