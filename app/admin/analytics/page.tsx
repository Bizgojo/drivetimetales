'use client';

import React from 'react';

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">📈 Analytics</h1>
        <p className="text-gray-400">Insights and statistics for marketing decisions</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <span className="text-6xl mb-4 block">🚧</span>
        <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Analytics features are being built. This will include:
        </p>
        <ul className="text-gray-500 mt-4 space-y-2">
          <li>• User growth charts</li>
          <li>• Most played stories</li>
          <li>• Conversion rates (free → paid)</li>
          <li>• Retention metrics</li>
          <li>• Geographic data</li>
          <li>• Peak listening times</li>
          <li>• Device breakdown</li>
        </ul>
      </div>
    </div>
  );
}
