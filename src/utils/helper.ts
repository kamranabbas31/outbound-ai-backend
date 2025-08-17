export function isNowInTimeWindow(window: string): boolean {
    const [startStr, endStr] = window.split("-");
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    console.log({now,start,end})
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    start.setHours(startH, startM, 0, 0);
    end.setHours(endH, endM, 0, 0);
    console.log("after the calculation")
    console.log({start,end})
    return now >= start && now <= end;
}