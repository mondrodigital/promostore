interface CalendarEvent {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: string;
}

export function generateCalendarUrls(event: CalendarEvent) {
  const {
    title,
    description,
    startDate,
    endDate,
    location
  } = event;

  // Format dates for different calendar providers
  const formatDateForGoogle = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const formatDateForOutlook = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  // Encode text for URLs
  const encodeText = (text: string) => encodeURIComponent(text);

  // Google Calendar URL
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeText(title)}&dates=${formatDateForGoogle(startDate)}/${formatDateForGoogle(endDate)}&details=${encodeText(description)}&location=${encodeText(location)}&sf=true&output=xml`;

  // Outlook Calendar URL 
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeText(title)}&startdt=${formatDateForOutlook(startDate)}&enddt=${formatDateForOutlook(endDate)}&body=${encodeText(description)}&location=${encodeText(location)}`;

  // Outlook Office 365 URL
  const outlook365Url = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${encodeText(title)}&startdt=${formatDateForOutlook(startDate)}&enddt=${formatDateForOutlook(endDate)}&body=${encodeText(description)}&location=${encodeText(location)}`;

  // Yahoo Calendar URL
  const yahooUrl = `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${encodeText(title)}&st=${formatDateForGoogle(startDate)}&et=${formatDateForGoogle(endDate)}&desc=${encodeText(description)}&in_loc=${encodeText(location)}`;

  // Apple Calendar (webcal) - works on iOS/macOS
  const appleUrl = `data:text/calendar;charset=utf8,BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
URL:${googleUrl}
DTSTART:${formatDateForGoogle(startDate)}
DTEND:${formatDateForGoogle(endDate)}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;

  return {
    google: googleUrl,
    outlook: outlookUrl,
    outlook365: outlook365Url,
    yahoo: yahooUrl,
    apple: appleUrl,
    // Generic ICS download link
    ics: `data:text/calendar;charset=utf8,BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Vellum Event Items//Calendar//EN
BEGIN:VEVENT
DTSTART:${formatDateForGoogle(startDate)}
DTEND:${formatDateForGoogle(endDate)}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
UID:${Date.now()}@vellummortgage.com
END:VEVENT
END:VCALENDAR`
  };
}

export function generateCalendarButtonsHtml(event: CalendarEvent): string {
  const urls = generateCalendarUrls(event);
  
  return `
    <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #0075AE;">
      <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">📅 Add to Your Calendar</h3>
      <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">Click your preferred calendar app to add this reminder:</p>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        <a href="${urls.google}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: #4285f4; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">📅 Google Calendar</a>
        <a href="${urls.outlook}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">📅 Outlook</a>
        <a href="${urls.outlook365}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">📅 Office 365</a>
        <a href="${urls.yahoo}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: #7B0099; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">📅 Yahoo</a>
        <a href="${urls.ics}" download="calendar-event.ics" style="display: inline-block; padding: 8px 16px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">📥 Download ICS</a>
      </div>
    </div>`;
} 