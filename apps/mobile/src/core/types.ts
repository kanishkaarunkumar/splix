export type User = { id: string; email: string; displayName: string };
export type Session = User & { sessionToken: string };
export type Group = {
  id: string;
  name: string;
  ownerId: string;
  version: number;
  archived: boolean;
  members: User[];
};
export type SplitMethod = "equal" | "percentage" | "exact" | "weighted";
export type Expense = {
  title: string;
  amountPaise: string;
  payerId: string;
  effectiveDate: string;
  category: string;
  note?: string;
  splitMethod: SplitMethod;
  participantIds: string[];
  percentages?: { userId: string; basisPoints: number }[];
  shares?: { userId: string; amountPaise: string }[];
  weights?: { userId: string; weight: number }[];
};
export type Settlement = {
  fromUserId: string;
  toUserId: string;
  amountPaise: string;
  effectiveDate: string;
};
export type FinancialEvent = {
  id: string;
  group_id: string;
  kind: "expense" | "settlement" | "reversal";
  actor_id: string;
  effective_date: string;
  recorded_at: string;
  amountPaise: string;
  title?: string;
  category?: string;
  payerId?: string;
  fromUserId?: string;
  toUserId?: string;
  shares: { userId: string; amountPaise: string }[];
  correctionOfEventId?: string;
  reversesEventId?: string;
  reason?: string;
  note?: string;
};
export type Balance = { userId: string; balancePaise: string };
export type Preset = { id: string; name: string } & Pick<
  Expense,
  "splitMethod" | "participantIds" | "weights" | "percentages" | "shares"
>;
export type Report = {
  month: string;
  categories: Record<string, string>;
  memberShares: Record<string, string>;
  openingBalances: Record<string, string>;
  closingBalances: Record<string, string>;
  settlements: FinancialEvent[];
};
export type CaptureDraft = {
  enteredTitle?: string;
  id: string;
  accountId: string;
  groupId: string;
  amountPaise: string;
  payeeLabel: string;
  observedAt: number;
  duplicateWarning: boolean;
  state:
    | "needs_review"
    | "personal"
    | "dismissed"
    | "queued"
    | "posted"
    | "needs_attention";
  committedEventId?: string;
};
export type CaptureStatus = {
  promptsEnabled?: boolean;
  sources?: string[];
  available: boolean;
  granted: boolean;
  consent: boolean;
  groupId?: string;
  expiresAt?: number;
  paused: boolean;
};
export type Mutation = {
  id: string;
  accountId: string;
  groupId: string;
  path: string;
  body: Expense | Settlement | { replacement: Expense; reason: string };
  draftId?: string;
  createdAt: number;
  state: "pending" | "sending" | "needs_attention" | "posted";
  error?: string;
  eventId?: string;
};
export type GroupSnapshot = {
  group: Group;
  balances: Balance[];
  history: FinancialEvent[];
  fetchedAt: number;
};
export type LocalState = {
  queue: Mutation[];
  snapshots: Record<string, GroupSnapshot>;
  forms: Record<
    string,
    Expense & { rawAmount?: string; rawValues?: Record<string, string> }
  >;
};
export const emptyLocal = (): LocalState => ({
  queue: [],
  snapshots: {},
  forms: {},
});
