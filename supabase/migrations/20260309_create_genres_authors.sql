CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color_hex VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description VARCHAR(500),
  birth_year INTEGER,
  death_year INTEGER,
  living BOOLEAN DEFAULT FALSE,
  techniques TEXT,
  audio_adaptation TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genre_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  rank INTEGER CHECK (rank >= 1 AND rank <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(genre_id, author_id)
);

CREATE INDEX idx_genres_name ON genres(name);
CREATE INDEX idx_authors_name ON authors(name);
CREATE INDEX idx_authors_living ON authors(living);

INSERT INTO genres (name, color_hex) VALUES
  ('Mystery', '#4F46E5'),
  ('Horror', '#DC2626'),
  ('Thriller', '#EA580C'),
  ('Romance', '#EC4899'),
  ('Comedy', '#FBBF24'),
  ('Drama', '#6366F1'),
  ('Sci-Fi', '#06B6D4'),
  ('Adventure', '#22C55E'),
  ('True Crime', '#8B5CF6'),
  ('Get Smarter', '#14B8A6'),
  ('Classics', '#6B7280')
ON CONFLICT (name) DO NOTHING;

INSERT INTO authors (name, description, birth_year, death_year, living, techniques, audio_adaptation) VALUES
  ('Stephen King', 'The Master of Psychological Horror', 1947, NULL, true, 'Ordinary made terrible, deep character interiority, conversational voice', 'Build dread through ambient sounds, pace dialogue'),
  ('Richard Matheson', 'The Architect of Paranoid Science Fiction', 1926, 2013, false, 'Scientific rationalization, isolation as horror', 'Maintain relentless forward momentum'),
  ('Ray Bradbury', 'The Poet of Science Fiction', 1920, 2012, false, 'Lyrical prose poetry, nostalgic melancholy', 'Narrator voice prominent, ambient soundscapes'),
  ('Roald Dahl', 'The Master of Dark Comedy', 1916, 1990, false, 'Delicious twists, dark humor, precise prose', 'Measured pace building to revelation'),
  ('O. Henry', 'The Craftsman of Surprise Endings', 1862, 1910, false, 'Surprise endings, warmth, humor with heart', 'Warm narrator, emotional twist'),
  ('Agatha Christie', 'The Queen of Mystery', 1890, 1976, false, 'Fair-play cluing, misdirection mastery', 'Plant clues, theatrical reveal'),
  ('Arthur Conan Doyle', 'The Father of Deductive Detection', 1859, 1930, false, 'Deductive revelation, Watson viewpoint', 'First-person narration, theatrical delivery'),
  ('Elmore Leonard', 'The Master of Criminal Dialogue', 1925, 2013, false, 'Invisible prose, dialogue supremacy', 'Distinctive voices, minimal narration'),
  ('Shirley Jackson', 'The Poet of Domestic Horror', 1916, 1965, false, 'Surface normality hiding horror', 'Build dread through tone shifts'),
  ('Edgar Allan Poe', 'The Father of Modern Horror', 1809, 1849, false, 'Gothic atmosphere, psychological obsession', 'Hypnotic rhythm, gothic sounds'),
  ('Raymond Chandler', 'The Voice of Hardboiled Noir', 1888, 1959, false, 'Poetic tough-talk, moral knight', 'World-weary narrator, noir atmosphere'),
  ('Rod Serling', 'The Master of the Moral Twist', 1924, 1975, false, 'Social commentary, ironic justice', 'Narrator framing, twist revelation'),
  ('Neil Gaiman', 'The Mythmaker of Modern Fantasy', 1960, NULL, true, 'Mythic resonance, fairy tale logic', 'Warm intimate narrator, magical sounds')
ON CONFLICT (name) DO NOTHING;
