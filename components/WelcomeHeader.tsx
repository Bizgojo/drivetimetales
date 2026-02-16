/*
================================================================================
🔑 PROTECTED MODULE W1 - WELCOME HEADER
================================================================================
Module: W1_WelcomeHeader
Location: components/WelcomeHeader.tsx

Created: January 18, 2026
Updated: February 15, 2026 - Removed news briefing reference

PURPOSE:
Welcome page header with animated vehicles and 3 credit states.

STATES:
- State 1 (2+ credits): "You have {n} free credits"
- State 2 (1 credit): "You have 1 free credit left"
- State 3 (0 credits): "You have used all your free credits" + [Get More Credits] button

⚠️  DO NOT MODIFY THIS DESIGN WITHOUT MARC'S EXPLICIT APPROVAL
================================================================================
*/

'use client'

import { useState } from 'react'
import Link from 'next/link'

interface WelcomeHeaderProps {
  credits: number
}

export default function WelcomeHeader({ credits }: WelcomeHeaderProps) {
  const [animationDone, setAnimationDone] = useState(false)
  
  return (
    <div style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '1rem', overflow: 'hidden' }}>
      
      {/* CSS Animation */}
      <style>{`
        @keyframes driveAcross {
          0% {
            transform: translateX(100vw);
          }
          100% {
            transform: translateX(-100vw);
          }
        }
        .driving-vehicles {
          animation: driveAcross 15s linear 1 forwards;
        }
      `}</style>
      
      {/* Welcome To */}
      <h1 style={{ 
        color: 'white', 
        fontSize: '1.75rem', 
        fontWeight: 'bold', 
        marginBottom: '0.5rem' 
      }}>
        Welcome To
      </h1>
      
      {/* Drive Time Tales Logo */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        <span style={{ fontSize: '1.875rem' }}>🚛</span>
        <span style={{ fontSize: '1.875rem' }}>🚗</span>
        <span style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold',
          color: 'white',
          whiteSpace: 'nowrap'
        }}>
          Drive Time <span style={{ color: '#fb923c' }}>Tales</span>
        </span>
      </div>
      
      {/* Animated Vehicles - hidden after animation completes */}
      {!animationDone && (
        <div style={{ 
          position: 'relative', 
          height: '3rem', 
          marginBottom: '1rem',
          overflow: 'hidden',
          width: '100%'
        }}>
          <div className="driving-vehicles" onAnimationEnd={() => setAnimationDone(true)} style={{ 
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            gap: '8rem',
            top: 0
          }}>
            <span style={{ fontSize: '2.5rem' }}>🛻</span>
            <span style={{ fontSize: '2.5rem' }}>🚕</span>
            <span style={{ fontSize: '2.5rem' }}>🚚</span>
            <span style={{ fontSize: '2.5rem' }}>🚙</span>
            <span style={{ fontSize: '2.5rem' }}>🚐</span>
            <span style={{ fontSize: '2.5rem' }}>🎗️</span>
          </div>
        </div>
      )}
      
      {/* Tagline */}
      <p style={{ 
        color: '#f97316', 
        fontSize: '1.125rem', 
        fontWeight: '600',
        marginBottom: '0.5rem'
      }}>
        Start Listening To Your Free Story Now!
      </p>
      
      {/* Credits line - 3 states */}
      {credits >= 2 ? (
        // STATE 1: 2+ credits
        <p style={{ color: 'white', fontSize: '1.125rem', marginBottom: '0.25rem' }}>
          You have <span style={{ color: '#f97316', fontSize: '1.5rem', fontWeight: 'bold' }}>{credits}</span> free credits
        </p>
      ) : credits === 1 ? (
        // STATE 2: 1 credit
        <p style={{ color: 'white', fontSize: '1.125rem', marginBottom: '0.25rem' }}>
          You have <span style={{ color: '#f97316', fontSize: '1.5rem', fontWeight: 'bold' }}>1</span> free credit left
        </p>
      ) : (
        // STATE 3: 0 credits
        <p style={{ 
          color: 'white', 
          fontSize: '1.125rem', 
          marginBottom: '0.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '0.75rem', 
          flexWrap: 'wrap' 
        }}>
          You have used all your free credits
          <Link 
            href="/subscribe" 
            style={{ 
              backgroundColor: '#f97316', 
              color: 'black', 
              fontWeight: 'bold', 
              fontSize: '0.875rem', 
              paddingLeft: '1rem', 
              paddingRight: '1rem', 
              paddingTop: '0.5rem', 
              paddingBottom: '0.5rem', 
              borderRadius: '0.5rem', 
              textDecoration: 'none'
            }}
          >
            Get More Credits
          </Link>
        </p>
      )}
      
      {/* Instructions line - only show if credits > 0 */}
      {credits > 0 && (
        <p style={{ 
          color: 'white', 
          fontSize: '1rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '0.35rem', 
          flexWrap: 'wrap' 
        }}>
          Select Any 
          <span style={{ 
            backgroundColor: '#22c55e', 
            color: 'black', 
            fontWeight: 'bold', 
            fontSize: '0.75rem', 
            paddingLeft: '0.5rem', 
            paddingRight: '0.5rem', 
            paddingTop: '0.125rem', 
            paddingBottom: '0.125rem', 
            borderRadius: '0.25rem', 
            textTransform: 'uppercase' 
          }}>Free</span> 
          Story and start listening.
        </p>
      )}
      
    </div>
  )
}
