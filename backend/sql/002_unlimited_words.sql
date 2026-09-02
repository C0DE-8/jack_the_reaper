ALTER TABLE word_batches
  MODIFY word_count INT UNSIGNED NOT NULL;

ALTER TABLE word_batch_items
  MODIFY position INT UNSIGNED NOT NULL;
