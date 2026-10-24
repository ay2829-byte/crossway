/* Google sign in on crosswayhq.com itself, so Google's screen says "continue to crosswayhq.com".
   Turns on when config.js has googleClientId; otherwise every page keeps its normal Google button. */
(function () {
  var cfg = window.WORKBOARD_CONFIG || {}, CID = cfg.googleClientId;
  if (!CID || !window.crypto || !crypto.subtle) return;
  var SEL = '#gAuth, #aGoogle, [data-act="google"]', loading = null, sb = null;
  function load() {
    if (loading) return loading;
    loading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s) });
    return loading;
  }
  function client() {
    if (sb) return sb;
    if (!window.supabase || !cfg.supabaseUrl) return null;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return sb;
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2) }).join("") }
  function after() {
    var m = document.querySelector('meta[name="cw-after-google"]');
    var to = m && m.content;
    try { var n = JSON.parse(localStorage.getItem("cw_next") || "null"); if (n && Date.now() - n.at < 9e5) { to = n.to; localStorage.removeItem("cw_next") } } catch (_) {}
    if (to) location.href = to; else location.reload();
  }
  function note(btn, text) {
    var p = btn.parentNode && btn.parentNode.querySelector(".cwg-err");
    if (!p) { p = document.createElement("p"); p.className = "cwg-err"; p.style.cssText = "margin:8px 0 0;font-size:13px;color:#C0392B;text-align:center"; btn.parentNode.insertBefore(p, btn.nextSibling) }
    p.textContent = text;
  }
  async function mount(btn) {
    if (btn.dataset.cwg) return; btn.dataset.cwg = "1";
    try { await load() } catch (_) { return }
    var c = client(); if (!c || !window.google || !google.accounts || !google.accounts.id) return;
    var raw = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    var hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
    google.accounts.id.initialize({
      client_id: CID, nonce: hashed, ux_mode: "popup", itp_support: true,
      callback: async function (r) {
        var res = await c.auth.signInWithIdToken({ provider: "google", token: r.credential, nonce: raw });
        if (res.error) { note(holder, "Google sign in didn't go through. Try again or use email."); return }
        after();
      }
    });
    var holder = document.createElement("div");
    holder.className = "cwg"; holder.style.cssText = "display:flex;justify-content:center;min-height:44px;width:100%";
    btn.parentNode.insertBefore(holder, btn);
    var w = Math.max(240, Math.min(400, btn.offsetWidth || 320));
    google.accounts.id.renderButton(holder, { type: "standard", theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center", width: w });
    btn.style.display = "none";
  }
  function scan() { document.querySelectorAll(SEL).forEach(function (b) { if (!b.dataset.cwg) mount(b) }) }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== "loading") scan(); else document.addEventListener("DOMContentLoaded", scan);
})();
