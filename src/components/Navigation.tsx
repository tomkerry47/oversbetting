'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Picks', icon: '🏟️' },
  { href: '/history', label: 'History', icon: '📅' },
  { href: '/stats', label: 'Stats', icon: '📊' },
  { href: '/fines', label: 'Fines', icon: '💰' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar - slim on mobile */}
      <header className="bg-slate-900/90 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="text-base font-bold text-emerald-400">
              Betting Overs
            </span>
          </Link>
        </div>
      </header>

      {/* Bottom tab bar - mobile native feel */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-700 z-50">
        <div className="grid grid-cols-4 max-w-lg mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center h-16 gap-0.5 transition-colors active:scale-95 ${
                  isActive
                    ? 'text-emerald-400'
                    : 'text-slate-500 active:text-slate-300'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 w-8 h-0.5 bg-emerald-400 rounded-full" />
                )}
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
