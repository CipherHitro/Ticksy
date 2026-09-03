import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middlewares/validate.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validators.js';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
} from '../controllers/auth.controller.js';

const router = Router();

// Brute-force protection on login specifically - this is the endpoint
// attackers actually hammer. Registration gets a looser limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, try again later' },
});

router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', loginLimiter, validate(loginSchema), loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', requireAuth, meHandler);

export default router;
