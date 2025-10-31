(function(){
  // =======================
  // LOCAL STORAGE KEYS (keep for categories/requests/contacts/comments)
  // =======================
  const LS = {
    plugins: 'fm_plugins',        // (not used anymore for listing; kept only for legacy fallbacks)
    categories: 'fm_cats',
    requests: 'fm_requests',
    contacts: 'fm_contacts',
    comments: 'fm_comments'
  };

  // =======================
  // BACKEND CONFIG + API LAYER
  // =======================
  const API_BASE = "https://fmp-backend-wrdc.onrender.com/api";
             
  const PLUGINS_URL = `${API_BASE}/plugins`;

  // Unified fetch that matches ApiResponse { success, data, meta? }
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const msg = json.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json.data ?? json;
  }

  // Backend store for plugins
  const Store = {
    async list({ q, cat, sub, tags, minRating } = {}) {
      const url = new URL(PLUGINS_URL);
      if (q) url.searchParams.set("q", q);
      if (cat) url.searchParams.set("category", cat);
      if (sub) url.searchParams.set("subcategory", sub);
      if (tags) url.searchParams.set("tags", tags);          // comma-separated
      if (minRating) url.searchParams.set("minRating", minRating);
      // Optional: url.searchParams.set("sortBy","newest|popular|rating")
      return api("GET", url.href);                           // -> array of plugins
    },
    async get(id) {
      return api("GET", `${PLUGINS_URL}/${id}`);
    },
    async create(payload) {
      return api("POST", PLUGINS_URL, payload);
    },
    async update(id, payload) {
      return api("PATCH", `${PLUGINS_URL}/${id}`, payload);
    },
    async softDelete(id) {
      return api("DELETE", `${PLUGINS_URL}/${id}`);
    },
    async restore(id) {
      return api("POST", `${PLUGINS_URL}/${id}/restore`);
    },
    async inc(id, field) {
      const p = await Store.get(id);
      const next = { [field]: (p[field] || 0) + 1 };
      return Store.update(id, next);
    },
  };

  // =======================
  // UTILITIES
  // =======================
  function $(s, ctx=document){return ctx.querySelector(s)}
  function $all(s, ctx=document){return Array.from(ctx.querySelectorAll(s))}
  function uid(){return 'id_'+Math.random().toString(36).slice(2,9)}
  function save(key, v){localStorage.setItem(key, JSON.stringify(v))}
  function load(key, def){const v=localStorage.getItem(key); return v?JSON.parse(v):def}
  const params = new URLSearchParams(location.search);
  const fmt = (x) => (x ?? "").toString();
  const getId = (p) => p._id || p.id;

  // =======================
  // DEFAULTS (only categories are seeded now)
  // =======================
  const defaultCats = [
    { name:'Chrome extensions', subs:['Youtube','Productivity','Design']},
    { name:'Wordpress', subs:['Plugins','Themes']},
    { name:'Woo-commerce', subs:['Payment','Shipping']},
    { name:'Shopify', subs:['Apps']},
    { name:'Others', subs:[]}
  ];

  function seedSample(){
    if(!load(LS.categories)) save(LS.categories, defaultCats);
    // NOTE: We no longer seed LS.plugins; plugins now come from backend.
  }
  seedSample();

  // =======================
  // RENDERING HELPERS
  // =======================
  function renderCategories(listElId='categoryList', catSelectId){
    const cats = load(LS.categories, []);
    const el = document.getElementById(listElId);
    if(el){
      el.innerHTML = '';
      cats.forEach(c=>{
        const li = document.createElement('li');
        li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
        el.appendChild(li);
      });
    }
    if(catSelectId){
      const sel = document.getElementById(catSelectId);
      if(sel){
        sel.innerHTML = '<option value="">Choose category</option>';
        cats.forEach(c=> sel.appendChild(new Option(c.name,c.name)));
      }
    }
  }

  // Build tag cloud from backend
  async function renderTagCloud(el) {
    if (!el) return;
    el.innerHTML = '';
    try {
      const all = await Store.list();
      const tagCount = {};
      all.forEach(p => (p.tags || []).forEach(t => tagCount[t] = (tagCount[t] || 0) + 1));
      Object.keys(tagCount).slice(0, 20).forEach(t => {
        const b = document.createElement('button'); 
        b.className='tag'; 
        b.textContent=t;
        b.addEventListener('click', ()=> location.href='listing.html?tag='+encodeURIComponent(t));
        el.appendChild(b);
      });
    } catch (e) {
      el.innerHTML = '<p class="muted">Tags unavailable</p>';
    }
  }

  // =======================
  // LISTING (BACKEND)
  // =======================
  async function listPlugins(containerId='pluginsContainer', filter={}){
    const cont = document.getElementById(containerId);
    if(!cont) return;
    cont.innerHTML = '<p class="muted">Loading...</p>';

    try {
      const items = await Store.list({
        q: filter.q,
        cat: filter.cat,
        sub: filter.sub,
        tags: filter.tags,
        minRating: filter.minRating
      });

      cont.innerHTML = '';
      if(!items.length){
        cont.innerHTML = '<p class="muted">No plugins found.</p>';
        return;
      }

      items.forEach(it=>{
        const card = document.createElement('article');
        card.className='card';
        const firstShot = (it.screenshots && it.screenshots[0] && it.screenshots[0].url) || 'https://placehold.co/400x220?text=Screenshot';
        const id = getId(it);
        card.innerHTML = `
          <a href="detail.html?id=${id}"><img src="${firstShot}" alt="" onerror="this.src='https://placehold.co/400x220?text=Screenshot'"></a>
          <h4><a href="detail.html?id=${id}">${it.title}</a></h4>
          <p class="muted">${it.desc}</p>
          <div class="muted category-name" style="margin-bottom:4px;">${it.category}${it.subcategory ? ' • <span class="muted">'+it.subcategory+'</span>' : ''}</div>
          <div class="meta-actions">
            <button data-act="heart" data-id="${id}">❤ ${it.hearts||0}</button>
            <button data-act="like" data-id="${id}">👍 ${it.likes||0}</button>
            <button data-act="ok" data-id="${id}">👌 ${it.oks||0}</button>
            <a href="detail.html?id=${id}">View →</a>
          </div>`;
        cont.appendChild(card);
      });
    } catch (err) {
      cont.innerHTML = `<p class="error">Failed to load: ${err.message}</p>`;
    }
  }

  // =======================
  // GLOBAL REACTIONS (BACKEND)
  // =======================
  document.addEventListener('click', async function(e){
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    try {
      if(act==='heart') await Store.inc(id, 'hearts');
      if(act==='like')  await Store.inc(id, 'likes');
      if(act==='ok')    await Store.inc(id, 'oks');
      // re-render affected sections
      if(document.getElementById('pluginsContainer')) listPlugins('pluginsContainer');
      if(document.getElementById('listContainer'))    listPlugins('listContainer', { q: $('#listSearch')?.value, cat: $('#categoryFilter')?.value, sub: $('#subcatFilter')?.value });
      if(document.getElementById('pluginDetail'))     renderDetailFromQuery();
    } catch (err) {
      alert('Action failed: ' + err.message);
    }
  });

  // =======================
  // HOME SEARCH
  // =======================
  const searchForm = $('#searchForm');
  if(searchForm){
    searchForm.addEventListener('submit', function(ev){
      ev.preventDefault();
      const q = $('#searchInput').value.trim();
      location.href = 'listing.html?q='+encodeURIComponent(q);
    });
  }

  // =======================
  // REQUEST MODAL (LS)
  // =======================
  const openRequestBtn = $('#openRequestBtn');
  const requestModal = $('#requestModal');
  if(openRequestBtn && requestModal){
    openRequestBtn.addEventListener('click', ()=> requestModal.setAttribute('aria-hidden','false'));
    $('#closeRequest').addEventListener('click', ()=> requestModal.setAttribute('aria-hidden','true'));
    $('#requestForm').addEventListener('submit', function(ev){
      ev.preventDefault();
      const docFile = $('#reqFile').files[0];
      const data = { id:uid(), text:$('#reqText').value, name:$('#reqName').value, email:$('#reqEmail').value, phone:$('#reqPhone').value, file:null, created:Date.now() };
      if(docFile){
        const reader = new FileReader();
        reader.onload = function(){ data.file = reader.result; const arr = load(LS.requests,[]); arr.push(data); save(LS.requests,arr); alert('Request submitted'); requestModal.setAttribute('aria-hidden','true'); $('#requestForm').reset(); };
        reader.readAsDataURL(docFile);
      } else {
        const arr = load(LS.requests,[]); arr.push(data); save(LS.requests,arr); alert('Request submitted'); requestModal.setAttribute('aria-hidden','true'); $('#requestForm').reset();
      }
    });
  }

  // =======================
  // LISTING PAGE FILTER/SEARCH
  // =======================
  if($('#listSearch')){
    const q0 = new URLSearchParams(location.search).get('q')||'';
    $('#listSearch').value = q0;

    $('#listSearch').addEventListener('input', ()=> listPlugins('listContainer',{ q: $('#listSearch').value }));

    renderCategories('','categoryFilter');
    const cats = load(LS.categories,[]);
    $('#categoryFilter').addEventListener('change', function(){
      const v = this.value;
      const subsel = $('#subcatFilter');
      subsel.innerHTML = '<option value="">All Subcategories</option>';
      const cat = cats.find(c=>c.name===v);
      if(cat) cat.subs.forEach(s=> subsel.appendChild(new Option(s,s)));
      listPlugins('listContainer',{ cat: v, q: $('#listSearch').value });
    });
    $('#subcatFilter').addEventListener('change', ()=> listPlugins('listContainer',{ cat: $('#categoryFilter').value, sub: $('#subcatFilter').value, q: $('#listSearch').value }));

    listPlugins('listContainer',{ q: q0 });
  }

  // =======================
  // HOME RENDERING
  // =======================
  (async function initHome(){
    if($('#pluginsContainer')){
      renderCategories('categoryList');
      await listPlugins('pluginsContainer');
      // tags (from backend)
      await renderTagCloud($('#tagList'));
      // category click → listing
      document.getElementById('categoryList')?.addEventListener('click', (ev)=>{
        const btn = ev.target.closest('button[data-cat]');
        if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
      });
    }
  })();

  // =======================
  // DETAIL PAGE (BACKEND)
  // =======================
  async function renderDetailFromQuery(){
    const id = new URLSearchParams(location.search).get('id');
    const container = $('#pluginDetail');
    const extras = $('#pluginExtras');
    const descText = $('#pluginDescText');
    if(!container) return;

    if(!id){
      container.innerHTML = '<p>Plugin not found</p>';
      if(descText) descText.innerHTML=''; 
      if(extras) extras.innerHTML='';
      return;
    }

    container.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const p = await Store.get(id);
      const comments = load(LS.comments,[]).filter(c=>c.pluginId===id && c.approved); // comments still in LS

      const firstShot = (p.screenshots && p.screenshots[0] && p.screenshots[0].url) || null;
      const mainScreenshotHtml = firstShot
        ? `<div id="mainScreenshot" style="margin-top:12px">
            <img id="mainScreenshotImg" src="${firstShot}" alt="main screenshot" onerror="this.src='https://placehold.co/800x420?text=Screenshot'" style="width:100%;max-height:420px;object-fit:contain;border-radius:8px;border:1px solid #eee">
           </div>` : '';

      const galleryHtml = (p.screenshots || []).length
        ? `<div class="screenshots" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${p.screenshots.map((s,idx)=>`
              <a href="${s.url}" data-scr="${s.url}" data-idx="${idx}" class="screenshot-link" style="display:inline-block">
                <img src="${s.url}" alt="screenshot ${idx+1}" onerror="this.src='https://placehold.co/120x80?text=Shot'" style="width:120px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #eee">
              </a>`).join('')}
           </div>` : '';

      const appBtnHtml = p.appLink ? `<a href="${p.appLink}" target="_blank" rel="noopener" class="btn" style="margin-right:8px">Open Application</a>` : '';

      container.innerHTML = `
        <div class="plugin-detail">
          <div class="plugin-meta">
            <div style="flex:1">
              <h1>${p.title}</h1>
              <p class="muted">${p.desc}</p>
              <p>Category: ${p.category}${p.subcategory ? ' • <span class="muted">'+p.subcategory+'</span>' : ''}</p>
              <div class="meta-actions">
                <button data-act="heart" data-id="${getId(p)}">❤ ${p.hearts||0}</button>
                <button data-act="like" data-id="${getId(p)}">👍 ${p.likes||0}</button>
                <button data-act="ok" data-id="${getId(p)}">👌 ${p.oks||0}</button>
                <button id="shareBtn">Share</button>
              </div>
            </div>
            <div style="width:320px">
              ${p.video? `<iframe width=\"100%\" height=\"180\" src=\"${p.video.replace('watch?v=','embed/')}\" frameborder=\"0\" allowfullscreen></iframe>` : ''}
            </div>
          </div>

          ${mainScreenshotHtml}
          ${galleryHtml}

          <div style="margin-top:12px">
            ${appBtnHtml}
          </div>

          <hr/>
          <h2 style="margin-top:18px">Full Description</h2>
          <div id="fullDescription" style="padding:14px;margin-top:8px;background:#fff">${p.descText || '<p>No detailed description provided.</p>'}</div>

          <hr/>
          <h3>Comments</h3>
          <div id="commentsArea">${comments.map(c=> `<div class="card"><strong>${c.name}</strong><p>${c.text}</p></div>`).join('') || '<p>No comments yet.</p>'}</div>

          <div id="commentFormWrap" style="margin-top:12px">
            <button id="btnSignIn" class="btn small">Sign in to comment</button>
            <div id="addCommentArea" style="display:none">
              <textarea id="commentText" placeholder="Write your comment"></textarea>
              <button id="submitComment" class="btn small">Submit (goes for moderation)</button>
            </div>
          </div>
        </div>
      `;

      if(extras) extras.innerHTML = '';

      $('#downloadDescBtn')?.addEventListener('click', function(){
        if(p.appLink){ window.open(p.appLink, '_blank', 'noopener'); return; }
        const content = p.descText || p.desc || '';
        const blob = new Blob([content], {type:'text/html'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (p.title || 'plugin') + '-description.html';
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      });

      $('#downloadScreenshot')?.addEventListener('click', function(){
        const img = $('#mainScreenshotImg');
        if(!img || !img.src) return alert('No screenshot to download');
        const a = document.createElement('a');
        a.href = img.src;
        a.download = (p.title || 'screenshot') + '.png';
        document.body.appendChild(a); a.click(); a.remove();
      });

      $('.screenshots')?.addEventListener('click', function(ev){
        const link = ev.target.closest('a.screenshot-link');
        if(!link) return;
        const mainImg = $('#mainScreenshotImg');
        if(mainImg && link.dataset.scr) mainImg.src = link.dataset.scr;
        if(ev.ctrlKey || ev.metaKey) window.open(link.dataset.scr,'_blank');
        ev.preventDefault();
      });

      $('#shareBtn').addEventListener('click', ()=> navigator.share ? navigator.share({ title:p.title, url:location.href }).catch(()=>alert('Share not supported')) : prompt('Share link', location.href));

      const session = sessionStorage.getItem('fm_user');
      if(session){
        $('#btnSignIn').style.display='none';
        $('#addCommentArea').style.display='block';
      }
      $('#btnSignIn')?.addEventListener('click', ()=> { $('#signinModal').setAttribute('aria-hidden','true') === false || $('#signinModal').setAttribute('aria-hidden','false'); });
      $('#submitComment')?.addEventListener('click', ()=>{
        const txt = $('#commentText').value.trim();
        if(!txt) return alert('Write something');
        const user = JSON.parse(sessionStorage.getItem('fm_user') || '{}');
        const cm = { id:uid(), pluginId:id, name: user.name||'Guest', email:user.email||'', text:txt, approved:false, created:Date.now() };
        const arr = load(LS.comments,[]); arr.push(cm); save(LS.comments, arr);
        alert('Comment submitted for moderation');
        $('#commentText').value='';
      });

      populateDetailSidebar(p);
    } catch (err) {
      container.innerHTML = `<p class="error">${err.message}</p>`;
      if(descText) descText.innerHTML=''; 
      if(extras) extras.innerHTML='';
    }
  }
  renderDetailFromQuery(); // no-op on non-detail pages

  // =======================
  // SIGN-IN MODAL (LS)
  // =======================
  if($('#signinForm')){
    $('#signinForm').addEventListener('submit', function(ev){
      ev.preventDefault();
      const name = $('#signinName').value, email = $('#signinEmail').value;
      sessionStorage.setItem('fm_user', JSON.stringify({ name, email }));
      $('#signinModal').setAttribute('aria-hidden','true');
      alert('Signed in as '+name);
      renderDetailFromQuery();
    });
    $('#closeSignin').addEventListener('click', ()=> $('#signinModal').setAttribute('aria-hidden','true'));
  }

  // =======================
  // CONTACT FORM (LS)
  // =======================
  if($('#contactForm')){
    $('#contactForm').addEventListener('submit', function(ev){
      ev.preventDefault();
      const msg = $('#contactMsg').value, email = $('#contactEmail').value;
      const arr = load(LS.contacts,[]); arr.push({id:uid(), msg, email, created:Date.now()}); save(LS.contacts,arr);
      alert('Thank you — we will reach out.');
      this.reset();
    });
  }

  // =======================
  // ADMIN (CREATE/LIST/DELETE/EDIT via BACKEND)
  // =======================
  if($('#adminPlugins') || $('#addPluginForm')){
    // categories UI (still LS)
    function populateAdminCats(){
      const cats = load(LS.categories,[]);
      const adminCats = $('#adminCats'); 
      if (adminCats) adminCats.innerHTML='';
      cats.forEach(c=>{
        const li = document.createElement('li');
        li.innerHTML = `${c.name} 
          <button data-del="${c.name}" class="small delCatBtn" title="Delete category" style="background:transparent;border:none;padding:2px 6px;vertical-align:middle;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;">
              <path d="M6 7v7m4-7v7m4-7v7M3 5h14M8 3h4a1 1 0 0 1 1 1v1H7V4a1 1 0 0 1 1-1z" stroke="#d00" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          ${c.subs && c.subs.length ? `<div style=\"font-size:13px;color:#888;margin-left:10px;\">Subs: ${c.subs.join(', ')}</div>` : ''}`;
        adminCats?.appendChild(li);
      });
      renderCategories('','pCategory');
      populateCatSelectForSub();
      $('#pCategory')?.addEventListener('change', function(){
        const name = this.value;
        const cats = load(LS.categories,[]);
        const found = cats.find(x=>x.name===name);
        $('#pSubcategory').innerHTML = '<option value="">Select sub</option>';
        (found && found.subs || []).forEach(s=> $('#pSubcategory').appendChild(new Option(s,s)));
      });
    }
    function populateCatSelectForSub(){
      const cats = load(LS.categories,[]);
      const sel = $('#catSelectForSub');
      if(sel){
        sel.innerHTML = '';
        cats.forEach(c=> sel.appendChild(new Option(c.name,c.name)));
      }
    }
    populateAdminCats();
    populateCatSelectForSub();

    // Helper state + fns for Edit flow
    let CURRENT_EDIT_ID = null;
    function fillEditCategorySelects(selectedCat, selectedSub) {
      const cats = load(LS.categories, []);
      const catSel = $('#editCategory');
      const subSel = $('#editSubcategory');
      if (!catSel || !subSel) return;

      catSel.innerHTML = '<option value="">Select category</option>';
      cats.forEach(c => catSel.appendChild(new Option(c.name, c.name)));
      catSel.value = selectedCat || '';

      subSel.innerHTML = '<option value="">Select sub</option>';
      const found = cats.find(x => x.name === catSel.value);
      (found && found.subs || []).forEach(s => subSel.appendChild(new Option(s, s)));
      subSel.value = selectedSub || '';

      catSel.addEventListener('change', () => {
        const found2 = cats.find(x => x.name === catSel.value);
        subSel.innerHTML = '<option value="">Select sub</option>';
        (found2 && found2.subs || []).forEach(s => subSel.appendChild(new Option(s, s)));
        subSel.value = '';
      });
    }
    const fileToDataURL = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // CREATE (backend) — reads files from #pScreens and sends data URLs
    $('#addPluginForm')?.addEventListener('submit', async function(ev){
      ev.preventDefault();

      // helper: File -> data URL
      const toDataURL = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const files = Array.from($('#pScreens')?.files || []);
      let screenshots = [];
      try {
        if (files.length) {
          const dataUrls = await Promise.all(files.map(toDataURL));
          screenshots = dataUrls.map(u => ({ url: u }));
        }
      } catch (e) {
        alert('Failed to read screenshot file(s).');
        return;
      }

      const payload = {
        title: $('#pTitle').value,
        desc: $('#pDesc').value,
        descText: $('#descEditor')?.innerHTML || '',
        tags: $('#pTags').value.split(',').map(s=>s.trim()).filter(Boolean),
        category: $('#pCategory').value,
        subcategory: $('#pSubcategory').value,
        screenshots, // now populated from file input
        video: $('#pVideo').value,
        appLink: $('#pAppLink')?.value || '',
      };

      Store.create(payload)
        .then(()=>{
          alert('Plugin added');
          $('#addPluginForm').reset();
          if($('#descEditor')) $('#descEditor').innerHTML = '';
          renderAdminPlugins();
        })
        .catch(err=> alert('Create failed: ' + err.message));
    });

    // ADMIN LIST (backend)
    async function renderAdminPlugins(){
      const wrap = $('#adminPlugins'); if(!wrap) return;
      wrap.innerHTML = '<p class="muted">Loading...</p>';
      try {
        const arr = await Store.list();
        if(!arr.length){ wrap.innerHTML = '<p>No plugins</p>'; return; }
        wrap.innerHTML = '';
        arr.forEach(p=>{
          const id = getId(p);
          const div = document.createElement('div'); 
          div.className='card';
          div.innerHTML = `<strong>${p.title}</strong>
            <p class=\"muted\">${p.category}${p.subcategory ? ' • <span class=\\\"muted\\\">'+p.subcategory+'</span>' : ''}</p>
            ${p.appLink ? `<div style=\"margin:6px 0\"><a href=\"${p.appLink}\" target=\"_blank\" rel=\"noopener\" class=\"btn ghost small\">Open App</a></div>` : ''}
            <button data-id=\"${id}\" class=\"editPlugin small\">Edit</button>
            <button data-id=\"${id}\" class=\"delPlugin small\">Delete</button>
            <a href=\"detail.html?id=${id}\">View</a>`;
          wrap.appendChild(div);
        });
      } catch (err) {
        wrap.innerHTML = `<p class=\"error\">${err.message}</p>`;
      }
    }
    renderAdminPlugins();

    // Admin list click: Edit & Delete
    $('#adminPlugins')?.addEventListener('click', async function(ev){
      const editBtn = ev.target.closest('button.editPlugin');
      const delBtn  = ev.target.closest('button.delPlugin');

      if (editBtn) {
        const id = editBtn.dataset.id;
        try {
          const p = await Store.get(id);
          CURRENT_EDIT_ID = id;

          $('#editTitle').value = p.title || '';
          $('#editDesc').value  = p.desc || '';
          $('#editDescEditor').innerHTML = p.descText || '';
          $('#editTags').value = (p.tags || []).join(', ');
          fillEditCategorySelects(p.category || '', p.subcategory || '');
          $('#editVideo').value = p.video || '';
          $('#editAppLink').value = p.appLink || '';
          if ($('#editScreens')) $('#editScreens').value = '';

          $('#editPluginModal').setAttribute('aria-hidden', 'false');
        } catch (e) {
          alert('Failed to open editor: ' + e.message);
        }
        return;
      }

      if (delBtn) {
        const id = delBtn.dataset.id;
        if(!confirm("Soft delete this plugin?")) return;
        try{
          await Store.softDelete(id);
          renderAdminPlugins();
        } catch(err){
          alert('Delete failed: ' + err.message);
        }
      }
    });

    // Close edit modal
    $('#closeEditPlugin')?.addEventListener('click', () => {
      $('#editPluginModal').setAttribute('aria-hidden', 'true');
      CURRENT_EDIT_ID = null;
    });

    // Optional: if you add this checkbox in admin.html inside edit form, code will honor it
    // <label style="display:flex;align-items:center;gap:6px;margin:6px 0;">
    //   <input type="checkbox" id="editReplaceShots" />
    //   Replace existing screenshots (instead of appending)
    // </label>

    // Save changes from Edit form
    $('#editPluginForm')?.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!CURRENT_EDIT_ID) return alert('No plugin selected.');

      try {
        const existing = await Store.get(CURRENT_EDIT_ID);
        const next = {
          title: $('#editTitle').value,
          desc:  $('#editDesc').value,
          descText: $('#editDescEditor')?.innerHTML || '',
          tags: $('#editTags').value.split(',').map(s=>s.trim()).filter(Boolean),
          category: $('#editCategory').value,
          subcategory: $('#editSubcategory').value,
          video: $('#editVideo').value,
          appLink: $('#editAppLink').value,
        };

        const files = Array.from($('#editScreens')?.files || []);
        const replace = $('#editReplaceShots')?.checked === true;
        let newShots = [];

        if (files.length) {
          const dataUrls = await Promise.all(files.map(fileToDataURL));
          newShots = dataUrls.map(u => ({ url: u }));
        }

        if (files.length) {
          next.screenshots = replace
            ? newShots
            : [ ...(existing.screenshots || []), ...newShots ];
        }

        await Store.update(CURRENT_EDIT_ID, next);

        alert('Plugin updated');
        $('#editPluginModal').setAttribute('aria-hidden', 'true');
        CURRENT_EDIT_ID = null;

        renderAdminPlugins();
        if (document.getElementById('pluginDetail')) renderDetailFromQuery();
      } catch (e) {
        alert('Update failed: ' + e.message);
      }
    });

    // Requests + Comments moderation still use LS (unchanged)
    function renderRequests(){
      const r = load(LS.requests,[]);
      const wrap = $('#adminRequests'); if(!wrap) return;
      wrap.innerHTML = '';
      if(!r.length) wrap.innerHTML = '<p>No requests</p>';
      r.forEach(req=>{
        const div = document.createElement('div'); div.className='card';
        div.innerHTML = `<strong>${req.name}</strong><p>${req.text}</p><div class=\"muted\">${req.email} • ${new Date(req.created).toLocaleString()}</div>
          <button data-rid=\"${req.id}\" class=\"small\">Delete</button>`;
        wrap.appendChild(div);
      });
    }
    renderRequests();
    $('#adminRequests')?.addEventListener('click', function(ev){
      const btn = ev.target.closest('button[data-rid]');
      if(!btn) return;
      const id = btn.dataset.rid;
      let r = load(LS.requests,[]); 
      r = r.filter(x=>x.id!==id); 
      save(LS.requests,r); 
      renderRequests();
    });

    function renderPendingComments(){
      const all = load(LS.comments,[]);
      const pending = all.filter(c=>!c.approved);
      const wrap = $('#adminComments'); if(!wrap) return;
      wrap.innerHTML = '';
      if(!pending.length) wrap.innerHTML = '<p>No pending comments</p>';
      pending.forEach(c=>{
        const div = document.createElement('div'); div.className='card';
        div.innerHTML = `<strong>${c.name}</strong><p>${c.text}</p><div class=\"muted\">${new Date(c.created).toLocaleString()}</div>
          <button data-approve=\"${c.id}\" class=\"small\">Approve</button>
          <button data-delc=\"${c.id}\" class=\"small\">Delete</button>`;
        wrap.appendChild(div);
      });
    }
    renderPendingComments();
    $('#adminComments')?.addEventListener('click', function(ev){
      const approve = ev.target.closest('button[data-approve]');
      const delc = ev.target.closest('button[data-delc]');
      if(approve){
        const id = approve.dataset.approve; 
        const arr = load(LS.comments,[]); 
        const c = arr.find(x=>x.id===id); 
        if(c) c.approved=true; 
        save(LS.comments,arr); 
        renderPendingComments();
      }
      if(delc){
        const id = delc.dataset.delc; 
        let arr = load(LS.comments,[]); 
        arr = arr.filter(x=>x.id!==id); 
        save(LS.comments,arr); 
        renderPendingComments();
      }
    });
  }

  // =======================
  // LISTING PAGE WITH QUERY PARAMS
  // =======================
  if(location.pathname.endsWith('/listing.html') || location.pathname.endsWith('listing.html')){
    const pms = new URLSearchParams(location.search);
    const q = pms.get('q') || pms.get('tag') || '';
    if(q) listPlugins('listContainer',{ q: q, cat: pms.get('cat') || '' });
  }

  // =======================
  // GENERIC MODAL HELPERS (unchanged)
  // =======================
  function enableModalAutoClose(modalSelector, panelSelector, closeBtnSelector) {
    const modal = $(modalSelector);
    const panel = $(panelSelector, modal);
    const closeBtn = $(closeBtnSelector, modal);
    if(!modal || !panel) return;
    modal.addEventListener('mousedown', function(ev){
      if(ev.target === modal) modal.setAttribute('aria-hidden','true');
    });
    document.addEventListener('keydown', function(ev){
      if(ev.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
        modal.setAttribute('aria-hidden','true');
      }
    });
    if(closeBtn) closeBtn.addEventListener('click', function(){
      modal.setAttribute('aria-hidden','true');
    });
  }

  // =======================
  // MOBILE FILTER SIDEBARS (use LS categories + backend tag cloud)
  // =======================
  if($('#openFilterSidebar')){
    $('#openFilterSidebar').addEventListener('click', async function(){
      $('#filterSidebarModal').setAttribute('aria-hidden','false');
      // categories
      const cats = load(LS.categories, []);
      const catList = $('#categoryListMobile');
      catList.innerHTML = '';
      cats.forEach(c=>{
        const li = document.createElement('li');
        li.innerHTML = `<button class=\"link-btn\" data-cat=\"${c.name}\">${c.name}</button>`;
        catList.appendChild(li);
      });
      catList.addEventListener('click', function(ev){
        const btn = ev.target.closest('button[data-cat]');
        if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
      });
      // tags from backend
      await renderTagCloud($('#tagListMobile'));
    });
    enableModalAutoClose('#filterSidebarModal', '.sidebar-panel', '#closeFilterSidebar');
  }

  if($('#openFilterSidebarDetail')){
    $('#openFilterSidebarDetail').addEventListener('click', async function(){
      $('#filterSidebarModalDetail').setAttribute('aria-hidden','false');
      // categories
      const cats = load(LS.categories, []);
      const catList = $('#categoryListMobileDetail');
      catList.innerHTML = '';
      cats.forEach(c=>{
        const li = document.createElement('li');
        li.innerHTML = `<button class=\"link-btn\" data-cat=\"${c.name}\">${c.name}</button>`;
        catList.appendChild(li);
      });
      catList.addEventListener('click', function(ev){
        const btn = ev.target.closest('button[data-cat]');
        if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
      });
      // tags from backend
      await renderTagCloud($('#tagListMobileDetail'));
    });
    enableModalAutoClose('#filterSidebarModalDetail', '.sidebar-panel', '#closeFilterSidebarDetail');
  }

  // Listing page popup filter
  if(location.pathname.endsWith('/listing.html') || location.pathname.endsWith('listing.html')){
    if(!$('#filterSidebarModalListing')){
      const modalDiv = document.createElement('div');
      modalDiv.id = 'filterSidebarModalListing';
      modalDiv.className = 'modal filter-sidebar-modal';
      modalDiv.setAttribute('aria-hidden','true');
      modalDiv.innerHTML = `
        <div class=\"modal-panel sidebar-panel\">
          <button class=\"close\" id=\"closeFilterSidebarListing\">&times;</button>
          <h3>Filters</h3>
          <form id=\"listingFilterFormPopup\" style=\"margin-top:12px;\">
            <input id=\"listSearchPopup\" placeholder=\"Search plugins...\" />
            <select id=\"categoryFilterPopup\"></select>
            <select id=\"subcatFilterPopup\"></select>
            <button type=\"submit\" class=\"btn small\" style=\"margin-top:10px;\">Apply Filters</button>
          </form>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }
    if(!$('#openFilterSidebarListing')){
      const btn = document.createElement('button');
      btn.id = 'openFilterSidebarListing';
      btn.className = 'btn ghost mobile-only';
      btn.type = 'button';
      btn.textContent = 'Filters';
      btn.style.margin = '8px 0';
      const filtersRow = $('.filters-row');
      if(filtersRow) filtersRow.parentNode.insertBefore(btn, filtersRow);
    }
    $('#openFilterSidebarListing')?.addEventListener('click', function(){
      $('#filterSidebarModalListing').setAttribute('aria-hidden','false');
      $('#listSearchPopup').value = $('#listSearch')?.value || '';
      const cats = load(LS.categories,[]);
      const catSel = $('#categoryFilterPopup');
      catSel.innerHTML = '<option value="">All Categories</option>';
      cats.forEach(c=> catSel.appendChild(new Option(c.name,c.name)));
      catSel.value = $('#categoryFilter')?.value || '';
      const subSel = $('#subcatFilterPopup');
      subSel.innerHTML = '<option value="">All Subcategories</option>';
      const found = cats.find(x=>x.name===catSel.value);
      (found && found.subs || []).forEach(s=> subSel.appendChild(new Option(s,s)));
      subSel.value = $('#subcatFilter')?.value || '';
      catSel.addEventListener('change', function(){
        const found = cats.find(x=>x.name===catSel.value);
        subSel.innerHTML = '<option value="">All Subcategories</option>';
        (found && found.subs || []).forEach(s=> subSel.appendChild(new Option(s,s)));
      });
    });
    enableModalAutoClose('#filterSidebarModalListing', '.sidebar-panel', '#closeFilterSidebarListing');
    $('#listingFilterFormPopup')?.addEventListener('submit', function(ev){
      ev.preventDefault();
      $('#listSearch').value = $('#listSearchPopup').value;
      $('#categoryFilter').value = $('#categoryFilterPopup').value;
      $('#subcatFilter').value = $('#subcatFilterPopup').value;
      listPlugins('listContainer',{
        q: $('#listSearch').value,
        cat: $('#categoryFilter').value,
        sub: $('#subcatFilter').value
      });
      $('#filterSidebarModalListing').setAttribute('aria-hidden','true');
    });
  }

  // =======================
  // DETAIL SIDEBAR HELPERS (related from backend)
  // =======================
  async function populateDetailSidebar(plugin){
    // related: same category or overlapping tags
    try {
      const all = await Store.list({ cat: plugin.category }) || [];
      const plusTags = await Store.list({ tags: (plugin.tags || []).join(',') }).catch(()=>[]);
      const merged = [...all, ...(plusTags||[])].filter(x=> getId(x)!==getId(plugin));

      const seen = new Set();
      const related = [];
      for (const x of merged) {
        const key = getId(x);
        if (!seen.has(key)) { related.push(x); seen.add(key); }
        if (related.length >= 6) break;
      }

      const relWrap = $('#relatedPlugins');
      if(relWrap){
        relWrap.innerHTML = '';
        if(!related.length) relWrap.innerHTML = '<li>No related plugins.</li>';
        related.forEach(r=>{
          const li = document.createElement('li');
          const shot = (r.screenshots && r.screenshots[0] && r.screenshots[0].url) || 'https://placehold.co/120x80?text=Screenshot';
          li.innerHTML = `<a href="detail.html?id=${getId(r)}" style="display:flex;align-items:center;">
            <img src="${shot}" alt="" onerror="this.src='https://placehold.co/120x80?text=Shot'">
            <span style="display:block;margin-left:8px;">${r.title}</span>
          </a>`;
          relWrap.appendChild(li);
        });
      }
    } catch(e){ /* ignore */ }

    // categories list (LS)
    const cats = load(LS.categories,[]);
    const catWrap = $('#detailCategories');
    if(catWrap){
      catWrap.innerHTML = '';
      cats.forEach(c=>{
        const li = document.createElement('li');
        li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
        catWrap.appendChild(li);
      });
      catWrap.addEventListener('click', function(ev){
        const btn = ev.target.closest('button[data-cat]');
        if(btn) location.href = 'listing.html?cat='+encodeURIComponent(btn.dataset.cat);
      });
    }

    // tags cloud (backend)
    await renderTagCloud($('#detailTags'));

    // ad box placeholder unchanged
  }

})();
