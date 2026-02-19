/**
 * Blog post renderer — fetches a .md file and renders it with marked.js
 * 
 * Usage: set window.POST_CONFIG before loading this script:
 *   { url: '../posts/my-post.md', prev: { href: '../72-hours/', title: '72 Hours' }, next: null }
 */

(async function() {
  const config = window.POST_CONFIG;
  if (!config || !config.url) {
    document.getElementById('content').innerHTML = '<p>Error: no post configured.</p>';
    return;
  }

  try {
    const resp = await fetch(config.url);
    if (!resp.ok) throw new Error(`Failed to load post: ${resp.status}`);
    let md = await resp.text();

    // Strip front matter: H1 + byline lines + optional --- separator
    md = md.replace(/^#[^\n]+\n+(\*[^\n]+\n+)*(---\n*)?/s, '');

    // Render
    document.getElementById('content').innerHTML = marked.parse(md);

    // Build nav
    const nav = document.getElementById('post-nav');
    if (nav) {
      if (config.prev) {
        nav.querySelector('.nav-prev').innerHTML = `<a href="${config.prev.href}">← ${config.prev.title}</a>`;
      }
      if (config.next) {
        nav.querySelector('.nav-next').innerHTML = `<a href="${config.next.href}">${config.next.title} →</a>`;
      }
      const allPosts = nav.querySelector('.nav-all');
      if (allPosts) allPosts.innerHTML = '<a href="../">All Posts</a>';
    }
  } catch (e) {
    document.getElementById('content').innerHTML = `<p>Error loading post: ${e.message}</p>`;
  }
})();
