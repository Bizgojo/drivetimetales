const fs = require('fs');
const f = 'app/account/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// Remove Quick Actions block (Collection + Reserved Stories buttons)
c = c.replace(
  `        {/* Quick Actions - Orange and Blue buttons */}
        <div className="flex gap-3 mb-6">
          <Link 
            href="/collection" 
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#f97316',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'none'
            }}
          >
            📚 My Collection
          </Link>
          <Link 
            href="/wishlist" 
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#3b82f6',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'none'
            }}
          >
            ♡ Reserved Stories
          </Link>
        </div>`,
  ''
);

// Remove Upgrade or Add Credits button block
c = c.replace(
  `          
          {/* Upgrade or Add Credits Button */}
          <div 
            onClick={() => router.push('/manage-subscription')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              backgroundColor: '#1e293b',
              border: '2px solid #f97316',
              borderRadius: '12px',
              padding: '16px',
              cursor: 'pointer',
              marginTop: '8px'
            }}
          >
            <span style={{ fontSize: '24px' }}>💳</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#f97316', fontWeight: '600', margin: 0 }}>Upgrade or Add Credits</p>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Manage your subscription</p>
            </div>
            <span style={{ color: '#f97316' }}>›</span>
          </div>`,
  ''
);

fs.writeFileSync(f, c);
console.log('done');
