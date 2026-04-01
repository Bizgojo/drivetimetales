'use client'
import { useState, useEffect } from 'react'

export default function HomeHintToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    console.log('[HomeHintToast] mounted')
    setVisible(true)
  }, [])

  console.log('[HomeHintToast] render, visible:', visible)

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'red',
      color: 'white',
      padding: '20px',
      fontSize: '20px',
      fontWeight: 900,
      zIndex: 99999,
      textAlign: 'center',
    }}>
      TOAST TEST — TAP TO CLOSE
      <button onClick={() => setVisible(false)} style={{ marginLeft: 20, background: 'white', color: 'red', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>X</button>
    </div>
  )
}
