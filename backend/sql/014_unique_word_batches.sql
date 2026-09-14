CREATE TEMPORARY TABLE word_batch_keepers AS
SELECT
  b.word_hash,
  COALESCE(MAX(CASE WHEN a.id IS NOT NULL THEN b.id END), MIN(b.id)) AS keeper_id
FROM word_batches b
LEFT JOIN word_accounts a ON a.batch_id = b.id
WHERE b.word_hash IS NOT NULL
GROUP BY b.word_hash;

DELETE b
FROM word_batches b
JOIN word_batch_keepers k ON k.word_hash = b.word_hash
WHERE b.id <> k.keeper_id;

DROP TEMPORARY TABLE word_batch_keepers;

ALTER TABLE word_batches
  DROP INDEX idx_word_batches_word_hash,
  ADD UNIQUE KEY uniq_word_batches_word_hash (word_hash);
