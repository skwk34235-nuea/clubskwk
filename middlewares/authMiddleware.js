const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/auth/login');
        }
        if (req.session.user.role !== role) {
            return res.redirect('/'); // Not authorized
        }
        next();
    };
};

const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

module.exports = { requireRole, requireLogin };
