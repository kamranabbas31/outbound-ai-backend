export function isNowInTimeWindow(window: string): boolean {
  const [startStr, endStr] = window.split('-');
  const now = getNowInEST();

  // Parse start time
  const startTime = parseTimeString(startStr);
  const endTime = parseTimeString(endStr);

  // Create Date objects for today with the parsed times in EST
  const start = new Date(now);
  start.setHours(startTime.hours, startTime.minutes, 0, 0);

  const end = new Date(now);
  end.setHours(endTime.hours, endTime.minutes, 0, 0);

  // Handle overnight time windows (e.g., 9:00 PM - 5:00 AM)
  if (end < start) {
    end.setDate(end.getDate() + 1);
  }

  console.log({
    window,
    now: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    start: start.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    end: end.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    startTime,
    endTime,
    result: now >= start && now <= end,
  });
  return now >= start && now <= end;
}

function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  // Remove any whitespace and convert to lowercase
  const cleanTime = timeStr.trim().toLowerCase();

  // Check if it's 12-hour format (contains AM/PM)
  if (cleanTime.includes('am') || cleanTime.includes('pm')) {
    const match = cleanTime.replace(/\s/g, '').match(/(\d+:\d+)(am|pm)/);
    if (!match) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    const [, time, period] = match;
    const [hours, minutes] = time.split(':').map(Number);

    let adjustedHours = hours;
    if (period === 'pm' && hours !== 12) {
      adjustedHours += 12;
    } else if (period === 'am' && hours === 12) {
      adjustedHours = 0;
    }

    return { hours: adjustedHours, minutes };
  } else {
    // Assume 24-hour format
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  }
}
function getNowInEST(): Date {
  // Create a date in UTC
  const now = new Date();

  // Convert UTC to EST (America/New_York, handles DST automatically)
  const estString = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });
  return new Date(estString);
}
