export function userError(reason: unknown, fallback = 'The request could not be completed. Please try again.'): string {
  const message = reason instanceof Error ? reason.message : '';
  if (/duplicate key|unique constraint|23505/i.test(message)) return 'This record already exists. Check the existing records before adding another.';
  if (/row.level security|permission denied|42501/i.test(message)) return 'Your account does not have permission for this action.';
  if (/schema cache|could not find.*function|column .* does not exist|relation .* does not exist/i.test(message)) return 'This feature needs a database update. Please contact your system administrator.';
  if (/violates|constraint|syntax error|invalid input syntax|SQLSTATE|postgres|PGRST|foreign key|check violation/i.test(message)) return fallback;
  if (/fetch|network/i.test(message)) return 'The connection was interrupted. Check your connection and try again.';
  return message || fallback;
}
