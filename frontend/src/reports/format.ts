import type { FallbackReason, ReportRead } from '../api/client';

export function fallbackReasonLabel(reason: FallbackReason | null | undefined): string {
  switch (reason) {
    case 'no_api_key':
      return 'No AI key is configured';
    case 'timeout':
      return 'The AI service took too long';
    case 'rate_limited':
      return 'The AI service is busy';
    case 'provider_error':
      return 'The AI service is unavailable';
    case 'invalid_output':
      return 'The AI answer was not usable, showing the standard report';
    default:
      return '';
  }
}

export function canRetryAI(reason: FallbackReason | null | undefined): boolean {
  return reason !== 'no_api_key';
}

export function formatReportAsText(report: ReportRead): string {
  const lines: string[] = [];

  lines.push(`Coaching Report - Session #${report.session_id}`);
  lines.push('');
  lines.push('Summary');
  lines.push(report.narrative.summary);
  lines.push('');

  lines.push('Strengths');
  for (const s of report.narrative.strengths) {
    lines.push(`- ${s}`);
  }
  lines.push('');

  if (report.narrative.issues && report.narrative.issues.length > 0) {
    lines.push('Areas for Improvement');
    for (const issue of report.narrative.issues) {
      lines.push(`- ${issue.rule}: ${issue.explanation}`);
      lines.push(`  Tip: ${issue.tip}`);
    }
    lines.push('');
  }

  lines.push('Next Session');
  report.narrative.next_session.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });
  lines.push('');

  lines.push('Fatigue Analysis');
  lines.push(report.narrative.fatigue_note);

  return lines.join('\n');
}
