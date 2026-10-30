const MAX_REVIEW_LENGTH = 500;
const MAX_INVOICE_ITEMS = 10;
const MAX_ITEM_DESCRIPTION = 100;
const MAX_ITEM_AMOUNT = 1000000;
const MAX_INVOICE_NOTES = 300;

// Validates a customer review. Returns { error } or { value }.
const validateReviewInput = (body) => {
  const { rating, comment } = body || {};

  if (typeof rating !== "number" || !Number.isInteger(rating)) {
    return { error: "Rating must be a whole number from 1 to 5" };
  }

  if (rating < 1 || rating > 5) {
    return { error: "Rating must be a whole number from 1 to 5" };
  }

  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return { error: "Review text must be text" };
  }

  const trimmed = (comment || "").trim();

  if (trimmed.length > MAX_REVIEW_LENGTH) {
    return {
      error: `Review must not exceed ${MAX_REVIEW_LENGTH} characters`,
    };
  }

  return { value: { rating, comment: trimmed } };
};

// Validates itemised invoice charges entered by the assigned mechanic.
// Amounts are summed in minor units (paise) to avoid floating-point drift.
// Returns { error } or { value: { lineItems, totalAmount, notes } }.
const validateInvoiceInput = (body) => {
  const { lineItems, notes } = body || {};

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { error: "Add at least one charge" };
  }

  if (lineItems.length > MAX_INVOICE_ITEMS) {
    return { error: `An invoice can have at most ${MAX_INVOICE_ITEMS} charges` };
  }

  const cleaned = [];
  let totalMinor = 0;

  for (const item of lineItems) {
    const description =
      typeof item?.description === "string" ? item.description.trim() : "";

    if (!description || description.length > MAX_ITEM_DESCRIPTION) {
      return {
        error: `Each charge needs a description of 1 to ${MAX_ITEM_DESCRIPTION} characters`,
      };
    }

    const amount = item?.amount;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > MAX_ITEM_AMOUNT
    ) {
      return {
        error: `Each amount must be a number from 0 to ${MAX_ITEM_AMOUNT}`,
      };
    }

    const minor = Math.round(amount * 100);

    if (Math.abs(minor - amount * 100) > 1e-6) {
      return { error: "Amounts can have at most 2 decimal places" };
    }

    totalMinor += minor;
    cleaned.push({ description, amount: minor / 100 });
  }

  if (totalMinor <= 0) {
    return { error: "The invoice total must be greater than zero" };
  }

  let cleanNotes = "";

  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") {
      return { error: "Notes must be text" };
    }

    cleanNotes = notes.trim();

    if (cleanNotes.length > MAX_INVOICE_NOTES) {
      return { error: `Notes must not exceed ${MAX_INVOICE_NOTES} characters` };
    }
  }

  return {
    value: {
      lineItems: cleaned,
      totalAmount: totalMinor / 100,
      notes: cleanNotes,
    },
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const requested = Number.parseInt(query?.limit, 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, requested));

  return { page, limit, skip: (page - 1) * limit };
};

module.exports = {
  validateReviewInput,
  validateInvoiceInput,
  escapeRegex,
  parsePagination,
  MAX_REVIEW_LENGTH,
};
