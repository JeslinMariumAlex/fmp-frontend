(function(){
	const LS = {
		plugins: 'fm_plugins',
		categories: 'fm_cats',
		requests: 'fm_requests',
		contacts: 'fm_contacts',
		comments: 'fm_comments'
	};

	// utilities
	function $(s, ctx=document){return ctx.querySelector(s)}
	function $all(s, ctx=document){return Array.from(ctx.querySelectorAll(s))}
	function uid(){return 'id_'+Math.random().toString(36).slice(2,9)}
	function save(key, v){localStorage.setItem(key, JSON.stringify(v))}
	function load(key, def){const v=localStorage.getItem(key); return v?JSON.parse(v):def}

	// defaults
	const defaultCats = [
		{ name:'Chrome extensions', subs:['Youtube','Productivity','Design']},
		{ name:'Wordpress', subs:['Plugins','Themes']},
		{ name:'Woo-commerce', subs:['Payment','Shipping']},
		{ name:'Shopify', subs:['Apps']},
		{ name:'Others', subs:[]}
	];

	function seedSample(){
		if(!load(LS.categories)) save(LS.categories, defaultCats);
		if(!load(LS.plugins)){
			const p = [
				{ id:uid(), title:'Amazing YouTube Helper', desc:'Extension to boost Youtube', tags:['youtube','video'], category:'Chrome extensions', subcategory:'Youtube', screenshots:[], video:'', likes:12, hearts:5, oks:2, created:Date.now() },
				{ id:uid(), title:'WP SEO Booster', desc:'SEO plugin for WordPress', tags:['seo','wordpress'], category:'Wordpress', subcategory:'Plugins', screenshots:[], video:'', likes:5, hearts:1, oks:0, created:Date.now()-86400000 }
			];
			save(LS.plugins, p);
		}
	}
	// initial seed
	seedSample();

	// Rendering helpers
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
		// subcat select population handled on change
	}

	function listPlugins(containerId='pluginsContainer', filter={}){
		const p = load(LS.plugins, []);
		const cont = document.getElementById(containerId);
		if(!cont) return;
		cont.innerHTML = '';
		let items = p.slice();
		// apply filters
		if(filter.q) items = items.filter(it => (it.title+it.desc+(it.tags||[]).join(' ')).toLowerCase().includes(filter.q.toLowerCase()));
		if(filter.cat) items = items.filter(it => it.category===filter.cat);
		if(filter.sub) items = items.filter(it => it.subcategory===filter.sub);
		// render
		items.forEach(it=>{
			const card = document.createElement('article');
			card.className='card';
			card.innerHTML = `
				<a href="detail.html#${it.id}"><img src="${it.screenshots[0] || 'https://placehold.co/400x220?text=Screenshot'}" alt=""></a>
				<h4><a href="detail.html#${it.id}">${it.title}</a></h4>
				<p class="muted">${it.desc}</p>
				<div class="muted category-name" style="margin-bottom:4px;">${it.category}${it.subcategory ? ' • <span class="muted">'+it.subcategory+'</span>' : ''}</div>
				<div class="meta-actions">
					<button data-act="heart" data-id="${it.id}">❤ ${it.hearts||0}</button>
					<button data-act="like" data-id="${it.id}">👍 ${it.likes||0}</button>
					<button data-act="ok" data-id="${it.id}">👌 ${it.oks||0}</button>
					<a href="detail.html#${it.id}">View →</a>
				</div>`;
			cont.appendChild(card);
		});
	}

	// attach simple handlers for like/heart/ok globally
	document.addEventListener('click', function(e){
		const btn = e.target.closest('button[data-act]');
		if(btn){
			const act = btn.dataset.act;
			const id = btn.dataset.id;
			const p = load(LS.plugins, []);
			const item = p.find(x=>x.id===id);
			if(item){
				if(act==='heart') item.hearts = (item.hearts||0)+1;
				if(act==='like') item.likes = (item.likes||0)+1;
				if(act==='ok') item.oks = (item.oks||0)+1;
				save(LS.plugins, p);
				// re-render listing if present
				if(document.getElementById('pluginsContainer')) listPlugins('pluginsContainer');
				if(document.getElementById('listContainer')) listPlugins('listContainer');
				// if on detail page, re-render detail
				if(document.getElementById('pluginDetail')) renderDetailFromHash();
			}
		}
	});

	// search on home
	const searchForm = $('#searchForm');
	if(searchForm){
		searchForm.addEventListener('submit', function(ev){
			ev.preventDefault();
			const q = $('#searchInput').value.trim();
			location.href = 'listing.html?q='+encodeURIComponent(q);
		});
	}

	// Request modal handlers
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
			// admin will see requests in admin panel
		});
	}

	// Listing page filter/search
	if($('#listSearch')){
		const q = new URLSearchParams(location.search).get('q')||'';
		$('#listSearch').value = q;
		$('#listSearch').addEventListener('input', ()=> listPlugins('listContainer',{ q: $('#listSearch').value }));
		renderCategories('','categoryFilter');
		const cats = load(LS.categories,[]);
		$('#categoryFilter').addEventListener('change', function(){
			const v = this.value;
			const subsel = $('#subcatFilter');
			subsel.innerHTML = '<option value="">All Subcategories</option>';
			const cat = cats.find(c=>c.name===v);
			if(cat) cat.subs.forEach(s=> subsel.appendChild(new Option(s,s)));
			listPlugins('listContainer',{ cat: v });
		});
		$('#subcatFilter').addEventListener('change', ()=> listPlugins('listContainer',{ cat: $('#categoryFilter').value, sub: $('#subcatFilter').value }));
		listPlugins('listContainer',{ q: q });
	}

	// Home rendering
	if($('#pluginsContainer')){
		renderCategories('categoryList');
		listPlugins('pluginsContainer');
		// tags
		const tagsEl = $('#tagList');
		const all = load(LS.plugins,[]);
		const tagCount = {};
		all.forEach(p=> (p.tags||[]).forEach(t=> tagCount[t]= (tagCount[t]||0)+1));
		Object.keys(tagCount).slice(0,20).forEach(t=> {
			const b = document.createElement('button'); b.className='tag'; b.textContent=t;
			b.addEventListener('click', ()=> location.href='listing.html?tag='+encodeURIComponent(t));
			tagsEl.appendChild(b);
		});
		// click category from sidebar
		document.getElementById('categoryList').addEventListener('click', (ev)=>{
			const btn = ev.target.closest('button[data-cat]');
			if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
		});
	}

	// Detail page rendering
	function renderDetailFromHash(){
		const id = location.hash.replace('#','');
		const p = load(LS.plugins,[]).find(x=>x.id===id);
		const container = $('#pluginDetail');
		const extras = $('#pluginExtras');
		const descText = $('#pluginDescText');
		if(!container) return;
		if(!p){ container.innerHTML = '<p>Plugin not found</p>'; if(descText) descText.innerHTML=''; if(extras) extras.innerHTML=''; return; }
		const comments = load(LS.comments,[]).filter(c=>c.pluginId===p.id && c.approved);

		// large main screenshot (use first screenshot if available)
		const mainScreenshotHtml = (p.screenshots||[]).length
			? `<div id="mainScreenshot" style="margin-top:12px">
					<img id="mainScreenshotImg" src="${p.screenshots[0]}" alt="main screenshot" style="width:100%;max-height:420px;object-fit:contain;border-radius:8px;border:1px solid #eee">
			   </div>`
			: '';

		// thumbnail gallery (kept below main screenshot)
		const galleryHtml = (p.screenshots||[]).length
			? `<div class="screenshots" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
					${(p.screenshots||[]).map((s,idx)=>`<a href="${s}" data-scr="${s}" data-idx="${idx}" class="screenshot-link" style="display:inline-block"><img src="${s}" alt="screenshot ${idx+1}" style="width:120px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #eee"></a>`).join('')}
			   </div>`
			: '';

		// app link button
		const appBtnHtml = p.appLink ? `<a href="${p.appLink}" target="_blank" rel="noopener" class="btn" style="margin-right:8px">Open Application</a>` : '';

		container.innerHTML = `
			<div class="plugin-detail">
				<div class="plugin-meta">
					<div style="flex:1">
						<h1>${p.title}</h1>
						<p class="muted">${p.desc}</p>
						<p>Category: ${p.category}${p.subcategory ? ' • <span class="muted">'+p.subcategory+'</span>' : ''}</p>
						<div class="meta-actions">
							<button data-act="heart" data-id="${p.id}">❤ ${p.hearts||0}</button>
							<button data-act="like" data-id="${p.id}">👍 ${p.likes||0}</button>
							<button data-act="ok" data-id="${p.id}">👌 ${p.oks||0}</button>
							<button id="shareBtn">Share</button>
						</div>
					</div>
					<div style="width:320px">
						${p.video? `<iframe width="100%" height="180" src="${p.video.replace('watch?v=','embed/')}" frameborder="0" allowfullscreen></iframe>` : ''}
					</div>
				</div>

				<!-- Show main screenshot and gallery immediately above the Full Description -->
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
		// clear pluginExtras placeholder
		if(extras) extras.innerHTML = '';

		// Download Plugin behavior: prefer appLink (open in new tab) else download description HTML
		$('#downloadDescBtn')?.addEventListener('click', function(){
			if(p.appLink){
				// open application link in a new tab (download may be blocked cross-origin)
				window.open(p.appLink, '_blank', 'noopener');
				return;
			}
			const content = p.descText || p.desc || '';
			const blob = new Blob([content], {type:'text/html'});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = (p.title || 'plugin') + '-description.html';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		});

		// Download currently displayed main screenshot
		$('#downloadScreenshot')?.addEventListener('click', function(){
			const img = $('#mainScreenshotImg');
			if(!img || !img.src) return alert('No screenshot to download');
			const s = img.src;
			const a = document.createElement('a');
			a.href = s;
			const ext = s.split('.').pop().split(/\#|\?/)[0] || 'png';
			a.download = (p.title || 'screenshot') + '.' + ext;
			document.body.appendChild(a);
			a.click();
			a.remove();
		});

		// clicking any thumbnail replaces main screenshot
		$('.screenshots')?.addEventListener('click', function(ev){
			const link = ev.target.closest('a.screenshot-link');
			if(!link) return;
			const src = link.dataset.scr;
			const mainImg = $('#mainScreenshotImg');
			if(mainImg && src){
				mainImg.src = src;
				// open in new tab on ctrl/cmd+click
				if(ev.ctrlKey || ev.metaKey) window.open(src,'_blank');
			}
			ev.preventDefault();
		});

		// share
		$('#shareBtn').addEventListener('click', ()=> navigator.share ? navigator.share({ title:p.title, url:location.href }).catch(()=>alert('Share not supported')) : prompt('Share link', location.href));

		// sign-in logic
		const session = sessionStorage.getItem('fm_user');
		if(session){
			$('#btnSignIn').style.display='none';
			$('#addCommentArea').style.display='block';
		}
		$('#btnSignIn').addEventListener('click', ()=> { $('#signinModal').setAttribute('aria-hidden','false'); });
		$('#submitComment')?.addEventListener('click', ()=>{
			const txt = $('#commentText').value.trim();
			if(!txt) return alert('Write something');
			const user = JSON.parse(sessionStorage.getItem('fm_user') || '{}');
			const cm = { id:uid(), pluginId:p.id, name: user.name||'Guest', email:user.email||'', text:txt, approved:false, created:Date.now() };
			const arr = load(LS.comments,[]); arr.push(cm); save(LS.comments, arr);
			alert('Comment submitted for moderation');
			$('#commentText').value='';
		});

		// populate sidebar (related plugins, categories, tags, ads)
		populateDetailSidebar(p);
	}
	window.addEventListener('hashchange', renderDetailFromHash);
	renderDetailFromHash();

	// Sign-in modal submit
	if($('#signinForm')){
		$('#signinForm').addEventListener('submit', function(ev){
			ev.preventDefault();
			const name = $('#signinName').value, email = $('#signinEmail').value;
			sessionStorage.setItem('fm_user', JSON.stringify({ name, email }));
			$('#signinModal').setAttribute('aria-hidden','true');
			alert('Signed in as '+name);
			renderDetailFromHash();
		});
		$('#closeSignin').addEventListener('click', ()=> $('#signinModal').setAttribute('aria-hidden','true'));
	}

	// Contact form
	if($('#contactForm')){
		$('#contactForm').addEventListener('submit', function(ev){
			ev.preventDefault();
			const msg = $('#contactMsg').value, email = $('#contactEmail').value;
			const arr = load(LS.contacts,[]); arr.push({id:uid(), msg, email, created:Date.now()}); save(LS.contacts,arr);
			alert('Thank you — we will reach out.');
			this.reset();
		});
	}

	// Admin page handlers
	if($('#adminPlugins') || $('#addPluginForm')){
		// load categories into selects
		function populateAdminCats(){
			const cats = load(LS.categories,[]);
			const adminCats = $('#adminCats'); adminCats.innerHTML='';
			cats.forEach(c=>{
				const li = document.createElement('li');
				li.innerHTML = `${c.name} 
					<button data-del="${c.name}" class="small delCatBtn" title="Delete category" style="background:transparent;border:none;padding:2px 6px;vertical-align:middle;">
						<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;">
							<path d="M6 7v7m4-7v7m4-7v7M3 5h14M8 3h4a1 1 0 0 1 1 1v1H7V4a1 1 0 0 1 1-1z" stroke="#d00" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					${c.subs && c.subs.length ? `<div style="font-size:13px;color:#888;margin-left:10px;">Subs: ${c.subs.join(', ')}</div>` : ''}`;
				adminCats.appendChild(li);
			});
			renderCategories('','pCategory');
			populateCatSelectForSub();
			// subcat change handler
			$('#pCategory').addEventListener('change', function(){
				const name = this.value;
				const cats = load(LS.categories,[]);
				const found = cats.find(x=>x.name===name);
				$('#pSubcategory').innerHTML = '<option value="">Select sub</option>';
				(found && found.subs || []).forEach(s=> $('#pSubcategory').appendChild(new Option(s,s)));
			});
		}
		populateAdminCats();

		// Subcategory UI logic
		function populateCatSelectForSub(){
			const cats = load(LS.categories,[]);
			const sel = $('#catSelectForSub');
			if(sel){
				sel.innerHTML = '';
				cats.forEach(c=> sel.appendChild(new Option(c.name,c.name)));
			}
		}
		populateCatSelectForSub();

		$('#addSubcat')?.addEventListener('click', ()=>{
			const catName = $('#catSelectForSub').value;
			const subcat = $('#newSubcat').value.trim();
			if(!catName || !subcat) return;
			const cats = load(LS.categories,[]);
			const cat = cats.find(c=>c.name===catName);
			if(cat && !cat.subs.includes(subcat)){
				cat.subs.push(subcat);
				save(LS.categories, cats);
				$('#newSubcat').value = '';
				populateAdminCats();
				populateCatSelectForSub();
				alert('Subcategory added');
			}
		});

		// Update populateAdminCats to also refresh subcategory select for subcategory UI
		function populateAdminCats(){
			const cats = load(LS.categories,[]);
			const adminCats = $('#adminCats'); adminCats.innerHTML = '';
			cats.forEach(c=>{
				const li = document.createElement('li');
				li.innerHTML = `${c.name} 
					<button data-del="${c.name}" class="small delCatBtn" title="Delete category" style="background:transparent;border:none;padding:2px 6px;vertical-align:middle;">
						<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="vertical-align:middle;">
							<path d="M6 7v7m4-7v7m4-7v7M3 5h14M8 3h4a1 1 0 0 1 1 1v1H7V4a1 1 0 0 1 1-1z" stroke="#d00" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					${c.subs && c.subs.length ? `<div style="font-size:13px;color:#888;margin-left:10px;">Subs: ${c.subs.join(', ')}</div>` : ''}`;
				adminCats.appendChild(li);
			});
			renderCategories('','pCategory');
			populateCatSelectForSub();
			$('#pCategory').addEventListener('change', function(){
				const name = this.value;
				const cats = load(LS.categories,[]);
				const found = cats.find(x=>x.name===name);
				$('#pSubcategory').innerHTML = '<option value="">Select sub</option>';
				(found && found.subs || []).forEach(s=> $('#pSubcategory').appendChild(new Option(s,s)));
			});
		}
		populateAdminCats();

		$('#addCat').addEventListener('click', ()=>{
			const v = $('#newCat').value.trim(); if(!v) return;
			const cats = load(LS.categories,[]); cats.push({name:v, subs:[]}); save(LS.categories,cats); $('#newCat').value=''; populateAdminCats(); populateCatSelectForSub();
		});
		$('#adminCats').addEventListener('click', function(ev){
			const btn = ev.target.closest('button[data-del]');
			if(!btn) return;
			const name = btn.dataset.del; let cats = load(LS.categories,[]); cats = cats.filter(c=>c.name!==name); save(LS.categories,cats); populateAdminCats(); populateCatSelectForSub();
		});

		// add plugin
		$('#addPluginForm').addEventListener('submit', function(ev){
			ev.preventDefault();
			const title = $('#pTitle').value, desc = $('#pDesc').value, tags = $('#pTags').value.split(',').map(s=>s.trim()).filter(Boolean);
			const category = $('#pCategory').value, sub = $('#pSubcategory').value;
			const descText = $('#descEditor').innerHTML;
			const files = $('#pScreens').files;
			const screenshots = [];
			if(files && files.length){
				let loaded = 0;
				for(let f of files){
					const r = new FileReader();
					r.onload = ()=>{ screenshots.push(r.result); loaded++; if(loaded===files.length) finish(); };
					r.readAsDataURL(f);
				}
			} else finish();
			function finish(){
				const arr = load(LS.plugins,[]);
				arr.unshift({ id:uid(), title, desc, descText, tags, category, subcategory:sub, screenshots, video:$('#pVideo').value, appLink: $('#pAppLink')?.value || '', likes:0, hearts:0, oks:0, created:Date.now() });
				save(LS.plugins, arr);
				alert('Plugin added');
				$('#addPluginForm').reset();
				$('#descEditor').innerHTML = '';
				renderAdminPlugins();
			}
		});

		// load sample data
		$('#loadDefaults').addEventListener('click', ()=>{ seedSample(); populateAdminCats(); renderAdminPlugins(); alert('Sample data loaded'); });

		// Edit plugin modal logic
		function openEditPluginModal(plugin){
			$('#editPluginModal').setAttribute('aria-hidden','false');
			$('#editTitle').value = plugin.title;
			$('#editDesc').value = plugin.desc;
			$('#editDescEditor').innerHTML = plugin.descText || '';
			$('#editTags').value = (plugin.tags||[]).join(', ');
			$('#editVideo').value = plugin.video || '';
			$('#editAppLink').value = plugin.appLink || '';
			// Populate categories/subcategories
			const cats = load(LS.categories,[]);
			$('#editCategory').innerHTML = '';
			cats.forEach(c=> $('#editCategory').appendChild(new Option(c.name,c.name)));
			$('#editCategory').value = plugin.category;
			const found = cats.find(x=>x.name===plugin.category);
			$('#editSubcategory').innerHTML = '<option value="">Select sub</option>';
			(found && found.subs || []).forEach(s=> $('#editSubcategory').appendChild(new Option(s,s)));
			$('#editSubcategory').value = plugin.subcategory || '';
			// Screenshots not editable for simplicity
			$('#editPluginForm').onsubmit = function(ev){
				ev.preventDefault();
				const arr = load(LS.plugins,[]);
				const idx = arr.findIndex(x=>x.id===plugin.id);
				if(idx>-1){
					arr[idx].title = $('#editTitle').value;
					arr[idx].desc = $('#editDesc').value;
					arr[idx].descText = $('#editDescEditor').innerHTML;
					arr[idx].tags = $('#editTags').value.split(',').map(s=>s.trim()).filter(Boolean);
					arr[idx].category = $('#editCategory').value;
					arr[idx].subcategory = $('#editSubcategory').value;
					arr[idx].video = $('#editVideo').value;
					arr[idx].appLink = $('#editAppLink').value || '';
					// Screenshots update if new files uploaded
					const files = $('#editScreens').files;
					if(files && files.length){
						const screenshots = [];
						let loaded = 0;
						for(let f of files){
							const r = new FileReader();
							r.onload = ()=>{ screenshots.push(r.result); loaded++; if(loaded===files.length){ arr[idx].screenshots = screenshots; finish(); } };
							r.readAsDataURL(f);
						}
						function finish(){
							save(LS.plugins, arr);
							alert('Plugin updated');
							$('#editPluginModal').setAttribute('aria-hidden','true');
							renderAdminPlugins();
						}
					} else {
						save(LS.plugins, arr);
						alert('Plugin updated');
						$('#editPluginModal').setAttribute('aria-hidden','true');
						renderAdminPlugins();
					}
				}
			};
		}

		$('#closeEditPlugin').addEventListener('click', ()=> $('#editPluginModal').setAttribute('aria-hidden','true'));

		// Render plugins with edit button
		function renderAdminPlugins(){
			const arr = load(LS.plugins,[]);
			const wrap = $('#adminPlugins'); wrap.innerHTML = '';
			arr.forEach(p=>{
				const div = document.createElement('div'); div.className='card';
				div.innerHTML = `<strong>${p.title}</strong>
					<p class="muted">${p.category}${p.subcategory ? ' • <span class="muted">'+p.subcategory+'</span>' : ''}</p>
					${p.appLink ? `<div style="margin:6px 0"><a href="${p.appLink}" target="_blank" rel="noopener" class="btn ghost small">Open App</a></div>` : ''}
					<button data-id="${p.id}" class="delPlugin small">Delete</button>
					<button data-edit="${p.id}" class="small editPluginBtn">Edit</button>
					<a href="detail.html#${p.id}">View</a>`;
				wrap.appendChild(div);
			});
		}
		renderAdminPlugins();

		// Edit button handler
		$('#adminPlugins').addEventListener('click', function(ev){
			const btn = ev.target.closest('button.editPluginBtn');
			if(btn){
				const id = btn.dataset.edit;
				const arr = load(LS.plugins,[]);
				const plugin = arr.find(x=>x.id===id);
				if(plugin) openEditPluginModal(plugin);
			}
			// delete logic
			const delBtn = ev.target.closest('button.delPlugin');
			if(delBtn){
				const id = delBtn.dataset.id;
				let arr = load(LS.plugins,[]); arr = arr.filter(x=>x.id!==id); save(LS.plugins,arr); renderAdminPlugins();
			}
		});

		// requests section
		function renderRequests(){
			const r = load(LS.requests,[]);
			const wrap = $('#adminRequests'); wrap.innerHTML = '';
			if(!r.length) wrap.innerHTML = '<p>No requests</p>';
			r.forEach(req=>{
				const div = document.createElement('div'); div.className='card';
				div.innerHTML = `<strong>${req.name}</strong><p>${req.text}</p><div class="muted">${req.email} • ${new Date(req.created).toLocaleString()}</div>
					<button data-rid="${req.id}" class="small">Delete</button>`;
				wrap.appendChild(div);
			});
		}
		renderRequests();
		$('#adminRequests').addEventListener('click', function(ev){
			const btn = ev.target.closest('button[data-rid]');
			if(!btn) return;
			const id = btn.dataset.rid;
			let r = load(LS.requests,[]); r = r.filter(x=>x.id!==id); save(LS.requests,r); renderRequests();
		});

		// comments moderation
		function renderPendingComments(){
			const all = load(LS.comments,[]);
			const pending = all.filter(c=>!c.approved);
			const wrap = $('#adminComments'); wrap.innerHTML = '';
			if(!pending.length) wrap.innerHTML = '<p>No pending comments</p>';
			pending.forEach(c=>{
				const div = document.createElement('div'); div.className='card';
				div.innerHTML = `<strong>${c.name}</strong><p>${c.text}</p><div class="muted">${new Date(c.created).toLocaleString()}</div>
					<button data-approve="${c.id}" class="small">Approve</button>
					<button data-delc="${c.id}" class="small">Delete</button>`;
				wrap.appendChild(div);
			});
		}
		renderPendingComments();
		$('#adminComments').addEventListener('click', function(ev){
			const approve = ev.target.closest('button[data-approve]');
			const delc = ev.target.closest('button[data-delc]');
			if(approve){
				const id = approve.dataset.approve; const arr = load(LS.comments,[]); const c = arr.find(x=>x.id===id); if(c) c.approved=true; save(LS.comments,arr); renderPendingComments();
			}
			if(delc){
				const id = delc.dataset.delc; let arr = load(LS.comments,[]); arr = arr.filter(x=>x.id!==id); save(LS.comments,arr); renderPendingComments();
			}
		});
	}

	// listing page with query params handling
	if(location.pathname.endsWith('/listing.html') || location.pathname.endsWith('listing.html')){
		const params = new URLSearchParams(location.search);
		const q = params.get('q')||params.get('tag')||'';
		if(q) listPlugins('listContainer',{ q: q, cat: params.get('cat') || '' });
	}

	// Utility for closing modal on outside click or Escape
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

	// Mobile filter sidebar logic (index page)
	if($('#openFilterSidebar')){
		$('#openFilterSidebar').addEventListener('click', function(){
			$('#filterSidebarModal').setAttribute('aria-hidden','false');
			// Sync categories/tags
			const cats = load(LS.categories, []);
			const catList = $('#categoryListMobile');
			catList.innerHTML = '';
			cats.forEach(c=>{
				const li = document.createElement('li');
				li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
				catList.appendChild(li);
			});
			catList.addEventListener('click', function(ev){
				const btn = ev.target.closest('button[data-cat]');
				if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
			});
			const tagsEl = $('#tagListMobile');
			tagsEl.innerHTML = '';
			const all = load(LS.plugins,[]);
			const tagCount = {};
			all.forEach(p=> (p.tags||[]).forEach(t=> tagCount[t]= (tagCount[t]||0)+1));
			Object.keys(tagCount).slice(0,20).forEach(t=> {
				const b = document.createElement('button'); b.className='tag'; b.textContent=t;
				b.addEventListener('click', ()=> location.href='listing.html?tag='+encodeURIComponent(t));
				tagsEl.appendChild(b);
			});
		});
		enableModalAutoClose('#filterSidebarModal', '.sidebar-panel', '#closeFilterSidebar');
	}

	// Mobile filter sidebar logic (detail page)
	if($('#openFilterSidebarDetail')){
		$('#openFilterSidebarDetail').addEventListener('click', function(){
			$('#filterSidebarModalDetail').setAttribute('aria-hidden','false');
			// Sync categories/tags
			const cats = load(LS.categories, []);
			const catList = $('#categoryListMobileDetail');
			catList.innerHTML = '';
			cats.forEach(c=>{
				const li = document.createElement('li');
				li.innerHTML = `<button class="link-btn" data-cat="${c.name}">${c.name}</button>`;
				catList.appendChild(li);
			});
			catList.addEventListener('click', function(ev){
				const btn = ev.target.closest('button[data-cat]');
				if(btn) location.href='listing.html?cat='+encodeURIComponent(btn.dataset.cat);
			});
			const tagsEl = $('#tagListMobileDetail');
			tagsEl.innerHTML = '';
			const all = load(LS.plugins,[]);
			const tagCount = {};
			all.forEach(p=> (p.tags||[]).forEach(t=> tagCount[t]= (tagCount[t]||0)+1));
			Object.keys(tagCount).slice(0,20).forEach(t=> {
				const b = document.createElement('button'); b.className='tag'; b.textContent=t;
				b.addEventListener('click', ()=> location.href='listing.html?tag='+encodeURIComponent(t));
				tagsEl.appendChild(b);
			});
		});
		enableModalAutoClose('#filterSidebarModalDetail', '.sidebar-panel', '#closeFilterSidebarDetail');
	}

	// Listing page filter sidebar popup
	if(location.pathname.endsWith('/listing.html') || location.pathname.endsWith('listing.html')){
		// Add filter sidebar popup if not present
		if(!$('#filterSidebarModalListing')){
			const modalDiv = document.createElement('div');
			modalDiv.id = 'filterSidebarModalListing';
			modalDiv.className = 'modal filter-sidebar-modal';
			modalDiv.setAttribute('aria-hidden','true');
			modalDiv.innerHTML = `
				<div class="modal-panel sidebar-panel">
					<button class="close" id="closeFilterSidebarListing">&times;</button>
					<h3>Filters</h3>
					<form id="listingFilterFormPopup" style="margin-top:12px;">
						<input id="listSearchPopup" placeholder="Search plugins..." />
						<select id="categoryFilterPopup"></select>
						<select id="subcatFilterPopup"></select>
						<button type="submit" class="btn small" style="margin-top:10px;">Apply Filters</button>
					</form>
				</div>
			`;
			document.body.appendChild(modalDiv);
		}
		// Add filter button for mobile
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
		$('#openFilterSidebarListing').addEventListener('click', function(){
			$('#filterSidebarModalListing').setAttribute('aria-hidden','false');
			// Sync filter form values
			$('#listSearchPopup').value = $('#listSearch')?.value || '';
			// Populate categories/subcategories
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
			// Change subcat on category change
			catSel.addEventListener('change', function(){
				const found = cats.find(x=>x.name===catSel.value);
				subSel.innerHTML = '<option value="">All Subcategories</option>';
				(found && found.subs || []).forEach(s=> subSel.appendChild(new Option(s,s)));
			});
		});
		enableModalAutoClose('#filterSidebarModalListing', '.sidebar-panel', '#closeFilterSidebarListing');
		// Apply filters from popup
		$('#listingFilterFormPopup').addEventListener('submit', function(ev){
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

	// new helper to populate sidebar
	function populateDetailSidebar(plugin){
		// related plugins: same category or matching tag, exclude current
		const all = load(LS.plugins,[]);
		const related = all
			.filter(x=> x.id!==plugin.id && (x.category===plugin.category || (x.tags||[]).some(t=> (plugin.tags||[]).includes(t))))
			.slice(0,6);

		const relWrap = $('#relatedPlugins');
		if(relWrap){
			relWrap.innerHTML = '';
			if(!related.length) relWrap.innerHTML = '<li>No related plugins.</li>';
			related.forEach(r=>{
				const li = document.createElement('li');
				li.innerHTML = `<a href="detail.html#${r.id}" style="display:flex;align-items:center;">
					<img src="${r.screenshots[0] || 'https://placehold.co/120x80?text=Screenshot'}" alt="">
					<span style="display:block;margin-left:8px;">${r.title}</span>
				</a>`;
				relWrap.appendChild(li);
			});
		}

		// categories list
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

		// tags cloud
		const tagWrap = $('#detailTags');
		if(tagWrap){
			tagWrap.innerHTML = '';
			const tagCount = {};
			all.forEach(p=> (p.tags||[]).forEach(t=> tagCount[t] = (tagCount[t]||0)+1));
			Object.keys(tagCount).slice(0,30).forEach(t=>{
				const b = document.createElement('button');
				b.className = 'tag';
				b.textContent = t;
				b.addEventListener('click', ()=> location.href='listing.html?tag='+encodeURIComponent(t));
				tagWrap.appendChild(b);
			});
		}

		// simple ad hooks: can be extended to pull real ads
		const adBox = document.querySelector('#detailSidebar .ad-box');
		if(adBox){
			// (already static markup) -- optionally replace content dynamically
			// adBox.innerHTML = '<h4>Sponsored</h4><p>Ad content</p><a class="btn ghost small" href="#">Learn more</a>';
		}
	}

})();
