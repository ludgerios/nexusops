INSERT INTO automation_rules (id,name,description,event) VALUES
  ('critical','Incidente crítico','Notifica a equipe quando um incidente P1 é aberto.','ticket.created'),
  ('sla-near','SLA próximo do vencimento','Notifica a equipe quando o prazo atinge o percentual configurado.','sla.threshold'),
  ('sla-breach','SLA vencido','Registra auditoria e notifica a equipe quando o prazo é excedido.','sla.breached'),
  ('assignment','Atribuição de responsável','Notifica o novo responsável por um chamado.','ticket.assigned');
