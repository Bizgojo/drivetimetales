'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface Review {
  id: string;
  user_id: string;
  story_id: string;
  rating: number;
  title?: string;
  content?: string;
  created_at: string;
  user?: { display_name: string };
}

interface ReviewsProps {
  storyId: string;
  userOwnsStory?: boolean;
}

export const Reviews = ({ storyId, userOwnsStory = false }: ReviewsProps) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const userReview = reviews.find(r => r.user_id === user?.id);

  useEffect(() => { fetchReviews(); }, [storyId]);

  const fetchReviews = async () => {
    try {
      const response = await fetch(`/api/reviews?storyId=${storyId}`);
      const data = await response.json();
      if (response.ok) {
        setReviews(data.reviews);
        setAverageRating(data.averageRating);
        setTotalReviews(data.totalReviews);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    
    setSubmitting(true);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ storyId, rating: newRating, title: newTitle || null, content: newContent || null }),
      });
      if (response.ok) {
        await fetchReviews();
        setShowForm(false);
        setNewRating(5);
        setNewTitle('');
        setNewContent('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed');
      }
    } catch { alert('Failed'); } finally { setSubmitting(false); }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Delete review?')) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    
    try {
      const response = await fetch(`/api/reviews?id=${reviewId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` } });
      if (response.ok) await fetchReviews();
    } catch { alert('Failed'); }
  };

  const renderStars = (rating: number, interactive = false, onChange?: (r: number) => void) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} type="button" onClick={() => interactive && onChange?.(star)} className={`text-xl ${interactive ? 'cursor-pointer' : 'cursor-default'} text-yellow-400`} disabled={!interactive}>
          {star <= rating ? '★' : '☆'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-lg">Reviews</h3>
          {totalReviews > 0 && <div className="flex items-center gap-2"><span>{renderStars(Math.round(averageRating))}</span><span className="text-white text-sm">{averageRating} ({totalReviews})</span></div>}
        </div>
        {userOwnsStory && !userReview && !showForm && <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg">Write Review</button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmitReview} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <h4 className="text-white font-bold mb-3">Your Review</h4>
          <div className="mb-4"><label className="block text-white text-sm mb-2">Rating</label>{renderStars(newRating, true, setNewRating)}</div>
          <div className="mb-4"><label className="block text-white text-sm mb-2">Title (optional)</label><input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-orange-500"/></div>
          <div className="mb-4"><label className="block text-white text-sm mb-2">Review (optional)</label><textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"/></div>
          <div className="flex gap-3"><button type="submit" disabled={submitting} className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-medium disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit'}</button><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 text-white rounded-lg">Cancel</button></div>
        </form>
      )}

      {userReview && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-start justify-between">
            <div><p className="text-orange-400 text-xs mb-1">Your Review</p>{renderStars(userReview.rating)}{userReview.title && <p className="text-white font-medium mt-1">{userReview.title}</p>}{userReview.content && <p className="text-white text-sm mt-1">{userReview.content}</p>}</div>
            <button onClick={() => handleDeleteReview(userReview.id)} className="text-red-400 text-xs">Delete</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-4"><span className="text-white">Loading...</span></div> : reviews.filter(r => r.user_id !== user?.id).length > 0 ? (
        <div className="space-y-3">
          {reviews.filter(r => r.user_id !== user?.id).map(review => (
            <div key={review.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white text-sm font-bold">{review.user?.display_name?.charAt(0) || '?'}</div>
                <div><p className="text-white text-sm font-medium">{review.user?.display_name || 'Anonymous'}</p></div>
                <div className="ml-auto">{renderStars(review.rating)}</div>
              </div>
              {review.title && <p className="text-white font-medium">{review.title}</p>}
              {review.content && <p className="text-white text-sm mt-1">{review.content}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="text-3xl mb-2">⭐</div><p className="text-white">No reviews yet</p>
        </div>
      )}
    </div>
  );
};

export default Reviews;
