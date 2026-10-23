/** The workflow assistant has no record-retrieval tool or live database context. */
export function requestsLiveInternshipData(message: string): boolean {
  const question = message.trim();
  if (!question) return false;

  // Keep workflow questions useful while refusing requests that require records
  // the conversational assistant cannot retrieve or verify.
  if (/^how (?:do|can|should) i\b/i.test(question)) return false;
  const asksForResult =
    /\b(?:what(?:'s| is| are)?|which|who|how many|how much|show|list|tell me|check|find|retrieve|fetch|give me|summarize)\b/i.test(
      question,
    );
  const refersToRecords =
    /\b(?:my|our|current|latest|today(?:'s)?|actual|assigned|specific|live|all)\b/i.test(
      question,
    );
  const internshipData =
    /\b(?:attendance|time[ -]?(?:in|out)|rendered hours?|internship hours?|grades?|scores?|evaluations?|weekly logs?|documents?|submissions?|assignments?|interns?|students?|placements?|compliance|performance|progress|risk|trends?|scopes?|approval status)\b/i.test(
      question,
    );
  return asksForResult && refersToRecords && internshipData;
}

export const liveDataUnavailableReply =
  "I cannot check live internship records in this chat. Open your authorized PRAXIZ workspace to verify the relevant attendance, hours, Weekly Logs, documents, assignments, or evaluations. I can explain where to find the information and what its statuses mean, but I cannot confirm any personal or institutional record from this conversation.";
