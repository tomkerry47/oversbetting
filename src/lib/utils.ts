import { addHours, format, isSaturday, isSunday, nextSaturday } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Week } from '@/types';

const UK_TZ = 'Europe/London';

/**
 * Get the current time in UK timezone.
 */
export function getUKNow(): Date {
  return toZonedTime(new Date(), UK_TZ);
}

/**
 * Get the relevant Saturday date for this week.
 * - On Saturday, returns today
 * - On Sunday, returns next Saturday (new week)
 * - Mon-Fri, returns the coming Saturday
 * @param weekOffset - Number of weeks to offset (0 = current, 1 = next, -1 = previous)
 */
export function getRelevantSaturday(weekOffset: number = 0): string {
  // TEMP: Use a test date for development when system date is in future
  // Remove this after testing with real fixtures
  const TEST_DATE = process.env.NEXT_PUBLIC_TEST_DATE;
  if (TEST_DATE) {
    console.log(`Using test date: ${TEST_DATE}`);
    const testDate = new Date(TEST_DATE);
    testDate.setDate(testDate.getDate() + (weekOffset * 7));
    return format(testDate, 'yyyy-MM-dd');
  }

  const now = getUKNow();

  let saturday: Date;
  if (isSaturday(now)) {
    saturday = now;
  } else if (isSunday(now)) {
    // Sunday = new week, target next Saturday
    saturday = nextSaturday(now);
  } else {
    // Mon-Fri: target coming Saturday
    saturday = nextSaturday(now);
  }

  // Apply week offset
  saturday.setDate(saturday.getDate() + (weekOffset * 7));
  
  return format(saturday, 'yyyy-MM-dd');
}

/**
 * Get the Saturday anchor date for any target date.
 * Sunday is treated as the start of the next game week.
 */
export function getSaturdayForTargetDate(targetDate: string): string {
  const date = new Date(`${targetDate}T12:00:00`);

  let saturday: Date;
  if (isSaturday(date)) {
    saturday = date;
  } else if (isSunday(date)) {
    saturday = nextSaturday(date);
  } else {
    saturday = nextSaturday(date);
  }

  return format(saturday, 'yyyy-MM-dd');
}

/**
 * Check if today is Sunday (reset day).
 */
export function isResetDay(): boolean {
  return isSunday(getUKNow());
}

/**
 * Format a date for display.
 */
export function formatDate(date: string): string {
  return format(new Date(date), 'dd MMM yyyy');
}

export function normalizeKickoffTime(kickoffTime: string): string {
  const trimmed = String(kickoffTime || '').trim();
  const match = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return trimmed;

  const [, hours, minutes, seconds] = match;
  return `${hours}:${minutes}:${seconds || '00'}`;
}

export function formatKickoffTimeLabel(kickoffTime: string): string {
  const normalized = normalizeKickoffTime(kickoffTime);
  return normalized.length >= 5 ? normalized.slice(0, 5) : normalized;
}

export function formatRoundLabel(week: Pick<Week, 'week_number' | 'is_custom'>): string {
  return `Week ${week.week_number}${week.is_custom ? '.5' : ''}`;
}

export function getRoundResultsAvailableAt(targetDate: string, kickoffTime: string): Date {
  const normalizedTime = formatKickoffTimeLabel(kickoffTime);
  const kickoffUtc = fromZonedTime(`${targetDate}T${normalizedTime}:00`, UK_TZ);
  return addHours(kickoffUtc, 2);
}

export function canCheckResultsForWeek(week: Pick<Week, 'target_date' | 'target_kickoff_time'>): boolean {
  return new Date() >= getRoundResultsAvailableAt(week.target_date, week.target_kickoff_time);
}

export function toLeagueCode(leagueNameRaw: string | null | undefined): string {
  const leagueName = String(leagueNameRaw || '').trim();
  const knownCodes: Record<string, string> = {
    'Premier League': 'pl',
    Championship: 'champ',
    'League One': 'l1',
    'League Two': 'l2',
    'National League': 'nl',
    'Scottish Premiership': 'spl',
    'Scottish Championship': 'schamp',
    'Scottish League One': 'sl1',
    'Scottish League Two': 'sl2',
    'FA Cup': 'fac',
    'Scottish Cup': 'sc',
  };

  if (knownCodes[leagueName]) return knownCodes[leagueName];

  const initials = leagueName
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .map((part) => part[0]?.toLowerCase())
    .join('');

  return initials || 'lg';
}

/**
 * Calculate week number based on the season start.
 */
export function calculateWeekNumber(saturdayDate: string, seasonStart: string = '2025-08-01'): number {
  const saturday = new Date(saturdayDate);
  const start = new Date(seasonStart);
  const diffTime = saturday.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

/**
 * Format selections for easy copying to a group chat.
 */
export function formatSelectionsForCopy(
  selections: Array<{
    player_name: string;
    fixture?: {
      home_team: string;
      away_team: string;
      league_name: string;
    };
  }>
): string {
  const grouped: Record<string, string[]> = {};

  for (const sel of selections) {
    if (!grouped[sel.player_name]) {
      grouped[sel.player_name] = [];
    }
    if (sel.fixture) {
      grouped[sel.player_name].push(
        `${sel.fixture.home_team} vs ${sel.fixture.away_team} (${toLeagueCode(sel.fixture.league_name)})`
      );
    }
  }

  let text = '⚽ BETTING OVERS - This Week\'s Picks ⚽\n';
  text += '━━━━━━━━━━━━━━━━━━━━━━━━\n';

  for (const [player, picks] of Object.entries(grouped)) {
    text += `\n🏟️ ${player}:\n`;
    picks.forEach((pick, i) => {
      text += `  ${i + 1}. ${pick}\n`;
    });
  }

  text += '\n━━━━━━━━━━━━━━━━━━━━━━━━';
  text += '\n💰 Over 2.5 goals to win!';

  return text;
}
