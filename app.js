/**
 * @typedef {{ rkey?: string, bsky_url: string, wayback_url?: string, wayback_timestamp?: string, meta?: Record<string, string> }} Post
 * @typedef {{ source?: string, profile?: string, post_count?: number, note?: string, posts: Post[] }} Archive
 */

const EMBED_RE = /^\s*\[contains quote post or other embedded content\]\s*$/i;
const EMBED_SPLIT = /\n\n\[contains quote post or other embedded content\]\s*$/i;

const BSKY_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const ARCHIVE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v5h5"/><path d="M21 21v-5h-5"/><path d="M3 12a9 9 0 0 0 6 8.4"/><path d="M21 12a9 9 0 0 1-6-8.4"/></svg>`;
const EMBED_SVG = `<svg class="post-embed-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1" opacity=".6"/><rect x="4" y="13" width="7" height="7" rx="1" opacity=".6"/></svg>`;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * @param {Date} date
 */
function relativeTimeShort(date) {
  const then = date.getTime();
  if (isNaN(then)) return null;
  const now = Date.now();
  const diffMs = then - now;
  const ad = Math.abs(diffMs);
  const sec = 1000;
  const min = 60 * sec;
  const hr = 60 * min;
  const day = 24 * hr;
  const wk = 7 * day;
  const month = 30.44 * day;
  const year = 365.25 * day;
  if (ad < 50 * sec) {
    return "Just now";
  }
  if (ad < 50 * min) {
    return rtf.format(Math.round(diffMs / min), "minute");
  }
  if (ad < 22 * hr) {
    return rtf.format(Math.round(diffMs / hr), "hour");
  }
  if (ad < 7 * day) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  if (ad < 4 * wk) {
    return rtf.format(Math.round(diffMs / wk), "week");
  }
  if (ad < 11 * month) {
    return rtf.format(Math.round(diffMs / month), "month");
  }
  return rtf.format(Math.round(diffMs / year), "year");
}

/**
 * @param {string} text
 */
function linkifyText(text) {
  const urlRe = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts = [];
  let last = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(document.createTextNode(text.slice(last, m.index)));
    }
    const a = document.createElement("a");
    a.href = m[1];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = m[1];
    parts.push(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(document.createTextNode(text.slice(last)));
  }
  if (parts.length === 0) {
    return [document.createTextNode(text)];
  }
  return parts;
}

/**
 * @param {Post} post
 * @param {string} description
 * @param {HTMLLIElement} li
 */
function fillPostCard(post, description, li) {
  li.className = "post";
  const meta = post.meta || {};
  const tw = meta["twitter:value1"];
  let displayText = description;
  let hasEmbed = false;
  if (EMBED_SPLIT.test(description)) {
    hasEmbed = true;
    displayText = description.replace(EMBED_SPLIT, "").trimEnd();
  } else if (EMBED_RE.test(description.trim())) {
    hasEmbed = true;
    displayText = "";
  }

  const row = document.createElement("div");
  row.className = "post-row";

  if (tw) {
    const d = new Date(tw);
    const p = document.createElement("div");
    p.className = "post-date";
    if (!isNaN(d.getTime())) {
      p.setAttribute("title", tw);
      p.appendChild(
        document.createTextNode(
          d.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        )
      );
      const rel = relativeTimeShort(d);
      if (rel) {
        const sub = document.createElement("span");
        sub.className = "time-secondary";
        sub.textContent = rel;
        p.appendChild(sub);
      }
    } else {
      p.textContent = tw;
    }
    row.appendChild(p);
  }

  if (post.rkey) {
    const idSpan = document.createElement("div");
    idSpan.className = "rkey";
    idSpan.textContent = post.rkey;
    idSpan.setAttribute("title", post.rkey);
    row.appendChild(idSpan);
  }

  if (row.childNodes.length) {
    li.appendChild(row);
  }

  if (displayText) {
    const body = document.createElement("p");
    body.className = "post-body";
    for (const node of linkifyText(displayText)) {
      body.appendChild(node);
    }
    li.appendChild(body);
  }

  if (hasEmbed) {
    const hint = document.createElement("p");
    hint.className = "post-embed";
    hint.insertAdjacentHTML("afterbegin", EMBED_SVG);
    const span = document.createElement("span");
    span.textContent = "May include quote or embedded content.";
    hint.appendChild(span);
    li.appendChild(hint);
  }

  const actions = document.createElement("div");
  actions.className = "post-actions";
  const bsky = document.createElement("a");
  bsky.href = post.bsky_url;
  bsky.target = "_blank";
  bsky.rel = "noopener noreferrer";
  bsky.insertAdjacentHTML("afterbegin", BSKY_SVG);
  bsky.appendChild(document.createTextNode(" Bluesky"));
  actions.appendChild(bsky);
  if (post.wayback_url) {
    const wb = document.createElement("a");
    wb.href = post.wayback_url;
    wb.target = "_blank";
    wb.rel = "noopener noreferrer";
    wb.insertAdjacentHTML("afterbegin", ARCHIVE_SVG);
    wb.appendChild(document.createTextNode(" Archived"));
    actions.appendChild(wb);
  }
  li.appendChild(actions);
}

/**
 * @param {unknown} data
 * @returns {Archive}
 */
function normalizeData(data) {
  if (data && typeof data === "object" && Array.isArray(/** @type {any} */ (data).posts)) {
    return /** @type {Archive} */ (data);
  }
  throw new Error("Invalid JSON: expected posts array");
}

function syncStickyVar() {
  const bar = document.getElementById("stickyBar");
  if (!bar) return;
  const h = bar.offsetHeight;
  document.documentElement.style.setProperty(
    "--sticky-h",
    `${h}px`
  );
}

/**
 * @param {() => void} fn
 * @param {number} delay
 */
function debounce(fn, delay) {
  let t = 0;
  return () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      t = 0;
      fn();
    }, delay);
  };
}

function main() {
  const statusBlock = document.getElementById("statusBlock");
  const statusEl = document.getElementById("status");
  const postsEl = document.getElementById("posts");
  const countEl = document.getElementById("count");
  const sourceMeta = document.getElementById("sourceMeta");
  const searchEl = document.getElementById("search");
  const searchClear = document.getElementById("searchClear");
  const sortEl = document.getElementById("sort");
  const emptyEl = document.getElementById("empty");
  const toTop = document.getElementById("toTop");
  const mainEl = document.getElementById("main");
  const skeleton = document.getElementById("skeleton");

  if (
    !statusBlock ||
    !statusEl ||
    !postsEl ||
    !countEl ||
    !sourceMeta ||
    !searchEl ||
    !searchClear ||
    !sortEl ||
    !emptyEl ||
    !toTop
  ) {
    return;
  }

  let archive = /** @type {Archive | null} */ (null);
  let sorted = /** @type {Post[]} */ ([]);

  function setClearVisible(visible) {
    searchClear.hidden = !visible;
  }

  function getFiltered() {
    const q = (searchEl.value || "").trim().toLowerCase();
    return !q
      ? sorted
      : sorted.filter((p) => {
          const desc = (p.meta && p.meta["og:description"]) || "";
          const rkey = p.rkey || "";
          return (
            desc.toLowerCase().includes(q) || rkey.toLowerCase().includes(q)
          );
        });
  }

  function applyFilter() {
    if (!archive) return;
    const sortOrder = sortEl.value;
    const filtered = getFiltered();
    const list =
      sortOrder === "oldest" ? filtered.slice().reverse() : filtered;

    postsEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const post of list) {
      const desc = (post.meta && post.meta["og:description"]) || "";
      const li = document.createElement("li");
      fillPostCard(post, desc, li);
      frag.appendChild(li);
    }
    postsEl.appendChild(frag);

    const total = archive.posts.length;
    const n = list.length;
    if (n === 0) {
      emptyEl.hidden = false;
      postsEl.hidden = true;
    } else {
      emptyEl.hidden = true;
      postsEl.hidden = false;
    }

    const q = (searchEl.value || "").trim();
    if (!q) {
      countEl.textContent = sortOrder === "oldest" ? `Oldest first · ${n} posts` : `Newest first · ${n} posts`;
    } else {
      countEl.textContent = `Showing ${n} of ${total} posts`;
    }
  }

  const debouncedFilter = debounce(applyFilter, 180);
  setClearVisible(!!(searchEl.value && searchEl.value.trim()));

  function onScroll() {
    const y = window.scrollY || 0;
    const stuck = y > 6;
    const bar = document.getElementById("stickyBar");
    if (bar) {
      bar.setAttribute("data-stuck", stuck ? "true" : "false");
    }
    toTop.setAttribute("data-visible", y > 420 ? "true" : "false");
  }

  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    mainEl?.focus({ preventScroll: true });
  });

  searchEl.addEventListener("input", () => {
    setClearVisible(!!searchEl.value.trim());
    if (archive) debouncedFilter();
  });

  searchClear.addEventListener("click", () => {
    searchEl.value = "";
    setClearVisible(false);
    searchEl.focus();
    if (archive) applyFilter();
  });

  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && searchEl.value) {
      e.preventDefault();
      searchEl.value = "";
      setClearVisible(false);
      if (archive) applyFilter();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "/") return;
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    searchEl.focus();
  });

  sortEl.addEventListener("change", () => {
    if (archive) applyFilter();
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    syncStickyVar();
  });

  fetch("coldforce_posts.json")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText || String(r.status));
      return r.json();
    })
    .then((data) => {
      archive = normalizeData(data);
      sourceMeta.textContent =
        archive.post_count != null ? `${archive.post_count} posts` : "";

      const posts = archive.posts.slice();
      posts.sort((a, b) => {
        const ta = (a.meta && a.meta["twitter:value1"]) || "";
        const tb = (b.meta && b.meta["twitter:value1"]) || "";
        const da = new Date(ta).getTime();
        const dbb = new Date(tb).getTime();
        if (!isNaN(da) && !isNaN(dbb) && da !== dbb) return dbb - da;
        const wa = a.wayback_timestamp || "";
        const wb = b.wayback_timestamp || "";
        return wb.localeCompare(wa);
      });
      sorted = posts;

      statusBlock.classList.add("loaded");
      statusBlock.setAttribute("aria-busy", "false");
      if (skeleton) skeleton.classList.add("hidden");
      statusEl.hidden = true;
      onScroll();
      requestAnimationFrame(() => {
        syncStickyVar();
        onScroll();
      });
      applyFilter();
    })
    .catch((err) => {
      if (skeleton) skeleton.classList.add("hidden");
      statusBlock.classList.add("error-state", "loaded");
      statusBlock.setAttribute("aria-busy", "false");
      statusEl.classList.add("error", "status-inline");
      statusEl.textContent =
        "Could not load coldforce_posts.json. Serve this folder over HTTP (for example, python -m http.server) so the browser can load the file — file:// often blocks fetch. " +
        (err && err.message ? `(${err.message})` : "");
    });
}

main();
