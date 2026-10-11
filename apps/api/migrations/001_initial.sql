CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL);
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, passwordHash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('administrator','agent','requester')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  teamId TEXT REFERENCES teams(id) ON DELETE SET NULL, createdAt TEXT NOT NULL);
CREATE TABLE sessions (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrfToken TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expiresAt);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetAt TEXT NOT NULL);
CREATE TABLE counters (kind TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counters VALUES ('incident',1000),('problem',1000),('request',1000);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES ('priorityMatrix','[[4,3,2],[3,2,2],[2,2,1]]');
CREATE TABLE tickets (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('incident','problem','request')), title TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL, subcategory TEXT, requestType TEXT,
  impact TEXT NOT NULL CHECK(impact IN ('low','medium','high')), urgency TEXT NOT NULL CHECK(urgency IN ('low','medium','high')),
  priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 4),
  status TEXT NOT NULL CHECK(status IN ('new','in_progress','waiting','resolved','closed','cancelled')),
  requesterId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigneeId TEXT REFERENCES users(id) ON DELETE SET NULL, teamId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, resolvedAt TEXT, version INTEGER NOT NULL DEFAULT 1,
  rootCause TEXT, workaround TEXT, resolution TEXT,
  CHECK(kind='request' OR requestType IS NULL), CHECK(kind='problem' OR (rootCause IS NULL AND workaround IS NULL)));
CREATE INDEX tickets_kind_status ON tickets(kind,status);
CREATE INDEX tickets_requester ON tickets(requesterId,createdAt);
CREATE INDEX tickets_assignment ON tickets(teamId,assigneeId);
CREATE INDEX tickets_created ON tickets(createdAt);
CREATE TABLE ticket_comments (id TEXT PRIMARY KEY, ticketId TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  authorId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, body TEXT NOT NULL, internal INTEGER NOT NULL CHECK(internal IN (0,1)), createdAt TEXT NOT NULL);
CREATE INDEX ticket_comments_ticket ON ticket_comments(ticketId,createdAt);
CREATE TABLE ticket_history (id TEXT PRIMARY KEY, ticketId TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actorId TEXT REFERENCES users(id) ON DELETE SET NULL, event TEXT NOT NULL, description TEXT NOT NULL, internal INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
CREATE INDEX ticket_history_ticket ON ticket_history(ticketId,createdAt);
CREATE TABLE problem_incidents (problemId TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  incidentId TEXT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE, createdAt TEXT NOT NULL, PRIMARY KEY(problemId,incidentId), CHECK(problemId != incidentId));
CREATE TRIGGER relation_kind_check BEFORE INSERT ON problem_incidents BEGIN
  SELECT CASE WHEN (SELECT kind FROM tickets WHERE id=NEW.problemId) != 'problem' OR (SELECT kind FROM tickets WHERE id=NEW.incidentId) != 'incident'
  THEN RAISE(ABORT, 'Invalid relation kinds') END;
END;
CREATE TABLE sla_policies (priority INTEGER PRIMARY KEY CHECK(priority BETWEEN 1 AND 4), responseMinutes INTEGER NOT NULL CHECK(responseMinutes > 0), resolutionMinutes INTEGER NOT NULL CHECK(resolutionMinutes > 0));
INSERT INTO sla_policies VALUES (1,15,240),(2,30,480),(3,120,1440),(4,240,4320);
CREATE TABLE sla_records (ticketId TEXT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  responseDueAt TEXT NOT NULL, resolutionDueAt TEXT NOT NULL, responseAt TEXT,
  responseMinutes INTEGER NOT NULL, resolutionMinutes INTEGER NOT NULL);
CREATE INDEX sla_deadlines ON sla_records(resolutionDueAt,responseDueAt);
CREATE TABLE automation_rules (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, event TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), thresholdPercent INTEGER NOT NULL DEFAULT 80 CHECK(thresholdPercent BETWEEN 1 AND 99));
CREATE TABLE automation_executions (id TEXT PRIMARY KEY, ruleId TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE RESTRICT,
  ticketId TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, dedupKey TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('success','failed')), message TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX automation_executions_time ON automation_executions(createdAt);
CREATE TABLE notifications (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL, ticketId TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  read INTEGER NOT NULL DEFAULT 0 CHECK(read IN (0,1)), dedupKey TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(userId,dedupKey));
CREATE INDEX notifications_user ON notifications(userId,read,createdAt);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actorId TEXT REFERENCES users(id) ON DELETE SET NULL,
  operation TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, details TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX audit_logs_time ON audit_logs(createdAt);
