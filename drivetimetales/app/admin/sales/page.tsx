'use client';

import React from 'react';

export default function SalesPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">🏷️ Sales & Promos</h1>
        <p className="text-gray-400">Manage promotional codes and campaigns</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <span className="text-6xl mb-4 block">🚧</span>
        <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Sales & promo features are being built. This will include:
        </p>
        <ul className="text-gray-500 mt-4 space-y-2">
          <li>• Create promo codes</li>
          <li>• Set discount amounts/percentages</li>
          <li>• Track code usage</li>
          <li>• Campaign management</li>
          <li>• Coupon expiration settings</li>
          <li>• Usage limits per code</li>
        </ul>
      </div>
    </div>
  );
}
