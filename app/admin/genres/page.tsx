/*
ASC3 Genre Manager
Manage genres, view story counts by genre usage, manage author associations
*/

'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface Genre {
  id: string;
  name: string;
  color_hex?: string;
}

interface GenreAuthor {
  author_id: string;
  author_name: string;
  birth_year?: number;
  death_year?: number;
  living?: boolean;
  rank?: number;
}

interface GenreStats {
  genre_id: string;
  genre_name: string;
  primary_count: number;
  secondary_count: number;
  tertiary_count: number;
  total_count: number;
}

interface SelectedGenre {
  id: string;
  name: string;
  stats: GenreStats;
}

export default function GenreManagerPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [stats, setStats] = useState<GenreStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<SelectedGenre | null>(null);
  const [genreAuthors, setGenreAuthors] = useState<GenreAuthor[]>([]);

  // Fetch genres and stats
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch genres
        const genresRes = await fetch('/api/asc3/genres');
        const genresData = await genresRes.json();
        setGenres(genresData.data || []);

        // TODO: Fetch story count stats from database
        // For now, initialize with 0 counts
        const initialStats = (genresData.data || []).map((g: Genre) => ({
          genre_id: g.id,
          genre_name: g.name,
          primary_count: 0,
          secondary_count: 0,
          tertiary_count: 0,
          total_count: 0,
        }));
        setStats(initialStats);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching genres:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch authors for selected genre
  const handleGenreClick = async (genre: Genre) => {
    try {
      const res = await fetch(`/api/asc3/genres?id=${genre.id}`);
      const data = await res.json();

      const genreStats = stats.find((s) => s.genre_id === genre.id) || {
        genre_id: genre.id,
        genre_name: genre.name,
        primary_count: 0,
        secondary_count: 0,
        tertiary_count: 0,
        total_count: 0,
      };

      setSelectedGenre({
        id: genre.id,
        name: genre.name,
        stats: genreStats,
      });

      setGenreAuthors(
        (data.data || []).map((item: any) => ({
          author_id: item.author_id,
          author_name: item.author_name,
          birth_year: item.birth_year,
          death_year: item.death_year,
          living: item.living,
          rank: item.rank,
        }))
      );
    } catch (error) {
      console.error('Error fetching genre authors:', error);
    }
  };

  const getAuthorLifespan = (author: GenreAuthor): string => {
    if (author.living) return 'Living';
    if (author.death_year) return `† ${author.death_year}`;
    return 'Unknown';
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>
        Loading genres...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '40px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'white', margin: '0 0 10px 0' }}>
            Genre Manager
          </h1>
          <p style={{ color: 'white', opacity: 0.9, margin: '0' }}>
            Manage genres and their associated authors
          </p>
        </div>

        {/* Main Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedGenre ? '1fr 1fr' : '1fr', gap: '30px' }}>
          {/* Genre List */}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '20px' }}>
              Genres
            </h2>

            <div style={{ display: 'grid', gap: '12px' }}>
              {genres.map((genre) => {
                const genreStat = stats.find((s) => s.genre_id === genre.id);
                const isSelected = selectedGenre?.id === genre.id;

                return (
                  <button
                    key={genre.id}
                    onClick={() => handleGenreClick(genre)}
                    style={{
                      padding: '16px',
                      backgroundColor: isSelected ? '#f97316' : '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        (e.target as HTMLElement).style.backgroundColor = '#334155';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.target as HTMLElement).style.backgroundColor = '#1e293b';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ color: 'white', fontWeight: '600', margin: '0 0 4px 0' }}>
                          {genre.name}
                        </h3>
                        <p
                          style={{
                            color: 'white',
                            opacity: 0.7,
                            fontSize: '12px',
                            margin: '0',
                          }}
                        >
                          PRIMARY: {genreStat?.primary_count || 0} | 2ND: {genreStat?.secondary_count || 0} | 3RD:{' '}
                          {genreStat?.tertiary_count || 0}
                        </p>
                      </div>
                      <div
                        style={{
                          backgroundColor: genre.color_hex || '#f97316',
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genre Details Popup */}
          {selectedGenre && (
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'white', margin: '0' }}>
                  {selectedGenre.name}
                </h2>
                <button
                  onClick={() => setSelectedGenre(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'white',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  gap: '12px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                  <p style={{ color: 'white', opacity: 0.7, fontSize: '12px', margin: '0 0 4px 0' }}>PRIMARY</p>
                  <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold', margin: '0' }}>
                    {selectedGenre.stats.primary_count}
                  </p>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                  <p style={{ color: 'white', opacity: 0.7, fontSize: '12px', margin: '0 0 4px 0' }}>2ND</p>
                  <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold', margin: '0' }}>
                    {selectedGenre.stats.secondary_count}
                  </p>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                  <p style={{ color: 'white', opacity: 0.7, fontSize: '12px', margin: '0 0 4px 0' }}>3RD</p>
                  <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold', margin: '0' }}>
                    {selectedGenre.stats.tertiary_count}
                  </p>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                  <p style={{ color: 'white', opacity: 0.7, fontSize: '12px', margin: '0 0 4px 0' }}>TOTAL</p>
                  <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 'bold', margin: '0' }}>
                    {selectedGenre.stats.total_count}
                  </p>
                </div>
              </div>

              {/* Authors List */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'white', margin: '0' }}>
                    Top Authors
                  </h3>
                  <button
                    style={{
                      background: '#f97316',
                      border: 'none',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} />
                    Add Author
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {genreAuthors.length === 0 ? (
                    <p style={{ color: 'white', opacity: 0.5, textAlign: 'center', padding: '20px' }}>
                      No authors assigned yet
                    </p>
                  ) : (
                    genreAuthors.map((author, idx) => (
                      <div
                        key={author.author_id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px',
                          backgroundColor: '#0f172a',
                          borderRadius: '6px',
                        }}
                      >
                        <div>
                          <p style={{ color: 'white', fontWeight: '500', margin: '0 0 4px 0' }}>
                            #{idx + 1} {author.author_name}
                          </p>
                          <p style={{ color: 'white', opacity: 0.6, fontSize: '12px', margin: '0' }}>
                            {getAuthorLifespan(author)}
                          </p>
                        </div>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ef4444',
                            padding: '4px',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
