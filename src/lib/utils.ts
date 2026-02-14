import { format, nextSaturday, previousSaturday, isSaturday, isSunday, isAfter, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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
 * Check if results checking is allowed (after 17:00 UK time on Saturday).
 */
export function canCheckResults(): boolean {
  const now = getUKNow();
  if (!isSaturday(now)) return false;
  return now.getHours() >= 17;
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
        `${sel.fixture.home_team} vs ${sel.fixture.away_team}`
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
