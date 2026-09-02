UPDATE word_batches b
JOIN (
  SELECT
    batch_id,
    SHA2(GROUP_CONCAT(LOWER(TRIM(word)) ORDER BY position SEPARATOR '\n'), 256) AS word_hash
  FROM word_batch_items
  GROUP BY batch_id
) h ON h.batch_id = b.id
SET b.word_hash = h.word_hash
WHERE b.word_hash IS NULL;

UPDATE word_accounts a
JOIN word_batches b ON b.id = a.batch_id
SET a.word_hash = b.word_hash
WHERE a.word_hash IS NULL
  AND b.word_hash IS NOT NULL;
