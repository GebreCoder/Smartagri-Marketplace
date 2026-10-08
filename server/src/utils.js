// ─── Shared helpers ported 1:1 from the original app services ─────

export const normalizeText = (value) => String(value ?? "").trim();

export const capitalize = (value) => {
  const text = normalizeText(value).toLowerCase();
  if (!text) return "Pending";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatMoney = (value) =>
  `ETB ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

export const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getProfileName = (row, fallback = "") =>
  normalizeText(row?.full_name) || normalizeText(row?.name) || fallback || "";

export const toDisplayOrderId = (id) => {
  const value = normalizeText(id).replace(/[^a-zA-Z0-9]/g, "");
  if (!value) return "ORD-000000";
  return `ORD-${value.slice(0, 8).toUpperCase()}`;
};

export const formatStatus = (status) => {
  const value = normalizeText(status).toLowerCase();
  if (value === "accepted") return "Accepted";
  if (value === "rejected") return "Rejected";
  return "Pending";
};

export const resolveImageUrl = (value) => {
  const text = normalizeText(value);
  if (!text) return "";
  return text; // stored as absolute URL (public /uploads path or remote)
};

// ─── Account rules (ported from src/admin/accountRules.js) ─────────
export const USER_TYPES = { ADMIN: "admin", FARMER: "farmer", BUYER: "buyer" };
export const ACCOUNT_STATES = { ACTIVE: "active", INACTIVE: "inactive" };

export const splitAccountRole = (roleValue) => {
  const value = normalizeText(roleValue).toLowerCase();
  if (value === USER_TYPES.ADMIN) {
    return { userType: USER_TYPES.ADMIN, accountState: ACCOUNT_STATES.ACTIVE };
  }
  const [rawUserType = USER_TYPES.BUYER, rawState = ACCOUNT_STATES.ACTIVE] = value.split("_");
  const userType = [USER_TYPES.FARMER, USER_TYPES.BUYER].includes(rawUserType) ? rawUserType : USER_TYPES.BUYER;
  const accountState = rawState === ACCOUNT_STATES.INACTIVE ? ACCOUNT_STATES.INACTIVE : ACCOUNT_STATES.ACTIVE;
  return { userType, accountState };
};

export const composeAccountRole = (userType, accountState) => {
  const safeUserType = [USER_TYPES.FARMER, USER_TYPES.BUYER, USER_TYPES.ADMIN].includes(normalizeText(userType).toLowerCase())
    ? normalizeText(userType).toLowerCase()
    : USER_TYPES.BUYER;
  const safeState = normalizeText(accountState).toLowerCase() === ACCOUNT_STATES.INACTIVE ? ACCOUNT_STATES.INACTIVE : ACCOUNT_STATES.ACTIVE;
  if (safeUserType === USER_TYPES.ADMIN) return USER_TYPES.ADMIN;
  return safeState === ACCOUNT_STATES.ACTIVE ? safeUserType : `${safeUserType}_${safeState}`;
};

export const isRestrictedAccount = (roleValue) => {
  const { accountState } = splitAccountRole(roleValue);
  return accountState === ACCOUNT_STATES.INACTIVE;
};

/** Blocks login for deactivated accounts. */
export const blocksLogin = (roleValue) => isRestrictedAccount(roleValue);

export const getAccountStateLabel = (accountState) =>
  accountState === ACCOUNT_STATES.INACTIVE ? "Inactive" : "Active";

// ─── Product shaping (ported from src/buyer/buyerService.js) ───────
export const shapeProduct = (row, farmer) => {
  const quantity = Number(row?.quantity || 0);
  const price = Number(row?.price || 0);
  const category = normalizeText(row?.category) || "Other";
  const description = normalizeText(row?.description);
  const title = normalizeText(row?.name) || "Product";

  const isOrganic = /organic/i.test(`${title} ${description} ${category}`);
  const isBulk = quantity >= 100 || /bulk/i.test(`${title} ${description}`);

  return {
    id: row.id,
    farmer_id: row.farmer_id,
    name: title,
    category,
    description,
    price,
    quantity,
    location: normalizeText(row?.location) || normalizeText(farmer?.location),
    image_url: resolveImageUrl(row?.image_url),
    created_at: row?.created_at,
    farmer_name: getProfileName(farmer, "Farmer"),
    farmer_location: normalizeText(farmer?.location),
    farmer_image_url: resolveImageUrl(farmer?.profile_image_url),
    price_label: formatMoney(price),
    stock_label: `${quantity} in stock`,
    created_label: formatDateTime(row?.created_at),
    is_organic: isOrganic,
    is_bulk: isBulk,
  };
};

export const ORDER_ACCENT = (category) =>
  category === "Grains" ? "#F8EDDA" : category === "Fruits" ? "#DDE7F8" : "#DCEED7";

export const ORDER_ICON = (category) =>
  category === "Grains" ? "layers-outline" : category === "Fruits" ? "nutrition-outline" : "cube-outline";

// ─── Order lifecycle steps (buyer → farmer, shared tracker) ────────
// Mirrors the production workflow: place → accept → prepare → ready →
// out for delivery → delivered → completed. Payment is tracked on the
// order card as a badge rather than a step, because payment and order
// lifecycles are independent (an order can be paid while preparing).
export const ORDER_STEPS = [
  { key: "placed", label: "Placed" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready_for_delivery", label: "Ready" },
  { key: "dispatched", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
];

export const ORDER_STATUS_LABEL = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready_for_delivery: "Ready for Delivery",
  dispatched: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  rejected: "Declined",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const DELIVERY_METHOD_LABEL = {
  delivery: "Home delivery",
  pickup: "Farm pickup",
};

export const TERMINAL_STATUSES = ["rejected", "cancelled", "refunded"];

/**
 * Build the progress tracker for an order from its raw status + payment flag.
 * Returns { steps, currentIndex, terminal, terminalLabel }.
 *   - steps:      [{ label, done, current }] for the visual tracker
 *   - terminal:   true for rejected / cancelled orders (show a banner)
 *   - terminalLabel: human text explaining the terminal state
 */
export const buildOrderSteps = (rawStatus, isPaid = false) => {
  const status = normalizeText(rawStatus).toLowerCase() || "pending";
  const terminal = TERMINAL_STATUSES.includes(status);

  let index;
  switch (status) {
    case "accepted":
      index = 1;
      break;
    case "preparing":
      index = 2;
      break;
    case "ready_for_delivery":
      index = 3;
      break;
    case "dispatched":
      index = 4;
      break;
    case "delivered":
      index = 5;
      break;
    case "completed":
      index = 6;
      break;
    case "pending":
    default:
      index = 0;
  }

  const steps = ORDER_STEPS.map((s, i) => ({
    label: s.label,
    done: i < index || status === "completed",
    current: i === index,
  }));

  return {
    steps,
    currentIndex: index,
    terminal,
    terminalLabel:
      status === "rejected"
        ? "The farmer declined this order."
        : status === "cancelled"
          ? "You cancelled this order."
          : status === "refunded"
            ? "This order was refunded."
            : "",
  };
};
