(() => {
  "use strict";

  const STORAGE_KEY = "xfeed_playground_state_v3";

  const AUTHOR_PROFILES = {
    alex_builder: {
      name: "Alex Builder",
      bio: "Distributed systems & indie SaaS founder. Posts benchmarks, postmortems, and occasional hot takes.",
      followers: "14.2K",
      following: "412",
      followed: true,
    },
    quiet_eng: {
      name: "Sam (Reply)",
      bio: "Staff infra engineer. Mostly short replies about edge cases and failure modes.",
      followers: "3.1K",
      following: "290",
      followed: false,
    },
    maya_builds: {
      name: "Maya",
      bio: "Building Android & web tools. Debugging semicolons and DNS since 2016.",
      followers: "8.9K",
      following: "510",
      followed: true,
    },
    growth_guru: {
      name: "AI Growth Hacks",
      bio: "10x your engagement with viral frameworks. DM 'SCALE' for my course.",
      followers: "92K",
      following: "1,840",
      followed: false,
    },
    megacorp_ads: {
      name: "CloudScale AI",
      bio: "Enterprise cloud synergy platform. Official sponsored account.",
      followers: "45K",
      following: "12",
      followed: false,
    },
    drama_watch: {
      name: "Viral Drama Alerts",
      bio: "Breaking internet drama 24/7. Turn on notifications!",
      followers: "310K",
      following: "88",
      followed: false,
    },
    rust_kernel: {
      name: "Lin Rust",
      bio: "Low-latency audio & Rust kernels.",
      followers: "11.4K",
      following: "320",
      followed: true,
    },
    you: {
      name: "You",
      bio: "Testing xfeed live!",
      followers: "128",
      following: "240",
      followed: false,
    },
  };

  function createInitialPosts() {
    return [
      {
        id: "18900001",
        authorHandle: "alex_builder",
        authorName: "Alex Builder",
        text: "We migrated our job queue from Redis streams to SQLite WAL and cut p99 latency from 140ms to 18ms because we eliminated cross-AZ hops. #systems #sqlite",
        hashtags: ["systems", "sqlite"],
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "9m",
        counts: { replies: 3, reposts: 32, likes: 184 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [
          {
            id: "18901001",
            authorHandle: "quiet_eng",
            authorName: "Sam (Reply)",
            text: "Worth noting this breaks if you later need multi-region writers—how are you handling failover if that single node dies?",
            hashtags: [],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "6m",
            counts: { replies: 1, reposts: 4, likes: 29 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
          {
            id: "18901002",
            authorHandle: "growth_guru",
            authorName: "AI Growth Hacks",
            text: "Unpopular opinion: SQLite is dead in 2026. Comment 'SCALE' and I'll DM you my 10 harsh truths about databases (a thread 🧵👇)",
            hashtags: [],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "4m",
            counts: { replies: 0, reposts: 1, likes: 2 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
          {
            id: "18901003",
            authorHandle: "alex_builder",
            authorName: "Alex Builder",
            text: "Good question! We stream WAL frames to S3 via Litestream every 1s—measured cold-node recovery at 4.2s, totally fine for our background jobs.",
            hashtags: ["sqlite"],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "2m",
            counts: { replies: 0, reposts: 6, likes: 41 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
        ],
      },
      {
        id: "18900002",
        authorHandle: "alex_builder",
        authorName: "Alex Builder",
        text: "Unpopular opinion: 99% of engineers fail because they don't hustle hard enough. Agree? 👇",
        hashtags: [],
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "14m",
        counts: { replies: 89, reposts: 12, likes: 54 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [
          {
            id: "18901010",
            authorHandle: "maya_builds",
            authorName: "Maya",
            text: "Actually, most engineers burn out from unclear product priorities, not lack of hustle.",
            hashtags: [],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "10m",
            counts: { replies: 2, reposts: 9, likes: 67 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
        ],
      },
      {
        id: "18900003",
        authorHandle: "quiet_eng",
        authorName: "Sam (Reply)",
        text: "Worth noting this breaks if your system clocks drift across regions.",
        hashtags: [],
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "19m",
        counts: { replies: 2, reposts: 8, likes: 46 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [
          {
            id: "18901020",
            authorHandle: "rust_kernel",
            authorName: "Lin Rust",
            text: "Hybrid logical clocks fix most of that, though debugging monotonic skew across VMs is still painful.",
            hashtags: ["systems"],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "12m",
            counts: { replies: 0, reposts: 3, likes: 19 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
        ],
      },
      {
        id: "18900004",
        authorHandle: "maya_builds",
        authorName: "Maya",
        text: "Spent two hours debugging a missing semicolon and honestly I'm just glad it wasn't DNS.",
        hashtags: [],
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "28m",
        counts: { replies: 5, reposts: 14, likes: 112 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [
          {
            id: "18901030",
            authorHandle: "alex_builder",
            authorName: "Alex Builder",
            text: "It's always DNS until the one day it's a trailing comma in JSON.",
            hashtags: [],
            links: [],
            isPromoted: false,
            isRepost: false,
            time: "21m",
            counts: { replies: 0, reposts: 2, likes: 38 },
            liked: false,
            reposted: false,
            bookmarked: false,
          },
        ],
      },
      {
        id: "18900005",
        authorHandle: "growth_guru",
        authorName: "AI Growth Hacks",
        text: "Comment 'PROMPT' and I'll DM you my 10 harsh truths about AI agents (a thread 🧵👇) #ai",
        hashtags: ["ai"],
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "36m",
        counts: { replies: 210, reposts: 18, likes: 95 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [],
      },
      {
        id: "18900006",
        authorHandle: "megacorp_ads",
        authorName: "CloudScale AI",
        text: "Supercharge your enterprise synergy with our next-gen SaaS platform. Sign up today for a free webinar! https://example.com/webinar",
        hashtags: [],
        links: ["https://example.com/webinar"],
        isPromoted: true,
        isRepost: false,
        time: "Ad",
        counts: { replies: 1, reposts: 0, likes: 4 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [],
      },
      {
        id: "18900007",
        authorHandle: "drama_watch",
        authorName: "Viral Drama Alerts",
        text: "BREAKING celebrity gossip thread! You won't believe who unfollowed who at last night's awards afterparty!! #drama",
        hashtags: ["drama"],
        links: [],
        isPromoted: false,
        isRepost: true,
        repostedBy: "Someone you follow",
        time: "1h",
        counts: { replies: 430, reposts: 90, likes: 620 },
        liked: false,
        reposted: false,
        bookmarked: false,
        replies: [],
      },
    ];
  }

  const EXTRA_STREAM_POSTS = [
    {
      id: "18900090",
      authorHandle: "alex_builder",
      authorName: "Alex Builder",
      text: "Hot take: most developers over-engineer databases before hitting 100 users. Thoughts? 👇",
      hashtags: [],
      links: [],
      isPromoted: false,
      isRepost: false,
      time: "Just now",
      counts: { replies: 19, reposts: 3, likes: 17 },
      replies: [],
    },
    {
      id: "18900091",
      authorHandle: "alex_builder",
      authorName: "Alex Builder",
      text: "Actually, on the other hand, adding basic schema migrations early saves weeks later when you have paying users.",
      hashtags: ["systems"],
      links: [],
      isPromoted: false,
      isRepost: false,
      time: "Just now",
      counts: { replies: 4, reposts: 11, likes: 63 },
      replies: [],
    },
    {
      id: "18900092",
      authorHandle: "rust_kernel",
      authorName: "Lin Rust",
      text: "Measured our lock-free ring buffer at 1.2M msgs/sec with zero allocations on the hot path. #rust #systems",
      hashtags: ["rust", "systems"],
      links: [],
      isPromoted: false,
      isRepost: false,
      time: "Just now",
      counts: { replies: 7, reposts: 29, likes: 145 },
      replies: [],
    },
  ];

  function createDefaultState() {
    return {
      profile: {
        version: 1,
        revision: 1,
        updatedAt: new Date().toISOString(),
        rules: [],
        authorWeights: {},
        contentFilters: {
          hidePromoted: true,
          hideReposts: false,
          hideLinksOnly: false,
          hideShortPostsBelow: 0,
        },
        thresholds: {
          hideBelow: -5,
          collapseBelow: -1.5,
          boostAbove: 2.5,
        },
        uiOptions: {
          enabled: true,
          displayMode: "collapse",
          showScoreBadge: true,
          forwardNotInterestedToX: true,
          observeNativeXFeedback: true,
        },
        tasteProfile: {
          philosophy:
            "Keep genuine human posts—whether informative, casual/funny, or a brief reply showing the other side of an opinion. Filter out engagement farming, reply-bait, rage-bait, DM funnels, and off-taste noise—even from authors I otherwise like.",
          learnedRules: [],
          aiJudgeEnabled: true,
        },
        learnedModel: {
          version: 1,
          trainedOnCount: 0,
          bias: 0,
          featureWeights: {},
          scorerWeights: {
            tasteJudge: 1.0,
            learnedModel: 1.0,
            authorWeights: 1.0,
            keywordRules: 1.0,
          },
          updatedAt: new Date().toISOString(),
        },
        customScorerConfig: {},
      },
      feedbackHistory: [],
      pendingFeedback: [],
      lastSyncedAt: null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    const fresh = createDefaultState();
    saveState(fresh);
    return fresh;
  }

  function saveState(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  let posts = createInitialPosts();
  let appState = loadState();
  let activeTab = "for_you";
  let lastStats = { seen: 0, hidden: 0, collapsed: 0, boosted: 0 };
  let eventLog = [];
  let streamIdx = 0;

  function findPostById(id) {
    for (const p of posts) {
      if (p.id === id) return p;
      for (const r of p.replies || []) {
        if (r.id === id) return r;
      }
    }
    return null;
  }

  function allPostsAndReplies() {
    const out = [];
    for (const p of posts) {
      out.push(p);
      for (const r of p.replies || []) out.push(r);
    }
    return out;
  }

  function addLog(title, detail) {
    eventLog = [{ title, detail, ts: new Date().toLocaleTimeString() }, ...eventLog].slice(0, 20);
    renderEventLog();
  }

  function showNativeToast(msg) {
    const el = document.getElementById("native-toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 3000);
  }

  function pushStateToBundle() {
    if (typeof window.__xfeedPushState === "function") {
      window.__xfeedPushState(
        JSON.stringify({
          profile: appState.profile,
          feedbackHistory: appState.feedbackHistory,
        }),
      );
    }
  }

  function navigate(targetPath, replace = false) {
    if (replace) {
      history.replaceState({}, "", targetPath);
    } else if (window.location.pathname !== targetPath) {
      history.pushState({}, "", targetPath);
    }
    closeMenus();
    renderCurrentRoute();
    // Notify x-adapter immediately of route change
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatTweetTextHtml(post) {
    let html = escapeHtml(post.text);
    html = html.replace(
      /(https?:\/\/\S+)/g,
      '<a href="$1" target="_blank" rel="noreferrer" data-external="1">$1</a>',
    );
    html = html.replace(
      /#([A-Za-z0-9_]+)/g,
      '<a href="/hashtag/$1" data-route="/hashtag/$1">#$1</a>',
    );
    return html;
  }

  function closeMenus() {
    const layers = document.getElementById("layers");
    if (layers) layers.innerHTML = "";
  }

  function openCaretMenu(caretBtn, post, cell) {
    closeMenus();
    const layers = document.getElementById("layers");
    if (!layers) return;

    const rect = caretBtn.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "x-menu";
    menu.setAttribute("role", "menu");
    menu.style.top = `${Math.min(window.innerHeight - 110, rect.bottom + 4)}px`;
    menu.style.left = `${Math.max(12, rect.right - 240)}px`;

    const notInterestedItem = document.createElement("button");
    notInterestedItem.type = "button";
    notInterestedItem.className = "x-menu-item";
    notInterestedItem.setAttribute("role", "menuitem");
    notInterestedItem.textContent = "Not interested in this post";
    notInterestedItem.addEventListener("click", () => {
      closeMenus();
      showNativeToast(`X received native "Not interested" for @${post.authorHandle}`);
      addLog(
        `Native X menu: "Not interested in this post"`,
        `Post #${post.id} (@${post.authorHandle})`,
      );
      const banner = document.createElement("div");
      banner.className = "native-dismissed-banner";
      banner.textContent = `Thanks. X will show fewer posts like @${post.authorHandle}'s.`;
      cell.appendChild(banner);
    });

    const muteItem = document.createElement("button");
    muteItem.type = "button";
    muteItem.className = "x-menu-item";
    muteItem.setAttribute("role", "menuitem");
    muteItem.textContent = `Mute @${post.authorHandle}`;
    muteItem.addEventListener("click", () => {
      closeMenus();
      showNativeToast(`X muted @${post.authorHandle}`);
    });

    menu.append(notInterestedItem, muteItem);
    layers.appendChild(menu);
  }

  function createTweetCell(post, { isFocal = false } = {}) {
    const cell = document.createElement("div");
    cell.setAttribute("data-testid", "cellInnerDiv");
    if (isFocal) cell.classList.add("focal-tweet-wrap");

    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");

    if (post.isRepost) {
      const ctx = document.createElement("div");
      ctx.className = "tweet-social-ctx";
      ctx.setAttribute("data-testid", "socialContext");
      ctx.textContent = `${post.repostedBy || "Someone"} reposted`;
      article.appendChild(ctx);
    }

    const row = document.createElement("div");
    row.className = "tweet-row";

    const avatar = document.createElement("div");
    avatar.className = "tweet-avatar";
    avatar.textContent = post.authorName.slice(0, 2).toUpperCase();
    avatar.title = `View @${post.authorHandle}`;
    avatar.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/${post.authorHandle}`);
    });

    const body = document.createElement("div");
    body.className = "tweet-body";

    const header = document.createElement("div");
    header.className = "tweet-header";

    const userBlock = document.createElement("div");
    userBlock.className = "tweet-user";
    userBlock.setAttribute("data-testid", "User-Name");

    const nameLink = document.createElement("a");
    nameLink.href = `/${post.authorHandle}`;
    nameLink.className = "tweet-name";
    nameLink.textContent = post.authorName;
    nameLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/${post.authorHandle}`);
    });

    const handleLink = document.createElement("a");
    handleLink.href = `/${post.authorHandle}`;
    handleLink.className = "tweet-handle";
    handleLink.textContent = `@${post.authorHandle}`;
    handleLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/${post.authorHandle}`);
    });

    const timeLink = document.createElement("a");
    timeLink.href = `/${post.authorHandle}/status/${post.id}`;
    timeLink.className = "tweet-time";
    const timeEl = document.createElement("time");
    timeEl.dateTime = new Date().toISOString();
    timeEl.textContent = `· ${post.time}`;
    timeLink.appendChild(timeEl);
    timeLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/${post.authorHandle}/status/${post.id}`);
    });

    userBlock.append(nameLink, handleLink, timeLink);

    if (post.isPromoted) {
      const ad = document.createElement("span");
      ad.className = "tweet-ad-badge";
      ad.setAttribute("data-testid", "placementTracking");
      ad.textContent = "Ad";
      userBlock.appendChild(ad);
    }

    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "caret-btn";
    caret.setAttribute("data-testid", "caret");
    caret.title = "More (Native X Menu)";
    caret.textContent = "•••";
    caret.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCaretMenu(caret, post, cell);
    });

    header.append(userBlock, caret);

    const textDiv = document.createElement("div");
    textDiv.className = "tweet-text";
    textDiv.setAttribute("data-testid", "tweetText");
    textDiv.innerHTML = formatTweetTextHtml(post);
    textDiv.querySelectorAll("a[data-route]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(a.getAttribute("data-route"));
      });
    });
    textDiv.querySelectorAll("a[data-external]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });

    const counts = post.counts || { replies: 0, reposts: 0, likes: 0 };
    const footer = document.createElement("div");
    footer.className = "tweet-footer";
    footer.setAttribute("role", "group");

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "tweet-action-btn";
    replyBtn.textContent = `💬 ${counts.replies}`;
    replyBtn.title = "View replies / Reply";
    replyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/${post.authorHandle}/status/${post.id}`);
      setTimeout(() => document.getElementById("reply-input")?.focus(), 40);
    });

    const repostBtn = document.createElement("button");
    repostBtn.type = "button";
    repostBtn.className = `tweet-action-btn ${post.reposted ? "reposted" : ""}`.trim();
    repostBtn.textContent = `🔁 ${counts.reposts}`;
    repostBtn.title = "Repost";
    repostBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      post.reposted = !post.reposted;
      counts.reposts += post.reposted ? 1 : -1;
      repostBtn.classList.toggle("reposted", post.reposted);
      repostBtn.textContent = `🔁 ${counts.reposts}`;
      addLog(post.reposted ? `Reposted @${post.authorHandle}` : `Un-reposted @${post.authorHandle}`, `Post #${post.id}`);
    });

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = `tweet-action-btn ${post.liked ? "liked" : ""}`.trim();
    likeBtn.textContent = `${post.liked ? "♥" : "♡"} ${counts.likes}`;
    likeBtn.title = "Like";
    likeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      post.liked = !post.liked;
      counts.likes += post.liked ? 1 : -1;
      likeBtn.classList.toggle("liked", post.liked);
      likeBtn.textContent = `${post.liked ? "♥" : "♡"} ${counts.likes}`;
      addLog(post.liked ? `Liked @${post.authorHandle}` : `Unliked @${post.authorHandle}`, `Post #${post.id}`);
    });

    const bookmarkBtn = document.createElement("button");
    bookmarkBtn.type = "button";
    bookmarkBtn.className = `tweet-action-btn ${post.bookmarked ? "bookmarked" : ""}`.trim();
    bookmarkBtn.textContent = post.bookmarked ? "🔖 Saved" : "🔖";
    bookmarkBtn.title = "Bookmark";
    bookmarkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      post.bookmarked = !post.bookmarked;
      bookmarkBtn.classList.toggle("bookmarked", post.bookmarked);
      bookmarkBtn.textContent = post.bookmarked ? "🔖 Saved" : "🔖";
      addLog(post.bookmarked ? `Bookmarked @${post.authorHandle}` : `Removed bookmark`, `Post #${post.id}`);
    });

    footer.append(replyBtn, repostBtn, likeBtn, bookmarkBtn);

    // Clicking anywhere else on the tweet body opens the full Post Detail + Replies view!
    if (!isFocal) {
      article.addEventListener("click", (e) => {
        if (
          e.target.closest("button") ||
          e.target.closest("a") ||
          e.target.closest(".xfeed-action-bar") ||
          e.target.closest(".xfeed-collapse-stub")
        ) {
          return;
        }
        navigate(`/${post.authorHandle}/status/${post.id}`);
      });
    }

    body.append(header, textDiv, footer);
    row.append(avatar, body);
    article.appendChild(row);
    cell.appendChild(article);
    return cell;
  }

  function renderSubViewHeader(title, subtitle = "") {
    const header = document.createElement("div");
    header.className = "subview-header";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-btn";
    back.textContent = "← Back";
    back.addEventListener("click", () => {
      if (window.history.length > 1) {
        history.back();
      } else {
        navigate("/home");
      }
    });

    const info = document.createElement("div");
    info.innerHTML = `<div class="subview-title">${escapeHtml(title)}</div>${
      subtitle ? `<div class="muted">${escapeHtml(subtitle)}</div>` : ""
    }`;

    header.append(back, info);
    return header;
  }

  function renderHomeView(timeline) {
    const tabsBar = document.querySelector(".x-tabs");
    const toolbar = document.querySelector(".feed-toolbar");
    if (tabsBar) tabsBar.style.display = "grid";
    if (toolbar) toolbar.style.display = "flex";

    const visiblePosts =
      activeTab === "following"
        ? posts.filter((p) => AUTHOR_PROFILES[p.authorHandle]?.followed)
        : posts;

    for (const post of visiblePosts) {
      timeline.appendChild(createTweetCell(post));
    }
  }

  function renderPostDetailView(timeline, statusId) {
    const tabsBar = document.querySelector(".x-tabs");
    const toolbar = document.querySelector(".feed-toolbar");
    if (tabsBar) tabsBar.style.display = "none";
    if (toolbar) toolbar.style.display = "none";

    const post = findPostById(statusId);
    timeline.appendChild(renderSubViewHeader("Post", post ? `@${post.authorHandle}` : ""));

    if (!post) {
      const missing = document.createElement("div");
      missing.className = "profile-card";
      missing.textContent = `Post #${statusId} not found.`;
      timeline.appendChild(missing);
      return;
    }

    timeline.appendChild(createTweetCell(post, { isFocal: true }));

    // Working Reply Composer
    const composer = document.createElement("form");
    composer.className = "reply-composer";
    const input = document.createElement("input");
    input.id = "reply-input";
    input.type = "text";
    input.placeholder = `Post your reply to @${post.authorHandle}...`;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-btn";
    submit.textContent = "Reply";
    composer.append(input, submit);
    composer.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const newReply = {
        id: String(Date.now()),
        authorHandle: "you",
        authorName: "You",
        text,
        hashtags: (text.match(/#([A-Za-z0-9_]+)/g) || []).map((t) => t.slice(1)),
        links: [],
        isPromoted: false,
        isRepost: false,
        time: "Just now",
        counts: { replies: 0, reposts: 0, likes: 1 },
        liked: false,
        reposted: false,
        bookmarked: false,
      };
      post.replies = [newReply, ...(post.replies || [])];
      if (post.counts) post.counts.replies += 1;
      addLog(`Replied to @${post.authorHandle}`, text.slice(0, 80));
      renderCurrentRoute();
    });
    timeline.appendChild(composer);

    const replies = post.replies || [];
    const divider = document.createElement("div");
    divider.className = "section-divider";
    divider.textContent = `Replies (${replies.length})`;
    timeline.appendChild(divider);

    if (replies.length === 0) {
      const empty = document.createElement("div");
      empty.className = "profile-card muted";
      empty.textContent = "No replies yet. Add one above!";
      timeline.appendChild(empty);
    } else {
      for (const reply of replies) {
        timeline.appendChild(createTweetCell(reply));
      }
    }
  }

  function renderAuthorProfileView(timeline, rawHandle) {
    const handle = rawHandle.toLowerCase();
    const tabsBar = document.querySelector(".x-tabs");
    const toolbar = document.querySelector(".feed-toolbar");
    if (tabsBar) tabsBar.style.display = "none";
    if (toolbar) toolbar.style.display = "none";

    const info = AUTHOR_PROFILES[handle] || {
      name: `@${handle}`,
      bio: "X user profile",
      followers: "1.2K",
      following: "180",
      followed: false,
    };
    const authorPosts = allPostsAndReplies().filter(
      (p) => p.authorHandle.toLowerCase() === handle,
    );

    timeline.appendChild(
      renderSubViewHeader(info.name, `${authorPosts.length} post(s)`),
    );

    const card = document.createElement("div");
    card.className = "profile-card";

    const top = document.createElement("div");
    top.className = "profile-top";

    const avatar = document.createElement("div");
    avatar.className = "profile-avatar-lg";
    avatar.textContent = info.name.slice(0, 2).toUpperCase();

    const followBtn = document.createElement("button");
    followBtn.type = "button";
    followBtn.className = `follow-btn ${info.followed ? "following" : ""}`.trim();
    followBtn.textContent = info.followed ? "Following" : "Follow";
    followBtn.addEventListener("click", () => {
      info.followed = !info.followed;
      followBtn.classList.toggle("following", info.followed);
      followBtn.textContent = info.followed ? "Following" : "Follow";
      addLog(info.followed ? `Followed @${handle}` : `Unfollowed @${handle}`, "Updated Following tab");
    });

    top.append(avatar, followBtn);

    const nameBlock = document.createElement("div");
    nameBlock.innerHTML = `<div class="subview-title">${escapeHtml(info.name)}</div><div class="muted">@${escapeHtml(handle)}</div>`;

    const bio = document.createElement("p");
    bio.className = "profile-bio";
    bio.textContent = info.bio;

    const weight = appState.profile.authorWeights[handle];
    const weightText =
      weight === undefined
        ? "xfeed weight: neutral (0.0)"
        : `xfeed weight: ${weight >= 0 ? "+" : ""}${weight.toFixed(1)}`;
    const meta = document.createElement("div");
    meta.className = "profile-meta";
    meta.innerHTML = `<span><strong>${escapeHtml(info.following)}</strong> Following</span><span><strong>${escapeHtml(info.followers)}</strong> Followers</span><span>${escapeHtml(weightText)}</span>`;

    card.append(top, nameBlock, bio, meta);
    timeline.appendChild(card);

    const divider = document.createElement("div");
    divider.className = "section-divider";
    divider.textContent = "Posts";
    timeline.appendChild(divider);

    if (authorPosts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "profile-card muted";
      empty.textContent = `No posts found for @${handle}.`;
      timeline.appendChild(empty);
    } else {
      for (const p of authorPosts) {
        timeline.appendChild(createTweetCell(p));
      }
    }
  }

  function renderHashtagView(timeline, tag) {
    const tabsBar = document.querySelector(".x-tabs");
    const toolbar = document.querySelector(".feed-toolbar");
    if (tabsBar) tabsBar.style.display = "none";
    if (toolbar) toolbar.style.display = "none";

    const lower = tag.toLowerCase();
    const matching = allPostsAndReplies().filter(
      (p) =>
        (p.hashtags || []).some((h) => h.toLowerCase() === lower) ||
        p.text.toLowerCase().includes(`#${lower}`),
    );

    timeline.appendChild(renderSubViewHeader(`#${tag}`, `${matching.length} matching post(s)`));

    for (const p of matching) {
      timeline.appendChild(createTweetCell(p));
    }
  }

  function renderCurrentRoute() {
    const timeline = document.getElementById("timeline");
    if (!timeline) return;
    timeline.innerHTML = "";

    const pathname = window.location.pathname;
    const statusMatch = pathname.match(/^\/([^/]+)\/status\/(\d+)$/i);
    if (statusMatch) {
      renderPostDetailView(timeline, statusMatch[2]);
      return;
    }

    const hashMatch = pathname.match(/^\/hashtag\/([^/]+)$/i);
    if (hashMatch) {
      renderHashtagView(timeline, decodeURIComponent(hashMatch[1]));
      return;
    }

    const profileMatch = pathname.match(/^\/([A-Za-z0-9_]+)$/);
    if (profileMatch && profileMatch[1].toLowerCase() !== "home") {
      renderAuthorProfileView(timeline, profileMatch[1]);
      return;
    }

    renderHomeView(timeline);
  }

  function getSyncHeaders() {
    const token = document.getElementById("sync-token")?.value.trim() || "playground-token";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-XFeed-Device": "playground-web",
    };
  }

  function getSyncBaseUrl() {
    return (document.getElementById("sync-url")?.value.trim() || "http://127.0.0.1:4173").replace(/\/+$/, "");
  }

  // Expose the EXACT Android @JavascriptInterface contract so /xfeed-bundle.js runs unmodified!
  window.XFeedAndroid = {
    getStateJson() {
      return JSON.stringify({
        profile: appState.profile,
        feedbackHistory: appState.feedbackHistory,
      });
    },
    saveProfileJson(profileJson) {
      appState.profile = JSON.parse(profileJson);
      saveState(appState);
      renderPanel();
      maybeAutoSync();
    },
    recordFeedbackJson(eventJson, profileJson, historyJson) {
      const ev = JSON.parse(eventJson);
      appState.profile = JSON.parse(profileJson);
      appState.feedbackHistory = JSON.parse(historyJson);
      appState.pendingFeedback = [...(appState.pendingFeedback || []), ev].slice(-200);
      saveState(appState);
      const authorNote =
        ev.action === "downvote" || ev.action === "farming"
          ? "Post-level only (author kept neutral)"
          : ev.action === "false_positive"
            ? "Correction saved for cloud learning"
            : "Saved locally";
      addLog(
        `Feedback: ${ev.action} on @${ev.authorHandle}`,
        ev.syncedToX ? `✓ Forwarded to X · ${authorNote}` : authorNote,
      );
      renderPanel();
      maybeAutoSync();
    },
    requestJudgeBatch(requestId, postsJson, profileJson, historyJson) {
      fetch(`${getSyncBaseUrl()}/v1/judge`, {
        method: "POST",
        headers: getSyncHeaders(),
        body: JSON.stringify({
          posts: JSON.parse(postsJson),
          profile: JSON.parse(profileJson),
          feedbackHistory: JSON.parse(historyJson),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          const verdicts = data.verdicts || [];
          addLog(
            `AI Taste Judge (${verdicts.length} posts)`,
            verdicts.map((v) => `${v.category}`).slice(0, 5).join(", "),
          );
          window.__xfeedResolveJudge?.(requestId, JSON.stringify(verdicts));
        })
        .catch(() => {
          window.__xfeedResolveJudge?.(requestId, "[]");
        });
    },
    openTuningPanel() {
      document.querySelector(".panel-column")?.scrollIntoView({ behavior: "smooth" });
    },
    reportStatsJson(statsJson) {
      lastStats = JSON.parse(statsJson);
      const el = document.getElementById("stats-summary");
      if (el) {
        const filtered = lastStats.hidden + lastStats.collapsed;
        el.textContent = `${lastStats.seen} seen · ${filtered} filtered · ${lastStats.boosted} boosted · rev ${appState.profile.revision}`;
      }
    },
  };

  function commitProfile(mutator) {
    const next = mutator(appState.profile);
    appState.profile = {
      ...next,
      revision: appState.profile.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    saveState(appState);
    renderPanel();
    pushStateToBundle();
    maybeAutoSync();
  }

  async function runReflect() {
    try {
      const res = await fetch(`${getSyncBaseUrl()}/v1/reflect`, {
        method: "POST",
        headers: getSyncHeaders(),
        body: JSON.stringify({
          profile: appState.profile,
          feedbackHistory: appState.feedbackHistory,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const learned = Array.isArray(data.learnedRules) ? data.learnedRules : [];
      commitProfile((p) => ({
        ...p,
        tasteProfile: { ...p.tasteProfile, learnedRules: learned },
      }));
      addLog("Loop B Taste Reflection", `Distilled ${learned.length} editable rule(s) (${data.source})`);
    } catch (err) {
      addLog("Reflection failed", err.message);
    }
  }

  async function runSync() {
    const url = getSyncBaseUrl();
    const statusEl = document.getElementById("sync-status");
    const headers = getSyncHeaders();

    try {
      statusEl.textContent = "Syncing...";
      let pushed = 0;
      if (appState.pendingFeedback?.length) {
        const res = await fetch(`${url}/v1/feedback/batch`, {
          method: "POST",
          headers,
          body: JSON.stringify({ events: appState.pendingFeedback }),
        });
        if (!res.ok) throw new Error(`Feedback push ${res.status}`);
        const data = await res.json();
        pushed = data.inserted || 0;
      }

      const stateRes = await fetch(`${url}/v1/state`, { headers });
      if (!stateRes.ok) throw new Error(`Pull ${stateRes.status}`);
      const remote = await stateRes.json();

      const remoteRev = remote.profile?.revision ?? 0;
      if (!remote.profile || appState.profile.revision > remoteRev) {
        const putRes = await fetch(`${url}/v1/profile`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ profile: appState.profile }),
        });
        if (!putRes.ok) throw new Error(`Profile push ${putRes.status}`);
        const putData = await putRes.json();
        appState.profile = putData.profile;
      } else if (remoteRev > appState.profile.revision) {
        appState.profile = remote.profile;
      }

      if (remote.learnedModel) {
        appState.profile = {
          ...appState.profile,
          learnedModel: {
            ...remote.learnedModel,
            scorerWeights:
              appState.profile.learnedModel?.scorerWeights ?? remote.learnedModel.scorerWeights,
          },
        };
      }

      const byId = new Map();
      for (const ev of remote.feedback || []) byId.set(ev.id, ev);
      for (const ev of appState.feedbackHistory || []) byId.set(ev.id, ev);
      appState.feedbackHistory = Array.from(byId.values()).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      appState.pendingFeedback = [];
      appState.lastSyncedAt = remote.serverTime;

      saveState(appState);
      renderPanel();
      pushStateToBundle();
      statusEl.textContent = `Synced (${pushed}↑ / ${(remote.feedback || []).length}↓) · ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      statusEl.textContent = `Sync failed: ${err.message}`;
    }
  }

  function maybeAutoSync() {
    if (document.getElementById("sync-enabled")?.checked) {
      void runSync();
    }
  }

  function renderEventLog() {
    const list = document.getElementById("event-log");
    if (!list) return;
    list.innerHTML = "";
    if (eventLog.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Interact with posts to see live engine & X feedback logs.";
      list.appendChild(li);
      return;
    }
    for (const item of eventLog) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span class="muted">${escapeHtml(item.ts)} · ${escapeHtml(item.detail)}</span>`;
      list.appendChild(li);
    }
  }

  function renderPanel() {
    const p = appState.profile;
    document.getElementById("opt-enabled").checked = p.uiOptions.enabled;
    document.getElementById("opt-display-mode").value = p.uiOptions.displayMode;
    document.getElementById("opt-hide-promoted").checked = p.contentFilters.hidePromoted;
    document.getElementById("opt-hide-reposts").checked = p.contentFilters.hideReposts;
    document.getElementById("opt-hide-links").checked = p.contentFilters.hideLinksOnly;
    document.getElementById("opt-forward-x").checked = p.uiOptions.forwardNotInterestedToX;
    document.getElementById("opt-score-badge").checked = p.uiOptions.showScoreBadge;
    document.getElementById("opt-ai-judge").checked = p.tasteProfile.aiJudgeEnabled;
    document.getElementById("taste-philosophy").value = p.tasteProfile.philosophy;

    const learnedList = document.getElementById("learned-rules-list");
    learnedList.innerHTML = "";
    const learned = p.tasteProfile.learnedRules || [];
    if (learned.length === 0) {
      learnedList.innerHTML =
        '<li class="empty">Rate a few posts (👍 Upvote / 👎 Downvote / Keep ✓), then click Reflect / Learn Now.</li>';
    } else {
      learned.forEach((ruleText, idx) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = ruleText;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "danger-btn";
        btn.textContent = "×";
        btn.addEventListener("click", () => {
          commitProfile((prof) => ({
            ...prof,
            tasteProfile: {
              ...prof.tasteProfile,
              learnedRules: prof.tasteProfile.learnedRules.filter((_, i) => i !== idx),
            },
          }));
        });
        li.append(span, btn);
        learnedList.appendChild(li);
      });
    }

    const rulesList = document.getElementById("rules-list");
    rulesList.innerHTML = "";
    if (p.rules.length === 0) {
      rulesList.innerHTML = '<li class="empty">No manual keyword rules (AI Taste Judge is handling quality!).</li>';
    } else {
      for (const rule of p.rules) {
        const li = document.createElement("li");
        const cls = rule.weight >= 0 ? "pos" : "neg";
        const sign = rule.weight >= 0 ? "+" : "";
        const wrap = rule.isRegex ? "/" : "";
        const span = document.createElement("span");
        span.innerHTML = `${wrap}${escapeHtml(rule.pattern)}${wrap} <span class="${cls}">(${sign}${rule.weight})</span>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "danger-btn";
        btn.textContent = "Remove";
        btn.addEventListener("click", () => {
          commitProfile((prof) => ({
            ...prof,
            rules: prof.rules.filter((r) => r.id !== rule.id),
          }));
        });
        li.append(span, btn);
        rulesList.appendChild(li);
      }
    }

    const modelSummary = document.getElementById("model-summary");
    const modelList = document.getElementById("model-weights-list");
    const lm = p.learnedModel || { trainedOnCount: 0, bias: 0, featureWeights: {} };
    if (modelSummary) {
      modelSummary.textContent = `Trained on ${lm.trainedOnCount || 0} synced event(s) · bias ${Number(lm.bias || 0).toFixed(2)}`;
    }
    if (modelList) {
      modelList.innerHTML = "";
      const allFeatEntries = Object.entries(lm.featureWeights || {});
      const topPos = allFeatEntries
        .filter(([, w]) => w > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      const topNeg = allFeatEntries
        .filter(([, w]) => w < 0)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 4);
      const featEntries = [...topPos, ...topNeg];
      if (featEntries.length === 0) {
        modelList.innerHTML =
          '<li class="empty">No learned feature weights yet — upvote/downvote posts to train & sync.</li>';
      } else {
        for (const [feat, w] of featEntries) {
          const li = document.createElement("li");
          const cls = w >= 0 ? "pos" : "neg";
          const sign = w >= 0 ? "+" : "";
          const label = feat.replace(/^(t:|cue:)/, "");
          li.innerHTML = `<span>${escapeHtml(label)}</span><span class="${cls}">${sign}${Number(w).toFixed(2)}</span>`;
          modelList.appendChild(li);
        }
      }
    }

    const authorsList = document.getElementById("authors-list");
    authorsList.innerHTML = "";
    const entries = Object.entries(p.authorWeights).sort((a, b) => a[1] - b[1]);
    if (entries.length === 0) {
      authorsList.innerHTML = '<li class="empty">No author penalties (👎 Downvote stays post-level!).</li>';
    } else {
      for (const [handle, weight] of entries) {
        const li = document.createElement("li");
        const cls = weight >= 0 ? "pos" : "neg";
        const tag = weight <= -10 ? "MUTED" : `${weight >= 0 ? "+" : ""}${weight.toFixed(1)}`;
        const span = document.createElement("span");
        span.innerHTML = `@${escapeHtml(handle)} <span class="${cls}">${tag}</span>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "danger-btn";
        btn.textContent = "Reset";
        btn.addEventListener("click", () => {
          commitProfile((prof) => {
            const nextWeights = { ...prof.authorWeights };
            delete nextWeights[handle];
            return { ...prof, authorWeights: nextWeights };
          });
        });
        li.append(span, btn);
        authorsList.appendChild(li);
      }
    }

    renderEventLog();
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".x-menu") && !e.target.closest('[data-testid="caret"]')) {
      closeMenus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });
  window.addEventListener("popstate", () => {
    renderCurrentRoute();
  });

  // Wire brand click -> home
  document.querySelector(".x-logo")?.addEventListener("click", () => {
    navigate("/home");
  });

  // Wire controls
  document.getElementById("opt-enabled").addEventListener("change", (e) => {
    commitProfile((p) => ({ ...p, uiOptions: { ...p.uiOptions, enabled: e.target.checked } }));
  });
  document.getElementById("opt-display-mode").addEventListener("change", (e) => {
    commitProfile((p) => ({ ...p, uiOptions: { ...p.uiOptions, displayMode: e.target.value } }));
  });
  document.getElementById("opt-hide-promoted").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      contentFilters: { ...p.contentFilters, hidePromoted: e.target.checked },
    }));
  });
  document.getElementById("opt-hide-reposts").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      contentFilters: { ...p.contentFilters, hideReposts: e.target.checked },
    }));
  });
  document.getElementById("opt-hide-links").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      contentFilters: { ...p.contentFilters, hideLinksOnly: e.target.checked },
    }));
  });
  document.getElementById("opt-forward-x").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, forwardNotInterestedToX: e.target.checked },
    }));
  });
  document.getElementById("opt-score-badge").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      uiOptions: { ...p.uiOptions, showScoreBadge: e.target.checked },
    }));
  });
  document.getElementById("opt-ai-judge").addEventListener("change", (e) => {
    commitProfile((p) => ({
      ...p,
      tasteProfile: { ...p.tasteProfile, aiJudgeEnabled: e.target.checked },
    }));
  });

  document.getElementById("btn-save-philosophy").addEventListener("click", () => {
    const val = document.getElementById("taste-philosophy").value.trim();
    if (!val) return;
    commitProfile((p) => ({
      ...p,
      tasteProfile: { ...p.tasteProfile, philosophy: val },
    }));
    addLog("Saved Feed Philosophy", "Re-evaluating feed with updated taste criteria");
  });

  document.getElementById("btn-reflect-now").addEventListener("click", () => {
    void runReflect();
  });

  document.getElementById("rule-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const patternEl = document.getElementById("rule-pattern");
    const weightEl = document.getElementById("rule-weight");
    const regexEl = document.getElementById("rule-regex");
    const pattern = patternEl.value.trim();
    if (!pattern) return;

    commitProfile((p) => ({
      ...p,
      rules: [
        {
          id: `rule-${Date.now()}`,
          pattern,
          isRegex: regexEl.checked,
          weight: Number(weightEl.value),
          enabled: true,
        },
        ...p.rules,
      ],
    }));
    patternEl.value = "";
    regexEl.checked = false;
  });

  document.getElementById("btn-sync-now").addEventListener("click", () => {
    void runSync();
  });

  document.getElementById("btn-stream-post").addEventListener("click", () => {
    const template = EXTRA_STREAM_POSTS[streamIdx % EXTRA_STREAM_POSTS.length];
    streamIdx += 1;
    const post = {
      ...template,
      id: String(18900100 + streamIdx),
      counts: { ...template.counts },
      liked: false,
      reposted: false,
      bookmarked: false,
      replies: [],
    };
    posts = [post, ...posts];
    if (window.location.pathname === "/home" || window.location.pathname === "/") {
      const timeline = document.getElementById("timeline");
      timeline.prepend(createTweetCell(post));
    }
    addLog("Streamed new post into DOM", `@${post.authorHandle} (#${post.id})`);
  });

  document.getElementById("btn-reset-feed").addEventListener("click", () => {
    posts = createInitialPosts();
    appState = createDefaultState();
    saveState(appState);
    navigate("/home", true);
    renderPanel();
    pushStateToBundle();
    addLog("Reset playground", "Restored default Feed Philosophy and sample posts");
  });

  document.querySelectorAll(".x-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab || "for_you";
      document.querySelectorAll(".x-tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      renderCurrentRoute();
    });
  });

  renderCurrentRoute();
  renderPanel();
})();
