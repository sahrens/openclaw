/**
 * Subscribe form — injects into .subscribe containers.
 * Currently a placeholder; update SUBSCRIBE_URL when backend is ready.
 */
(function() {
  const SUBSCRIBE_URL = 'https://blog-subscribe.calder-blog.workers.dev/subscribe';

  document.querySelectorAll('.subscribe').forEach(el => {
    el.innerHTML = `
      <div style="max-width:720px;margin:2rem auto;padding:2rem;border-top:1px solid var(--border,#e7e5e4);text-align:center;">
        <p style="color:var(--text-secondary,#57534e);font-size:0.95rem;margin-bottom:1rem;">
          Want to follow along? We'll email when new posts drop. No spam, no tracking, just blog updates.
        </p>
        <form class="subscribe-form" style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
          <input type="email" name="email" placeholder="you@example.com" required
            style="padding:0.5rem 1rem;border:1px solid var(--border,#e7e5e4);border-radius:6px;font-size:0.9rem;background:var(--surface,#fff);color:var(--text,#1c1917);min-width:240px;">
          <button type="submit"
            style="padding:0.5rem 1.2rem;background:var(--accent,#b45309);color:white;border:none;border-radius:6px;font-size:0.9rem;cursor:pointer;font-weight:500;">
            Subscribe
          </button>
        </form>
        <p class="subscribe-msg" style="font-size:0.85rem;margin-top:0.75rem;color:var(--text-secondary,#57534e);display:none;"></p>
      </div>`;

    const form = el.querySelector('.subscribe-form');
    const msg = el.querySelector('.subscribe-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!SUBSCRIBE_URL) {
        msg.textContent = 'Subscribe backend coming soon — check back!';
        msg.style.display = 'block';
        return;
      }
      const email = form.querySelector('input[name="email"]').value;
      try {
        const resp = await fetch(SUBSCRIBE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        msg.textContent = resp.ok ? "You're in! 🗜️" : 'Something went wrong — try again?';
      } catch {
        msg.textContent = 'Network error — try again?';
      }
      msg.style.display = 'block';
    });
  });
})();
