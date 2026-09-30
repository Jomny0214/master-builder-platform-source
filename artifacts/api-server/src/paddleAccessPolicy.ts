export type PaddleAccessChange = "revoke" | "restore" | null;

export function getPaddleAccessChange(
  action: string,
  status: string,
): PaddleAccessChange {
  const approved = status === "approved";
  const pending = status === "pending_approval";
  const reversed = status === "reversed";

  if (
    (action === "refund" && approved) ||
    ((action === "chargeback" || action === "chargeback_warning") &&
      (approved || pending))
  ) {
    return "revoke";
  }

  if (
    action === "credit_reverse" ||
    action === "chargeback_reverse" ||
    ((action === "refund" ||
      action === "chargeback" ||
      action === "chargeback_warning") &&
      reversed)
  ) {
    return "restore";
  }

  return null;
}