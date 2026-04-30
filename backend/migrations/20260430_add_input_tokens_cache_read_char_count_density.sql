-- 20260430: add input_tokens, cache_read, char_count, token_density to test_results
ALTER TABLE test_results ADD COLUMN input_tokens INTEGER;
ALTER TABLE test_results ADD COLUMN cache_read INTEGER;
ALTER TABLE test_results ADD COLUMN char_count INTEGER;
ALTER TABLE test_results ADD COLUMN token_density FLOAT;
