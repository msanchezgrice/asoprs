ALTER TABLE flashcards DROP CONSTRAINT IF EXISTS flashcards_status_check;
ALTER TABLE flashcards ADD CONSTRAINT flashcards_status_check CHECK (status = ANY (ARRAY['new'::text, 'learning'::text, 'mastered'::text]));;
