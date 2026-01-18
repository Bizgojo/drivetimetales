/*
================================================================================
🔒 PROTECTED MODULE 00 - DTT LOGO (UNIVERSAL)
================================================================================
Module: 00_DTTLogo
Location: ~/DriveTimeFiles/WorkingCodeLibrary/00_SharedComponents/
Status: PROTECTED - DO NOT MODIFY WITHOUT MARC'S APPROVAL

FORMAT:
🚗 🚙 Drive Time Tales
- Two vehicles on left
- "Drive Time" in white
- "Tales" in orange
- Italic font style
================================================================================
*/

interface DTTLogoProps {
  size?: 'sm' | 'md' | 'lg'
}

export default function DTTLogo({ size = 'md' }: DTTLogoProps) {
  const fontSize = size === 'sm' ? '1rem' : size === 'lg' ? '1.5rem' : '1.25rem'
  const vehicleSize = size === 'sm' ? '1rem' : size === 'lg' ? '1.5rem' : '1.25rem'
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: vehicleSize }}>🚗</span>
      <span style={{ fontSize: vehicleSize }}>🚙</span>
      <span 
        className="text-white"
        style={{ 
          fontSize,
          fontWeight: 'bold',
          fontStyle: 'italic'
        }}
      >
        Drive Time <span className="text-orange-400">Tales</span>
      </span>
    </div>
  )
}
