export const PAGE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>devin-squad</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font: 14px/1.5 -apple-system, "Hiragino Sans", sans-serif; background: #0d1117; color: #e6edf3; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 10px 16px; border-bottom: 1px solid #21262d; display: flex; gap: 12px; align-items: baseline; }
  header h1 { font-size: 16px; }
  header .repo { color: #8b949e; font-size: 12px; }
  main { flex: 1; display: flex; min-height: 0; }
  aside { width: 220px; border-right: 1px solid #21262d; overflow-y: auto; padding: 8px; }
  .persona { padding: 8px; border-radius: 8px; cursor: pointer; }
  .persona:hover, .persona.active { background: #161b22; }
  .persona .desc { color: #8b949e; font-size: 11px; }
  section.center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #chat { flex: 1; overflow-y: auto; padding: 16px; }
  .msg { max-width: 75%; padding: 8px 12px; border-radius: 12px; margin-bottom: 10px; white-space: pre-wrap; word-wrap: break-word; }
  .msg.me { background: #1f6feb; margin-left: auto; }
  .msg.persona { background: #161b22; border: 1px solid #30363d; }
  .msg .who { font-size: 11px; color: #8b949e; margin-bottom: 2px; }
  #composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #21262d; }
  #composer input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: inherit; padding: 8px 12px; }
  button { background: #238636; border: 0; border-radius: 8px; color: #fff; padding: 8px 14px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  section.board { width: 320px; border-left: 1px solid #21262d; padding: 12px; overflow-y: auto; }
  .board h2 { font-size: 13px; color: #8b949e; margin-bottom: 8px; }
  .task { border: 1px solid #30363d; border-radius: 8px; padding: 8px; margin-bottom: 8px; font-size: 12px; }
  .task .t { font-weight: 600; }
  .task .s { color: #8b949e; }
  .task.running { border-color: #d29922; }
  .task.success { border-color: #238636; }
  .task.failed, .task.timeout { border-color: #f85149; }
  #goalRow { display: flex; gap: 6px; margin-bottom: 8px; }
  #goalRow input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: inherit; padding: 6px 10px; }
  #planPreview { font-size: 12px; color: #8b949e; margin-bottom: 8px; white-space: pre-wrap; }
</style>
</head>
<body>
<header><h1>🐝 devin-squad</h1><span class="repo" id="repo"></span></header>
<main>
  <aside id="personas"><div style="color:#8b949e;padding:8px">personas…</div></aside>
  <section class="center">
    <div id="chat"></div>
    <div id="composer">
      <input id="msg" placeholder="ペルソナを選んで話しかける / Enter で送信" autocomplete="off">
      <button id="send">送信</button>
    </div>
  </section>
  <section class="board">
    <h2>SQUAD RUN</h2>
    <div id="goalRow"><input id="goal" placeholder="ゴール（例: テストを追加して）"><button id="planBtn">plan</button></div>
    <div id="planPreview"></div>
    <div id="runRow" style="display:none;margin-bottom:8px"><button id="runBtn">▶ run</button></div>
    <div id="tasks"></div>
  </section>
</main>
<script>
var AMBIENT = '__ambient__';
var selected = AMBIENT;
var tasksData = null;
var evtSource = null;

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

fetch('/api/state').then(function(r){return r.json()}).then(function(s){
  document.getElementById('repo').textContent = s.repo;
  renderPersonas(s.personas);
});

function renderPersonas(personas) {
  var box = document.getElementById('personas');
  box.innerHTML = '';
  var amb = el('div', 'persona active');
  amb.appendChild(el('div', null, '🌐 ambient'));
  amb.appendChild(el('div', 'desc', 'みんな — 関係するペルソナが勝手に反応'));
  amb.onclick = function(){
    selected = AMBIENT;
    document.querySelectorAll('.persona').forEach(function(x){x.classList.remove('active')});
    amb.classList.add('active');
    addMsg('persona', '🌐 ambient', '（全員に聞こえています。関係するペルソナが応答します）');
  };
  box.appendChild(amb);
  personas.forEach(function(p){
    var d = el('div', 'persona');
    d.appendChild(el('div', null, p.emoji + ' ' + p.name));
    d.appendChild(el('div', 'desc', p.description));
    d.onclick = function(){
      selected = p.name;
      document.querySelectorAll('.persona').forEach(function(x){x.classList.remove('active')});
      d.classList.add('active');
      addMsg('persona', p.emoji + ' ' + p.name, '（このペルソナと会話します）');
    };
    box.appendChild(d);
  });
}

function addMsg(cls, who, text) {
  var m = el('div', 'msg ' + (cls === 'me' ? 'me' : 'persona'));
  if (who) m.appendChild(el('div', 'who', who));
  m.appendChild(el('div', null, text));
  document.getElementById('chat').appendChild(m);
  document.getElementById('chat').scrollTop = 1e9;
}

function send() {
  var input = document.getElementById('msg');
  var text = input.value.trim();
  if (!text || !selected) return;
  input.value = '';
  addMsg('me', null, text);
  var thinking = el('div', 'msg persona', '…');
  document.getElementById('chat').appendChild(thinking);
  if (selected === AMBIENT) {
    fetch('/api/ambient', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text})})
      .then(function(r){return r.json()})
      .then(function(r){
        thinking.remove();
        if (r.error) { addMsg('persona', '⚠️', r.error); return; }
        if (!r.replies || r.replies.length === 0) { addMsg('persona', '🌐', '（誰も反応しませんでした）'); return; }
        r.replies.forEach(function(x){ addMsg('persona', x.emoji + ' ' + x.name, x.reply); });
      })
      .catch(function(e){ thinking.textContent = 'error: ' + e; });
    return;
  }
  fetch('/api/chat', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({persona:selected,message:text})})
    .then(function(r){return r.json()})
    .then(function(r){ thinking.textContent = r.reply || r.error; thinking.scrollIntoView(); })
    .catch(function(e){ thinking.textContent = 'error: ' + e; });
}
document.getElementById('send').onclick = send;
document.getElementById('msg').addEventListener('keydown', function(e){ if(e.key==='Enter') send(); });

document.getElementById('planBtn').onclick = function(){
  var goal = document.getElementById('goal').value.trim();
  if (!goal) return;
  document.getElementById('planPreview').textContent = 'planning…';
  fetch('/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal:goal})})
    .then(function(r){return r.json()})
    .then(function(r){
      if (r.error) { document.getElementById('planPreview').textContent = 'error: '+r.error; return; }
      tasksData = r.tasks;
      document.getElementById('planPreview').textContent = r.tasks.map(function(t){return '- '+t.id+': '+t.title}).join('\\n');
      document.getElementById('runRow').style.display = 'block';
    });
};

document.getElementById('runBtn').onclick = function(){
  if (!tasksData) return;
  fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tasks:tasksData})})
    .then(function(r){return r.json()})
    .then(function(r){
      if (r.error) { document.getElementById('planPreview').textContent = 'error: '+r.error; return; }
      watchRun(r.runId, tasksData);
    });
};

function watchRun(runId, tasks) {
  var box = document.getElementById('tasks');
  box.innerHTML = '';
  var cards = {};
  tasks.forEach(function(t){
    var c = el('div','task');
    c.appendChild(el('div','t',t.id));
    c.appendChild(el('div','s','queued'));
    box.appendChild(c); cards[t.id] = c;
  });
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events?run=' + runId);
  evtSource.onmessage = function(e){
    var ev = JSON.parse(e.data);
    if (ev.type === 'task-start') { cards[ev.taskId].className='task running'; cards[ev.taskId].querySelector('.s').textContent='running…'; }
    if (ev.type === 'task-done') {
      var c = cards[ev.taskId];
      c.className = 'task ' + ev.status;
      c.querySelector('.s').textContent = ev.status + ' (' + Math.round(ev.durationMs/1000) + 's)' + (ev.changed ? ' · changes' : '');
    }
    if (ev.type === 'task-skip') { cards[ev.taskId].querySelector('.s').textContent = 'skipped: '+ev.reason; }
    if (ev.type === 'run-done') evtSource.close();
  };
}
</script>
</body>
</html>`;
