import {
  type Client,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  type PartialMessage,
  type PartialGuildMember,
  type User,
} from "discord.js";
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

type DiscordMessage = Message<true>;
type DiscordInteraction = ChatInputCommandInteraction;
type MarriageRecords = Record<string, string[]>;
type MarriageMetadata = {
  marriedAt?: number;
  reason?: string;
};
type MarriageDetails = Record<string, Record<string, MarriageMetadata>>;
type MarriageConnection = {
  holderId: string;
  spouseId: string;
  metadata: MarriageMetadata;
};
type DeletedMessage = {
  content: string;
  author: User;
  timestamp: number;
};
type ConversationMessage = {
  message: DiscordMessage;
  timestamp: number;
};
type AfkEntry = {
  reason: string;
  startedAt: number;
};
type DailyActivity = {
  day: string;
  messages: number;
  curses: number;
  marriages: number;
  divorces: number;
  discordTimeMs: number;
  lastActivityAt?: number;
};
type InvoiceStatus = "APPROVED" | "REJECTED";
type InvoiceRecord = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  charge: string;
  reason: string;
  amount: number;
  status: InvoiceStatus;
  issuer: string;
  issuerId?: string;
  triggerKey?: string;
  issuedAt: number;
};
type DebtPayment = {
  amount: number;
  source: string;
  paidAt: number;
};
type DebtAccount = {
  historyId: string;
  originalDebt: number;
  amountPaid: number;
  remainingDebt: number;
  debtStartDate: string;
  consecutiveDebtDays: number;
  lastProcessedDay: string;
  lastReminderDay?: string;
  lastThreeDayConsequenceDay?: string;
  lastSevenDayConsequenceDay?: string;
  bankruptcyStatus: boolean;
  debtStatusLabel?: string;
};
type DebtHistoryRecord = {
  id: string;
  originalDebt: number;
  amountPaid: number;
  remainingDebt: number;
  startedAt: number;
  clearedAt?: number;
  payments: DebtPayment[];
};
type PersonaWebhook = {
  send(payload: {
    content: string;
    username: string;
    avatarURL: string;
    allowedMentions: { parse: [] };
  }): Promise<unknown>;
};

type CommandState = {
  protectedUsers: Map<string, number>;
  activeLocks: Map<string, keyof typeof PERSONAS>;
  setupGuilds: Set<string>;
  balances: Record<string, number>;
  marriages: MarriageRecords;
  marriageDetails: MarriageDetails;
  serverSettings: Record<string, ServerSettings>;
  activeAtmChannel: DiscordMessage["channel"] | null;
  atmTimer: ReturnType<typeof setInterval> | null;
  atmRoundsUsed: number;
  pendingWaiters: Set<() => void>;
  snipes: Map<string, DeletedMessage[]>;
  moderatorSnipes: Map<string, DeletedMessage[]>;
  conversations: Map<string, ConversationMessage[]>;
  afkUsers: Map<string, AfkEntry>;
  shushTimers: Map<string, ReturnType<typeof setTimeout>>;
  personaWebhooks: Map<string, PersonaWebhook>;
  processedMessages: Map<string, number>;
  burdens: Record<string, string[]>;
  dailyActivity: Record<string, DailyActivity>;
  marriageCounts: Record<string, number>;
  divorceCounts: Record<string, number>;
  transactions: Record<string, InvoiceRecord[]>;
  atmClaims: Record<string, number>;
  debts: Record<string, DebtAccount>;
  debtHistory: Record<string, DebtHistoryRecord[]>;
  knownUsers: Map<string, User>;
  userChannels: Map<string, DiscordMessage["channel"]>;
  debtTimer: ReturnType<typeof setInterval> | null;
};

type CommandFeatures = {
  handleMessage(message: DiscordMessage): Promise<void>;
  handleInteraction(interaction: DiscordInteraction): Promise<void>;
  handleDelete(message: Message | PartialMessage): void;
  handleMemberJoin(member: GuildMember): Promise<void>;
  handleMemberRemove(member: GuildMember | PartialGuildMember): Promise<void>;
  cleanup(): void;
};

type ServerSettings = {
  jailId?: string;
  prisonerRoleId?: string;
  modTestId?: string;
  freshDisappointmentId?: string;
  badbyesId?: string;
  welcomeMsg?: string;
  byeMsg?: string;
};

const PREFIX = ".";
const DISCORD_MESSAGE_LIMIT = 2_000;
const DISCORD_SAFE_MESSAGE_LIMIT = 1_900;
const PROTECTION_DURATION = 24 * 60 * 60 * 1000;
const DEDUPE_WINDOW = 10 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const SHUSH_DURATION = 5 * 60 * 1000;
const MAX_SNIPE_COUNT = 30;
const MAX_MODERATOR_SNIPE_COUNT = 100;
const ACTION_GIF_COMMANDS = new Set([
  "unbirth",
  "birth",
  "pushing",
  "spank",
  "smack",
  "read",
  "kidnap",
  "feed",
  "choke_on_dick",
  "kiss",
  "tear",
  "eat",
  "cum",
  "gem",
  "beat",
  "beats",
  "stab",
  "slap",
  "pull",
  "castrate",
  "warn",
  "crush",
  "destroy",
  "execute",
  "hang",
  "shoot",
  "tantrum",
  "magic",
  "dance",
  "oh no",
]);
const ACTION_GIF_URLS: Record<string, string> = {
  unbirth: "https://klipy.com/gifs/pregnant-pregnancy-23",
  birth: "https://klipy.com/gifs/jason-lee-confused",
  pushing: "https://klipy.com/gifs/911-tv-show-madney-1",
  spank: "https://klipy.com/gifs/smack-27",
  smack: "https://klipy.com/gifs/shut-up-shut-3",
  read: "https://klipy.com/gifs/how-to-kill-2",
  kidnap: "https://klipy.com/gifs/kill-4",
  feed: "https://klipy.com/gifs/cat-milk-17",
  choke_on_dick: "https://klipy.com/gifs/mask-choke",
  kiss: "https://klipy.com/gifs/shaquille-o-neal-kiss",
  tear: "https://klipy.com/gifs/ripping-shirt-2",
  eat: "https://cdn.greed.best/img2gif/cbad98c0-58b2-42c7-be20-03b097ef9bbf.gif",
  cum: "https://cdn.discordapp.com/attachments/1289073986117828628/1300734271467814912/attachment.gif",
  gem: "https://klipy.com/gifs/gem-alert-pjberriboi",
  beat: "https://klipy.com/gifs/little-child",
  beats: "https://klipy.com/gifs/love-you-4314",
  stab: "https://klipy.com/gifs/spongebob-stab",
  slap: "https://klipy.com/gifs/slp-baba",
  pull: "https://klipy.com/gifs/japan-monkey",
  castrate: "https://klipy.com/gifs/birth-control-Pbc",
  warn: "https://klipy.com/gifs/hasbulla-hasbik-10",
  crush: "https://klipy.com/gifs/apple-crush",
  destroy: "https://klipy.com/gifs/destroy-17",
  execute: "https://klipy.com/gifs/get-rekt-boi-elmo",
  hang: "https://klipy.com/gifs/dinosolostan",
  shoot: "https://klipy.com/gifs/gun-shotgun-4",
  tantrum: "https://klipy.com/gifs/mad-tantrum-5",
  magic: "https://klipy.com/gifs/prayer-circle-ritual",
  dance: "https://klipy.com/gifs/peppa-pig-pig-peppa",
  "oh no": "https://klipy.com/gifs/wtf-george",
};
const ACTION_GIF_VERBS: Record<string, string> = {
  unbirth: "unbirthed",
  birth: "birthed",
  pushing: "pushed",
  spank: "spanked",
  smack: "smacked",
  read: "read",
  kidnap: "kidnapped",
  feed: "fed",
  choke_on_dick: "choked",
  kiss: "kissed",
  tear: "tore",
  eat: "ate",
  cum: "came on",
  gem: "used a gem on",
  beat: "beat",
  beats: "beat",
  stab: "stabbed",
  slap: "slapped",
  pull: "pulled",
  castrate: "castrated",
  warn: "warned",
  crush: "crushed",
  destroy: "destroyed",
  execute: "executed",
  hang: "hung",
  shoot: "shot",
  tantrum: "threw a tantrum at",
  magic: "used magic on",
  dance: "danced with",
  "oh no": "said oh no to",
};
const SUPPORTED_COMMANDS = new Set([
  "unhello",
  "court",
  "mental_stability",
  "mental",
  "bitch_meter",
  "bitch",
  "dora",
  "boots",
  "barney",
  "add",
  "remove",
  "protect",
  "hamoud",
  "botserver",
  "jail",
  "unjail",
  "teach",
  "atm",
  "set_atm_channel",
  "balance",
  "bal",
  "debt",
  "marry",
  "marriage",
  "single_card",
  "married",
  "married_card",
  "reason",
  "s",
  "cs",
  "c",
  "purge",
  "mod",
  "afk",
  "shush",
  "unshush",
  "forcemarry",
  "forcedivorce",
  "burden",
  "unburden",
  "steal",
  "unsteal",
  "apologize",
  ...ACTION_GIF_COMMANDS,
]);

const AVAILABLE_SLASH_COMMANDS = [
  "set_the_fuck_up",
  "set_atm_channel",
  "invoice",
  "debt",
  "teach",
  "jail",
  "unjail",
  "view",
  "dora",
  "boots",
  "add",
  "remove",
  "protect",
  "setwelc",
  "setleave",
  "testwelc",
  "testleave",
] as const;

const SPECIAL_CHAT_REPLIES: Record<string, Record<string, string>> = {
  ray91_c: {
    "my worst creation": "Fuck you❤️❤️\nhttps://klipy.com/gifs/pepe-xZX",
  },
  kaiiiii345_21293: {
    oh: "Fu…..fu…..fu……Fuck you❤️!\nhttps://klipy.com/gifs/uwu-46",
  },
};

const DATABASE_FILE = process.env["DISCORD_BOT_DATA_FILE"] ?? "bot_database.json";
const ATM_MAX_CLAIMS_PER_USER = 3;
const DAILY_CURSE_THRESHOLD = 100;
const DAILY_MESSAGE_THRESHOLD = 200;
const MARRIAGE_INVOICE_THRESHOLD = 10;
const DIVORCE_INVOICE_THRESHOLD = 5;
const DISCORD_SITTING_FEE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const DISCORD_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const DISCORD_SITTING_FEE_AMOUNT = 30;
const BANKRUPTCY_THRESHOLD = 100;
const DEBT_PROCESS_INTERVAL = 60 * 60 * 1000;
const CURSE_PATTERN = /\b(?:asshole|bastard|bitch|bullshit|cock|cunt|damn|dick|fag|fuck|fucking|hell|hoe|motherfucker|shit|slut|whore)\b/gi;
const AUTOMATED_INVOICE_ISSUER = "Automated System";

type BotData = {
  balances: Record<string, number>;
  marriages: MarriageRecords;
  marriage_details?: MarriageDetails;
  burdens?: Record<string, string[]>;
  atm_rounds_used?: number;
  atm_claims?: Record<string, number>;
  daily_activity?: Record<string, DailyActivity>;
  marriage_counts?: Record<string, number>;
  divorce_counts?: Record<string, number>;
  transactions?: Record<string, InvoiceRecord[]>;
  debts?: Record<string, DebtAccount>;
  debt_history?: Record<string, DebtHistoryRecord[]>;
  server_settings?: Record<string, ServerSettings>;
};

const DEFAULT_BOT_DATA: BotData = {
  balances: {},
  marriages: {},
  marriage_details: {},
  burdens: {},
  atm_rounds_used: 0,
  atm_claims: {},
  daily_activity: {},
  marriage_counts: {},
  divorce_counts: {},
  transactions: {},
  debts: {},
  debt_history: {},
  server_settings: {},
};

function normalizeMarriageDetails(value: unknown): MarriageDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const details: MarriageDetails = {};
  for (const [holderId, holderDetails] of Object.entries(value)) {
    if (!holderDetails || typeof holderDetails !== "object" || Array.isArray(holderDetails)) {
      continue;
    }
    const normalized: Record<string, MarriageMetadata> = {};
    for (const [spouseId, metadata] of Object.entries(holderDetails)) {
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
      const candidate = metadata as { marriedAt?: unknown; reason?: unknown };
      const entry: MarriageMetadata = {};
      if (typeof candidate.marriedAt === "number" && Number.isFinite(candidate.marriedAt)) {
        entry.marriedAt = candidate.marriedAt;
      }
      if (typeof candidate.reason === "string" && candidate.reason.trim().length > 0) {
        entry.reason = candidate.reason;
      }
      normalized[spouseId] = entry;
    }
    if (Object.keys(normalized).length > 0) details[holderId] = normalized;
  }
  return details;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, candidate]) =>
        typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      )
      .map(([key, candidate]) => [key, Math.floor(candidate as number)]),
  );
}

function normalizeDailyActivity(value: unknown): Record<string, DailyActivity> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const activity: Record<string, DailyActivity> = {};
  for (const [userId, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entry = candidate as Partial<DailyActivity>;
    if (typeof entry.day !== "string") continue;
    activity[userId] = {
      day: entry.day,
      messages: typeof entry.messages === "number" && Number.isFinite(entry.messages)
        ? Math.floor(Math.max(0, entry.messages))
        : 0,
      curses: typeof entry.curses === "number" && Number.isFinite(entry.curses)
        ? Math.floor(Math.max(0, entry.curses))
        : 0,
      marriages: typeof entry.marriages === "number" && Number.isFinite(entry.marriages)
        ? Math.floor(Math.max(0, entry.marriages))
        : 0,
      divorces: typeof entry.divorces === "number" && Number.isFinite(entry.divorces)
        ? Math.floor(Math.max(0, entry.divorces))
        : 0,
      discordTimeMs: typeof entry.discordTimeMs === "number" &&
          Number.isFinite(entry.discordTimeMs)
        ? Math.floor(Math.max(0, entry.discordTimeMs))
        : 0,
      ...(typeof entry.lastActivityAt === "number" &&
        Number.isFinite(entry.lastActivityAt)
        ? { lastActivityAt: entry.lastActivityAt }
        : {}),
    };
  }
  return activity;
}

function normalizeDebtAccounts(value: unknown): Record<string, DebtAccount> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const debts: Record<string, DebtAccount> = {};
  for (const [userId, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entry = candidate as Partial<DebtAccount>;
    if (
      typeof entry.historyId !== "string" ||
      typeof entry.originalDebt !== "number" ||
      typeof entry.amountPaid !== "number" ||
      typeof entry.remainingDebt !== "number" ||
      typeof entry.debtStartDate !== "string"
    ) {
      continue;
    }
    const remainingDebt = Math.min(
      BANKRUPTCY_THRESHOLD,
      Math.max(0, Math.floor(entry.remainingDebt)),
    );
    if (remainingDebt <= 0) continue;
    debts[userId] = {
      historyId: entry.historyId,
      originalDebt: Math.max(remainingDebt, Math.floor(entry.originalDebt)),
      amountPaid: Math.max(0, Math.floor(entry.amountPaid)),
      remainingDebt,
      debtStartDate: entry.debtStartDate,
      consecutiveDebtDays: Math.max(1, Math.floor(entry.consecutiveDebtDays ?? 1)),
      lastProcessedDay: typeof entry.lastProcessedDay === "string"
        ? entry.lastProcessedDay
        : entry.debtStartDate,
      ...(typeof entry.lastReminderDay === "string"
        ? { lastReminderDay: entry.lastReminderDay }
        : {}),
      ...(typeof entry.lastThreeDayConsequenceDay === "string"
        ? { lastThreeDayConsequenceDay: entry.lastThreeDayConsequenceDay }
        : {}),
      ...(typeof entry.lastSevenDayConsequenceDay === "string"
        ? { lastSevenDayConsequenceDay: entry.lastSevenDayConsequenceDay }
        : {}),
      bankruptcyStatus: Boolean(entry.bankruptcyStatus) ||
        remainingDebt >= BANKRUPTCY_THRESHOLD,
      ...(typeof entry.debtStatusLabel === "string" && entry.debtStatusLabel.length > 0
        ? { debtStatusLabel: entry.debtStatusLabel }
        : {}),
    };
  }
  return debts;
}

function normalizeDebtHistory(value: unknown): Record<string, DebtHistoryRecord[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const history: Record<string, DebtHistoryRecord[]> = {};
  for (const [userId, candidate] of Object.entries(value)) {
    if (!Array.isArray(candidate)) continue;
    history[userId] = candidate.flatMap(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Partial<DebtHistoryRecord>;
      if (
        typeof entry.id !== "string" ||
        typeof entry.originalDebt !== "number" ||
        typeof entry.amountPaid !== "number" ||
        typeof entry.remainingDebt !== "number" ||
        typeof entry.startedAt !== "number"
      ) {
        return [];
      }
      const payments = Array.isArray(entry.payments)
        ? entry.payments.flatMap(payment => {
          if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
          const candidatePayment = payment as Partial<DebtPayment>;
          return typeof candidatePayment.amount === "number" &&
              typeof candidatePayment.source === "string" &&
              typeof candidatePayment.paidAt === "number"
            ? [{
              amount: Math.max(0, candidatePayment.amount),
              source: candidatePayment.source,
              paidAt: candidatePayment.paidAt,
            }]
            : [];
        })
        : [];
      return [{
        id: entry.id,
        originalDebt: Math.max(0, entry.originalDebt),
        amountPaid: Math.max(0, entry.amountPaid),
        remainingDebt: Math.max(0, entry.remainingDebt),
        startedAt: entry.startedAt,
        ...(typeof entry.clearedAt === "number" ? { clearedAt: entry.clearedAt } : {}),
        payments,
      }];
    });
  }
  return history;
}

function normalizeTransactions(value: unknown): Record<string, InvoiceRecord[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const transactions: Record<string, InvoiceRecord[]> = {};
  for (const [userId, candidate] of Object.entries(value)) {
    if (!Array.isArray(candidate)) continue;
    transactions[userId] = candidate.flatMap(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Partial<InvoiceRecord>;
      if (
        typeof entry.id !== "string" ||
        typeof entry.userId !== "string" ||
        typeof entry.username !== "string" ||
        typeof entry.charge !== "string" ||
        typeof entry.reason !== "string" ||
        typeof entry.amount !== "number" ||
        !Number.isFinite(entry.amount) ||
        typeof entry.issuedAt !== "number" ||
        !Number.isFinite(entry.issuedAt)
      ) {
        return [];
      }
      const status = entry.status === "REJECTED" ? "REJECTED" : "APPROVED";
      return [{
        id: entry.id,
        userId: entry.userId,
        username: entry.username,
        avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : "",
        charge: entry.charge,
        reason: entry.reason,
        amount: entry.amount,
        status,
        issuer: typeof entry.issuer === "string" && entry.issuer.length > 0
          ? entry.issuer
          : AUTOMATED_INVOICE_ISSUER,
        ...(typeof entry.issuerId === "string" ? { issuerId: entry.issuerId } : {}),
        ...(typeof entry.triggerKey === "string" ? { triggerKey: entry.triggerKey } : {}),
        issuedAt: entry.issuedAt,
      }];
    });
  }
  return transactions;
}

function loadBotData(): BotData {
  if (!existsSync(DATABASE_FILE)) {
    return {
      balances: {},
      marriages: {},
      marriage_details: {},
      burdens: {},
      atm_rounds_used: 0,
      atm_claims: {},
      daily_activity: {},
      marriage_counts: {},
      divorce_counts: {},
      transactions: {},
      debts: {},
      debt_history: {},
    };
  }

  const parsed: unknown = JSON.parse(readFileSync(DATABASE_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Discord bot data file must contain an object: ${DATABASE_FILE}`);
  }
  const data = parsed as Partial<BotData> & {
    marriages?: Record<string, string | string[]>;
    marriage_details?: unknown;
  };
  if (
    !data.balances ||
    typeof data.balances !== "object" ||
    Array.isArray(data.balances) ||
    !data.marriages ||
    typeof data.marriages !== "object" ||
    Array.isArray(data.marriages)
  ) {
    throw new Error(`Discord bot data file has an invalid shape: ${DATABASE_FILE}`);
  }

  return {
    balances: Object.fromEntries(
      Object.entries(data.balances).filter(([, value]) => typeof value === "number"),
    ),
    marriages: Object.fromEntries(
      Object.entries(data.marriages).flatMap(([holderId, spouses]) => {
        const normalized = typeof spouses === "string"
          ? [spouses]
          : Array.isArray(spouses)
            ? spouses.filter((spouseId): spouseId is string => typeof spouseId === "string")
            : [];
        return normalized.length > 0 ? [[holderId, normalized]] : [];
      }),
    ),
    marriage_details: normalizeMarriageDetails(data.marriage_details),
    burdens: Object.fromEntries(
      Object.entries(data.burdens ?? {})
        .filter(([, value]) => Array.isArray(value))
        .map(([parentId, children]) => [
          parentId,
          children.filter((childId): childId is string => typeof childId === "string"),
        ]),
    ),
    atm_rounds_used: typeof data.atm_rounds_used === "number" &&
      Number.isFinite(data.atm_rounds_used) &&
      data.atm_rounds_used > 0
      ? Math.floor(data.atm_rounds_used)
      : 0,
    atm_claims: normalizeNumberRecord(data.atm_claims),
    daily_activity: normalizeDailyActivity(data.daily_activity),
    marriage_counts: normalizeNumberRecord(data.marriage_counts),
    divorce_counts: normalizeNumberRecord(data.divorce_counts),
    transactions: normalizeTransactions(data.transactions),
    debts: normalizeDebtAccounts(data.debts),
    debt_history: normalizeDebtHistory(data.debt_history),
    server_settings: data.server_settings && typeof data.server_settings === "object"
      ? data.server_settings
      : {},
  };
}

function saveBotData(data: BotData): void {
  const temporaryFile = `${DATABASE_FILE}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(temporaryFile, DATABASE_FILE);
}

function teachMeFunction(): string {
  return (
    "🤖 **Bot Commands Guide**\n\n" +
    "**💰 Economy & Debt**\n" +
    "• `.set_atm_channel` - Set the daily ATM channel.\n" +
    "• `.atm` - Drop $5-$100; each user can claim up to 3 drops with `.inter the sting` within 60s. $5-$30 drops are more common.\n" +
    "• `.balance` / `.bal [@user]` - Check wallet balance.\n" +
    "• `/invoice @user reason:<text>` - Admin-only manual invoice; random $1-$5 fine with 50/50 approval.\n" +
    "• `/debt @user` - View debt, payments, remaining balance, status, labels, and debt days.\n" +
    "• Automatic invoices: 100 curses → Terrible Mouth; 200 messages → Excessive Yapping; 10 marriages → Delusion Tax; 5 divorces → Relationship Felony; 2+ hours activity → $30 Discord Sitting Fee. Each triggers once/day.\n" +
    "• Debt: Earnings and ATM payouts pay debt first. 3 days → warning/marriage action; 7 days → reset + Irresponsible Debt; $100 → BANKRUPT.\n\n" +
    "**💍 Marriage & Family**\n" +
    "• `.marry @user` - Marry someone.\n" +
    "• `.marriage` - Show the family tree.\n" +
    "• `.single_card` - Draw a single-user card if unmarried.\n" +
    "• `.married card` / `.married_card` - Show your marriage card.\n" +
    "• `.reason [up to 10 words]` - Set your marriage reason.\n" +
    "• `.forcemarry @user1 @user2` - Attempt to force a marriage.\n" +
    "• `.forcedivorce @user1 @user2` - Force divorce.\n" +
    "• `.burden @user` - Ask for adoption approval within 60s.\n" +
    "• `.unburden @user` - Remove an adopted child from the family tree.\n" +
    "• `.steal @user` - Attempt to steal a partner.\n" +
    "• `.unsteal @stealer` - Try to get your partner back.\n" +
    "• `.apologize @stealer [text]` - Bribe/apologize to get your partner back.\n\n" +
    "**🗑️ Moderation & Messages**\n" +
    "• `.s` - Show up to 30 recent deleted messages.\n" +
    "• `.cs` - Clear the public snipe list.\n" +
    "• `.mod` - Show the deleted-message log, even after `.cs`.\n" +
    "• `.c` - Clear tracked messages from the last 10 minutes.\n" +
    "• `.purge [1-100]` - Delete 1-100 recent messages.\n\n" +
    "• `.afk [reason]` - Set an AFK reason and show a return-time message when you speak again.\n" +
    "• `.shush @user` / `.unshush @user` - Shush/restore a member for 5 minutes.\n" +
    "• `.jail @user [reason]` / `.unjail @user` - Restrict/release a member through the prisoner channel.\n\n" +
    "**🎭 Personas & Character Modes**\n" +
    "• `.add @user [persona]` - Lock a user into tsundere, yandere, bakadere, sadodere, or uwu mode.\n" +
    "• `.remove @user` - Remove a persona lock.\n" +
    "• `.protect @user` - Grant 24h immunity.\n\n" +
    "**🧠 User Stats**\n" +
    "• `.mental` / `.mental_stability` - Check mental stability score.\n" +
    "• `.bitch` / `.bitch_meter` - Calculate bitch percentage.\n\n" +
    "**🎪 Fun & Characters**\n" +
    "• `.dora blessings [question]` - Ask Dora for guidance.\n" +
    "• `.boots @user [task]` - Assign a Boots task.\n" +
    "• `.barney says` - Barney says something random with a GIF.\n" +
    "• `.hamoud habibi` - Send a Hamoud GIF.\n" +
    "• `.court @user [accuse]` - Put a user on trial.\n" +
    "• `.unhello` - Send a judging judge GIF.\n" +
    "• `.botserver` - Share the bot server invite.\n\n" +
    "**🎬 Action GIFs**\n" +
    "`.unbirth` • `.birth` • `.pushing` • `.spank` • `.smack` • `.read` • `.kidnap` • `.feed` • `.choke_on_dick` • `.kiss` • `.tear` • `.eat` • `.cum` • `.gem` • `.beat` • `.beats` • `.stab` • `.slap` • `.pull` • `.castrate` • `.warn` • `.crush` • `.destroy` • `.execute` • `.hang` • `.shoot` • `.tantrum` • `.magic` • `.dance` • `.oh no`."
  );
}

const FORCE_MARRIAGE_REASONS = [
  "Two red flags have finally found their matching emergency.",
  "Nobody wanted either of you, so the bot had to intervene.",
  "Because apparently one bad decision wasn't enough.",
  "Congratulations. You found someone with equally questionable standards.",
  "The server has decided you two deserve each other. Tragic.",
  "Your combined stupidity would be irresponsible to leave unsupervised.",
  "Because your love life needed a hostile takeover.",
  "The matchmaking algorithm has officially stopped trying.",
  "You’re both unbearable. Might as well be unbearable together.",
  "The bot saw your personalities and chose mutual suffering.",
  "Congratulations. Your standards have finally met their natural limit.",
];

const FORCE_DIVORCE_REASONS = [
  "The relationship has been classified as a server-wide inconvenience.",
  "You two lasted longer than expected. Unfortunately.",
  "The love is gone. The irritation remains.",
  "Your relationship has officially been discontinued due to poor performance.",
  "Even the bot is tired of watching you two argue.",
  "You don’t need couples therapy. You need separate zip codes.",
  "The server has reviewed your relationship and recommends immediate separation.",
  "Your relationship has expired. Please dispose of it responsibly.",
  "You two went from soulmates to mutual fucking headaches.",
  "The romance died. The arguments held a funeral and kept going.",
  "Congratulations on turning affection into a competitive sport.",
  "The bot has decided you’ve suffered enough. Separately, preferably.",
];

const BURDEN_REASONS = [
  "Congratulations. You’ve been assigned a child because apparently you need supervision.",
  "You failed adulthood, so here’s another responsibility.",
  "A new burden has been assigned. Try not to emotionally damage it.",
  "Because your life was apparently too peaceful.",
  "The server has decided you need character development. Against your will.",
  "Congratulations, you’re now responsible for another little shit.",
  "You clearly needed more problems. Here’s one with a smaller hitbox.",
  "Your new responsibility has arrived. No refunds, no exchanges.",
  "You can barely raise your IQ, but congratulations on the child.",
  "Apparently God wasn’t testing you hard enough.",
  "You have been assigned a dependent. Good luck, dumbass.",
];

const BOOTS_REASONS = [
  "Couldn’t dick enough",
  "Dicking failed",
  "The dicks are sleeping",
  "Because apparently being annoying wasn’t a full-time job.",
  "Congratulations. You’ve been promoted to unpaid server labor.",
  "Consider this community service for being fucking annoying.",
  "The server has identified your only useful skill: being available.",
  "Mandatory character development has been assigned.",
  "You’ve been assigned a task because doing nothing was getting embarrassing.",
  "Since you clearly have nothing better to do, suffer productively.",
  "The bot needed someone disposable. Congratulations.",
  "You have been selected for unpaid employment. Democracy is dead.",
  "Apparently your free time was being wasted, so we fixed that.",
  "You’re not busy enough, and unfortunately that’s now everyone’s problem.",
];

const DORA_REASONS = [
  "Got caught trying to flirt and failed miserably.",
  "Spreading absolute nonsense across the server.",
  "Was spotted hiding in the bushes doing absolutely nothing productive.",
  "Trying to look cool while completely embarrassing themselves.",
  "Spreading rumors about their own non-existent social life.",
];

const BARNEY_RESPONSES = [
  ["“Gay gay gay.”", "https://klipy.com/gifs/ourfriendbarney-barney-the-dinosaur"],
  ["“Beat beat beat.”", "https://klipy.com/gifs/barney-dinosaur-2"],
  ["“Dance dance dance”", "https://klipy.com/gifs/barney-barney-the-dinosaur-4"],
  ["“Barni hates you, but here’s me”", "https://klipy.com/gifs/riff-thinking"],
  ["“hug hug hug”", "https://klipy.com/gifs/barney-and-friends-hug"],
  ["“Sing sing sing”", "https://klipy.com/gifs/barney-barney-the-dinosaur"],
  ["“bing bing bing”", "https://klipy.com/gifs/hola-165"],
  ["“He offers you pistachios”", "https://klipy.com/gifs/barney-the-dinosaur-would-you-like-a-pistachio"],
  ["“again?”", "https://klipy.com/gifs/barney-the-dinosaur-barney-and-friends"],
  ["“oh u tuned to…black”", "https://klipy.com/gifs/barney-plush-train9"],
  ["“I eat kids”", "https://klipy.com/gifs/barney-dinosaur-3"],
];

const DORA_BLESSINGS_RESPONSES = [
  "Got it! Dicking for an answer\nDidn’t don’t it, search for your dignity instead",
  "Got it! Dicking for an answer\nWish I could find it as fast as u drop your pants",
  "Got it! Dicking for an answer\nUp in your ass",
  "Got it! Dicking for an answer\nIt isn’t there like your existence",
  "Got it! Dicking for an answer\nAsk who went to bring milk\nDad? DAD! Can u say day?",
];
const DORA_BLESSINGS_GIF = "https://klipy.com/gifs/dontworryillwait-whatelse-1";

function randomDoraBlessing(): string {
  return `${randomItem(DORA_BLESSINGS_RESPONSES)}\n${DORA_BLESSINGS_GIF}`;
}

const TRIVIA_QUESTIONS = [
  { question: "What is 2 + 2?", answer: "4" },
  { question: "What color is a clear sky during the day? (Type: blue)", answer: "blue" },
  { question: "Is Python a programming language or a snake? Type 'both' or 'language'", answer: "language" },
  { question: "What is the capital of France?", answer: "paris" },
  { question: "Solve: 5 * 5 - 5", answer: "20" },
  { question: "Name the color you get by mixing red and white. (Type: pink)", answer: "pink" },
  { question: "Hard Question: What is the exact value of Pi rounded to 2 decimal places?", answer: "3.14" },
];

const PERSONAL_DM_TARGETS = {
  dora: {
    name: "nora_123q",
    message: "Hello from Dora! 🎒✨",
    success: "✅ Dora DM sent to nora_123q!",
    failure: "❌ Could not send DM to nora_123q (DMs might be closed).",
    missing: "❌ User `nora_123q` not found in bot's visible cache/guilds.",
  },
  boots: {
    name: "snowyswirls",
    message: "Boots says hi! 🐒🥾",
    success: "✅ Boots DM sent to snowyswirls!",
    failure: "❌ Could not send DM to snowyswirls (DMs might be closed).",
    missing: "❌ User `snowyswirls` not found in bot's visible cache/guilds.",
  },
} as const;

const PERMANENTLY_PROTECTED_USERS = new Set([
  "1252998519178924035",
  "1428977057253032007",
]);

const PERSONA_TRANSLATION_EXEMPT_NAMES = new Set([
  "ray91_c",
  "kaiiiii345_21293",
  "Ray",
]);
const SPECIAL_MARRIAGE_LIMITS: Record<string, number> = {
  ray91_c: 11,
  kaiiiii345_21293: 10,
};

const AFFAIR_REASONS = [
  "Seems you drop your pants faster than your morals.",
  "Your loyalty has a shorter lifespan than your self-control.",
  "Apparently 'committed' was just a temporary setting.",
  "Your morals clock out the second temptation walks in.",
  "You treat loyalty like a free trial.",
  "You had one job: keep your promises and your pants on.",
  "Loyalty left the chat before you did.",
  "You saw temptation and apparently treated it like a side quest.",
  "The pants came off. The standards went with them.",
  "You managed to cheat on someone and still embarrass yourself. Impressive.",
];

const SINGLE_NICKNAMES = [
  "Professional Third Wheel",
  "Certified Lonely Entity",
  "Walking Red Flag",
  "Main Character in a Tragedy",
  "Depressed Spectator",
];

const PERSONAS = {
  tsundere: {
    okay: "“O-Okay! But don’t think I’m doing this because I like you or anything!”",
    yes: "“Y-Yes! Obviously! Why are you making me say it?!”",
    no: "“N-No! Obviously not, idiot!”",
    sure: "“F-Fine! Whatever! I guess I can do that.”",
    thanks: "“T-Thanks… I guess. Don’t expect me to say it again.”",
    sorry: "“F-Fine, I’m sorry! Happy now?!”",
    please: "“P-Please! I-I’m actually asking nicely!”",
    hello: "“H-Hey! Don’t stare at me like that!”",
    bye: "“F-Fine! Go then! It’s not like I wanted you to stay!”",
    "really?": "“R-Really?! You actually mean that?!”",
    fine: "“F-Fine! Have it your way!”",
    wait: "“W-Wait! Don’t just leave!”",
    "come here": "“G-Get over here! I-I need to tell you something!”",
    "i know": "“I-I know already! You don’t have to tell me everything!”",
    "i don’t know": "“H-How should I know?! Stop asking me!”",
    maybe: "“M-Maybe… I-I mean, it’s not like I’ve decided yet!”",
    whatever: "“W-Whatever! Do whatever you want, then!”",
    good: "“I-I guess that was pretty good… Don’t get proud!”",
    cute: "“C-Cute?! Who said you were cute?! I didn’t!”",
    "love you": "“I-I… l-love you too, okay?! You happy now, idiot?!”",
    lol: "“D-Don’t laugh! It wasn’t even that funny!”",
    "shut up": "“S-Shut up, idiot! You’re so annoying!”",
    what: "“W-What?! Why are you looking at me like that?!”",
    bro: "“B-Bro?! Don’t call me that!”",
    bruh: "“B-Bruh?! Seriously?!”",
    wtf: "“What the hell are you doing?!”",
    "come on": "“C-Come on! Hurry up already!”",
    goodnight: "“G-Goodnight… Don’t stay up too late, idiot.”",
    bitch: "“I-IDIOT!!”",
    hoe: "“W-What kind of person even says that?!”",
    fat: "“D-Don’t you dare say that about yourself!”",
    why: "“W-Why?! Why do you even care?!”",
    stop: "“S-Stop it, idiot!”",
    never: "“N-Never! Absolutely not!”",
    kill: "“D-Don’t be ridiculous!”",
    whore: "“W-Watch your mouth!”",
    meow: "“M-Meow?! I’m not doing that!”",
    satwp: "“S-SATWP?! What the hell is that supposed to mean?!”",
    remove: "“F-Fine! Get rid of it then!”",
    it: "“T-That thing! You know what I mean!”",
    pls: "“P-Please…? Ugh, fine!”",
    and: "“A-And?! What about it?!”",
  },
  yandere: {
    okay: "“Of course, darling. Whatever you want.”",
    yes: "“Yes, my love. Always.”",
    no: "“No, darling. You don’t need that.”",
    sure: "“Of course. I’d do anything for you.”",
    thanks: "“You’re welcome, darling. Anything for you.”",
    sorry: "“You don’t have to apologize. I could never stay angry at you.”",
    please: "“You never have to beg me. Just ask.”",
    hello: "“There you are, darling. I was waiting for you.”",
    bye: "“Leaving already, darling? I’ll be waiting for you.”",
    "really?": "“Really? You mean that? Tell me again. I like hearing it from you.”",
    fine: "“If that’s what you want, darling.”",
    wait: "“Wait for me, darling. Don’t go anywhere without me.”",
    "come here": "“Come here, darling. I want you closer.”",
    "i know": "“I know, darling. I always know what you’re doing.”",
    "i don’t know": "“I don’t know… but I’ll find out for you.”",
    maybe: "“Maybe… but I’d rather you choose me.”",
    whatever: "“Whatever you want, darling. As long as you stay with me.”",
    good: "“Good. That’s exactly what I wanted to hear.”",
    cute: "“Cute? You’re adorable when you try to hide your feelings from me.”",
    "love you": "“I love you too, darling. More than you could ever understand.”",
    lol: "“Hehe… I’m glad you’re having fun, darling.”",
    "shut up": "“You can tell me to be quiet, darling. I’ll still be listening.”",
    what: "“What is it, darling? You have my full attention.”",
    bro: "“Bro? I thought I was a little more special to you.”",
    bruh: "“Hehe… you’re adorable when you’re confused.”",
    wtf: "“Something wrong, darling? Tell me everything.”",
    "come on": "“Come with me, darling. Stay close.”",
    goodnight: "“Goodnight, darling. Don’t forget about me while you sleep.”",
    bitch: "“How unpleasant… but I suppose I can tolerate you, darling.”",
    hoe: "“Such a vulgar little thing…”",
    fat: "“Shh, darling. You don't need to worry about anything.”",
    why: "“Why? Because I care about you, of course.”",
    stop: "“Please don’t make me ask twice, darling.”",
    never: "“Never? Then I suppose I’ll make sure you never have to.”",
    kill: "“How extreme… Leave that sort of thing to me.”",
    whore: "“Careful with those words, darling.”",
    meow: "“Meow? If you want me to, darling.”",
    satwp: "“What an interesting little word…”",
    remove: "“Consider it taken care of, darling.”",
    it: "“That? Don’t worry. I’ll handle it.”",
    pls: "“You don’t have to beg, darling. I already said yes.”",
    and: "“And? Go on, darling. I’m listening.”",
  },
  bakadere: {
    okay: "“OKAY!!! I HAVE NO IDEA WHAT I’M AGREEING TO, BUT LET’S GOOOO!”",
    yes: "“YES!!! ABSOLUTELY!!! …Wait, what are we saying yes to?”",
    no: "“NOPE!!! DEFINITELY NOT!!! …Probably.”",
    sure: "“SURE!!! I’M TOTALLY QUALIFIED FOR THIS!!!”",
    thanks: "“THANK YOU!!! YOU’RE AWESOME!!! I THINK!!!”",
    sorry: "“SORRY!!! MY BAD!!! I MAY HAVE MADE IT WORSE!!!”",
    please: "“PLEASEEEEE!! I’M BEGGING!!”",
    hello: "“HEYYYY!!! LOOK WHO JUST SHOWED UP!!!”",
    bye: "“BYEEEE!! COME BACK SOON!!”",
    "really?": "“REALLY?! NO WAY!!! ARE YOU SERIOUS?! THIS IS CRAZY!!!”",
    fine: "“FINE!!! I’LL DO IT!!! HOW HARD COULD IT BE?!”",
    wait: "“WAIT!!! MY BRAIN IS STILL LOADING!!!”",
    "come here": "“GET OVER HERE!!! I HAVE SOMETHING IMPORTANT TO TELL YOU!!! …I FORGOT WHAT IT WAS.”",
    "i know": "“I KNOW!!! …Wait, what were we talking about?”",
    "i don’t know": "“I DON’T KNOW!!! MY BRAIN HAS LEFT THE CHAT!!!”",
    maybe: "“MAYBE!!! …THAT SOUNDS LIKE A FUTURE-ME PROBLEM!!!”",
    whatever: "“WHATEVER!!! LET’S JUST DO SOMETHING STUPID!!!”",
    good: "“GOOD?! WE DID IT!!! I THINK!!!”",
    cute: "“CUTE?! ME?! WAIT, REALLY?! AAAAA!!!”",
    "love you": "“I LOVE YOU TOO!!! WAIT, DID I SAY THAT OUT LOUD?!”",
    lol: "“HAHAHAHA!!! I’M DYING!!! WAIT, I CAN’T ACTUALLY DIE, RIGHT?!”",
    "shut up": "“I’M NOT SHUTTING UP!!! YOU CAN’T STOP ME!!!”",
    what: "“HUH?! WHAT?! MY BRAIN JUST CRASHED!!!”",
    bro: "“BROOOOO!!!”",
    bruh: "“BRUUUUUH!!! WHAT IS HAPPENING?!”",
    wtf: "“WHAT THE FUCK?! WHO PRESSED THE WRONG BUTTON?!”",
    "come on": "“COME ON!!! LET’S GO!!! I HAVE NO PLAN!!!”",
    goodnight: "“GOODNIGHT!!! DON’T LET THE BED MONSTERS GET YOU!!!”",
    bitch: "“HEY!! YOU’RE BEING MEAN!!”",
    hoe: "“HUH?! WHAT DOES THAT EVEN MEAN?!”",
    fat: "“WAIT, WHAT?! WHO SAID THAT?!”",
    why: "“WHY?! I DON’T KNOW!! WHY ARE WE ASKING WHY?!”",
    stop: "“STOPPP!! I’M GONNA EXPLODE!!”",
    never: "“NEVER EVER EVER!!”",
    kill: "“WHAT?! NO!! THAT SOUNDS LIKE A TERRIBLE IDEA!!”",
    whore: "“HUH?! THAT’S A WORD?! SINCE WHEN?!”",
    meow: "“MEOW!!! WAIT, WHY DID I ACTUALLY DO IT?!”",
    satwp: "“SATWP?! IS THAT A NEW WORD?! TEACH ME!!”",
    remove: "“OKAY!! BYE-BYE, THING!!”",
    it: "“THE THING!! THAT THING!! YOU KNOW!!”",
    pls: "“PLEAAAAASE?! I’LL BE GOOD!! PROBABLY!!”",
    and: "“AND!!! AND!!! AND THEN WHAT?!”",
  },
  sadodere: {
    okay: "“Fine. If that’s what you want. Try not to embarrass yourself.”",
    yes: "“Yes. You finally managed to ask something correctly.”",
    no: "“No. And watching you struggle with that answer is adorable.”",
    sure: "“Sure. I’d love to watch you regret that decision.”",
    thanks: "“You’re welcome. Try not to become dependent on me.”",
    sorry: "“Apology accepted. Barely.”",
    please: "“Say it properly. I want to hear you beg.”",
    hello: "“Oh, look who decided to show up.”",
    bye: "“Leaving already? I was just starting to enjoy this.”",
    "really?": "“Really? You actually believed that? Adorable.”",
    fine: "“Fine. I’ll allow it this time.”",
    wait: "“Wait. I’m not finished humiliating you yet.”",
    "come here": "“Come here. Don’t make me come get you myself.”",
    "i know": "“I know. Try telling me something I don’t already know.”",
    "i don’t know": "“I don’t know. Watching you figure it out might be entertaining, though.”",
    maybe: "“Maybe. I’ll decide when I feel like it.”",
    whatever: "“Whatever. Do what you want. I’ll enjoy watching you fail.”",
    good: "“Good. You managed to do something right for once.”",
    cute: "“Cute? You? That’s almost convincing.”",
    "love you": "“I love you too. Don’t let it inflate your ego.”",
    lol: "“Hehe. Watching you suffer is surprisingly entertaining.”",
    "shut up": "“Make me.”",
    what: "“What? Did I finally confuse you?”",
    bro: "“Bro? That’s embarrassingly unoriginal.”",
    bruh: "“Brilliant response. Truly groundbreaking.”",
    wtf: "“Oh, you’re confused? This is getting even better.”",
    "come on": "“Come on. Try harder. I know you can embarrass yourself more.”",
    goodnight: "“Goodnight. Try not to think about me too much.”",
    bitch: "“How adorable. Did that insult make you feel better?”",
    hoe: "“Oh? Someone’s feeling particularly shameless today.”",
    fat: "“Careful. That little insecurity is showing.”",
    why: "“Because I said so. Try keeping up.”",
    stop: "“Make me.”",
    never: "“Never? How cute. You sound so confident.”",
    kill: "“Such dramatic language. You’re adorable.”",
    whore: "“Oh? That’s quite a word coming from you.”",
    meow: "“Again. I want to hear you do it properly.”",
    satwp: "“What a pathetic little collection of letters.”",
    remove: "“Go ahead. Pretend you’re in control.”",
    it: "“That’s it? I expected something more interesting.”",
    pls: "“Oh, you’re begging already? How cute.”",
    and: "“And? Don’t stop now. This is entertaining.”",
  },
  uwu: {
    no: "“Nyahhh~! Nuuuu~! >w<”",
    okay: "“Mkay uwu~ 🥹💧”",
    yes: "“Yeshhh~! Ehehehe >w<”",
    yeah: "“Yesh yesh~! UwU”",
    sure: "“Okiii~! Sowwy, sure sure~ 💗”",
    alright: "“Awwight~! We can do dat~!”",
    good: "“Goooodie~! Ehehe~ ✨”",
    bad: "“Nuuu, dat’s a vewy bad thingy~! 🥺”",
    hello: "“Hewwoooo~! >w<”",
    hi: "“Hiii hiii~! Ehehehe~ 💗”",
    thanks: "“Fank youuu~! You’re so sweetieee 🥺💗”",
    thank: "“Fankies~! Ehehe~”",
    sorry: "“Sowwyyyy~! I didn’t mean to be a meanieee 🥺”",
    what: "“W-What’s dattt~? Ehehehe!”",
    who: "“W-Whooo~? Who could it beee~?”",
    when: "“Whenieee~? Tell meee tell meee~!”",
    where: "“Wheweee~? I wanna knowww~!”",
    how: "“H-Howieee~? Ehehe, I dunnooo~”",
    can: "“Can I pwetty pweaseee~? 🥺👉👈”",
    "can't": "“Nuu, I can’tieee~! Sowwyyy~”",
    want: "“I wannaaa~! Ehehehe >w<”",
    "don't": "“Don’tieee~! Nuuuu~!”",
    do: "“Do ittt~! Ehehehe~”",
    did: "“Didd youuu~? 👀”",
    does: "“Doeees ittt~? Ehehe~”",
    wait: "“W-WAITIEEEE~! 😭”",
    come: "“Cwome heweee~! >w<”",
    go: "“Goooo~! Shoo shoo~! Ehehe~”",
    look: "“Lookieee~! Look look look~!”",
    listen: "“Pwease wisten~! I’m saying important thingies~ 🥺”",
    really: "“Weawwy weawwy~?! >w<”",
    actually: "“Ackshuallyyy~! Ehehe~”",
    maybe: "“M-Maybe uwu~? I dunnooo~”",
    always: "“Awwaysss~! Fowevew and evew~ 💗”",
    never: "“Nuuuu, nevew evew evew~!!”",
    nothing: "“Nuffinggg~! There’s nuffing heweee~”",
    something: "“Somefingieee~! A wittle somefing~!”",
    someone: "“Somewoneee~? Ehehehe~”",
    everyone: "“Evewyoneee~! All da wittle beanies~!”",
    now: "“Nowieee~! Right meowww~!”",
    later: "“Latew~! See you denieee~”",
    again: "“Againieee~! One more timeee~!”",
    "really?": "“Weawwy?! You’we seriousieee~?! >w<”",
    fine: "“Fiiineee~! If you say sooooo~ 🥹”",
    please: "“Pweaseee~! I’m asking vewy nicelyyy 🥺💗”",
    help: "“Hewppp meee~! I’m just a wittle bean!! 🥺”",
    "shut up": "“Nuuuu, quietieee~! 🤫”",
    enough: "“Dat’s enuffieee~! Nuu moreee~!”",
    exactly: "“Exacklyyy~! You get ittt~! >w<”",
    obviously: "“Obviouwwy~! Ehehehe~”",
    whatever: "“Whatevew~! Nyaa, I don’t caweee~”",
    nevermind: "“Nevew mindieee~! Fowget ittt~”",
    because: "“Becawseee~! Dat’s whyieee~”",
    but: "“Buuuttt~! Wait wait waitieee~!”",
    also: "“Awsooo~! Don’t fowget dat~”",
    and: "“Aaaand~? What happens nextieee?!”",
    or: "“Owww~? Which oneieee~?”",
    if: "“Iffff~! Maybe maybeee~”",
    then: "“Denieee~! Ehehe~”",
    so: "“Soooo~! What nowieee~?”",
    "maybe not": "“M-Maybe nyahhh~ 🥹”",
    definitely: "“Definitewee~! One hundwed percentieee~!”",
    surely: "“Suwelyyy~! Ehehehe~”",
    goodbye: "“Byeeee~! Don’t fowget meee~! 🥺💗”",
    welcome: "“You’we welcomieee~! Ehehe~”",
    congratulations: "“YAYYY~! You’we a big achiever bean!! >w<”",
    oops: "“Oopshieee~! Ehehehe~”",
    "uh-oh": "“U-Uh ohhh~! We have a wittle pwoblemieee~ 🥺”",
    wow: "“WOOOWIEEEE~! Dat’s so coolieee~! >w<”",
    damn: "“D-Damnieee~! Such a stwong wordieee~!”",
    fuck: "“F-Fwuckieee~! Eep! Such a naughtee word~!”",
    shit: "“Sh-Shipieee~! Ehehehe, naughty potty word~!”",
    bitch: "“Mwehehe, you’we being a wittle meanie >w<”",
    hoe: "“Ehehe, what a naughty wittle bean~”",
    whore: "“Eep! Such a naughtee word~!”",
    kill: "“Nuuuu, no killing, silly!! That’s vewy scawy~”",
    meow: "“Mweowww~! >w<”",
    bro: "“B-Bwooo~! Ehehehe!”",
    remove: "“Okiii~! It’s gone now, ehehe~”",
    add: "“Addieee~! Put da wittle thingy hewe~!”",
    delete: "“Deweeeete~! Poof! It’s goneee~!”",
    stop: "“Nuuuu, don’t make me stoppp~!”",
    start: "“Stawtieee~! Let’s gooo~!”",
    finish: "“Finisheee~! We did da thingy~! ✨”",
  },
} as const;

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]!;
}

const LONG_MESSAGE_RESPONSES = [
  "who asked tho?",
  "Bro😭🙏🏻",
  "what is bro yapping about?",
  "good for you bro 🙏🏻",
  "what possessed you to say this?",
  "I can’t do this anymore 😭",
  "HELPP😭😭🙏🏻🙏🏻",
  "👍🏻 👍🏻",
] as const;

function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor < 0) return items[index]!;
  }
  return items[items.length - 1]!;
}

function personaReplacement(
  persona: keyof typeof PERSONAS,
  content: string,
): string | undefined {
  const normalized = content.toLowerCase().trim();
  const entries = Object.entries(PERSONAS[persona]) as [string, string][];
  const exactMatch = entries.find(([trigger]) => trigger === normalized);
  if (exactMatch) return exactMatch[1];

  const escaped = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return entries
    .sort(([first], [second]) => second.length - first.length)
    .find(([trigger]) => {
      const pattern = trigger
        .split(/\s+/)
        .map(escaped)
        .join("\\s+");
      return new RegExp(`\\b${pattern}\\b`, "i").test(normalized);
    })?.[1];
}

function splitDiscordContent(content: string): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > DISCORD_SAFE_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf("\n", DISCORD_SAFE_MESSAGE_LIMIT);
    if (splitAt <= 0) splitAt = DISCORD_SAFE_MESSAGE_LIMIT;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
    if (remaining.startsWith("\n")) remaining = remaining.slice(1);
  }

  if (remaining.length > 0 || chunks.length === 0) chunks.push(remaining);
  return chunks;
}

async function send(
  message: DiscordMessage,
  content: string | MessageCreateOptions,
): Promise<unknown> {
  if (typeof content !== "string" || content.length <= DISCORD_MESSAGE_LIMIT) {
    return message.channel.send(content);
  }

  let lastMessage: unknown;
  for (const chunk of splitDiscordContent(content)) {
    lastMessage = await message.channel.send(chunk);
  }
  return lastMessage;
}

function mentionedUsers(message: DiscordMessage): User[] {
  if (!message.mentions) return [];
  const users = message.mentions.users as unknown as {
    values?: () => IterableIterator<User>;
    first?: () => User | undefined;
  };
  if (typeof users.values === "function") return [...users.values()];
  const first = typeof users.first === "function" ? users.first() : undefined;
  return first ? [first] : [];
}

function mentionedMembers(message: DiscordMessage): GuildMember[] {
  if (!message.mentions) return [];
  const members = message.mentions.members as unknown as {
    values?: () => IterableIterator<GuildMember>;
    first?: () => GuildMember | undefined;
  };
  if (typeof members.values === "function") return [...members.values()];
  const first = typeof members.first === "function" ? members.first() : undefined;
  return first ? [first] : [];
}

function specialChatReply(message: DiscordMessage): string | undefined {
  const replies = SPECIAL_CHAT_REPLIES[message.author.username];
  if (!replies) return undefined;
  return replies[message.content.trim().toLowerCase()];
}

function activityDay(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function calendarDaysBetween(startDay: string, endDay: string): number {
  const start = Date.parse(`${startDay}T00:00:00.000Z`);
  const end = Date.parse(`${endDay}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

function countCurseWords(content: string): number {
  return content.match(CURSE_PATTERN)?.length ?? 0;
}

type InvoiceMessagePayload = Pick<MessageCreateOptions, "embeds">;

function invoiceMessage(user: User, invoice: InvoiceRecord): InvoiceMessagePayload {
  return {
    embeds: [{
      color: 0xffffff,
      title: "🧾 Invoice",
      thumbnail: { url: invoice.avatarUrl || user.displayAvatarURL() },
      fields: [
        { name: "Username", value: user.username, inline: true },
        { name: "Charge", value: invoice.charge, inline: true },
        { name: "Reason", value: invoice.reason },
        { name: "Fine", value: `$${invoice.amount}`, inline: true },
        { name: "Status", value: invoice.status, inline: true },
        { name: "Issuer", value: invoice.issuer, inline: true },
        {
          name: "Date/Time",
          value: `<t:${Math.floor(invoice.issuedAt / 1000)}:F>`,
          inline: false,
        },
      ],
      footer: { text: `Invoice ID: ${invoice.id}` },
      timestamp: new Date(invoice.issuedAt).toISOString(),
    }],
  };
}

function hasPermission(
  message: DiscordMessage,
  permission:
    | "Administrator"
    | "BanMembers"
    | "KickMembers"
    | "ManageMessages"
    | "ManageRoles"
    | "ModerateMembers",
): boolean {
  return Boolean(message.member?.permissions?.has(permission));
}

function canModerateMembers(message: DiscordMessage): boolean {
  return hasPermission(message, "ManageRoles") ||
    hasPermission(message, "ModerateMembers");
}

function interactionHasPermission(
  interaction: DiscordInteraction,
  permission:
    | "Administrator"
    | "ManageRoles"
    | "ModerateMembers",
): boolean {
  return Boolean(interaction.memberPermissions?.has(permission));
}

function canModerateInteraction(interaction: DiscordInteraction): boolean {
  return interactionHasPermission(interaction, "ManageRoles") ||
    interactionHasPermission(interaction, "ModerateMembers");
}

export function createDiscordCommands(client: Client): CommandFeatures {
  const data = loadBotData() ?? DEFAULT_BOT_DATA;
  const state: CommandState = {
    protectedUsers: new Map(),
    activeLocks: new Map(),
    setupGuilds: new Set(),
    balances: data.balances,
    marriages: data.marriages,
    marriageDetails: data.marriage_details ?? {},
    serverSettings: data.server_settings ?? {},
    activeAtmChannel: null,
    atmTimer: null,
    atmRoundsUsed: data.atm_rounds_used ?? 0,
    pendingWaiters: new Set(),
    snipes: new Map(),
    moderatorSnipes: new Map(),
    conversations: new Map(),
    afkUsers: new Map(),
    shushTimers: new Map(),
    personaWebhooks: new Map(),
    processedMessages: new Map(),
    burdens: data.burdens ?? {},
    dailyActivity: data.daily_activity ?? {},
    marriageCounts: data.marriage_counts ?? {},
    divorceCounts: data.divorce_counts ?? {},
    transactions: data.transactions ?? {},
    atmClaims: data.atm_claims ?? {},
    debts: data.debts ?? {},
    debtHistory: data.debt_history ?? {},
    knownUsers: new Map(),
    userChannels: new Map(),
    debtTimer: null,
  };

  function getBalance(userId: string): number {
    return state.balances[userId] ?? 0;
  }

  function debtStatusMessage(userId: string, username: string): string {
    const debt = state.debts[userId];
    if (!debt || debt.remainingDebt <= 0) {
      return (
        "💳 **DEBT STATUS**\n" +
        `User: ${username}\n` +
        "Debt: $0\n" +
        "Status: CLEAR"
      );
    }
    const status = debt.bankruptcyStatus ? "BANKRUPT" : "IN DEBT";
    const label = debt.debtStatusLabel ? `\nLabel: ${debt.debtStatusLabel}` : "";
    return (
      "💳 **DEBT STATUS**\n" +
      `User: ${username}\n` +
      `Original Debt: $${debt.originalDebt}\n` +
      `Amount Paid: $${debt.amountPaid}\n` +
      `Remaining Balance: $${debt.remainingDebt}\n` +
      `Total Debt: $${debt.originalDebt}\n` +
      `Status: ${status}\n` +
      `Days in Debt: ${debt.consecutiveDebtDays}${label}`
    );
  }

  function saveState(): void {
    saveBotData({
      balances: state.balances,
      marriages: state.marriages,
      marriage_details: state.marriageDetails,
      burdens: state.burdens,
      atm_rounds_used: state.atmRoundsUsed,
      atm_claims: state.atmClaims,
      daily_activity: state.dailyActivity,
      marriage_counts: state.marriageCounts,
      divorce_counts: state.divorceCounts,
      transactions: state.transactions,
      server_settings: state.serverSettings,
      debts: state.debts,
      debt_history: state.debtHistory,
    });
  }

  function syncDebtHistory(userId: string, debt: DebtAccount): void {
    const history = state.debtHistory[userId] ?? [];
    const index = history.findIndex(entry => entry.id === debt.historyId);
    if (index < 0) return;
    const existing = history[index]!;
    history[index] = {
      ...existing,
      originalDebt: debt.originalDebt,
      amountPaid: debt.amountPaid,
      remainingDebt: debt.remainingDebt,
    };
    state.debtHistory[userId] = history;
  }

  function createDebtAccount(userId: string, amount: number, day: string): DebtAccount | null {
    const acceptedAmount = Math.min(BANKRUPTCY_THRESHOLD, Math.max(0, Math.floor(amount)));
    if (acceptedAmount <= 0) return null;
    const historyId = `${userId}:debt:${Date.now()}:${randomInt(1000, 9999)}`;
    const debt: DebtAccount = {
      historyId,
      originalDebt: acceptedAmount,
      amountPaid: 0,
      remainingDebt: acceptedAmount,
      debtStartDate: day,
      consecutiveDebtDays: 1,
      lastProcessedDay: day,
      bankruptcyStatus: acceptedAmount >= BANKRUPTCY_THRESHOLD,
      ...(acceptedAmount >= BANKRUPTCY_THRESHOLD
        ? { debtStatusLabel: "Shameless Inhaler" }
        : {}),
    };
    state.debtHistory[userId] = [
      ...(state.debtHistory[userId] ?? []),
      {
        id: historyId,
        originalDebt: acceptedAmount,
        amountPaid: 0,
        remainingDebt: acceptedAmount,
        startedAt: Date.now(),
        payments: [],
      },
    ];
    state.debts[userId] = debt;
    return debt;
  }

  function addDebt(userId: string, amount: number, source: string): number {
    const requested = Math.max(0, Math.floor(amount));
    if (requested <= 0) return 0;
    const day = activityDay();
    let debt = state.debts[userId];
    if (!debt || debt.remainingDebt <= 0) {
      const createdDebt = createDebtAccount(userId, requested, day);
      if (createdDebt) {
        sendDailyDebtReminder(userId, createdDebt, day);
      }
      saveState();
      return createdDebt?.remainingDebt ?? 0;
    }

    const acceptedAmount = Math.min(requested, BANKRUPTCY_THRESHOLD - debt.remainingDebt);
    if (acceptedAmount > 0) {
      debt.originalDebt += acceptedAmount;
      debt.remainingDebt += acceptedAmount;
      debt.bankruptcyStatus = debt.remainingDebt >= BANKRUPTCY_THRESHOLD;
      if (debt.bankruptcyStatus) debt.debtStatusLabel = "Shameless Inhaler";
      syncDebtHistory(userId, debt);
    }
    saveState();
    return acceptedAmount;
  }

  function recordDebtPayment(userId: string, amount: number, source: string): number {
    const debt = state.debts[userId];
    if (!debt || amount <= 0) return 0;
    const payment = Math.min(Math.floor(amount), debt.remainingDebt);
    if (payment <= 0) return 0;
    debt.amountPaid += payment;
    debt.remainingDebt -= payment;
    const history = state.debtHistory[userId] ?? [];
    const historyEntry = history.find(entry => entry.id === debt.historyId);
    historyEntry?.payments.push({ amount: payment, source, paidAt: Date.now() });
    syncDebtHistory(userId, debt);
    if (debt.remainingDebt <= 0) {
      if (historyEntry) {
        historyEntry.clearedAt = Date.now();
        historyEntry.remainingDebt = 0;
      }
      delete state.debts[userId];
    }
    return payment;
  }

  function chargeUser(
    userId: string,
    amount: number,
    source: string,
    _invoiceId?: string,
  ): void {
    const charge = Math.max(0, Math.floor(amount));
    const available = Math.max(0, getBalance(userId));
    const paidFromBalance = Math.min(available, charge);
    state.balances[userId] = available - paidFromBalance;
    const unpaid = charge - paidFromBalance;
    if (unpaid > 0) addDebt(userId, unpaid, source);
    saveState();
  }

  function updateBalance(userId: string, amount: number, source = "Balance update"): void {
    if (amount === 0) return;
    if (amount < 0) {
      state.balances[userId] = getBalance(userId) + amount;
      saveState();
      return;
    }

    const debt = state.debts[userId];
    if (!debt || debt.remainingDebt <= 0) {
      state.balances[userId] = getBalance(userId) + amount;
      saveState();
      return;
    }

    const payment = Math.min(amount, debt.remainingDebt);
    recordDebtPayment(userId, payment, source);
    const remainingEarnings = amount - payment;
    if (remainingEarnings > 0) {
      state.balances[userId] = getBalance(userId) + remainingEarnings;
    }
    saveState();
  }

  function saveRelationships(): void {
    saveState();
  }

  function storeInvoice(invoice: InvoiceRecord): void {
    const userTransactions = state.transactions[invoice.userId] ?? [];
    state.transactions[invoice.userId] = [...userTransactions, invoice];
    if (invoice.status === "APPROVED") {
      chargeUser(invoice.userId, invoice.amount, `Invoice: ${invoice.reason}`, invoice.id);
    }
    saveState();
  }

  function hasInvoiceForReasonOnDay(
    userId: string,
    reason: string,
    day: string,
  ): boolean {
    return (state.transactions[userId] ?? []).some(transaction =>
      transaction.reason === reason && activityDay(transaction.issuedAt) === day
    );
  }

  async function issueAutomaticInvoice(
    message: DiscordMessage,
    user: User,
    charge: string,
    reason: string,
    day: string,
    amount = randomInt(1, 5),
  ): Promise<void> {
    const userTransactions = state.transactions[user.id] ?? [];
    const triggerKey = `${charge}:${day}`;
    if (
      userTransactions.some(transaction => transaction.triggerKey === triggerKey) ||
      hasInvoiceForReasonOnDay(user.id, reason, day)
    ) {
      return;
    }

    const invoice: InvoiceRecord = {
      id: `${user.id}:${triggerKey}`,
      userId: user.id,
      username: user.username,
      avatarUrl: user.displayAvatarURL(),
      charge,
      reason,
      amount,
      status: "APPROVED",
      issuer: AUTOMATED_INVOICE_ISSUER,
      issuerId: "automated-system",
      triggerKey,
      issuedAt: Date.now(),
    };
    storeInvoice(invoice);
    await send(message, invoiceMessage(user, invoice));
  }

  async function recordDailyActivity(message: DiscordMessage): Promise<void> {
    const day = activityDay();
    const now = Date.now();
    const current = state.dailyActivity[message.author.id];
    const activity = current?.day === day
      ? current
      : {
        day,
        messages: 0,
        curses: 0,
        marriages: 0,
        divorces: 0,
        discordTimeMs: 0,
      };
    if (activity.lastActivityAt !== undefined && now >= activity.lastActivityAt) {
      activity.discordTimeMs += Math.min(now - activity.lastActivityAt, 24 * 60 * 60 * 1000);
    }
    activity.lastActivityAt = now;
    activity.messages += 1;
    activity.curses += countCurseWords(message.content);
    state.dailyActivity[message.author.id] = activity;
    saveState();

    if (activity.curses >= DAILY_CURSE_THRESHOLD) {
      await issueAutomaticInvoice(
        message,
        message.author,
        "Terrible Mouth",
        "Your vocabulary has officially become a public safety concern.",
        day,
      );
    }
    if (activity.messages >= DAILY_MESSAGE_THRESHOLD) {
      await issueAutomaticInvoice(
        message,
        message.author,
        "Excessive Yapping",
        "You have spoken enough for several lifetimes.",
        day,
      );
    }
    if (activity.discordTimeMs > DISCORD_SITTING_FEE_THRESHOLD_MS) {
      await issueAutomaticInvoice(
        message,
        message.author,
        "Discord Sitting Fee",
        "You have spent more than two hours sitting on Discord today.",
        day,
        DISCORD_SITTING_FEE_AMOUNT,
      );
    }
  }

  async function recordRelationshipActivity(
    message: DiscordMessage,
    users: User[],
    type: "marriage" | "divorce",
  ): Promise<void> {
    const uniqueUsers = [...new Map(users.map(user => [user.id, user])).values()];
    const counts = type === "marriage" ? state.marriageCounts : state.divorceCounts;
    const threshold = type === "marriage"
      ? MARRIAGE_INVOICE_THRESHOLD
      : DIVORCE_INVOICE_THRESHOLD;
    const charge = type === "marriage" ? "Delusion Tax" : "Relationship Felony";
    const reason = type === "marriage"
      ? "At this point, commitment is clearly not your strong suit."
      : "You have treated relationships like limited-time subscriptions.";
    const day = activityDay();
    for (const user of uniqueUsers) {
      counts[user.id] = (counts[user.id] ?? 0) + 1;
      const current = state.dailyActivity[user.id];
      const activity = current?.day === day
        ? current
        : {
          day,
          messages: 0,
          curses: 0,
          marriages: 0,
          divorces: 0,
          discordTimeMs: 0,
        };
      activity[type === "marriage" ? "marriages" : "divorces"] += 1;
      state.dailyActivity[user.id] = activity;
    }
    saveState();

    for (const user of uniqueUsers) {
      const activity = state.dailyActivity[user.id]!;
      const count = type === "marriage" ? activity.marriages : activity.divorces;
      if (count < threshold || count % threshold !== 0) continue;
      await issueAutomaticInvoice(
        message,
        user,
        charge,
        reason,
        day,
      );
    }
  }

  function marriageCount(userId: string): number {
    return Object.entries(state.marriages).reduce(
      (count, [holderId, spouseIds]) =>
        count +
        (holderId === userId ? spouseIds.length : 0) +
        spouseIds.filter(spouseId => spouseId === userId).length,
      0,
    );
  }

  function marriageLimit(user: User): number {
    return SPECIAL_MARRIAGE_LIMITS[user.username] ?? 1;
  }

  function marriageConnections(userId: string): MarriageConnection[] {
    const connections: MarriageConnection[] = [];
    for (const [holderId, spouseIds] of Object.entries(state.marriages)) {
      for (const spouseId of spouseIds) {
        if (holderId !== userId && spouseId !== userId) continue;
        connections.push({
          holderId,
          spouseId,
          metadata: state.marriageDetails[holderId]?.[spouseId] ?? {},
        });
      }
    }
    return connections;
  }

  function createMarriageConnection(
    holderId: string,
    spouseId: string,
    reason?: string,
  ): void {
    state.marriages[holderId] = [
      ...(state.marriages[holderId] ?? []),
      spouseId,
    ];
    state.marriageDetails[holderId] ??= {};
    state.marriageDetails[holderId]![spouseId] = {
      marriedAt: Date.now(),
      ...(reason ? { reason } : {}),
    };
  }

  function dissolveUserMarriages(userId: string): string[] {
    const formerSpouses = new Set<string>();
    for (const [holderId, spouses] of Object.entries(state.marriages)) {
      if (holderId === userId) {
        for (const spouseId of spouses) formerSpouses.add(spouseId);
        delete state.marriages[holderId];
        delete state.marriageDetails[holderId];
        continue;
      }
      if (spouses.includes(userId)) {
        formerSpouses.add(holderId);
        state.marriages[holderId] = spouses.filter(spouseId => spouseId !== userId);
        if (state.marriages[holderId].length === 0) {
          delete state.marriages[holderId];
          delete state.marriageDetails[holderId];
        } else if (state.marriageDetails[holderId]) {
          delete state.marriageDetails[holderId]![userId];
        }
      }
    }
    return [...formerSpouses];
  }

  function dissolveMarriageBetween(firstUserId: string, secondUserId: string): boolean {
    let dissolved = false;
    for (const [holderId, spouses] of Object.entries(state.marriages)) {
      const spouseId = holderId === firstUserId
        ? secondUserId
        : holderId === secondUserId
          ? firstUserId
          : null;
      if (!spouseId || !spouses.includes(spouseId)) continue;

      const remainingSpouses = spouses.filter(candidate => candidate !== spouseId);
      if (remainingSpouses.length === 0) {
        delete state.marriages[holderId];
        delete state.marriageDetails[holderId];
      } else {
        state.marriages[holderId] = remainingSpouses;
        if (state.marriageDetails[holderId]) {
          delete state.marriageDetails[holderId]![spouseId];
          if (Object.keys(state.marriageDetails[holderId]!).length === 0) {
            delete state.marriageDetails[holderId];
          }
        }
      }
      dissolved = true;
    }
    return dissolved;
  }

  function sendDebtNotice(userId: string, content: string): boolean {
    const channel = state.userChannels.get(userId);
    if (!channel || typeof channel.send !== "function") return false;
    void channel.send(content).catch(error => {
      console.error("Debt notice failed", error);
    });
    return true;
  }

  function sendDailyDebtReminder(
    userId: string,
    debt: DebtAccount,
    day: string,
  ): boolean {
    if (
      debt.remainingDebt <= 0 ||
      debt.consecutiveDebtDays > 7 ||
      debt.lastReminderDay === day
    ) {
      return false;
    }
    const sent = sendDebtNotice(
      userId,
      `💳 **Unpaid Fine Reminder:** You still owe **$${debt.remainingDebt}**. ` +
        `This is day **${debt.consecutiveDebtDays} of 7**; pay it before the 7-day reset.`,
    );
    if (sent) debt.lastReminderDay = day;
    return sent;
  }

  function processDebtDays(): void {
    const today = activityDay();
    let changed = false;
    for (const [userId, debt] of Object.entries(state.debts)) {
      if (debt.remainingDebt <= 0) continue;
      const isNewDay = debt.lastProcessedDay !== today;
      if (isNewDay) {
        debt.consecutiveDebtDays = calendarDaysBetween(debt.debtStartDate, today) + 1;
        debt.lastProcessedDay = today;
        changed = true;
      }

      const isThreeDayConsequence = debt.consecutiveDebtDays === 3;
      const isSevenDayConsequence = debt.consecutiveDebtDays >= 7;
      if (
        debt.consecutiveDebtDays <= 7 &&
        !isThreeDayConsequence &&
        !isSevenDayConsequence &&
        sendDailyDebtReminder(userId, debt, today)
      ) {
        changed = true;
      }

      if (
        isNewDay &&
        debt.consecutiveDebtDays >= 3 &&
        debt.lastThreeDayConsequenceDay !== today
      ) {
        debt.lastThreeDayConsequenceDay = today;
        const formerSpouses = dissolveUserMarriages(userId);
        if (formerSpouses.length > 0) {
          if (sendDebtNotice(
            userId,
            `💔 Your debt reached 3 consecutive days, so your marriage has been automatically dissolved. Handle your debt before making another commitment.`,
          )) {
            debt.lastReminderDay = today;
          }
        } else {
          if (sendDebtNotice(
            userId,
            `⚠️ You have been in debt for ${debt.consecutiveDebtDays} consecutive days. Can't handle paying your debt and already want to marry? How bold.`,
          )) {
            debt.lastReminderDay = today;
          }
        }
      }

      if (
        isNewDay &&
        debt.consecutiveDebtDays >= 7 &&
        debt.lastSevenDayConsequenceDay !== today
      ) {
        debt.lastSevenDayConsequenceDay = today;
        state.balances[userId] = 0;
        debt.debtStatusLabel = "Warning: Irresponsible";
        if (sendDebtNotice(
          userId,
          "💸 Your debt has lasted 7 consecutive days. Your normal balance and accumulated earnings have been reset. Debt collection remains active.",
        )) {
          debt.lastReminderDay = today;
        }
      }
      syncDebtHistory(userId, debt);
    }
    if (changed) saveState();
  }

  function latestMarriageConnection(userId: string): MarriageConnection | null {
    const connections = marriageConnections(userId);
    return connections[connections.length - 1] ?? null;
  }

  function formatMarriageDate(timestamp?: number): string {
    return typeof timestamp === "number"
      ? new Date(timestamp).toISOString().slice(0, 10)
      : "Unknown (legacy marriage)";
  }

  function findSpouseHolder(userId: string): string | null {
    for (const [holder, spouses] of Object.entries(state.marriages)) {
      if (holder === userId || spouses.includes(userId)) {
        return holder;
      }
    }
    return null;
  }

  function waitForMessage(
    predicate: (candidate: DiscordMessage) => boolean,
    timeoutMs: number,
  ): Promise<DiscordMessage | null> {
    return new Promise(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (candidate: DiscordMessage | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.off("messageCreate", onMessage);
        state.pendingWaiters.delete(cancel);
        resolve(candidate);
      };
      const onMessage = (candidate: DiscordMessage): void => {
        if (predicate(candidate)) finish(candidate);
      };
      const cancel = (): void => finish(null);

      state.pendingWaiters.add(cancel);
      client.on("messageCreate", onMessage);
      timer = setTimeout(() => finish(null), timeoutMs);
      timer.unref?.();
    });
  }

  async function runAtmDrop(
    requestedChannel?: DiscordMessage["channel"],
  ): Promise<void> {
    const channel = requestedChannel ?? state.activeAtmChannel;
    if (!channel) return;

    const amounts = [
      randomInt(5, 30),
      randomInt(31, 100),
    ];
    const chosenAmount = weightedChoice(amounts, [80, 20]);
    await channel.send({
      content:
        "🚨 **ATM HAS ARRIVED!** 🏧\n" +
        `@everyone An ATM is dropping **$${chosenAmount}**!\n` +
        "Type `.inter the sting` within **60 seconds** to claim the cash!",
      allowedMentions: { parse: ["everyone"] },
    });

    const deadline = Date.now() + 60_000;
    let winner: DiscordMessage | null = null;
    while (!winner) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const candidate = await waitForMessage(
        possibleWinner =>
          possibleWinner.channel === channel &&
          !possibleWinner.author.bot &&
          possibleWinner.content.toLowerCase().trim() === ".inter the sting",
        remaining,
      );
      if (!candidate) break;
      const claims = state.atmClaims[candidate.author.id] ?? 0;
      if (claims >= ATM_MAX_CLAIMS_PER_USER) {
        await channel.send(
          `❌ <@${candidate.author.id}> has already claimed the ATM 3 times.`,
        );
        continue;
      }
      winner = candidate;
    }

    if (winner) {
      state.atmClaims[winner.author.id] = (state.atmClaims[winner.author.id] ?? 0) + 1;
      updateBalance(winner.author.id, chosenAmount, "ATM payout");
      await channel.send(
        `🎉 Congratulations <@${winner.author.id}>! You successfully withdrew **$${chosenAmount}** from the ATM!`,
      );
    } else {
      await channel.send(
        `⏳ Time's up! No one claimed the $${chosenAmount} from the ATM. It locked itself back up!`,
      );
    }
  }

  function findUserByUsername(message: DiscordMessage, username: string): User | null {
    const cachedUser = client.users.cache.find(user => user.username === username);
    if (cachedUser) return cachedUser;
    const guildMember = [...message.guild.members.cache.values()]
      .find(member => member.user.username === username);
    return guildMember?.user ?? null;
  }

  function conversationKey(message: DiscordMessage): string {
    const channelId = (message.channel as unknown as { id?: string }).id ?? "unknown-channel";
    return `${message.guild.id}:${channelId}`;
  }

  function recordConversation(message: DiscordMessage, timestamp: number): void {
    const key = conversationKey(message);
    const entries = state.conversations.get(key) ?? [];
    entries.push({ message, timestamp });
    const cutoff = timestamp - TEN_MINUTES;
    state.conversations.set(
      key,
      entries.filter(entry => entry.timestamp >= cutoff),
    );
  }

  async function getPersonaWebhook(message: DiscordMessage): Promise<PersonaWebhook> {
    const channel = message.channel as typeof message.channel & {
      id?: string;
      createWebhook?: (options: { name: string }) => Promise<unknown>;
    };
    const channelId = channel.id ?? "unknown-channel";
    const existing = state.personaWebhooks.get(channelId);
    if (existing) return existing;
    if (typeof channel.createWebhook !== "function") {
      throw new Error("This channel does not support persona webhooks.");
    }
    const webhook = await channel.createWebhook({ name: "Persona Mode" });
    const typedWebhook = webhook as PersonaWebhook;
    state.personaWebhooks.set(channelId, typedWebhook);
    return typedWebhook;
  }

  function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }

  function formatDeletedMessages(
    entries: DeletedMessage[],
    title: string,
    limit = MAX_SNIPE_COUNT,
  ): string {
    if (entries.length === 0) return `${title}\nNo deleted messages saved.`;
    return [
      title,
      ...entries
        .slice(-limit)
        .reverse()
        .map(entry =>
          `• <t:${Math.floor(entry.timestamp / 1_000)}:R> **${entry.author.username}**: ${entry.content}`
        ),
    ].join("\n");
  }

  state.atmTimer = setInterval(() => {
    void runAtmDrop().catch(error => {
      console.error("Discord ATM drop failed", error);
    });
  }, 24 * 60 * 60 * 1000);
  state.atmTimer.unref?.();

  async function setupGuild(guild: DiscordMessage["guild"]): Promise<string> {
    const existingSettings = state.serverSettings[guild.id];
    const previouslyConfigured = state.setupGuilds.has(guild.id) ||
      Boolean(existingSettings && (
        existingSettings.jailId ||
        existingSettings.prisonerRoleId ||
        existingSettings.modTestId ||
        existingSettings.freshDisappointmentId ||
        existingSettings.badbyesId
      ));
    const missingResources: string[] = [];
    if (previouslyConfigured) {
      const channelResources = [
        ["prisoner-is-suffering", existingSettings?.jailId],
        ["moderators-test", existingSettings?.modTestId],
        ["fresh-disappointment", existingSettings?.freshDisappointmentId],
        ["badbyes", existingSettings?.badbyesId],
      ] as const;
      for (const [name, id] of channelResources) {
        if (!id || !guild.channels.cache.get(id)) missingResources.push(name);
      }
      const prisonerRole = existingSettings?.prisonerRoleId
        ? guild.roles.cache.get(existingSettings.prisonerRoleId)
        : guild.roles.cache.find(role => role.name === "Prisoner");
      if (!prisonerRole) missingResources.push("Prisoner role");
    }
    if (previouslyConfigured && missingResources.length === 0) {
      return "Setup is already complete for this server.";
    }
    try {
      type SetupChannel = {
        id: string;
        name?: string;
        mention?: string;
      };
      const cachedChannels = [...guild.channels.cache.values()] as SetupChannel[];
      const findOrCreate = async (name: string, options?: Record<string, unknown>): Promise<SetupChannel> => {
        const existing = cachedChannels.find(channel => channel.name === name);
        if (existing) return existing;
        const created = await guild.channels.create({
          name,
          type: 0,
          ...options,
        });
        const channel = created as unknown as SetupChannel;
        cachedChannels.push(channel);
        return channel;
      };

      const settings = existingSettings ?? {};
      const jailRole = await ensurePrisonerRole(guild, settings);
      const jailChannel = await findOrCreate("prisoner-is-suffering", {
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ["ViewChannel"],
          },
          {
            id: jailRole.id,
            allow: ["ViewChannel", "SendMessages"],
          },
        ],
      });
      const modTestChannel = await findOrCreate("moderators-test");
      const freshChannel = await findOrCreate("fresh-disappointment");
      const badbyesChannel = await findOrCreate("badbyes");
      await configurePrisonerVisibility(guild, jailRole, jailChannel.id);

      state.setupGuilds.add(guild.id);
      state.serverSettings[guild.id] = {
        jailId: jailChannel.id,
        prisonerRoleId: jailRole.id,
        modTestId: modTestChannel.id,
        freshDisappointmentId: freshChannel.id,
        badbyesId: badbyesChannel.id,
      };
      saveRelationships();
      const recoveryNotice = missingResources.length > 0
        ? `⚠️ I noticed these setup resources were deleted: ${missingResources.join(", ")}. Recreated them.\n`
        : "";
      return recoveryNotice + "✅ **Server Setup Complete!**\n" +
        `• Jail: ${jailChannel.mention ?? `<#${jailChannel.id}>`}\n` +
        `• Mod Test: ${modTestChannel.mention ?? `<#${modTestChannel.id}>`}\n` +
        `• Welcome: ${freshChannel.mention ?? `<#${freshChannel.id}>`}\n` +
        `• Leave: ${badbyesChannel.mention ?? `<#${badbyesChannel.id}>`}`;
    } catch (error: unknown) {
      console.error("Discord setup command failed", error);
      return "❌ Setup failed. Check my permissions and try again.";
    }
  }

  async function ensurePrisonerRole(
    guild: DiscordMessage["guild"],
    settings: ServerSettings,
  ) {
    let role = settings.prisonerRoleId
      ? guild.roles.cache.get(settings.prisonerRoleId)
      : undefined;
    role ??= guild.roles.cache.find(candidate => candidate.name === "Prisoner");
    if (!role && settings.prisonerRoleId && typeof guild.roles.fetch === "function") {
      role = await guild.roles.fetch(settings.prisonerRoleId) ?? undefined;
    }
    if (!role) {
      role = await guild.roles.create({
        name: "Prisoner",
        color: 0x2f3136,
        reason: "Create the prisoner role for jail commands",
      });
    }
    if (settings.prisonerRoleId !== role.id) {
      settings.prisonerRoleId = role.id;
      saveRelationships();
    }
    return role;
  }

  async function configurePrisonerVisibility(
    guild: DiscordMessage["guild"],
    role: Awaited<ReturnType<typeof ensurePrisonerRole>>,
    jailId: string,
  ): Promise<void> {
    type PermissionChannel = {
      id: string;
      permissionOverwrites?: {
        edit: (
          target: typeof role,
          permissions: { ViewChannel?: boolean; SendMessages?: boolean },
        ) => Promise<unknown>;
      };
    };
    const channels = [...guild.channels.cache.values()] as unknown as PermissionChannel[];
    for (const channel of channels) {
      if (typeof channel.permissionOverwrites?.edit !== "function") continue;
      await channel.permissionOverwrites.edit(
        role,
        channel.id === jailId
          ? { ViewChannel: true, SendMessages: true }
          : { ViewChannel: false },
      );
    }
  }

  async function jailMember(
    guild: DiscordMessage["guild"],
    member: GuildMember,
    reason: string,
  ): Promise<string> {
    const settings = state.serverSettings[guild.id];
    if (!settings?.jailId) {
      return "❌ Run `/set_the_fuck_up` first to create the private prisoner channel.";
    }
    const role = await ensurePrisonerRole(guild, settings);
    await configurePrisonerVisibility(guild, role, settings.jailId);
    await member.roles.add(role, reason);
    saveRelationships();
    return `🔒 <@${member.id}> has been jailed in <#${settings.jailId}>.`;
  }

  async function unjailMember(
    guild: DiscordMessage["guild"],
    member: GuildMember,
    reason: string,
  ): Promise<string> {
    const settings = state.serverSettings[guild.id];
    if (!settings?.jailId) {
      return "❌ Run `/set_the_fuck_up` first to create the private prisoner channel.";
    }
    const role = await ensurePrisonerRole(guild, settings);
    await member.roles.remove(role, reason);
    saveRelationships();
    return `🔓 <@${member.id}> has been released from <#${settings.jailId}>.`;
  }

  async function handleSetup(message: DiscordMessage, args: string[]): Promise<void> {
    if (args.join(" ").toLowerCase() !== "the fuck up") {
      await send(message, "Usage: `.set the fuck up`");
      return;
    }
    if (!hasPermission(message, "Administrator")) {
      await send(message, "❌ You need the Administrator permission to use this command.");
      return;
    }
    await send(message, await setupGuild(message.guild));
  }

  async function handleMemberEvent(
    member: GuildMember | PartialGuildMember,
    event: "join" | "remove",
  ): Promise<void> {
    const settings = state.serverSettings[member.guild.id];
    if (!settings) return;
    const channelId = event === "join"
      ? settings.freshDisappointmentId
      : settings.badbyesId;
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId) as unknown as {
      send?: (content: string) => Promise<unknown>;
    } | undefined;
    if (!channel || typeof channel.send !== "function") return;

    const mention = `<@${member.id}>`;
    const defaultMessage = event === "join"
      ? `Welcome to the server, ${mention}!`
      : `Goodbye, ${mention}!`;
    const customMessage = event === "join" ? settings.welcomeMsg : settings.byeMsg;
    const renderedMessage = (customMessage ?? defaultMessage).replace(/\{user\}/g, mention);
    const rendered = renderedMessage.includes(mention)
      ? renderedMessage
      : `${renderedMessage} ${mention}`;
    await channel.send(rendered);
  }

  async function handleCommand(
    message: DiscordMessage,
    command: string,
    args: string[],
  ): Promise<void> {
    if (!SUPPORTED_COMMANDS.has(command)) return;

    const users = mentionedUsers(message);
    const members = mentionedMembers(message);

    if (command === "unhello") {
      await send(message, "https://klipy.com/gifs/judging-judge-2");
      return;
    }

    if (command === "court") {
      const member = members[0];
      const accusation = args.slice(1).join(" ") || "General Crime";
      if (!member) {
        await send(message, "Sue who?\nhttps://klipy.com/gifs/ziarastar");
        return;
      }

      const outcomeType = randomItem(["egg", "fine"] as const);
      if (outcomeType === "egg") {
        await send(
          message,
          "**Court Case:**\n" +
          `• Target: <@${member.id}>\n` +
          `• Accusation: ${accusation}\n` +
          "OH OH CRIMINAL SPOTTED\n" +
          "Penalty: egg the mother fucker!\n" +
          "https://klipy.com/gifs/hellmo-fire",
        );
        return;
      }

      const fineAmount = randomInt(100, 5000);
      if (randomItem(["humiliated", "saved"] as const) === "humiliated") {
        await send(
          message,
          "**Court Case:**\n" +
          `• Target: <@${member.id}>\n` +
          `• Accusation: ${accusation}\n` +
          `Pay a fine of ${fineAmount}$\n` +
          "https://klipy.com/gifs/what-surprised-21",
        );
      } else {
        await send(
          message,
          "**Court Case:**\n" +
          `• Target: <@${member.id}>\n` +
          `• Accusation: ${accusation}\n` +
          "Phew saved by the…\n" +
          "https://klipy.com/gifs/spongebob-wipe",
        );
      }
      return;
    }

    if (command === "mental_stability" || command === "mental") {
      const target = members[0]?.user ?? message.author;
      const targetMention = `<@${target.id}>`;
      const stability = Math.floor(Math.random() * 101);
      const status = stability >= 80
        ? "Fake, just to keep you alive."
        : "Your mental state is doubtful. You should go to therapy.";
      await send(
        message,
        `🧠 **Mental Stability Report for ${targetMention}:**\n` +
        `• Score: **${stability}%**\n` +
        `• Status: *${status}*\n` +
        "https://klipy.com/gifs/balthazar-crazy-1",
      );
      return;
    }

    if (command === "bitch_meter" || command === "bitch") {
      const target = members[0]?.user ?? message.author;
      const targetMention = `<@${target.id}>`;
      const score = Math.floor(Math.random() * 101);
      await send(
        message,
        `💅 **Bitch Meter for ${targetMention}:**\n` +
        `• How bitch you are: **${score}%**\n` +
        "• Oh, bitchy around me.\n" +
        "https://klipy.com/gifs/shut-up-shut-3",
      );
      return;
    }

    if (command === "set") return handleSetup(message, args);
    if (command === "set_the_fuck_up" || command === "setthefuckup") {
      return handleSetup(message, ["the", "fuck", "up"]);
    }

    if (command === "setwelc" || command === "setbye" || command === "setleave") {
      if (!hasPermission(message, "Administrator")) {
        await send(message, "❌ You need the Administrator permission to use this command.");
        return;
      }
      const text = args.join(" ").trim();
      if (!text) {
        await send(message, `Usage: \`.${command} [message]\``);
        return;
      }
      const settings = state.serverSettings[message.guild.id] ?? {};
      if (command === "setwelc") settings.welcomeMsg = text;
      else settings.byeMsg = text;
      state.serverSettings[message.guild.id] = settings;
        saveRelationships();
      await send(
        message,
        command === "setwelc"
          ? `✅ Welcome message updated! It will direct to **fresh-disappointment**.\nPreview: ${text}`
          : `✅ Leave message updated! It will direct to **badbyes**.\nPreview: ${text}`,
      );
      return;
    }

    if (command === "testwelc" || command === "testbye" || command === "testleave") {
      const settings = state.serverSettings[message.guild.id];
      const channelId = settings?.modTestId;
      if (!channelId) {
        await send(message, "❌ Run `.set the fuck up` first to set up the channels!");
        return;
      }
      const channel = message.guild.channels.cache.get(channelId) as unknown as {
        id: string;
        mention?: string;
        send?: (content: string) => Promise<unknown>;
      } | undefined;
      if (!channel || typeof channel.send !== "function") {
        await send(message, "❌ Mod test channel not found.");
        return;
      }
      const isWelcomeTest = command === "testwelc";
      const template = isWelcomeTest
        ? settings?.welcomeMsg ?? `Welcome to the server, <@${message.author.id}>!`
        : settings?.byeMsg ?? `Goodbye, <@${message.author.id}>!`;
      const rendered = template.replace(
        "{user}",
        `<@${message.author.id}>`,
      );
      await channel.send(
        `🧪 **[TEST ${isWelcomeTest ? "WELCOME" : "BYE"}]** -> ${rendered}`,
      );
      await send(
        message,
        `✅ Test ${isWelcomeTest ? "welcome" : "leave"} sent to ${channel.mention ?? `<#${channel.id}>`}!`,
      );
      return;
    }

    if (command === "s") {
      await send(
        message,
        formatDeletedMessages(
          state.snipes.get(message.guild.id) ?? [],
          "🕵️ **Recent deleted messages**",
        ),
      );
      return;
    }

    if (command === "cs") {
      state.snipes.delete(message.guild.id);
      await send(message, "🧹 Recent snipes have been cleared.");
      return;
    }

    if (command === "c") {
      if (!hasPermission(message, "ManageMessages")) {
        await send(message, "❌ You need the ManageMessages permission to use this command.");
        return;
      }
      const key = conversationKey(message);
      const entries = state.conversations.get(key) ?? [];
      const cutoff = Date.now() - TEN_MINUTES;
      const recentEntries = entries.filter(entry => entry.timestamp >= cutoff);
      let deletedCount = 0;
      for (const entry of recentEntries) {
        try {
          await entry.message.delete();
          deletedCount += 1;
        } catch (error: unknown) {
          console.error("Discord conversation clear failed", error);
        }
      }
      state.conversations.delete(key);
      await send(message, `🧹 Cleared ${deletedCount} messages from the last 10 minutes.`);
      return;
    }

    if (command === "purge") {
      if (!hasPermission(message, "ManageMessages")) {
        await send(message, "❌ You need the ManageMessages permission to use this command.");
        return;
      }
      const requestedAmount = args[0] ?? "";
      if (!/^\d+$/.test(requestedAmount)) {
        await send(message, "Usage: `.purge [1-100]`");
        return;
      }
      const amount = Number(requestedAmount);
      if (amount < 1 || amount > 100) {
        await send(message, "❌ Purge amount must be between 1 and 100.");
        return;
      }
      const channel = message.channel as typeof message.channel & {
        bulkDelete?: (limit: number) => Promise<unknown>;
      };
      if (typeof channel.bulkDelete !== "function") {
        await send(message, "❌ This channel does not support purging messages.");
        return;
      }
      try {
        await channel.bulkDelete(amount);
        await send(message, `🧹 Purged ${amount} messages.`);
      } catch (error: unknown) {
        console.error("Discord purge command failed", error);
        await send(message, "❌ I could not purge messages in this channel.");
      }
      return;
    }

    if (command === "mod") {
      if (!hasPermission(message, "ManageMessages")) {
        await send(message, "❌ Only moderators with ManageMessages can use `.mod`.");
        return;
      }
      await send(
        message,
        formatDeletedMessages(
          state.moderatorSnipes.get(message.guild.id) ?? [],
          "🛡️ **Moderator deleted-message log**",
          MAX_MODERATOR_SNIPE_COUNT,
        ),
      );
      return;
    }

    if (command === "afk") {
      const reason = args.join(" ").trim() || "No reason provided";
      state.afkUsers.set(message.author.id, {
        reason,
        startedAt: Date.now(),
      });
      await send(
        message,
        `💤 <@${message.author.id}> is now AFK: **${reason}**`,
      );
      return;
    }

    if (command === "ban" || command === "kick") {
      const member = members[0];
      const permission = command === "ban" ? "BanMembers" : "KickMembers";
      if (!hasPermission(message, permission)) {
        await send(message, `❌ You need the ${permission} permission to use this command.`);
        return;
      }
      if (!member) {
        await send(message, `Usage: \`.${command} @member [reason]\``);
        return;
      }
      const reason = args.slice(1).join(" ") || "No reason provided";
      try {
        if (command === "ban") {
          await member.ban({ reason });
          await send(message, `🔨 Banned <@${member.id}> for: *${reason}*. Good riddance.`);
        } else {
          await member.kick(reason);
          await send(message, `👢 Kicked <@${member.id}> for: *${reason}*. Out they go!`);
        }
      } catch (error: unknown) {
        console.error(`Discord ${command} command failed`, error);
        await send(message, `❌ I could not ${command} that member. Check role hierarchy and permissions.`);
      }
      return;
    }

    if (command === "unban") {
      if (!hasPermission(message, "BanMembers")) {
        await send(message, "❌ You need the BanMembers permission to use this command.");
        return;
      }
      const userId = args[0];
      if (!userId || !/^\d+$/.test(userId)) {
        await send(message, "Usage: `.unban <user_id>`");
        return;
      }
      try {
        const user = await client.users.fetch(userId);
        await message.guild.members.unban(user, "Unban command");
        await send(message, `🤝 Unbanned ${user.username}. Welcome back to the circus.`);
      } catch (error: unknown) {
        console.error("Discord unban command failed", error);
        await send(message, "❌ I could not unban that user. Check the ID and my permissions.");
      }
      return;
    }

    if (command === "jail" || command === "unjail") {
      if (!canModerateMembers(message)) {
        await send(message, "❌ You need the ManageRoles or ModerateMembers permission to use this command.");
        return;
      }
      const member = members[0];
      if (!member) {
        await send(message, `Usage: \`.${command} @member [reason]\``);
        return;
      }
      const reason = args.slice(1).join(" ").trim() || "Jail command";
      try {
        await send(
          message,
          command === "jail"
            ? await jailMember(message.guild, member, reason)
            : await unjailMember(message.guild, member, reason),
        );
      } catch (error: unknown) {
        console.error(`Discord ${command} command failed`, error);
        await send(message, `❌ I could not ${command} that member. Check my permissions and try again.`);
      }
      return;
    }

    if (command === "shush" || command === "unshush") {
      if (!canModerateMembers(message)) {
        await send(message, "❌ You need the ManageRoles or ModerateMembers permission to use this command.");
        return;
      }
      const member = members[0];
      if (!member) {
        await send(message, `Usage: \`.${command} @member [reason]\``);
        return;
      }
      const channel = message.channel as typeof message.channel & {
        permissionOverwrites?: {
          edit: (target: GuildMember, permissions: { SendMessages: boolean | null }) => Promise<unknown>;
        };
      };
      if (!channel.permissionOverwrites) {
        await send(message, "❌ This channel does not support shushing members.");
        return;
      }
      const channelId = (message.channel as unknown as { id?: string }).id ?? "unknown-channel";
      const shushKey = `${message.guild.id}:${channelId}:${member.id}`;
      const existingTimer = state.shushTimers.get(shushKey);

      try {
        if (existingTimer) {
          clearTimeout(existingTimer);
          state.shushTimers.delete(shushKey);
        }
        await channel.permissionOverwrites.edit(member, {
          SendMessages: command === "shush" ? false : null,
        });
        if (command === "shush") {
          const timer = setTimeout(() => {
            void channel.permissionOverwrites?.edit(member, { SendMessages: null })
              .catch(error => {
                console.error("Discord automatic unshush failed", error);
              })
              .finally(() => {
                if (state.shushTimers.get(shushKey) === timer) {
                  state.shushTimers.delete(shushKey);
                }
              });
          }, SHUSH_DURATION);
          timer.unref?.();
          state.shushTimers.set(shushKey, timer);
        }
        await send(
          message,
          command === "shush"
            ? `🤫 Shushed! <@${member.id}> cannot speak in this channel for **5 minutes**.`
            : `🔊 Unshushed! <@${member.id}> got their voice back in this channel.`,
        );
      } catch (error: unknown) {
        console.error(`Discord ${command} command failed`, error);
        await send(message, `❌ I could not ${command} that member. Check my channel permissions.`);
      }
      return;
    }

    if (command === "dora") {
      if (args[0]?.toLowerCase() === "blessings") {
        await send(message, randomDoraBlessing());
      }
      return;
    }

    if (command === "atm") {
      await runAtmDrop(message.channel);
      return;
    }

    if (command === "set_atm_channel") {
      if (!hasPermission(message, "Administrator")) {
        await send(message, "❌ You need the Administrator permission to use this command.");
        return;
      }
      state.activeAtmChannel = message.channel;
      await send(message, "✅ This channel has been set for the daily automated ATM drops!");
      return;
    }

    if (command === "debt") {
      const target = users[0] ?? message.author;
      state.knownUsers.set(target.id, target);
      state.userChannels.set(target.id, message.channel);
      await send(message, debtStatusMessage(target.id, target.username));
      return;
    }

    if (command === "inter") {
      return;
    }

    if (command === "balance" || command === "bal") {
      const target = users[0] ?? message.author;
      const displayName = target.displayName ?? target.username;
      await send(
        message,
        `💰 **${displayName}'s Balance:** $${getBalance(target.id)}`,
      );
      return;
    }

    if (command === "marry") {
      const partner = users[0];
      if (!partner) {
        await send(message, "Usage: `.marry @member`");
        return;
      }
      if (state.debts[message.author.id]?.remainingDebt || state.debts[partner.id]?.remainingDebt) {
        await send(
          message,
          "❌ Can't handle paying your debt and already want to marry? How bold. Clear all outstanding debt first.",
        );
        return;
      }
      if (partner.id === message.author.id) {
        await send(message, "You can't marry yourself!");
        return;
      }
      const authorLimit = marriageLimit(message.author);
      const partnerLimit = marriageLimit(partner);
      if (marriageConnections(message.author.id).some(connection =>
        connection.holderId === partner.id || connection.spouseId === partner.id
      )) {
        await send(
          message,
          `❌ <@${message.author.id}> and <@${partner.id}> are already married. Divorce first before marrying again.`,
        );
        return;
      }
      if (marriageCount(message.author.id) >= authorLimit) {
        await send(
          message,
          `❌ You have reached your marriage limit of **${authorLimit}**.`,
        );
        return;
      }
      if (marriageCount(partner.id) >= partnerLimit) {
        await send(
          message,
          `❌ <@${partner.id}> has reached their marriage limit of **${partnerLimit}**.`,
        );
        return;
      }
      createMarriageConnection(message.author.id, partner.id);
      saveRelationships();
      await send(
        message,
        `💍 <@${message.author.id}> and <@${partner.id}> are now officially married! Congratulations!`,
      );
      await recordRelationshipActivity(message, [message.author, partner], "marriage");
      return;
    }

    if (command === "steal") {
      const target = users[0];
      if (!target) {
        await send(message, "Usage: `.steal @member`");
        return;
      }
      if (marriageCount(message.author.id) >= marriageLimit(message.author)) {
        await send(message, "❌ You have reached your marriage limit and cannot steal someone else's spouse.");
        return;
      }
      const marriageHolder = findSpouseHolder(target.id);
      if (!marriageHolder) {
        await send(message, `❌ <@${target.id}> is not even married to anyone!`);
        return;
      }

      const question = randomItem(TRIVIA_QUESTIONS);
      await send(
        message,
        `🚨 **STEAL ATTEMPT!** <@${message.author.id}> is trying to steal <@${target.id}>!\n` +
        "Answer this within **3 seconds** to succeed:\n" +
        `**${question.question}**`,
      );
      const answer = await waitForMessage(
        candidate =>
          candidate.author.id === message.author.id &&
          candidate.channel === message.channel &&
          !candidate.author.bot,
        3_000,
      );
      if (!answer) {
        await send(message, "⏰ Too slow! You ran out of the 3-second window. The steal failed!");
      } else if (answer.content.toLowerCase().trim() !== question.answer) {
        await send(message, "❌ Wrong answer! The steal attempt failed miserably.");
      } else {
        const remainingSpouses = (state.marriages[marriageHolder] ?? [])
          .filter(spouseId => spouseId !== target.id);
        if (remainingSpouses.length === 0) {
          delete state.marriages[marriageHolder];
        } else {
          state.marriages[marriageHolder] = remainingSpouses;
        }
        if (state.marriageDetails[marriageHolder]) {
          delete state.marriageDetails[marriageHolder]![target.id];
          if (Object.keys(state.marriageDetails[marriageHolder]!).length === 0) {
            delete state.marriageDetails[marriageHolder];
          }
        }
        state.marriages[message.author.id] = [
          ...(state.marriages[message.author.id] ?? []),
          target.id,
        ];
        state.marriageDetails[message.author.id] ??= {};
        state.marriageDetails[message.author.id]![target.id] = {
          marriedAt: Date.now(),
        };
        saveRelationships();
        await send(
          message,
          `🔥 **SUCCESS!** <@${message.author.id}> answered correctly and successfully stole <@${target.id}> away!`,
        );
      }
      return;
    }

    if (command === "unsteal") {
      const stealer = users[0];
      if (!stealer) {
        await send(message, "Usage: `.unsteal @stealer`");
        return;
      }
      if (!(stealer.id in state.marriages) || state.marriages[stealer.id]!.length === 0) {
        await send(message, `❌ <@${stealer.id}> doesn't hold anyone.`);
        return;
      }
      const bribeAmount = randomInt(10, 100);
      if (getBalance(message.author.id) < bribeAmount) {
        await send(
          message,
          `❌ You don't have enough money! You need **$${bribeAmount}** to pay the bribe.`,
        );
        return;
      }
      await send(
        message,
        `💸 **UNSTEAL / BRIBE PROCESS:**\n` +
        `• Husband <@${message.author.id}> wants to unsteal their partner from <@${stealer.id}>.\n` +
        `• **Bribe Required:** **$${bribeAmount}**.\n` +
        `• **Action Required:** Husband must type \`.apologize <@${stealer.id}> [text]\` within 30 seconds, then <@${stealer.id}> must agree!`,
      );
      return;
    }

    if (command === "apologize") {
      const stealer = users[0];
      if (!stealer) {
        await send(message, "Usage: `.apologize @stealer [text]`");
        return;
      }
      const wifeId = state.marriages[stealer.id]?.[0];
      if (!wifeId) {
        await send(message, `❌ <@${stealer.id}> is not holding your partner.`);
        return;
      }
      const bribeAmount = 50;
      if (getBalance(message.author.id) < bribeAmount) {
        await send(message, "❌ You don't have enough balance to pay the bribe!");
        return;
      }
      const apologyText = args.slice(1).join(" ");
      await send(
        message,
        `💌 <@${message.author.id}> apologized to <@${stealer.id}>: *"${apologyText}"*\n` +
        `⏳ **<@${stealer.id}>**, do you accept this bribe and agree to unsteal? Type \`yes\` or \`no\` within 15 seconds.`,
      );
      const response = await waitForMessage(
        candidate =>
          candidate.author.id === stealer.id &&
          candidate.channel === message.channel &&
          ["yes", "no"].includes(candidate.content.toLowerCase().trim()),
        15_000,
      );
      if (!response) {
        await send(message, `⏰ <@${stealer.id}> took too long to respond. The unsteal request expired.`);
      } else if (response.content.toLowerCase().trim() === "yes") {
        updateBalance(message.author.id, -bribeAmount);
        updateBalance(stealer.id, bribeAmount);
        const remainingSpouses = (state.marriages[stealer.id] ?? []).filter(
          spouseId => spouseId !== wifeId,
        );
        if (remainingSpouses.length === 0) {
          delete state.marriages[stealer.id];
        } else {
          state.marriages[stealer.id] = remainingSpouses;
        }
        if (state.marriageDetails[stealer.id]) {
          delete state.marriageDetails[stealer.id]![wifeId];
          if (Object.keys(state.marriageDetails[stealer.id]!).length === 0) {
            delete state.marriageDetails[stealer.id];
          }
        }
        state.marriages[message.author.id] = [
          ...(state.marriages[message.author.id] ?? []),
          wifeId,
        ];
        state.marriageDetails[message.author.id] ??= {};
        state.marriageDetails[message.author.id]![wifeId] = {
          marriedAt: Date.now(),
        };
        saveRelationships();
        await send(
          message,
          `✨ **AGREED!** <@${stealer.id}> accepted the apology and bribe. Partner returned to <@${message.author.id}> safely! 🏠💕`,
        );
        await recordRelationshipActivity(message, [message.author, stealer], "divorce");
      } else {
        await send(message, `❌ <@${stealer.id}> **declined** the apology and bribe! The partner stays with the stealer.`);
      }
      return;
    }

    if (command === "personal") {
      const type = args[0]?.toLowerCase() as keyof typeof PERSONAL_DM_TARGETS | undefined;
      const target = type ? PERSONAL_DM_TARGETS[type] : undefined;
      if (!target) {
        await send(message, "Usage: `.personal dora` or `.personal boots`");
        return;
      }
      const user = findUserByUsername(message, target.name);
      if (!user) {
        await send(message, target.missing);
        return;
      }
      try {
        await user.send(target.message);
        await send(message, target.success);
      } catch (error: unknown) {
        console.error(`Discord personal ${type} DM failed`, error);
        await send(message, target.failure);
      }
      return;
    }

    if (command === "boots") {
      const member = members[0];
      if (!member) {
        await send(message, "Usage: `.Boots @member [accusation]`");
        return;
      }
      const accusation = args.slice(1).join(" ") || "General Incompetence";
      const outcome = weightedChoice(
        ["approved", "failed", "no_answer"] as const,
        [50, 25, 25],
      );
      const status = outcome === "approved"
        ? "Approved by ur lack sense of sanity"
        : outcome === "failed"
          ? "Dicking failed"
          : "Dicking lower";
      await send(
        message,
        "**Boots Task Assign:**\n" +
        `• Target: <@${member.id}>\n` +
        `• Accusation/Task: ${accusation}\n` +
        "• Task assigned: **Dicking lower!**\n" +
        `• Status: **${status}**\n` +
        "https://klipy.com/gifs/boots-dora-3",
      );
      return;
    }

    if (command === "barney" || command === "barney_says") {
      if (command === "barney_says" || args.join(" ").toLowerCase() === "says") {
        const [quote, gifUrl] = randomItem(BARNEY_RESPONSES);
        await send(
          message,
          `${quote}\n${gifUrl}`,
        );
      } else {
        await send(message, "Usage: `.barney says`");
      }
      return;
    }

    if (ACTION_GIF_COMMANDS.has(command)) {
      const gifUrl = ACTION_GIF_URLS[command] ?? "❌ This action GIF is not configured.";
      const target = users[0];
      if (target) {
        const verb = ACTION_GIF_VERBS[command] ?? command;
        await send(
          message,
          `<@${message.author.id}> ${verb} <@${target.id}>\n${gifUrl}`,
        );
      } else {
        await send(message, gifUrl);
      }
      return;
    }

    if (command === "hamoud") {
      if (args.join(" ").toLowerCase() === "habibi") {
        await send(message, "https://klipy.com/gifs/habibi-hammod");
      } else {
        await send(message, "Usage: `.hamoud habibi`");
      }
      return;
    }

    if (command === "botserver") {
      await send(message, "Are you funny enough tho?\nhttps://discord.gg/ptfNUqwB9");
      return;
    }

    if (command === "help_guide" || command === "bot_guide") {
      await send(
        message,
        "**Bot Commands Guide:**\n" +
        "• `.court @user [accuse]` - Puts a user on trial with random punishments.\n" +
        "• `.unhello` - Sends a judging judge GIF.\n" +
        "• `.mental` / `.mental_stability` - Checks mental stability score with a custom GIF.\n" +
        "• `.bitch` / `.bitch_meter` - Calculates bitch percentage.\n" +
        "• `.dora blessings [question]` - Asks Dora for guidance.\n" +
        "• `.boots @user [task]` - Assigns a boots task.\n" +
        "• `.barney says` - Barney says something random with a GIF.\n" +
         "• Automatic invoices: 100 curse uses/day = Terrible Mouth; 200 messages/day = Excessive Yapping; 10 marriages/day = Delusion Tax; 5 divorces/day = Relationship Felony. Discord Sitting Fee triggers after more than 2 hours of tracked activity and costs $30. Each reason triggers once per day.\n" +
         "• `/invoice @user reason:<text>` - Admin-only manual invoice with an exact custom reason, random $1-$5 fine, and 50/50 approval. Rejected invoices are saved but do not deduct money.\n" +
         "• `/debt @user` - Shows original debt, payments, remaining balance, status, labels, and consecutive debt days. Earnings and ATM payouts pay debt before adding spendable balance.\n" +
         "• Debt at 3 consecutive days can dissolve a marriage or issue a once-per-day warning; at 7 days, normal balance/progress resets and an irresponsible-debt label is applied. Debt is capped at $100.\n" +
        "• `.add @user [persona]` - Locks a user into tsundere, yandere, bakadere, sadodere, or uwu mode.\n" +
        "• `.remove @user` - Removes persona lock.\n" +
        "• `.protect @user` - Grants 24h immunity against locks.\n" +
        "• `.hamoud habibi` - Sends hamoud gif.\n" +
        "• `.botserver` - Shares the bot server invite.\n" +
        "• **Action GIFs:** `.unbirth`, `.birth`, `.pushing`, `.spank`, `.smack`, `.read`, " +
        "`.kidnap`, `.feed`, `.choke_on_dick`, `.kiss`, `.tear`, `.eat`, `.cum`, `.gem`, " +
        "`.beat`, `.beats`, `.stab`, `.slap`, `.pull`, `.castrate`, `.warn`, `.crush`, " +
        "`.destroy`, `.execute`, `.hang`, `.shoot`, `.tantrum`, `.magic`, `.dance`, `.oh no`.",
      );
      return;
    }

    if (command === "teach") {
      if (args.join(" ").toLowerCase() === "me") {
        await send(message, teachMeFunction());
      } else {
        await send(message, "Usage: `.teach me`");
      }
      return;
    }

    if (command === "reason") {
      const reason = args.join(" ").trim();
      if (!reason) {
        await send(message, "Usage: `.reason [up to 10 words]`");
        return;
      }
      const wordCount = reason.split(/\s+/).length;
      if (wordCount > 10) {
        await send(message, "❌ Your marriage reason cannot be more than 10 words.");
        return;
      }
      const connection = latestMarriageConnection(message.author.id);
      if (!connection) {
        await send(message, "❌ You must be married before setting a marriage reason.");
        return;
      }
      state.marriageDetails[connection.holderId] ??= {};
      state.marriageDetails[connection.holderId]![connection.spouseId] = {
        ...connection.metadata,
        reason,
      };
      saveRelationships();
      await send(message, "✅ Your marriage reason has been saved.");
      return;
    }

    const isMarriedCard =
      command === "married_card" ||
      (command === "married" && args[0]?.toLowerCase() === "card");
    if (isMarriedCard) {
      const connections = marriageConnections(message.author.id);
      if (connections.length === 0) {
        await send(message, "❌ Only married users can draw a married card.");
        return;
      }
      if (connections.some(connection => !connection.metadata.reason)) {
        await send(
          message,
          "❌ Set your marriage reason first with `.reason [up to 10 words]`.",
        );
        return;
      }

      await send(message, {
        embeds: [{
          title: `💍 Married Card: ${message.author.username}`,
          color: 0xff0000,
          thumbnail: { url: message.author.displayAvatarURL() },
          fields: [
            { name: "Funny Nickname", value: randomItem(SINGLE_NICKNAMES), inline: false },
            {
              name: "Married To",
              value: connections
                .map(connection => `<@${connection.spouseId === message.author.id ? connection.holderId : connection.spouseId}>`)
                .join("\n"),
              inline: false,
            },
            {
              name: "Anniversary",
              value: connections
                .map(connection => formatMarriageDate(connection.metadata.marriedAt))
                .join("\n"),
              inline: false,
            },
            {
              name: "Reason of Marriage",
              value: connections.map(connection => connection.metadata.reason!).join("\n"),
              inline: false,
            },
          ],
        }],
      });
      return;
    }

    if (command === "married") {
      await send(message, "Usage: `.married card`");
      return;
    }

    if (command === "marriage") {
      const connections = marriageConnections(message.author.id);
      const relatedBurdenLines = Object.entries(state.burdens).flatMap(
        ([parentId, children]) =>
          parentId === message.author.id || children.includes(message.author.id)
            ? children.map(childId => `👶 <@${parentId}> adopted <@${childId}>`)
            : [],
      );
      const familyLines = [
        `**🌳 ${message.author.username}'s Family Tree**`,
        `Marriage Count: ${connections.length} out of ${marriageLimit(message.author)}`,
        ...connections.map(connection =>
          `💍 <@${connection.holderId}> married <@${connection.spouseId}>`
        ),
        ...relatedBurdenLines,
      ];
      if (connections.length === 0 && relatedBurdenLines.length === 0) {
        familyLines.push("The family tree is empty.");
      }
      await send(message, familyLines.join("\n"));
      return;
    }

    if (command === "forcemarry") {
      if (!users[0] || !users[1]) {
        await send(message, "Usage: `.forcemarry @member1 @member2`");
        return;
      }
      if (Math.random() < 0.3) {
        const first = users[0];
        const second = users[1];
        const alreadyMarried = marriageConnections(first.id).some(connection =>
          connection.holderId === second.id || connection.spouseId === second.id
        );
        if (alreadyMarried) {
          await send(
            message,
            `💔 Force marriage rejected because <@${first.id}> and <@${second.id}> are already married.`,
          );
          return;
        }
        if (
          marriageCount(first.id) >= marriageLimit(first) ||
          marriageCount(second.id) >= marriageLimit(second)
        ) {
          await send(
            message,
            "💔 Force marriage rejected because one of the users has reached their marriage limit.",
          );
          return;
        }
        createMarriageConnection(first.id, second.id, "Forced marriage");
        saveRelationships();
        await send(
          message,
          `💒 Force Marriage Successful! <@${first.id}> & <@${second.id}>.\nReason: *${randomItem(FORCE_MARRIAGE_REASONS)}*`,
        );
        await recordRelationshipActivity(message, [first, second], "marriage");
      } else {
        await send(message, "💔 Force marriage rejected (70% no chance hit).");
      }
      return;
    }

    if (command === "forcedivorce") {
      if (!users[0] || !users[1]) {
        await send(message, "Usage: `.forcedivorce @member1 @member2`");
        return;
      }
      await send(
        message,
        `📜 Force Divorce Executed between <@${users[0].id}> and <@${users[1].id}>!\nReason: *${randomItem(FORCE_DIVORCE_REASONS)}*`,
      );
      if (dissolveMarriageBetween(users[0].id, users[1].id)) {
        saveRelationships();
      }
      await recordRelationshipActivity(message, [users[0], users[1]], "divorce");
      return;
    }

    if (command === "burden") {
      const child = users[0];
      if (!child) {
        await send(message, "Usage: `.burden @member`");
        return;
      }
      if (child.id === message.author.id) {
        await send(message, "You can't adopt yourself!");
        return;
      }
      const existingChildren = state.burdens[message.author.id] ?? [];
      if (existingChildren.includes(child.id)) {
        await send(message, `❌ <@${child.id}> is already part of your family tree.`);
        return;
      }

      await send(
        message,
        `👶 <@${message.author.id}> wants to adopt <@${child.id}> as a burden.\n` +
        `**<@${child.id}>**, approve or reject this adoption by typing \`yes\` or \`no\` within **60 seconds**.`,
      );
      const response = await waitForMessage(
        candidate =>
          candidate.author.id === child.id &&
          candidate.channel === message.channel &&
          ["yes", "no"].includes(candidate.content.toLowerCase().trim()),
        60_000,
      );
      if (!response) {
        await send(message, `⏰ <@${child.id}> took too long to approve the adoption. The request expired.`);
      } else if (response.content.toLowerCase().trim() === "yes") {
        state.burdens[message.author.id] = [...existingChildren, child.id];
        saveRelationships();
        await send(
          message,
          `👶 <@${message.author.id}> has adopted <@${child.id}> as a burden!\n` +
          `Reason: *${randomItem(BURDEN_REASONS)}*`,
        );
      } else {
        await send(message, `❌ <@${child.id}> rejected the adoption request.`);
      }
      return;
    }

    if (command === "unburden") {
      const child = users[0];
      if (!child) {
        await send(message, "Usage: `.unburden @member`");
        return;
      }
      const existingChildren = state.burdens[message.author.id] ?? [];
      if (!existingChildren.includes(child.id)) {
        await send(message, `❌ <@${child.id}> is not your adopted burden.`);
        return;
      }
      if (Math.random() < 0.5) {
        state.burdens[message.author.id] = existingChildren.filter(id => id !== child.id);
        if (state.burdens[message.author.id].length === 0) {
          delete state.burdens[message.author.id];
        }
        saveRelationships();
        await send(message, "I see how u dropped ur kid faster than ur morals");
      } else {
        await send(message, "Yh you keep that thing with you");
      }
      return;
    }

    if (command === "affair") {
      if (!users[0] || !users[1]) {
        await send(message, "Usage: `.affair @user1 @user2`");
        return;
      }
      await send(
        message,
        `🚨 **Drama Alert!** <@${users[0].id}> caught having an affair with <@${users[1].id}>!\nReason: *${randomItem(AFFAIR_REASONS)}*`,
      );
      return;
    }

    if (command === "single_card") {
      if (marriageCount(message.author.id) > 0) {
        await send(message, "❌ Married users cannot draw a single card.");
        return;
      }
      await send(message, {
        embeds: [{
          title: `🃏 Single Card: ${message.author.username}`,
          color: 0xff0000,
          thumbnail: { url: message.author.displayAvatarURL() },
          fields: [
            { name: "Funny Nickname", value: randomItem(SINGLE_NICKNAMES), inline: false },
            {
              name: "Humiliating Stats",
              value: "• Romantic Life: Non-existent\n• Desperation Level: 99.9%\n• Reason for being single: Everyone has basic survival instincts.",
              inline: false,
            },
          ],
        }],
      });
      return;
    }

    if (command === "add") {
      const member = members[0];
      const persona = args[1]?.toLowerCase() as keyof typeof PERSONAS | undefined;
      if (!member || !persona) {
        await send(message, "Usage: `.add @member <tsundere | yandere | bakadere | sadodere | uwu>`");
        return;
      }
      if (!(persona in PERSONAS)) {
        await send(message, "❌ Invalid persona! Choose from: `tsundere`, `yandere`, `bakadere`, `sadodere`, `uwu`");
        return;
      }
      const expiry = state.protectedUsers.get(member.id);
      if (
        PERMANENTLY_PROTECTED_USERS.has(member.id) ||
        (expiry !== undefined && expiry > Date.now())
      ) {
        await send(message, `🛡️ <@${member.id}> is protected against character/dere locking right now!`);
        return;
      }
      state.activeLocks.set(member.id, persona);
      await send(message, `🔒 <@${member.id}> has been locked into **${persona[0]!.toUpperCase()}${persona.slice(1)}** mode!`);
      return;
    }

    if (command === "remove") {
      if (!hasPermission(message, "ManageRoles")) {
        await send(message, "❌ You need the ManageRoles permission to remove a character lock.");
        return;
      }
      const member = members[0];
      if (!member) {
        await send(message, "Usage: `.remove @member`");
        return;
      }
      if (state.activeLocks.delete(member.id)) {
        await send(message, `🔓 Character lock removed from <@${member.id}>!`);
      } else {
        await send(message, `❓ <@${member.id}> is not locked into any character.`);
      }
      return;
    }

    if (command === "protect") {
      if (!hasPermission(message, "ManageRoles")) {
        await send(message, "❌ You need the ManageRoles permission to protect a member from character locking.");
        return;
      }
      const member = members[0];
      if (!member) {
        await send(message, "Usage: `.protect @member`");
        return;
      }
      state.protectedUsers.set(member.id, Date.now() + PROTECTION_DURATION);
      state.activeLocks.delete(member.id);
      await send(
        message,
        `🛡️ <@${member.id}> is now immune to character/dere locks for the next **24 hours**!`,
      );
    }
  }

  async function handleInteraction(interaction: DiscordInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ These commands can only be used inside a server.",
        ephemeral: true,
      });
      return;
    }

    state.knownUsers.set(interaction.user.id, interaction.user);
    if (interaction.channel) {
      state.userChannels.set(
        interaction.user.id,
        interaction.channel as unknown as DiscordMessage["channel"],
      );
    }
    processDebtDays();
    await interaction.deferReply();
    const reply = async (content: string): Promise<void> => {
      const chunks = splitDiscordContent(content);
      await interaction.editReply(chunks[0] ?? "");
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    };
    const guild = interaction.guild;
    const command = interaction.commandName;

    try {
      if (command === "view") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "commands") {
          await reply(
            "**Available slash commands:**\n" +
            AVAILABLE_SLASH_COMMANDS.map(name => `• \`/${name}\``).join("\n"),
          );
        } else {
          await reply("Usage: `/view commands`");
        }
        return;
      }

      if (command === "teach") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "me") {
          await reply(teachMeFunction());
        } else {
          await reply("Usage: `/teach me`");
        }
        return;
      }

      if (command === "set_the_fuck_up") {
        if (!interactionHasPermission(interaction, "Administrator")) {
          await reply("❌ You need the Administrator permission to use this command.");
          return;
        }
        await reply(await setupGuild(guild));
        return;
      }

      if (command === "set_atm_channel") {
        if (!interactionHasPermission(interaction, "Administrator")) {
          await reply("❌ You need the Administrator permission to use this command.");
          return;
        }
        if (!interaction.channel) {
          await reply("❌ This command must be used in a text channel.");
          return;
        }
        state.activeAtmChannel = interaction.channel as unknown as DiscordMessage["channel"];
        await reply("✅ This channel has been set for the daily automated ATM drops!");
        return;
      }

      if (command === "debt") {
        const target = interaction.options.getUser("user", true);
        state.knownUsers.set(target.id, target);
        if (interaction.channel) {
          state.userChannels.set(
            target.id,
            interaction.channel as unknown as DiscordMessage["channel"],
          );
        }
        await reply(debtStatusMessage(target.id, target.username));
        return;
      }

      if (command === "invoice") {
        if (!interactionHasPermission(interaction, "Administrator")) {
          await reply("❌ You need the Administrator permission to use this command.");
          return;
        }
        const target = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        if (!reason.trim()) {
          await reply("❌ The invoice reason cannot be empty.");
          return;
        }
        const day = activityDay();
        state.knownUsers.set(target.id, target);
        if (interaction.channel) {
          state.userChannels.set(
            target.id,
            interaction.channel as unknown as DiscordMessage["channel"],
          );
        }
        if (hasInvoiceForReasonOnDay(target.id, reason, day)) {
          await reply("❌ This user has already received an invoice for that reason today.");
          return;
        }
        const invoice: InvoiceRecord = {
          id: `${target.id}:manual:${Date.now()}:${randomInt(1000, 9999)}`,
          userId: target.id,
          username: target.username,
          avatarUrl: target.displayAvatarURL(),
          charge: "Manual Invoice",
          reason,
          amount: randomInt(1, 5),
          status: Math.random() < 0.5 ? "APPROVED" : "REJECTED",
          issuer: interaction.user.username,
          issuerId: interaction.user.id,
          triggerKey: `manual:${day}:${reason}`,
          issuedAt: Date.now(),
        };
        storeInvoice(invoice);
        await interaction.editReply(invoiceMessage(target, invoice));
        return;
      }

      if (command === "dora") {
        await reply(randomDoraBlessing());
        return;
      }

      if (command === "boots") {
        const target = interaction.options.getUser("user", true);
        const task = interaction.options.getString("task")?.trim() || "General Incompetence";
        const outcome = weightedChoice(
          ["approved", "failed", "no_answer"] as const,
          [50, 25, 25],
        );
        const status = outcome === "approved"
          ? "Approved by ur lack sense of sanity"
          : outcome === "failed"
            ? "Dicking failed"
            : "Dicking lower";
        await reply(
          "**Boots Task Assign:**\n" +
          `• Target: <@${target.id}>\n` +
          `• Accusation/Task: ${task}\n` +
          "• Task assigned: **Dicking lower!**\n" +
          `• Status: **${status}**\n` +
          "https://klipy.com/gifs/boots-dora-3",
        );
        return;
      }

      if (command === "add") {
        const target = interaction.options.getUser("user", true);
        const persona = interaction.options.getString("persona", true).toLowerCase() as keyof typeof PERSONAS;
        if (!(persona in PERSONAS)) {
          await reply("❌ Invalid persona! Choose from: `tsundere`, `yandere`, `bakadere`, `sadodere`, `uwu`");
          return;
        }
        const expiry = state.protectedUsers.get(target.id);
        if (
          PERMANENTLY_PROTECTED_USERS.has(target.id) ||
          (expiry !== undefined && expiry > Date.now())
        ) {
          await reply(`🛡️ <@${target.id}> is protected against character/dere locking right now!`);
          return;
        }
        state.activeLocks.set(target.id, persona);
        await reply(`🔒 <@${target.id}> has been locked into **${persona[0]!.toUpperCase()}${persona.slice(1)}** mode!`);
        return;
      }

      if (command === "remove") {
        if (!interactionHasPermission(interaction, "ManageRoles")) {
          await reply("❌ You need the ManageRoles permission to remove a character lock.");
          return;
        }
        const target = interaction.options.getUser("user", true);
        await reply(
          state.activeLocks.delete(target.id)
            ? `🔓 Character lock removed from <@${target.id}>!`
            : `❓ <@${target.id}> is not locked into any character.`,
        );
        return;
      }

      if (command === "protect") {
        if (!interactionHasPermission(interaction, "ManageRoles")) {
          await reply("❌ You need the ManageRoles permission to protect a member from character locking.");
          return;
        }
        const target = interaction.options.getUser("user", true);
        state.protectedUsers.set(target.id, Date.now() + PROTECTION_DURATION);
        state.activeLocks.delete(target.id);
        await reply(`🛡️ <@${target.id}> is now immune to character/dere locks for the next **24 hours**!`);
        return;
      }

      if (command === "jail" || command === "unjail") {
        if (!canModerateInteraction(interaction)) {
          await reply("❌ You need the ManageRoles or ModerateMembers permission to use this command.");
          return;
        }
        const target = interaction.options.getUser("user", true);
        const member = await guild.members.fetch(target.id);
        const reason = interaction.options.getString("reason")?.trim() ||
          (command === "jail" ? "Jail command" : "Unjail command");
        await reply(
          command === "jail"
            ? await jailMember(guild, member, reason)
            : await unjailMember(guild, member, reason),
        );
        return;
      }

      if (command === "setwelc" || command === "setleave") {
        if (!interactionHasPermission(interaction, "Administrator")) {
          await reply("❌ You need the Administrator permission to use this command.");
          return;
        }
        const text = interaction.options.getString("message", true).trim();
        const settings = state.serverSettings[guild.id] ?? {};
        if (command === "setwelc") settings.welcomeMsg = text;
        else settings.byeMsg = text;
        state.serverSettings[guild.id] = settings;
        saveRelationships();
        await reply(
          command === "setwelc"
            ? `✅ Welcome message updated! It will direct to **fresh-disappointment**.\nPreview: ${text}`
            : `✅ Leave message updated! It will direct to **badbyes**.\nPreview: ${text}`,
        );
        return;
      }

      if (command === "testwelc" || command === "testleave") {
        const isWelcomeTest = command === "testwelc";
        const settings = state.serverSettings[guild.id];
        const channelId = isWelcomeTest
          ? settings?.freshDisappointmentId
          : settings?.badbyesId;
        if (!channelId) {
          await reply("❌ Run `/set_the_fuck_up` first to set up the welcome and leave channels.");
          return;
        }
        const channel = guild.channels.cache.get(channelId) as unknown as {
          id: string;
          mention?: string;
          send?: (content: string) => Promise<unknown>;
        } | undefined;
        if (!channel || typeof channel.send !== "function") {
          await reply("❌ Configured welcome/leave channel not found.");
          return;
        }
        const template = isWelcomeTest
          ? settings?.welcomeMsg ?? `Welcome to the server, <@${interaction.user.id}>!`
          : settings?.byeMsg ?? `Goodbye, <@${interaction.user.id}>!`;
        const rendered = template.replace(
          "{user}",
          `<@${interaction.user.id}>`,
        );
        await channel.send(`🧪 **[TEST ${isWelcomeTest ? "WELCOME" : "BYE"}]** -> ${rendered}`);
        await reply(`✅ Test ${isWelcomeTest ? "welcome" : "leave"} sent to ${channel.mention ?? `<#${channel.id}>`}!`);
      }
    } catch (error: unknown) {
      console.error(`Discord slash command ${command} failed`, error);
      await reply("❌ The slash command could not be completed. Check my permissions and try again.");
    }
  }

  async function handleMessage(message: DiscordMessage): Promise<void> {
    if (!message.guild || message.author.bot) return;

    state.knownUsers.set(message.author.id, message.author);
    state.userChannels.set(message.author.id, message.channel);
    processDebtDays();
    const now = Date.now();
    const previous = state.processedMessages.get(message.id);
    if (previous !== undefined && now - previous < DEDUPE_WINDOW) return;
    state.processedMessages.set(message.id, now);
    for (const [id, processedAt] of state.processedMessages) {
      if (now - processedAt >= DEDUPE_WINDOW) state.processedMessages.delete(id);
    }
    recordConversation(message, now);
    await recordDailyActivity(message);

    const specialReply = specialChatReply(message);
    if (specialReply) {
      await send(message, specialReply);
      return;
    }

    const parts = message.content.startsWith(PREFIX)
      ? message.content.slice(PREFIX.length).trim().split(/\s+/)
      : [];
    let command = message.content.startsWith(PREFIX)
      ? parts.shift()?.toLowerCase()
      : undefined;
    if (command === "oh" && parts[0]?.toLowerCase() === "no") {
      parts.shift();
      command = "oh no";
    }

    const afkEntry = state.afkUsers.get(message.author.id);
    if (afkEntry && command !== "afk") {
      state.afkUsers.delete(message.author.id);
      await send(
        message,
        `👋 Welcome back, <@${message.author.id}>! You were AFK for **${formatDuration(now - afkEntry.startedAt)}**.`,
      );
    }

    const mentionedAfkUsers = mentionedUsers(message)
      .filter(user => user.id !== message.author.id)
      .map(user => ({ user, entry: state.afkUsers.get(user.id) }))
      .filter((value): value is { user: User; entry: AfkEntry } => value.entry !== undefined);
    for (const { user, entry } of mentionedAfkUsers) {
      await send(
        message,
        `💤 <@${user.id}> is AFK: **${entry.reason}** (away for **${formatDuration(now - entry.startedAt)}**).`,
      );
    }

    if (command === "add") {
      for (const mentioned of mentionedUsers(message)) {
        if (PERMANENTLY_PROTECTED_USERS.has(mentioned.id)) {
          await send(
            message,
            mentioned.id === "1252998519178924035"
              ? "Ray is always two steps ahead….TWO STEPS AHEAD " +
                "https://cdn.discordapp.com/attachments/1537411977930997871/1549915086859280385/giphy.gif"
              : "Wh..why ar…are you..so MEAN TO ME? https://klipy.com/gifs/mean-rude",
          );
          return;
        }
        const expiry = state.protectedUsers.get(mentioned.id);
        if (expiry !== undefined && expiry > now) {
          await send(
            message,
            `⚠️ <@${mentioned.id}> is currently protected from character locking!`,
          );
          return;
        }
      }
    }

    const persona = state.activeLocks.get(message.author.id);
    if (
      persona &&
      !message.content.startsWith(PREFIX) &&
      !PERSONA_TRANSLATION_EXEMPT_NAMES.has(message.author.username) &&
      !PERSONA_TRANSLATION_EXEMPT_NAMES.has(message.author.displayName)
    ) {
      const replacement = personaReplacement(persona, message.content);
      if (replacement) {
        try {
          const webhook = await getPersonaWebhook(message);
          await webhook.send({
            content: replacement,
            username: message.author.displayName ?? message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            allowedMentions: { parse: [] },
          });
          await message.delete();
        } catch (error: unknown) {
          console.error("Discord persona replacement failed", error);
        }
        return;
      }
    }

    if (!command && countWords(message.content) >= 45) {
      await send(message, randomItem(LONG_MESSAGE_RESPONSES));
    }

    if (!command) return;
    await handleCommand(message, command, parts);
  }

  state.debtTimer = setInterval(processDebtDays, DEBT_PROCESS_INTERVAL);
  state.debtTimer.unref?.();
  processDebtDays();

  return {
    handleMessage,
    handleInteraction,
    handleDelete(message: Message | PartialMessage): void {
      if (!message.guild || !message.author || message.author.bot) return;
      const deletedMessage: DeletedMessage = {
        content: message.content || "*No text*",
        author: message.author,
        timestamp: Date.now(),
      };
      const snipes = state.snipes.get(message.guild.id) ?? [];
      snipes.push(deletedMessage);
      state.snipes.set(message.guild.id, snipes.slice(-MAX_SNIPE_COUNT));

      const moderatorSnipes = state.moderatorSnipes.get(message.guild.id) ?? [];
      moderatorSnipes.push(deletedMessage);
      state.moderatorSnipes.set(
        message.guild.id,
        moderatorSnipes.slice(-MAX_MODERATOR_SNIPE_COUNT),
      );
    },
    handleMemberJoin(member: GuildMember): Promise<void> {
      return handleMemberEvent(member, "join");
    },
    handleMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
      return handleMemberEvent(member, "remove");
    },
    cleanup(): void {
      for (const cancel of state.pendingWaiters) cancel();
      state.pendingWaiters.clear();
      if (state.atmTimer) clearInterval(state.atmTimer);
      state.atmTimer = null;
      if (state.debtTimer) clearInterval(state.debtTimer);
      state.debtTimer = null;
      state.activeAtmChannel = null;
      state.protectedUsers.clear();
      state.activeLocks.clear();
      state.setupGuilds.clear();
      state.snipes.clear();
      state.moderatorSnipes.clear();
      state.conversations.clear();
      state.afkUsers.clear();
      for (const timer of state.shushTimers.values()) clearTimeout(timer);
      state.shushTimers.clear();
      state.personaWebhooks.clear();
      state.processedMessages.clear();
    },
  };

}
