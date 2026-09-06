"use client";
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

export function PublicSectionLink({ href, children, className, onClick }: {
  href: string; children: ReactNode; className?: string; onClick?: () => void;
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync(); window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return <a href={href} className={className} aria-current={pathname === '/' && hash && href === `/${hash}` ? 'location' : undefined}
    onClick={onClick}>{children}</a>;
}
