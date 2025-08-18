export function isNowInTimeWindow(window: string): boolean {
  const [startStr, endStr] = window.split('-');
  const now = new Date();

  // Parse start time
  const startTime = parseTimeString(startStr);
  const endTime = parseTimeString(endStr);

  // Create Date objects for today with the parsed times
  const start = new Date(now);
  console.log({ start });
  start.setHours(startTime.hours, startTime.minutes, 0, 0);

  const end = new Date(now);
  end.setHours(endTime.hours, endTime.minutes, 0, 0);

  // Handle overnight time windows (e.g., 9:00 PM - 5:00 AM)
  if (end < start) {
    end.setDate(end.getDate() + 1);
  }

  console.log({ now, start, end, startTime, endTime });
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
