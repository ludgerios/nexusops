import type { Ticket, User, Team } from '@nexusops/shared';
export type {
  Role,
  TicketKind as Kind,
  TicketStatus as Status,
  User,
  Team,
  Ticket,
  TicketComment as Comment,
  TicketHistory as History,
  TicketDetail,
  Dashboard,
  SlaPolicy as Policy,
  AutomationRule as Automation,
  AutomationExecution as Execution,
  Notification,
} from '@nexusops/shared';
export interface TicketList {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}
export type Matrix = number[][];
export interface Meta {
  users: User[];
  teams: Team[];
  categories: string[];
  priorityMatrix: Matrix;
}
