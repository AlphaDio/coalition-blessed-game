const LAW_UI_LOG_KEYWORDS = [
  '*** LAW ENACTED ***',
  '*** LAW FAILED',
  '*** LAW BURIED',
  'Phase advanced',
  'VOTING phase complete',
  'Hero Passive',
  'Hero pressure',
  'Hero sentiment',
  'Hero Ability',
  'Hero charge',
  'Unrest externality',
  'ERROR'
];

export function filterLawLogs(logs) {
  return logs.filter(line => LAW_UI_LOG_KEYWORDS.some(keyword => line.includes(keyword)));
}
