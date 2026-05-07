export type Role = "operator" | "customer_admin" | "customer_user";

export type Profile = {
  user_id: string;
  tenant_id: string | null;
  full_name: string;
  role: Role;
  created_at: string;
};

export type Tenant = { id: string; name: string; created_at: string };

export type SKU = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  unit_of_measure: string;
  tags: string[];
  created_at: string;
};

export type Lot = {
  id: string;
  tenant_id: string;
  sku_id: string;
  lot_code: string;
  initial_qty: number;
  on_hand_qty: number;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

export type EventType =
  | "goods_received" | "goods_picked" | "goods_issued"
  | "goods_returned" | "goods_adjusted";

export type MovementEvent = {
  id: string;
  tenant_id: string;
  lot_id: string;
  event_type: EventType;
  quantity: number;
  actor_id: string | null;
  withdrawal_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  recorded_at: string;
};

export type WithdrawalStatus =
  | "requested" | "approved" | "rejected"
  | "awaiting_ack" | "acknowledged" | "released"
  | "ack_timeout" | "cancelled";

export type Withdrawal = {
  id: string;
  tenant_id: string;
  lot_id: string;
  requested_qty: number;
  requested_by: string | null;
  status: WithdrawalStatus;
  approved_by: string | null;
  approved_at: string | null;
  otp_code: string | null;
  otp_expires_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
};
