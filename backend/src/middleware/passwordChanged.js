export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ message: "Change your temporary password before continuing." });
  }
  return next();
}
