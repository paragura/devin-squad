export const PAGE_HTML = String.raw`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Devin Squad · チームの会話</title>
    <style>
      :root {
        --bg: #f3f6fa;
        --paper: #fff;
        --ink: #182635;
        --blue: #45679b;
        --muted: #627187;
        --line: #dfe5ee;
        --amber: #b47716;
        --red: #b54747;
        --green: #317763;
        --wash: #eaf0fa;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font:
          14px/1.65 -apple-system,
          BlinkMacSystemFont,
          'Hiragino Kaku Gothic ProN',
          'Yu Gothic',
          sans-serif;
      }
      button,
      input,
      textarea,
      select {
        font: inherit;
      }
      button {
        cursor: pointer;
      }
      button:disabled {
        cursor: wait;
        opacity: 0.55;
      }
      button,
      a,
      input,
      textarea,
      select,
      summary {
        outline-offset: 4px;
      }
      :focus-visible {
        outline: 2px solid var(--blue);
      }
      button {
        border: 1px solid var(--line);
        border-radius: 9px;
        padding: 8px 12px;
        color: var(--ink);
        background: var(--paper);
      }
      button:hover:not(:disabled) {
        background: var(--wash);
      }
      button.primary {
        background: var(--blue);
        border-color: var(--blue);
        color: white;
      }
      button.primary:hover:not(:disabled) {
        background: #365584;
      }
      button.quiet {
        background: transparent;
        border-color: transparent;
      }
      input,
      textarea,
      select {
        background: white;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        padding: 9px 11px;
        min-width: 0;
        width: 100%;
      }
      textarea {
        resize: vertical;
      }
      a {
        color: var(--blue);
      }
      h1,
      h2,
      h3,
      p {
        margin: 0;
      }
      h1 {
        font-size: 18px;
        font-weight: 650;
        letter-spacing: -0.4px;
      }
      h2 {
        font-size: 16px;
      }
      h3 {
        font-size: 14px;
      }
      .muted {
        color: var(--muted);
      }
      .small {
        font-size: 12px;
      }
      .hidden,
      [hidden] {
        display: none !important;
      }
      .app {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        min-height: 480px;
      }
      .topbar {
        height: 66px;
        flex-shrink: 0;
        background: white;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 22px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
        font-size: 16px;
        font-weight: 700;
      }
      .brand-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        background: #fff4d9;
        border-radius: 10px;
        font-size: 21px;
      }
      .repo {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        color: var(--muted);
        font-size: 12px;
      }
      .workspace {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .sidebar {
        width: 238px;
        flex-shrink: 0;
        background: #f9fbfd;
        border-right: 1px solid var(--line);
        display: flex;
        flex-direction: column;
        padding: 24px 14px 14px;
        overflow: auto;
      }
      .nav-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0 10px 10px;
      }
      .nav-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
      }
      .nav-group {
        margin-bottom: 26px;
      }
      .nav-item {
        width: 100%;
        display: flex;
        gap: 11px;
        text-align: left;
        align-items: center;
        border: 0;
        background: transparent;
        margin: 4px 0;
        padding: 11px 10px;
      }
      .nav-item.active {
        background: #e7edf7;
        color: #2f4f7d;
      }
      .nav-item .name {
        display: block;
        font-weight: 600;
      }
      .nav-item .desc {
        font-size: 11px;
        display: block;
        color: var(--muted);
        line-height: 1.5;
      }
      .avatar {
        height: 35px;
        width: 35px;
        border-radius: 11px;
        background: #e7edf5;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        font-size: 19px;
      }
      .nav-item:nth-child(3n) .avatar {
        background: #f1eaf5;
      }
      .nav-item:nth-child(3n + 1) .avatar {
        background: #e5f0ed;
      }
      .sidebar-foot {
        margin-top: auto;
        border-top: 1px solid var(--line);
        padding: 14px 10px 0;
        font-size: 11px;
        color: var(--muted);
      }
      .chat-shell {
        min-width: 0;
        flex: 1;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .chat-head {
        min-height: 91px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 32px;
        background: rgba(255, 255, 255, 0.6);
      }
      .chat-head .avatar {
        height: 43px;
        width: 43px;
        font-size: 23px;
        background: white;
        border: 1px solid var(--line);
      }
      .chat-title {
        flex: 1;
        min-width: 0;
      }
      .chat-title h1 {
        overflow-wrap: anywhere;
      }
      .connection {
        font-size: 11px;
        color: var(--muted);
        white-space: nowrap;
      }
      .connection::before {
        content: '';
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 6px;
        border-radius: 50%;
        background: var(--amber);
      }
      .connection[data-state='online']::before {
        background: var(--green);
      }
      .messages {
        flex: 1;
        overflow: auto;
        padding: 28px 32px;
        scroll-behavior: auto;
      }
      .welcome {
        max-width: 540px;
        margin: 8vh auto 0;
        text-align: center;
      }
      .welcome .team-mark {
        font-size: 30px;
        margin-bottom: 18px;
      }
      .welcome h2 {
        font-size: 25px;
        letter-spacing: -0.7px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      .welcome p {
        color: var(--muted);
        max-width: 410px;
        margin: auto;
        line-height: 1.9;
      }
      .suggestions {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 24px;
      }
      .suggestions button {
        font-size: 12px;
        background: transparent;
      }
      .message {
        display: flex;
        gap: 12px;
        max-width: 850px;
        margin: 0 auto 25px;
      }
      .message .avatar {
        width: 31px;
        height: 31px;
        font-size: 16px;
      }
      .message-body {
        min-width: 0;
        max-width: calc(100% - 44px);
      }
      .message-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        margin-bottom: 7px;
        font-weight: 600;
      }
      .message-meta time {
        font-size: 10px;
        font-weight: 400;
        color: var(--muted);
      }
      .bubble {
        background: white;
        padding: 14px 18px;
        border-radius: 0 14px 14px 14px;
        box-shadow: 0 1px 2px #18263508;
        overflow-wrap: anywhere;
        line-height: 1.8;
      }
      .message.me {
        justify-content: flex-end;
      }
      .me .message-meta {
        justify-content: flex-end;
      }
      .me .bubble {
        background: #e5ecf8;
        border-radius: 14px 0 14px 14px;
      }
      .rich p + p {
        margin-top: 9px;
      }
      .rich pre {
        background: #edf1f6;
        padding: 14px;
        border-radius: 7px;
        overflow: auto;
        max-width: 100%;
        line-height: 1.6;
      }
      .rich code {
        font:
          12px/1.6 ui-monospace,
          SFMono-Regular,
          Consolas,
          monospace;
        white-space: pre-wrap;
      }
      .rich p code {
        background: #edf1f6;
        padding: 2px 4px;
        border-radius: 3px;
      }
      .rich h3 {
        margin: 12px 0 6px;
      }
      .rich ul {
        padding-left: 22px;
        margin: 8px 0;
      }
      .rich a {
        overflow-wrap: anywhere;
      }
      .composer-area {
        padding: 0 32px 18px;
      }
      .composer {
        background: white;
        border: 1px solid #cbd5e3;
        border-radius: 14px;
        box-shadow: 0 4px 18px #18263505;
        overflow: hidden;
      }
      .composer textarea {
        border: 0;
        resize: none;
        min-height: 68px;
        max-height: 180px;
        border-radius: 14px;
        padding: 16px 18px;
        display: block;
        background: transparent;
      }
      .composer-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px 10px;
        gap: 10px;
      }
      .composer-hint {
        font-size: 10px;
        color: var(--muted);
        padding-left: 6px;
      }
      .compose-status {
        min-height: 26px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        padding: 0 3px 4px;
      }
      .compose-status.error {
        color: var(--red);
      }
      .compose-status button {
        font-size: 11px;
        padding: 2px 8px;
      }
      .new-messages {
        position: absolute;
        bottom: 172px;
        left: 50%;
        transform: translateX(-50%);
        box-shadow: 0 4px 15px #18263512;
        white-space: nowrap;
      }
      .board {
        width: 352px;
        flex-shrink: 0;
        background: white;
        border-left: 1px solid var(--line);
        padding: 22px;
        overflow: auto;
      }
      .board-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }
      .board .intro {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 20px;
      }
      .field-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        margin: 14px 0 7px;
      }
      .board textarea {
        font-size: 12px;
      }
      .board .primary {
        width: 100%;
        margin-top: 10px;
      }
      .section-divider {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 23px 0;
      }
      .plan-task {
        margin: 10px 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px;
      }
      .plan-task summary {
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      }
      .plan-task label {
        display: block;
        margin-top: 9px;
        font-size: 11px;
        color: var(--muted);
      }
      .plan-task input {
        padding: 5px;
        font-size: 12px;
      }
      .plan-task textarea {
        margin-top: 4px;
        min-height: 100px;
      }
      .task {
        border-bottom: 1px solid var(--line);
        padding: 14px 0;
      }
      .task-top {
        display: flex;
        align-items: flex-start;
        gap: 9px;
      }
      .task-icon {
        font-size: 15px;
        color: var(--muted);
      }
      .task-icon.running {
        color: var(--amber);
      }
      .task-icon.success {
        color: var(--green);
      }
      .task-icon.failed,
      .task-icon.timeout {
        color: var(--red);
      }
      .task-title {
        font-weight: 600;
        font-size: 12px;
        overflow-wrap: anywhere;
      }
      .task-state {
        font-size: 11px;
        color: var(--muted);
        margin-top: 3px;
      }
      .task-error {
        font-size: 11px;
        color: var(--red);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin-top: 8px;
      }
      .artifact-links {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 8px;
      }
      .artifact-links button {
        font-size: 11px;
        border: 0;
        padding: 0;
        color: var(--blue);
        background: none;
      }
      .run-error {
        color: var(--red);
        font-size: 12px;
        margin-top: 10px;
        overflow-wrap: anywhere;
      }
      .run-select {
        font-size: 11px;
        margin-top: 10px;
      }
      .run-summary {
        font-size: 12px;
        color: var(--muted);
        margin-top: 12px;
      }
      .board-empty {
        border: 1px dashed #d4dce7;
        border-radius: 10px;
        padding: 20px 14px;
        color: var(--muted);
        font-size: 12px;
        text-align: center;
        margin-top: 16px;
      }
      dialog {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 0;
        max-width: 900px;
        width: 90vw;
        max-height: 85dvh;
        box-shadow: 0 20px 90px #18263530;
        color: var(--ink);
      }
      dialog::backdrop {
        background: #18263555;
      }
      .dialog-head {
        padding: 15px 22px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .dialog-body {
        padding: 22px;
        overflow: auto;
        max-height: 68dvh;
      }
      .mobile-only {
        display: none;
      }
      .toggle[aria-expanded='true'] {
        background: var(--wash);
        border-color: #bdcee5;
      }
      @media (min-width: 1101px) {
        .board.closed {
          display: none;
        }
      }
      @media (max-width: 1100px) {
        .board {
          display: none;
          position: absolute;
          right: 0;
          top: 66px;
          bottom: 0;
          z-index: 3;
          width: min(390px, 100vw);
          box-shadow: -12px 0 40px #18263512;
        }
        .board.open {
          display: block;
        }
        .chat-head {
          padding: 18px 24px;
        }
        .messages {
          padding: 24px;
        }
        .composer-area {
          padding: 0 24px 16px;
        }
      }
      @media (max-width: 700px) {
        .topbar {
          padding: 0 14px;
          gap: 10px;
        }
        .repo {
          display: none;
        }
        .brand {
          flex: 1;
          font-size: 14px;
        }
        .topbar button {
          padding: 7px 9px;
          font-size: 12px;
        }
        .mobile-only {
          display: inline-block;
        }
        .sidebar {
          display: none;
          position: absolute;
          left: 0;
          top: 66px;
          bottom: 0;
          z-index: 4;
          width: 260px;
          box-shadow: 12px 0 40px #18263512;
        }
        .sidebar.open {
          display: flex;
        }
        .chat-head {
          padding: 15px 18px;
          min-height: 83px;
        }
        .chat-title h1 {
          font-size: 16px;
        }
        .connection {
          font-size: 10px;
        }
        .messages {
          padding: 20px 16px;
        }
        .composer-area {
          padding: 0 14px 12px;
        }
        .composer-hint {
          font-size: 9px;
        }
        .welcome {
          margin-top: 5vh;
        }
        .welcome h2 {
          font-size: 22px;
        }
        .welcome p {
          font-size: 12px;
        }
        .bubble {
          padding: 12px 14px;
        }
        .message {
          gap: 8px;
        }
        .message-body {
          max-width: calc(100% - 36px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          scroll-behavior: auto !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="topbar">
        <button
          id="navToggle"
          class="mobile-only quiet"
          aria-label="会話一覧を開く"
          aria-expanded="false"
        >
          ☰
        </button>
        <div class="brand"><span class="brand-icon" aria-hidden="true">🐝</span>Devin Squad</div>
        <span class="repo" id="repo">ワークスペースを読み込み中</span
        ><button id="boardToggle" class="toggle" aria-expanded="true">実行パネル</button>
      </header>
      <div class="workspace">
        <nav class="sidebar" id="sidebar" aria-label="会話一覧">
          <div class="nav-group">
            <div class="nav-head"><span class="nav-title">ルーム</span></div>
            <div id="rooms"></div>
          </div>
          <div class="nav-group">
            <div class="nav-head">
              <span class="nav-title">チームメンバー</span
              ><span id="memberCount" class="muted small"></span>
            </div>
            <div id="personas"></div>
          </div>
          <div class="sidebar-foot">
            ルームでは、話題に合うメンバーが応答します。<br />メンバーを選ぶと個別に話せます。
          </div>
        </nav>
        <main class="chat-shell">
          <div class="chat-head">
            <div class="avatar" id="chatAvatar">🌐</div>
            <div class="chat-title">
              <h1 id="chatTitle">みんなのルーム</h1>
              <p class="muted small" id="chatDescription">チームに相談してみましょう</p>
            </div>
            <span class="connection" id="connection" role="status">接続中</span>
          </div>
          <div class="messages" id="messages" aria-label="会話履歴"></div>
          <button id="newMessages" class="new-messages hidden">新しいメッセージ ↓</button>
          <div class="composer-area">
            <div id="composeStatus" class="compose-status" role="status" aria-live="polite"></div>
            <form class="composer" id="composer">
              <textarea
                id="message"
                rows="2"
                aria-label="メッセージ"
                placeholder="チームに相談する…"
              ></textarea>
              <div class="composer-bottom">
                <span class="composer-hint">Enter で送信 · Shift + Enter で改行</span
                ><button class="primary" id="send" type="submit">送信</button>
              </div>
            </form>
          </div>
        </main>
        <aside class="board" id="board" aria-label="実行パネル">
          <div class="board-head">
            <h2>作業をチームに任せる</h2>
            <button id="boardClose" class="quiet" aria-label="実行パネルを閉じる">×</button>
          </div>
          <p class="intro">ゴールから計画を作り、内容を確認して実行できます。</p>
          <label class="field-label" for="goal">今回のゴール</label
          ><textarea
            id="goal"
            rows="3"
            placeholder="例：ログイン処理を調べて、テストを追加する"
          ></textarea
          ><button class="primary" id="planBtn">計画をつくる</button>
          <div id="planError" class="run-error" role="alert"></div>
          <div id="planPreview"></div>
          <button class="primary hidden" id="runBtn">この計画で実行</button>
          <hr class="section-divider" />
          <h3>実行状況</h3>
          <select id="runSelect" class="run-select" aria-label="実行履歴"></select>
          <div id="runSummary" class="run-summary"></div>
          <div id="runError" class="run-error" role="alert"></div>
          <div id="tasks">
            <div class="board-empty">実行すると、ここで進み具合と<br />成果物を確認できます。</div>
          </div>
          <div id="runArtifacts" class="artifact-links"></div>
        </aside>
      </div>
    </div>
    <dialog id="artifactDialog">
      <div class="dialog-head">
        <h2 id="artifactTitle">成果物</h2>
        <button id="artifactClose" aria-label="成果物を閉じる">閉じる</button>
      </div>
      <div id="artifactContent" class="dialog-body rich"></div>
    </dialog>
    <script>
      (function () {
        'use strict';
        var $ = function (id) {
          return document.getElementById(id);
        };
        var roster = [],
          channels = ['web'],
          selected = { kind: 'room', name: 'web' },
          stream = null,
          generation = 0,
          seen = new Set(),
          pending = new Map(),
          drafts = new Map(),
          runs = [],
          currentRun = null,
          runStream = null,
          planning = false,
          starting = false;
        function el(tag, cls, text) {
          var e = document.createElement(tag);
          if (cls) e.className = cls;
          if (text !== undefined) e.textContent = text;
          return e;
        }
        function saved(key, fallback) {
          try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
          } catch (e) {
            return fallback;
          }
        }
        function save(key, value) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {}
        }
        function key(s) {
          return s.kind + ':' + s.name;
        }
        function query(s) {
          return s.kind === 'persona'
            ? 'persona=' + encodeURIComponent(s.name)
            : 'channel=' + encodeURIComponent(s.name);
        }
        async function api(url, body) {
          var r = await fetch(
            url,
            body === undefined
              ? {}
              : {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(body),
                },
          );
          var data = await r.json();
          if (!r.ok) throw new Error(data.error || '通信に失敗しました');
          return data;
        }
        function inline(parent, text) {
          var re = /(\*\*([^*]+)\*\*|\x60([^\x60]+)\x60|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g,
            last = 0,
            m;
          while ((m = re.exec(text))) {
            parent.appendChild(document.createTextNode(text.slice(last, m.index)));
            var node;
            if (m[2]) node = el('strong', null, m[2]);
            else if (m[3]) node = el('code', null, m[3]);
            else {
              node = el('a', null, m[4]);
              node.href = m[5];
              node.target = '_blank';
              node.rel = 'noopener noreferrer';
            }
            parent.appendChild(node);
            last = re.lastIndex;
          }
          parent.appendChild(document.createTextNode(text.slice(last)));
        }
        function rich(target, text) {
          var code = false,
            buf = [],
            list = null;
          String(text)
            .split('\n')
            .forEach(function (line) {
              if (line.startsWith('\x60\x60\x60')) {
                if (code) {
                  var pre = el('pre');
                  pre.appendChild(el('code', null, buf.join('\n')));
                  target.appendChild(pre);
                  buf = [];
                }
                code = !code;
                list = null;
                return;
              }
              if (code) {
                buf.push(line);
                return;
              }
              if (/^[-*] /.test(line)) {
                if (!list) {
                  list = el('ul');
                  target.appendChild(list);
                }
                var li = el('li');
                inline(li, line.slice(2));
                list.appendChild(li);
                return;
              }
              list = null;
              if (!line.trim()) return;
              var heading = /^#{1,6}\s+/.test(line),
                p = el(heading ? 'h3' : 'p');
              inline(p, line.replace(/^#{1,6}\s+/, ''));
              target.appendChild(p);
            });
          if (code) {
            var pre = el('pre');
            pre.appendChild(el('code', null, buf.join('\n')));
            target.appendChild(pre);
          }
        }
        function nav() {
          var rooms = $('rooms'),
            people = $('personas');
          rooms.replaceChildren();
          people.replaceChildren();
          function item(s, emoji, title, description) {
            var b = el('button', 'nav-item' + (key(s) === key(selected) ? ' active' : ''));
            b.setAttribute('aria-pressed', String(key(s) === key(selected)));
            b.appendChild(el('span', 'avatar', emoji));
            var labels = el('span');
            labels.appendChild(el('span', 'name', title));
            if (description) labels.appendChild(el('span', 'desc', description));
            b.appendChild(labels);
            b.onclick = function () {
              switchChat(s);
              $('sidebar').classList.remove('open');
              $('navToggle').setAttribute('aria-expanded', 'false');
            };
            return b;
          }
          channels.forEach(function (c) {
            rooms.appendChild(
              item(
                { kind: 'room', name: c },
                c === 'web' ? '🌐' : '#',
                c === 'web' ? 'みんなのルーム' : c,
                c === 'web' ? '話題に合うメンバーが参加' : 'Slack の共有ログ',
              ),
            );
          });
          roster.forEach(function (p) {
            people.appendChild(
              item({ kind: 'persona', name: p.name }, p.emoji, p.name, p.description),
            );
          });
          $('memberCount').textContent = roster.length;
          if (!roster.length)
            people.appendChild(
              el('p', 'muted small', 'ペルソナを追加すると、ここに表示されます。'),
            );
        }
        function welcome() {
          var box = $('messages');
          box.replaceChildren();
          var w = el('div', 'welcome');
          w.id = 'welcome';
          w.appendChild(el('div', 'team-mark', selected.kind === 'room' ? '🐝' : '💬'));
          w.appendChild(
            el(
              'h2',
              null,
              selected.kind === 'room'
                ? 'ひとりで考えず、チームと。'
                : 'ここから、会話をはじめよう。',
            ),
          );
          w.appendChild(
            el(
              'p',
              null,
              selected.kind === 'room'
                ? 'アイデアの壁打ちも、コードの相談も。話題に合うメンバーが加わり、一緒に考えます。'
                : 'このメンバーとの会話は保存されます。背景や気になっていることから、気軽に話しかけてください。',
            ),
          );
          var suggestions = el('div', 'suggestions');
          ['アイデアを一緒に整理したい', 'レビューの観点を相談したい'].forEach(function (t) {
            var b = el('button', null, t);
            b.onclick = function () {
              $('message').value = t;
              $('message').focus();
            };
            suggestions.appendChild(b);
          });
          w.appendChild(suggestions);
          box.appendChild(w);
        }
        function addMessage(m) {
          var id = m.id || String(m.ts) + m.name + m.text;
          if (seen.has(id)) return;
          seen.add(id);
          var box = $('messages'),
            bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
          if ($('welcome')) $('welcome').remove();
          var row = el('article', 'message' + (m.author === 'user' ? ' me' : ''));
          if (m.author !== 'user') {
            var p = roster.find(function (p) {
              return p.name === m.name;
            });
            row.appendChild(el('div', 'avatar', p ? p.emoji : '💬'));
          }
          var body = el('div', 'message-body'),
            meta = el('div', 'message-meta');
          meta.appendChild(
            el(
              'span',
              null,
              m.author === 'user' ? (m.display === 'you' ? 'あなた' : m.display) : m.display,
            ),
          );
          var time = el(
            'time',
            null,
            new Date(m.ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
          );
          time.dateTime = new Date(m.ts).toISOString();
          meta.appendChild(time);
          body.appendChild(meta);
          var bubble = el('div', 'bubble rich');
          rich(bubble, m.text);
          body.appendChild(bubble);
          row.appendChild(body);
          box.appendChild(row);
          if (bottom) box.scrollTop = box.scrollHeight;
          else $('newMessages').classList.remove('hidden');
        }
        function status() {
          var state = pending.get(key(selected)),
            s = $('composeStatus');
          s.replaceChildren();
          s.className = 'compose-status';
          $('send').disabled = !!(state && state.busy);
          $('send').textContent = state && state.busy ? '応答待ち…' : '送信';
          if (!state) return;
          if (state.busy) s.textContent = 'メンバーが考えています。別の会話を開いても続きます。';
          else if (state.error) {
            s.classList.add('error');
            s.appendChild(el('span', null, state.error));
            var retry = el('button', null, '再送');
            retry.onclick = function () {
              submit(state);
            };
            s.appendChild(retry);
          }
        }
        function switchChat(s) {
          drafts.set(key(selected), $('message').value);
          selected = s;
          save('squad-chat', s);
          $('message').value = drafts.get(key(s)) || '';
          nav();
          var p = roster.find(function (p) {
            return p.name === s.name;
          });
          $('chatTitle').textContent =
            s.kind === 'persona' ? s.name : s.name === 'web' ? 'みんなのルーム' : s.name;
          $('chatAvatar').textContent =
            s.kind === 'persona' && p ? p.emoji : s.name === 'web' ? '🌐' : '#';
          $('chatDescription').textContent =
            s.kind === 'persona'
              ? '個別の会話 · 履歴は保存されます'
              : s.name === 'web'
                ? '話題に合うメンバーが会話に加わります'
                : 'Slack の共有ログ · ここでの投稿はWeb上に保存されます';
          $('message').placeholder =
            s.kind === 'persona' ? s.name + ' に話しかける…' : 'チームに相談する…';
          if (stream) stream.close();
          var gen = ++generation;
          seen = new Set();
          welcome();
          $('newMessages').classList.add('hidden');
          $('connection').textContent = '接続中';
          $('connection').dataset.state = 'waiting';
          stream = new EventSource('/api/stream?' + query(s));
          stream.onopen = function () {
            if (gen !== generation) return;
            $('connection').textContent = '接続中';
            $('connection').dataset.state = 'online';
          };
          stream.onmessage = function (e) {
            if (gen !== generation) return;
            try {
              addMessage(JSON.parse(e.data));
            } catch (err) {}
          };
          stream.onerror = function () {
            if (gen !== generation) return;
            $('connection').textContent = '再接続中';
            $('connection').dataset.state = 'waiting';
          };
          status();
        }
        async function submit(previous) {
          var s = Object.assign({}, selected),
            k = key(s),
            existing = pending.get(k);
          if (existing && existing.busy) return;
          var text = previous ? previous.text : $('message').value.trim();
          if (!text) return;
          var state = {
            text: text,
            requestId: previous ? previous.requestId : crypto.randomUUID(),
            busy: true,
          };
          pending.set(k, state);
          if (!previous) {
            $('message').value = '';
            drafts.delete(k);
          }
          status();
          try {
            var body = { message: text, requestId: state.requestId };
            body[s.kind === 'persona' ? 'persona' : 'channel'] = s.name;
            await api(s.kind === 'persona' ? '/api/chat' : '/api/ambient', body);
            pending.delete(k);
          } catch (e) {
            state.busy = false;
            state.error = e.message;
          }
          if (key(selected) === k) status();
        }
        $('composer').onsubmit = function (e) {
          e.preventDefault();
          submit();
        };
        $('message').onkeydown = function (e) {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          }
        };
        $('newMessages').onclick = function () {
          $('messages').scrollTop = $('messages').scrollHeight;
          this.classList.add('hidden');
        };
        $('messages').onscroll = function () {
          if (this.scrollHeight - this.scrollTop - this.clientHeight < 90)
            $('newMessages').classList.add('hidden');
        };
        function board(open) {
          $('board').classList.toggle('closed', !open);
          $('board').classList.toggle('open', open);
          $('boardToggle').setAttribute('aria-expanded', String(open));
        }
        $('boardToggle').onclick = function () {
          board(this.getAttribute('aria-expanded') !== 'true');
        };
        $('boardClose').onclick = function () {
          board(false);
        };
        board(window.innerWidth > 1100);
        $('navToggle').onclick = function () {
          var open = $('sidebar').classList.toggle('open');
          this.setAttribute('aria-expanded', String(open));
        };
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            board(false);
            $('sidebar').classList.remove('open');
            $('navToggle').setAttribute('aria-expanded', 'false');
          }
        });
        var planned = [], planRequestId = null;
        function showPlan(tasks) {
          planned = tasks;
          planRequestId = crypto.randomUUID();
          $('planPreview').replaceChildren();
          tasks.forEach(function (t, i) {
            var d = el('details', 'plan-task'),
              summary = el('summary', null, t.title);
            d.appendChild(summary);
            [
              ['id', 'タスクID'],
              ['title', 'タイトル'],
              ['prompt', '作業内容'],
              ['dependsOn', '依存タスク（カンマ区切り）'],
            ].forEach(function (pair) {
              var label = el('label', null, pair[1]),
                input = el(pair[0] === 'prompt' ? 'textarea' : 'input');
              input.value =
                pair[0] === 'dependsOn' ? (t.dependsOn || []).join(', ') : t[pair[0]] || '';
              input.setAttribute('aria-label', pair[1] + ' ' + (i + 1));
              input.oninput = function () {
                t[pair[0]] =
                  pair[0] === 'dependsOn'
                    ? this.value
                        .split(',')
                        .map(function (x) {
                          return x.trim();
                        })
                        .filter(Boolean)
                    : this.value;
                if (pair[0] === 'title') summary.textContent = this.value;
              };
              label.appendChild(input);
              d.appendChild(label);
            });
            $('planPreview').appendChild(d);
          });
          $('runBtn').classList.remove('hidden');
        }
        $('planBtn').onclick = async function () {
          if (planning || starting) return;
          var goal = $('goal').value.trim();
          if (!goal) return;
          planning = true;
          this.disabled = true;
          this.textContent = '計画を作成中…';
          $('runBtn').disabled = true;
          $('planError').textContent = '';
          try {
            var r = await api('/api/plan', { goal: goal });
            showPlan(r.tasks);
          } catch (e) {
            $('planError').textContent = e.message;
            planned = [];
            $('planPreview').replaceChildren();
            $('runBtn').classList.add('hidden');
          } finally {
            planning = false;
            this.disabled = false;
            this.textContent = '計画をつくる';
            $('runBtn').disabled = false;
          }
        };
        $('runBtn').onclick = async function () {
          if (starting || planning || !planned.length) return;
          starting = true;
          this.disabled = true;
          $('planError').textContent = '';
          try {
            var r = await api('/api/run', { tasks: planned, goal: $('goal').value, requestId: planRequestId });
            planned = [];
            this.classList.add('hidden');
            $('planPreview').replaceChildren();
            await refreshRuns(r.runId);
          } catch (e) {
            $('planError').textContent = e.message;
          } finally {
            starting = false;
            this.disabled = false;
          }
        };
        var statusNames = {
          queued: '待機中',
          running: '実行中',
          success: '完了',
          failed: '失敗',
          timeout: '時間切れ',
          skipped: 'スキップ',
        };
        function artifactButton(label, runId, file, task) {
          var b = el('button', null, label);
          b.onclick = async function () {
            var url =
              '/api/artifact?run=' +
              encodeURIComponent(runId) +
              '&file=' +
              encodeURIComponent(file) +
              (task ? '&task=' + encodeURIComponent(task) : '');
            $('artifactTitle').textContent = (task ? task + ' / ' : '') + file;
            $('artifactContent').textContent = '読み込み中…';
            $('artifactDialog').showModal();
            try {
              var response = await fetch(url);
              if (!response.ok) {
                var err = await response.json();
                throw new Error(err.error);
              }
              var text = await response.text();
              $('artifactContent').replaceChildren();
              if (file.endsWith('.md')) rich($('artifactContent'), text);
              else {
                var pre = el('pre');
                pre.appendChild(el('code', null, text));
                $('artifactContent').appendChild(pre);
              }
            } catch (e) {
              $('artifactContent').textContent = e.message;
            }
          };
          return b;
        }
        function renderRun(run) {
          $('tasks').replaceChildren();
          $('runError').textContent = run.error || '';
          var states = {};
          run.tasks.forEach(function (t) {
            states[t.id] = { status: 'queued' };
          });
          (run.events || []).forEach(function (e) {
            if (e.type === 'task-start') states[e.taskId] = { status: 'running' };
            if (e.type === 'task-done') states[e.taskId] = e;
            if (e.type === 'task-skip') states[e.taskId] = { status: 'skipped', error: e.reason };
            if (e.type === 'heartbeat')
              e.running.forEach(function (r) {
                if (states[r.id]) states[r.id].durationMs = r.elapsedMs;
              });
          });
          (run.results || []).forEach(function (r) {
            states[r.task.id] = r;
          });
          var done = 0;
          run.tasks.forEach(function (t) {
            var s = states[t.id] || { status: 'queued' };
            if (s.status !== 'queued' && s.status !== 'running') done++;
            var card = el('div', 'task'),
              top = el('div', 'task-top');
            top.appendChild(
              el(
                'span',
                'task-icon ' + s.status,
                s.status === 'success'
                  ? '✓'
                  : s.status === 'running'
                    ? '◷'
                    : s.status === 'queued'
                      ? '○'
                      : '!',
              ),
            );
            var content = el('div');
            content.appendChild(el('div', 'task-title', t.title));
            content.appendChild(
              el(
                'div',
                'task-state',
                t.id +
                  ' · ' +
                  statusNames[s.status] +
                  (s.durationMs ? ' · ' + Math.round(s.durationMs / 1000) + '秒' : ''),
              ),
            );
            top.appendChild(content);
            card.appendChild(top);
            if (s.error) card.appendChild(el('div', 'task-error', s.error));
            if (s.status !== 'queued' && s.status !== 'running' && s.status !== 'skipped') {
              var links = el('div', 'artifact-links');
              links.appendChild(artifactButton('回答', run.id, 'output.md', t.id));
              if (s.changed) links.appendChild(artifactButton('差分', run.id, 'diff.patch', t.id));
              links.appendChild(artifactButton('ログ', run.id, 'log.txt', t.id));
              card.appendChild(links);
            }
            $('tasks').appendChild(card);
          });
          $('runSummary').textContent =
            done +
            ' / ' +
            run.tasks.length +
            ' タスク完了' +
            (run.status === 'running' ? ' · 実行中' : run.status === 'error' ? ' · 中断' : '');
          $('runArtifacts').replaceChildren();
          if (run.status === 'done')
            $('runArtifacts').appendChild(artifactButton('レポートを開く', run.id, 'report.md'));
        }
        async function watchRun(id) {
          if (runStream) runStream.close();
          currentRun = id;
          save('squad-run', id);
          try {
            var run = await api('/api/run?run=' + encodeURIComponent(id));
            if (currentRun !== id) return;
            renderRun(run);
            if (run.status !== 'running') return;
            runStream = new EventSource('/api/events?run=' + encodeURIComponent(id));
            var source = runStream;
            source.onmessage = function (e) {
              if (currentRun !== id) return;
              var ev = JSON.parse(e.data);
              if (ev.type === 'run-done' || ev.type === 'run-error') {
                source.close();
                refreshRuns(id);
              } else {
                run.events.push(ev);
                renderRun(run);
              }
            };
            source.onerror = function () {
              if (currentRun === id)
                $('runSummary').textContent = '進捗への接続を再試行しています…';
            };
          } catch (e) {
            $('runError').textContent = e.message;
          }
        }
        async function refreshRuns(selectId) {
          try {
            var data = await api('/api/runs');
            runs = data.runs;
            $('runSelect').replaceChildren();
            if (!runs.length) {
              $('runSelect').classList.add('hidden');
              return;
            }
            $('runSelect').classList.remove('hidden');
            runs.forEach(function (r) {
              var option = el(
                'option',
                null,
                (r.goal ? r.goal.slice(0, 28) : r.id) +
                  ' (' +
                  (r.status === 'running' ? '実行中' : r.status === 'error' ? '中断' : '完了') +
                  ')',
              );
              option.value = r.id;
              $('runSelect').appendChild(option);
            });
            var id = selectId || currentRun || saved('squad-run', null);
            if (
              !runs.some(function (r) {
                return r.id === id;
              })
            )
              id = runs[0].id;
            $('runSelect').value = id;
            await watchRun(id);
          } catch (e) {
            $('runError').textContent = e.message;
          }
        }
        $('runSelect').onchange = function () {
          watchRun(this.value);
        };
        $('artifactClose').onclick = function () {
          $('artifactDialog').close();
        };
        async function refreshChannels() {
          try {
            var r = await api('/api/channels');
            channels = ['web'].concat(
              r.channels.filter(function (c) {
                return c !== 'web';
              }),
            );
            nav();
          } catch (e) {}
        }
        async function init() {
          try {
            var state = await api('/api/state');
            roster = state.personas;
            $('repo').textContent = state.repo;
            $('repo').title = state.repo;
            await refreshChannels();
            var s = saved('squad-chat', selected);
            if (
              (s.kind === 'persona' &&
                roster.some(function (p) {
                  return p.name === s.name;
                })) ||
              (s.kind === 'room' && channels.includes(s.name))
            )
              selected = s;
            switchChat(selected);
            refreshRuns();
          } catch (e) {
            $('composeStatus').textContent = '初期化に失敗しました: ' + e.message;
          }
        }
        window.matchMedia('(max-width:1100px)').addEventListener('change', function (e) {
          board(!e.matches);
        });
        init();
        setInterval(refreshChannels, 15000);
      })();
    </script>
  </body>
</html>
`;
