'use client'

export default function LinkExpiredPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#020617',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <div style={{
        background: '#1a1a2e',
        borderRadius: '20px',
        padding: '40px 32px',
        maxWidth: '400px',
        width: '100%',
        border: '1px solid rgba(249,115,22,0.2)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
        <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 800, margin: '0 0 12px' }}>
          This link has expired
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px', lineHeight: 1.6, margin: '0 0 28px' }}>
          Magic links can only be used once and expire after one hour. Ask Marc to send you a new one.
        </p>
        <a
          href="/signin"
          style={{
            display: 'inline-block',
            background: '#f97316',
            color: 'white',
            textDecoration: 'none',
            padding: '14px 32px',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 700,
          }}
        >
          Sign in instead
        </a>
      </div>
    </div>
  )
}
