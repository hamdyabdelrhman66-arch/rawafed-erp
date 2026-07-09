import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'rawafed-dev-secret');
if (!jwtSecret)
    throw new Error('JWT_SECRET is required in production.');
const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret;
export function signUser(user) {
    return jwt.sign({
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
    }, jwtSecret, { expiresIn: '12h' });
}
export function signRefreshToken(user, tokenId) {
    return jwt.sign({ sub: user.id, tokenId, type: 'refresh' }, refreshSecret, { expiresIn: '30d' });
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, refreshSecret);
}
export function createOpaqueToken() {
    return randomBytes(48).toString('base64url');
}
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
        res.status(401).json({ message: 'Authentication required.' });
        return;
    }
    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
}
export function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required.' });
            return;
        }
        if (req.user.role === 'Super Admin' || roles.includes(req.user.role)) {
            next();
            return;
        }
        res.status(403).json({ message: 'You do not have access to this resource.' });
    };
}
