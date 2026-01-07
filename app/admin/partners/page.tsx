'use client';

import React from 'react';

export default function PartnersPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">🤝 Partners</h1>
        <p className="text-gray-400">QR code partner program management</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <span className="text-6xl mb-4 block">🚧</span>
        <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Partner management features are being built. This will include:
        </p>
        <ul className="text-gray-500 mt-4 space-y-2">
          <li>• Create and manage partner QR codes</li>
          <li>• Track conversions per partner</li>
          <li>• Configure commission rates</li>
          <li>• Manage partner promos</li>
          <li>• Generate payout reports</li>
        </ul>
      </div>
    </div>
  );
}
