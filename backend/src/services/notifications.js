import Notification from "../models/Notification.js";

export async function notify(userIds, message, requestId) {
  const recipients = [...new Set(userIds.map((id) => String(id)))];
  if (!recipients.length) return;
  await Notification.insertMany(
    recipients.map((user) => ({ user, message, requestId: requestId || "" }))
  );
}
