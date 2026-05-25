function authMiddleware(db) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ error: '未登录' });

    const session = db.prepare(
      "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).get(token);

    if (!session) return res.status(401).json({ error: '会话过期，请重新登录' });
    req.session = session;
    next();
  };
}

function teacherOnly(req, res, next) {
  if (req.session.user_type !== 'teacher') {
    return res.status(403).json({ error: '需要教师权限' });
  }
  next();
}

function adminOnly(db) {
  return (req, res, next) => {
    if (req.session.user_type !== 'teacher') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    const teacher = db.prepare('SELECT is_admin FROM teachers WHERE username = ?').get(req.session.teacher_username);
    if (!teacher?.is_admin) {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
  };
}

module.exports = { authMiddleware, teacherOnly, adminOnly };
