-- Trigger auto-update updated_at sur appels_offres (et autres tables)
-- Sans ça, updated_at ne bouge que sur INSERT.

CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON appels_offres
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_responses
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
