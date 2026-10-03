export type EmailInboxLink = {
  label: string;
  href: string;
};

export function inboxLinkForEmail(email: string): EmailInboxLink | null {
  const domain = email.trim().toLowerCase().split("@").at(1) ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { label: "Open Gmail inbox", href: "https://mail.google.com/mail/u/0/#inbox" };
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { label: "Open Outlook inbox", href: "https://outlook.live.com/mail/0/inbox" };
  }
  if (domain === "yahoo.com" || domain.startsWith("yahoo.")) {
    return { label: "Open Yahoo Mail", href: "https://mail.yahoo.com/" };
  }
  return null;
}
