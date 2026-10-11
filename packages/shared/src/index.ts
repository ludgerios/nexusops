export type Role = 'administrator' | 'agent' | 'requester';
export type TicketKind = 'incident' | 'problem' | 'request';
export type TicketStatus = 'new' | 'in_progress' | 'waiting' | 'resolved' | 'closed' | 'cancelled';
export type Level = 'low' | 'medium' | 'high';
export type SlaState = 'on_track' | 'at_risk' | 'breached' | 'met' | 'missed';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  teamId: string | null;
}
export interface Team {
  id: string;
  name: string;
  description: string;
  memberCount?: number;
}
export interface Ticket {
  id: string;
  number: string;
  kind: TicketKind;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  requestType: string | null;
  impact: Level;
  urgency: Level;
  priority: number;
  status: TicketStatus;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: number;
  rootCause: string | null;
  workaround: string | null;
  resolution: string | null;
  responseDueAt: string;
  resolutionDueAt: string;
  responseAt: string | null;
  responseSlaState: SlaState;
  resolutionSlaState: SlaState;
}
export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  internal: boolean;
  createdAt: string;
}
export interface TicketHistory {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string;
  event: string;
  description: string;
  createdAt: string;
}
export interface TicketDetail {
  ticket: Ticket;
  comments: TicketComment[];
  history: TicketHistory[];
  relatedIncidents: Ticket[];
  relatedProblem: Ticket | null;
}
export interface SlaPolicy {
  priority: number;
  responseMinutes: number;
  resolutionMinutes: number;
}
export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  event: string;
  enabled: boolean;
  thresholdPercent: number;
  lastExecutedAt: string | null;
  lastResult: string | null;
}
export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  ticketId: string;
  ticketNumber: string;
  status: string;
  message: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  ticketId: string | null;
  ticketNumber: string | null;
  read: boolean;
  createdAt: string;
}
export interface Dashboard {
  metrics: {
    totalIncidents: number;
    openIncidents: number;
    resolvedIncidents: number;
    criticalIncidents: number;
    activeProblems: number;
    pendingRequests: number;
    breachedSlas: number;
    slaCompliance: number;
  };
  trend: { date: string; created: number; resolved: number }[];
  priorities: { name: string; value: number }[];
  statuses: { name: string; value: number }[];
  sla: { name: string; value: number }[];
  recentTickets: Ticket[];
}
