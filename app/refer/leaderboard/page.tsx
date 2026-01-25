'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface LeaderboardEntry {
  id: string
  first_name: string
  display_name: string
  referral_code: string
  total_referrals: number
  successful_referrals: number
  total_days_earned: number
  total_credits_earned: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [userRank, setUserRank] = useState<number | null>(null)
  const [userStats, setUserStats] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchLeaderboard() }, [user])

  async function fetchLeaderboard() {
    setLoading(true)
    
    const { data: leaderboardData } = await supabase
      .from('referral_leaderboard')
      .select('*')
      .limit(50)
    
    if (leaderboardData) {
      setLeaders(leaderboardData)
      
      // Find current user's rank
      if (user?.id) {
        const userIndex = leaderboardData.findIndex(l => l.id === user.id)
        if (userIndex >= 0) {
          setUserRank(userIndex + 1)
          setUserStats(leaderboardData[userIndex])
        }
      }
    }
    
    setLoading(false)
  }

  function getMedal(rank: number) {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return rank.toString()
  }

  function getInitial(entry: LeaderboardEntry) {
    return (entry.first_name || entry.display_name || '?').charAt(0).toUpperCase()
  }

  function getName(entry: LeaderboardEntry) {
    const name = entry.first_name || entry.display_name || 'Anonymous'
    // Show first name + first letter of last if display_name has space
    if (entry.display_name && entry.display_name.includes(' ')) {
      const parts = entry.display_name.split(' ')
      return parts[0] + ' ' + parts[1].charAt(0) + '.'
    }
    return name
  }

  if (loading) return (<div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /><style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} /></div>)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 50 }}>
        <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <button onClick={() => router.push('/refer')} style={{ backgroundColor: '#334155', color: 'white', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>← Back</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <span style={{ fontSize: '20px' }}>🏆</span>
            <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>Referral Leaderboard</span>
          </div>
          <div style={{ width: '36px' }}></div>
        </div>
      </div>

      <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
        {/* Your Rank Card */}
        {userStats && userRank && (
          <div style={{ backgroundColor: '#1e3a2f', border: '2px solid #22c55e', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.5rem' }}>Your Ranking</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: userRank <= 3 ? '#fbbf24' : 'white', minWidth: '40px' }}>{getMedal(userRank)}</div>
                <div>
                  <div style={{ color: 'white', fontWeight: 600 }}>{getName(userStats)}</div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>{userStats.successful_referrals} successful • {userStats.total_referrals} total</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>
                  {userStats.total_days_earned > 0 ? userStats.total_days_earned + 'd' : userStats.total_credits_earned + 'cr'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>earned</div>
              </div>
            </div>
          </div>
        )}

        {/* Top 3 Podium */}
        {leaders.length >= 3 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0 1rem' }}>
            {/* 2nd Place */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#475569', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: 'white' }}>{getInitial(leaders[1])}</div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{getName(leaders[1])}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{leaders[1].successful_referrals} referrals</div>
              <div style={{ backgroundColor: '#94a3b8', height: '60px', borderRadius: '8px 8px 0 0', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px' }}>🥈</span>
              </div>
            </div>
            
            {/* 1st Place */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#f97316', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', color: 'white', border: '3px solid #fbbf24' }}>{getInitial(leaders[0])}</div>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>{getName(leaders[0])}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{leaders[0].successful_referrals} referrals</div>
              <div style={{ backgroundColor: '#fbbf24', height: '80px', borderRadius: '8px 8px 0 0', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px' }}>🥇</span>
              </div>
            </div>
            
            {/* 3rd Place */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#475569', margin: '0 auto 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: 'white' }}>{getInitial(leaders[2])}</div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{getName(leaders[2])}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{leaders[2].successful_referrals} referrals</div>
              <div style={{ backgroundColor: '#cd7f32', height: '40px', borderRadius: '8px 8px 0 0', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px' }}>🥉</span>
              </div>
            </div>
          </div>
        )}

        {/* Full Leaderboard */}
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Top Referrers</span>
            <span>Successful / Total</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {leaders.map((entry, index) => {
              const isCurrentUser = user?.id === entry.id
              return (
                <div key={entry.id} style={{ backgroundColor: isCurrentUser ? '#1e3a2f' : '#0f172a', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: isCurrentUser ? '1px solid #22c55e' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '28px', textAlign: 'center', fontSize: index < 3 ? '18px' : '14px', fontWeight: 'bold', color: index < 3 ? '#fbbf24' : '#94a3b8' }}>
                      {getMedal(index + 1)}
                    </div>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: isCurrentUser ? '#f97316' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: 'white' }}>
                      {getInitial(entry)}
                    </div>
                    <div>
                      <div style={{ color: 'white', fontSize: '14px', fontWeight: isCurrentUser ? 600 : 400 }}>
                        {getName(entry)} {isCurrentUser && <span style={{ color: '#22c55e', fontSize: '11px' }}>(you)</span>}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                        {entry.total_days_earned > 0 ? entry.total_days_earned + ' days earned' : entry.total_credits_earned > 0 ? entry.total_credits_earned + ' credits earned' : 'No rewards yet'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 'bold' }}>{entry.successful_referrals}</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>/ {entry.total_referrals}</div>
                  </div>
                </div>
              )
            })}
          </div>
          
          {leaders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '32px', marginBottom: '0.5rem' }}>🏆</div>
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>No referrals yet. Be the first!</div>
              <button onClick={() => router.push('/refer')} style={{ marginTop: '1rem', backgroundColor: '#f97316', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Start Referring
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
