-- Temporary helper for the one-time historical JSON import from the public GitHub repository.
-- Kept as a versioned migration so production schema never drifts from GitHub.
create extension if not exists http with schema extensions;
