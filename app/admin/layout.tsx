'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/news', label: 'News Briefings', icon: '📰' },
  { href: '/admin/finance', label: 'Finance', icon: '💰' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/stories', label: 'Stories', icon: '📚' },
  { href: '/admin/partners', label: 'Partners', icon: '🤝' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/sales', label: 'Sales & Promos', icon: '🏷️' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚛</span>
            {sidebarOpen && (
              <div>
                <span className="font-bold text-white">DTT</span>
                <span className="font-bold text-orange-500"> Admin</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && pathname?.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  isActive
                    ? 'bg-orange-500 text-black'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <span>{sidebarOpen ? '◀' : '▶'}</span>
            {sidebarOpen && <span className="text-sm">Collapse</span>}
          </button>
          
          {sidebarOpen && (
            <Link
              href="/"
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-500 hover:text-white text-sm"
            >
              ← Back to Site
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
