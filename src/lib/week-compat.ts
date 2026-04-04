import { Week } from '@/types';

type WeekLike = Partial<Week> & {
  saturday_date?: string;
  target_date?: string;
  target_kickoff_time?: string;
  is_custom?: boolean;
};

export function isMissingWeekColumnError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    message.includes('column weeks.is_custom does not exist') ||
    message.includes('column weeks.target_date does not exist') ||
    message.includes('column weeks.target_kickoff_time does not exist') ||
    message.includes('target_date does not exist') ||
    message.includes('target_kickoff_time does not exist') ||
    message.includes('is_custom does not exist')
  );
}

export function normalizeWeek<T extends WeekLike | null | undefined>(week: T): Week | null {
  if (!week) return null;

  return {
    ...(week as Week),
    saturday_date: String(week.saturday_date || week.target_date || ''),
    target_date: String(week.target_date || week.saturday_date || ''),
    target_kickoff_time: String(week.target_kickoff_time || '15:00:00'),
    is_custom: Boolean(week.is_custom),
  };
}

export function normalizeWeeks<T extends WeekLike>(weeks: T[] | null | undefined): Week[] {
  return (weeks || []).map((week) => normalizeWeek(week)).filter(Boolean) as Week[];
}
