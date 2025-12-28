'use client';

import React from 'react';
import Link from 'next/link';

interface CreditStatusProps {
  credits: number;
  showBuyLink?: boolean;
}

export const CreditStatus = ({ credits, showBuyLink = true }: CreditStatusProps) => {
  const getStatus = () => {
    if (credits >= 4) {
      return { 
        type: 'normal', 
        color: 'text-green-400', 
        bgColor: 'bg-green-500/20', 
        borderColor: 'border-green-500/30' 
      };
    } else if (credits >= 2) {
      return { 
        type: 'low', 
        color: 'text-yellow-400', 
        bgColor: 'bg-yellow-500/20', 
        borderColor: 'border-yellow-500/30' 
      };
    } else {
      return { 
        type: 'insufficient', 
        color: 'text-red-400', 
        bgColor: 'bg-red-500/20', 
        borderColor: 'border-red-500/30' 
      };
    }
  };

  const status = getStatus();

  return (
    <div className={`${status.bgColor} border ${status.borderColor} rounded-lg px-3 py-2`}>
      {status.type === 'normal' && (
        <p className={`${status.color} text-sm font-medium`}>
          💎 You have {credits} credits
        </p>
      )}
      {status.type === 'low' && (
        <p className={`${status.color} text-sm font-medium`}>
          ⚠️ You have {credits} credits — {showBuyLink && (
            <Link href="/pricing" className="underline">Running Low, Buy More</Link>
          )}
        </p>
      )}
      {status.type === 'insufficient' && (
        <p className={`${status.color} text-sm font-medium`}>
          ⚠️ You have {credits} credit{credits !== 1 ? 's' : ''} — {showBuyLink && (
            <Link href="/pricing" className="underline">Running Low, Buy More</Link>
          )}
        </p>
      )}
    </div>
  );
};

export default CreditStatus;
