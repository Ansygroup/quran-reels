// Bot protection middleware - rate limiting + suspicious pattern detection
// Blocks excessive requests from single IP (likely bots/scrapers)

const RATE_LIMIT = 60; // max requests per minute per IP
const WINDOW_MS = 60000;
const ipCounts = new Map();

export default function middleware(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ua = request.headers.get('user-agent') || '';
  
  // Allow legitimate crawlers
  const allowedBots = ['Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider', 'YandexBot', 'Sogou', 'Exabot', 'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'WhatsApp', 'TelegramBot', 'Applebot'];
  if (allowedBots.some(bot => ua.includes(bot))) {
    return;
  }
  
  // Rate limiting
  const now = Date.now();
  const entry = ipCounts.get(ip) || { count: 0, windowStart: now };
  
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  
  entry.count++;
  ipCounts.set(ip, entry);
  
  if (entry.count > RATE_LIMIT) {
    return new Response('Too many requests', { 
      status: 429,
      headers: { 'Retry-After': '60' }
    });
  }
  
  return;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|favicon.ico).*)'],
};
