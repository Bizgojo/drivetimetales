'use client';

import React from 'react';

// Vehicles component - always drives left to right
const Vehicles = ({ 
  truckSize = 'text-2xl', 
  carSize = 'text-xl', 
  gap = 'gap-1' 
}: {
  truckSize?: string;
  carSize?: string;
  gap?: string;
}) => (
  <div className={`flex items-center ${gap}`} style={{ transform: 'scaleX(-1)' }}>
    <span className={carSize}>🚗</span>
    <span className={truckSize}>🚛</span>
  </div>
);

// Brand text component
const BrandText = ({ size = 'text-lg' }: { size?: string }) => (
  <span className={`${size} font-bold`}>
    <span className="text-orange-500">Drive Time</span>
    <span className="text-white"> Tales</span>
  </span>
);

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  size?: LogoSize;
}

// Main horizontal logo: 🚛 🚗 Drive Time Tales
export const Logo = ({ size = 'md' }: LogoProps) => {
  const sizes = {
    sm: { truck: 'text-xl', car: 'text-lg', text: 'text-base', gap: 'gap-1', containerGap: 'gap-2' },
    md: { truck: 'text-2xl', car: 'text-xl', text: 'text-lg', gap: 'gap-1', containerGap: 'gap-2' },
    lg: { truck: 'text-3xl', car: 'text-2xl', text: 'text-2xl', gap: 'gap-2', containerGap: 'gap-3' },
    xl: { truck: 'text-4xl', car: 'text-3xl', text: 'text-3xl', gap: 'gap-2', containerGap: 'gap-4' },
  };
  
  const s = sizes[size] || sizes.md;
  
  return (
    <div className={`flex items-center ${s.containerGap}`}>
      <Vehicles truckSize={s.truck} carSize={s.car} gap={s.gap} />
      <BrandText size={s.text} />
    </div>
  );
};

// Stacked logo: vehicles above text
export const LogoStacked = ({ size = 'md' }: LogoProps) => {
  const sizes = {
    sm: { truck: 'text-xl', car: 'text-lg', text: 'text-base', gap: 'gap-1', stackGap: 'gap-1' },
    md: { truck: 'text-3xl', car: 'text-2xl', text: 'text-xl', gap: 'gap-2', stackGap: 'gap-1' },
    lg: { truck: 'text-4xl', car: 'text-3xl', text: 'text-2xl', gap: 'gap-3', stackGap: 'gap-2' },
    xl: { truck: 'text-5xl', car: 'text-4xl', text: 'text-3xl', gap: 'gap-3', stackGap: 'gap-2' },
  };
  
  const s = sizes[size] || sizes.md;
  
  return (
    <div className={`flex flex-col items-center ${s.stackGap}`}>
      <Vehicles truckSize={s.truck} carSize={s.car} gap={s.gap} />
      <BrandText size={s.text} />
    </div>
  );
};

// Just the vehicles icon (for favicon, small spaces)
export const LogoIcon = ({ size = 'md' }: LogoProps) => {
  const sizes = {
    sm: { truck: 'text-lg', car: 'text-base', gap: 'gap-0.5' },
    md: { truck: 'text-2xl', car: 'text-xl', gap: 'gap-1' },
    lg: { truck: 'text-3xl', car: 'text-2xl', gap: 'gap-1' },
    xl: { truck: 'text-4xl', car: 'text-3xl', gap: 'gap-2' },
  };
  
  const s = sizes[size] || sizes.md;
  
  return <Vehicles truckSize={s.truck} carSize={s.car} gap={s.gap} />;
};

export default Logo;
