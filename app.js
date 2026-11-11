/* ANUBIS — application de visite de chantier G4 (PWA iPhone) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const { STATUTS, frDate } = window.Report;
  const LEGACY = { conforme: 'SO', surveiller: 'OBS', nonconf: 'OBS', nv: 'SO' };
  const normPoint = (p) => { if (!STATUTS[p.statut]) p.statut = LEGACY[p.statut] || 'SO'; if (p.avis == null) p.avis = ''; return p; };
  const introType = (a, v) => `Lors de notre visite de chantier du ${frDate(v.date)}, nous nous sommes rendus sur le chantier ${a.intitule ? 'de ' + a.intitule : ''}.${a.entreprise ? ` L'entreprise ${a.entreprise} était présente sur le site.` : ''}`;
  const CLOTURE_TYPE = "Nous n'avons pas d'autres observations.";

  // ------------------------------------------------------------------
  // Référentiel : listes de contrôle G4 et phrases rapides
  // ------------------------------------------------------------------
  const CHECKLISTS = {
    'Paroi berlinoise / blindage': [
      'Implantation et verticalité des profilés', 'Fiche des profilés (longueur, cote d\'arrêt)',
      'Blindage entre profilés (planches / béton projeté)', 'Hauteur des passes de terrassement',
      'Liernes, butons, tirants (calage, serrage)', 'Déformations / fissures en crête',
      'Venues d\'eau, drainage', 'Surcharges en crête (engins, stockages)',
    ],
    'Terrassements / fond de fouille': [
      'Nature des sols (conformité au modèle G2)', 'Cote du fond de fouille', 'Présence d\'eau / rabattement',
      'Talus provisoires (pente, stabilité)', 'Purges et substitutions',
    ],
    'Fondations superficielles': [
      'Ancrage dans la couche porteuse', 'Dimensions des semelles / longrines',
      'Propreté du fond avant béton de propreté', 'Protection du fond de fouille (intempéries)',
    ],
    'Fondations profondes / pieux': [
      'Cote d\'ancrage atteinte', 'Coupe de forage vs sondages G2', 'Bétonnage (volume, surconsommation)',
      'Recépage', 'Essais d\'intégrité / chargement',
    ],
    'Inclusions rigides': [
      'Implantation / maillage', 'Profondeur et paramètres de forage', 'Matelas de répartition (épaisseur, compactage)',
      'Essais de chargement',
    ],
    'Remblais / couche de forme / dallage': [
      'Matériaux (classification GTR)', 'Épaisseur des couches', 'Compactage (EV2, EV2/EV1)', 'Drainage / géotextile',
    ],
    'Murs de soutènement': [
      'Drainage (barbacanes, drain)', 'Remblai technique contre l\'ouvrage', 'Phasage du remblaiement',
    ],
  };
  const AVIS_RAPIDES = [
    'Pas de remarque.', 'Conforme aux hypothèses de la G2 PRO.', 'À surveiller lors de la prochaine visite.',
    'À reprendre avant poursuite des travaux.', 'Transmettre les PV d\'essais à Ginger.',
    'Informer le MOE et Ginger en cas d\'évolution.', 'Arrêt des travaux sur cette zone dans l\'attente d\'un avis.',
  ];
  const METEO = ['Ensoleillé', 'Nuageux', 'Pluie', 'Pluies récentes', 'Vent fort', 'Gel'];

  // ------------------------------------------------------------------
  // Utilitaires UI
  // ------------------------------------------------------------------
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function setBar(subtitle, backHash, tabs, activeTab) {
    $('#subtitle').textContent = subtitle;
    const b = $('#back'); b.hidden = !backHash; b.onclick = () => (location.hash = backHash);
    const nav = $('#tabs');
    if (!tabs) { nav.hidden = true; nav.innerHTML = ''; return; }
    nav.hidden = false;
    nav.innerHTML = tabs.map(([k, l]) => `<button data-k="${k}" class="${k === activeTab ? 'on' : ''}">${l}</button>`).join('');
    $$('button', nav).forEach(btn => btn.onclick = () => { location.hash = btn.dataset.k; });
  }
  function fab(label, onclick) {
    $$('.fab').forEach(f => f.remove());
    if (!label) return;
    const f = document.createElement('button'); f.className = 'fab'; f.textContent = label; f.onclick = onclick;
    document.body.appendChild(f);
  }
  const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const urls = new Set();
  function blobUrl(m) {
    const u = URL.createObjectURL(new Blob([m.buf], { type: m.mime }));
    urls.add(u); return u;
  }
  function revokeAll() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); }

  // Photo : redimensionnement (1600 px max) + JPEG -> ArrayBuffer
  async function compressImage(file, max = 1600, quality = 0.82) {
    let src;
    try { src = await createImageBitmap(file); }
    catch {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    }
    const w0 = src.width, h0 = src.height, r = Math.min(1, max / Math.max(w0, h0));
    const w = Math.round(w0 * r), h = Math.round(h0 * r);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
    return { buf: await blob.arrayBuffer(), w, h, mime: 'image/jpeg' };
  }
  async function toPng(file, max = 600) {
    const bmp = await createImageBitmap(file); const c = document.createElement('canvas');
    const r = Math.min(1, max / bmp.width); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(res => c.toBlob(res, 'image/png'));
    return { buf: await b.arrayBuffer(), w: c.width, h: c.height };
  }
  function pickFiles({ accept = 'image/*', capture = false, multiple = true } = {}) {
    return new Promise(resolve => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
      if (capture) i.setAttribute('capture', 'environment');
      i.style.display = 'none'; document.body.appendChild(i);
      i.onchange = () => { resolve([...i.files]); i.remove(); };
      i.click();
    });
  }

  // Dictée (reconnaissance vocale) — selon support du navigateur
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let activeRec = null;
  // ------------------------------------------------------------------
  // Correction du vocabulaire dicté (hors ligne) + assistant IA (Claude)
  // ------------------------------------------------------------------
  const VOCAB = [
    [/\b(t'?as|ta|tas) ?lu(s)?\b/gi, 'talus'], [/\bpied de t'?as lu\b/gi, 'pied de talus'],
    [/\bplate ?forme\b/gi, 'plate-forme'], [/\bg[ée]o ?textile\b/gi, 'géotextile'],
    [/\bdelta ?m ?s\b/gi, 'Delta MS'], [/\bfond de fouilles?\b/gi, 'fond de fouille'],
    [/\bb[ée]ton projet[ée]\b/gi, 'béton projeté'], [/\bpi[ée]zo m[èe]tre\b/gi, 'piézomètre'],
    [/\bp[ée]n[ée]tro m[èe]tre\b/gi, 'pénétromètre'], [/\bh ?e ?b\b/gi, 'HEB'], [/\bh ?e ?a\b/gi, 'HEA'],
    [/\bg ?t ?r\b/gi, 'GTR'], [/\be ?v ?2\b/gi, 'EV2'], [/\bg ?2 ?pro\b/gi, 'G2 PRO'], [/\bg ?4\b/gi, 'G4'],
  ];
  let userVocab = [];
  async function loadVocab() {
    const txt = await DB.getSetting('dictionnaire', '');
    userVocab = txt.split('\n').map(l => l.split(/=>|=|→/)).filter(a => a.length === 2 && a[0].trim())
      .map(([a, b]) => [new RegExp('\\b' + a.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), b.trim()]);
  }
  const fixVocab = (t) => [...userVocab, ...VOCAB].reduce((acc, [re, rep]) => acc.replace(re, rep), t);

  const AI_SYSTEM = `Tu es l'assistant d'un ingénieur géotechnicien de Ginger CEBTP qui réalise des missions G4 (supervision géotechnique d'exécution, NF P 94-500) et rédige des comptes rendus de visite de chantier.
Les textes fournis viennent souvent d'une DICTÉE VOCALE sur chantier, avec des erreurs de reconnaissance phonétique (ex. « t'as lu raide » = « talus raide », « le prolétaire » peut être « le profilé », « les HB » = « les HEB »). Reconstitue le sens technique le plus probable en vocabulaire géotechnique et BTP (paroi berlinoise, profilés, blindage, liernes, butons, terrassement, fond de fouille, talus, plate-forme, Delta MS, drainage, venues d'eau, réseaux, remblai, compactage, etc.).
Règles :
- Style de compte rendu G4 : phrases courtes, factuelles, au présent, ton professionnel, sans « je ».
- N'invente AUCUN fait, cote, mesure ou nom absent du texte. Si un passage reste incompréhensible, conserve-le entre crochets suivi de [?].
- L'avis Ginger formule une position ou une prescription claire (ce qui est conforme, ce qui doit être surveillé, repris, transmis, avant quelle étape).
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`;

  async function aiCall(userText, maxTokens = 1200) {
    const key = await DB.getSetting('iaKey', '');
    if (!key) throw new Error('Ajoutez votre clé API Claude dans ⚙︎ Réglages → Assistant IA.');
    const model = await DB.getSetting('iaModel', 'claude-sonnet-5-5');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: AI_SYSTEM, messages: [{ role: 'user', content: userText }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Erreur ${r.status}`);
    const txt = (data.content || []).map(c => c.text || '').join('');
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Réponse IA illisible');
    return JSON.parse(m[0]);
  }

  function aiDialog(title, fields, onApply) {
    const d = document.createElement('dialog');
    d.innerHTML = `<div class="dlg-body"><h3>✨ ${esc(title)}</h3>
      ${fields.map((f, i) => `<label>${esc(f.label)}</label>${f.type === 'statut'
        ? `<select data-i="${i}">${Object.entries(STATUTS).map(([k, st]) => `<option value="${k}" ${k === f.value ? 'selected' : ''}>${st.label}</option>`).join('')}</select>`
        : `<textarea data-i="${i}" style="min-height:${f.label === 'Ouvrage' ? 52 : 110}px">${esc(f.value)}</textarea>`}`).join('')}
      <p class="hint">Relisez et modifiez si besoin avant d'appliquer.</p>
      <div class="row"><button class="btn ghost" id="cx">Annuler</button><button class="btn gold" id="okx">Appliquer</button></div></div>`;
    document.body.appendChild(d);
    $('#cx', d).onclick = () => { d.close(); d.remove(); };
    $('#okx', d).onclick = () => { const vals = $$('[data-i]', d).map(e => e.value); d.close(); d.remove(); onApply(vals); };
    d.showModal();
  }

  function dictate(textarea, btn) {
    if (!SR) { toast('Dictée : utilisez le micro 🎤 du clavier iOS'); textarea.focus(); return; }
    if (activeRec) { activeRec.stop(); return; }
    const rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = false;
    const base = textarea.value;
    let acc = '';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) acc += fixVocab(e.results[i][0].transcript.trim()) + ' ';
      textarea.value = (base ? base.replace(/\s*$/, '\n') : '') + acc.trim();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (e) => { if (e.error !== 'aborted') toast('Dictée indisponible ici : micro du clavier iOS 🎤'); };
    rec.onend = () => { activeRec = null; btn.classList.remove('live'); };
    try { rec.start(); activeRec = rec; btn.classList.add('live'); toast('Je vous écoute… (touchez pour arrêter)'); }
    catch { toast('Dictée : utilisez le micro 🎤 du clavier iOS'); }
  }
  const micField = (id, value, placeholder = '') =>
    `<div class="field-wrap"><textarea id="${id}" placeholder="${esc(placeholder)}">${esc(value)}</textarea><button class="mic" data-for="${id}" type="button" aria-label="Dicter">🎙</button></div>`;
  function bindMics(root = app) {
    $$('.mic', root).forEach(b => b.onclick = () => dictate($('#' + b.dataset.for, root), b));
  }

  // ------------------------------------------------------------------
  // Données
  // ------------------------------------------------------------------
  async function visitesOf(affaireId) {
    const v = await DB.byIndex('visites', 'affaireId', affaireId);
    return v.sort((a, b) => (a.numero - b.numero));
  }
  async function mediaOf(visiteId, kind) {
    const m = await DB.byIndex('media', 'visiteId', visiteId);
    return m.filter(x => x.kind === kind).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  }

  // ------------------------------------------------------------------
  // Vue : liste des affaires
  // ------------------------------------------------------------------
  async function viewHome() {
    setBar('Mes affaires G4', null);
    const affaires = (await DB.all('affaires')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const counts = {};
    for (const v of await DB.all('visites')) counts[v.affaireId] = (counts[v.affaireId] || 0) + 1;
    app.innerHTML = affaires.length ? `
      <h2>Affaires</h2>
      ${affaires.map(a => `
        <a class="card list-item" href="#/affaire/${a.id}">
          <div style="flex:1;min-width:0">
            <div class="big">${esc(a.numero)}</div>
            <div>${esc(a.intitule)}</div>
            <div class="sub">${esc(a.commune || '')} · ${counts[a.id] || 0} visite(s)</div>
          </div><span class="chev">›</span>
        </a>`).join('')}` : `
      <div class="empty"><img src="icon-192.png" alt="" style="width:88px;border-radius:20px">
        <p><b>Bienvenue dans ANUBIS.</b><br>Créez votre première affaire pour démarrer une visite.</p></div>`;
    fab('+', () => (location.hash = '#/affaire/new'));
  }

  // ------------------------------------------------------------------
  // Vue : affaire (fiche + visites)
  // ------------------------------------------------------------------
  async function viewAffaire(id) {
    const isNew = id === 'new';
    const a = isNew ? { id: DB.uid(), numero: '', intitule: '', commune: '', client: '', moe: '', entreprise: '' } : await DB.get('affaires', id);
    if (!a) return (location.hash = '#/');
    setBar(isNew ? 'Nouvelle affaire' : `${a.numero}`, '#/');
    const visites = isNew ? [] : await visitesOf(a.id);
    app.innerHTML = `
      ${isNew ? '' : `<h2>Visites</h2>
        ${visites.length ? visites.slice().reverse().map(v => `
          <a class="card list-item" href="#/visite/${v.id}/infos">
            <div class="num">${esc(v.numero)}</div>
            <div style="flex:1"><div class="big">Visite n°${esc(v.numero)}</div>
              <div class="sub">${frDate(v.date)} · ${(v.points || []).length} point(s)${v.phase ? ' · ' + esc(v.phase) : ''}</div></div>
            <span class="chev">›</span></a>`).join('') : '<p class="hint">Aucune visite pour l\'instant.</p>'}
        <button class="btn gold" id="newVisite">＋ Nouvelle visite (n°${visites.length ? Math.max(...visites.map(v => +v.numero || 0)) + 1 : 1})</button>`}
      <h2>Fiche affaire</h2>
      <div class="card">
        <label>N° d'affaire *</label><input id="numero" value="${esc(a.numero)}" placeholder="ex. SBA1.Q.0040" autocapitalize="characters">
        <label>Intitulé de l'opération *</label><input id="intitule" value="${esc(a.intitule)}" placeholder="ex. Parois berlinoises RD13">
        <label>Commune</label><input id="commune" value="${esc(a.commune)}">
        <label>Maître d'ouvrage / Client</label><input id="client" value="${esc(a.client)}">
        <label>Maître d'œuvre</label><input id="moe" value="${esc(a.moe)}">
        <label>Entreprise(s)</label><input id="entreprise" value="${esc(a.entreprise)}">
        ${isNew ? '' : `<label>Logo du client (à gauche du cartouche)</label>
        ${a.logo ? `<img src="${blobUrl({ buf: a.logo.buf, mime: 'image/png' })}" style="max-height:56px;display:block;margin:6px 0">` : '<p class="hint">Aucun logo : l\'emplacement restera vide dans le cartouche.</p>'}
        <div class="row"><button class="btn small ghost" id="clogo">Choisir le logo client</button>${a.logo ? '<button class="btn small danger" id="clogoDel">Retirer</button>' : ''}</div>`}
        ${isNew ? '<button class="btn" id="saveA">Créer l\'affaire</button>' : '<p class="hint">Enregistrement automatique.</p>'}
      </div>
      ${isNew ? '' : '<button class="btn danger" id="delA">Supprimer l\'affaire et ses visites</button>'}`;
    fab(null);
    const read = () => { ['numero', 'intitule', 'commune', 'client', 'moe', 'entreprise'].forEach(k => a[k] = $('#' + k).value.trim()); a.updatedAt = Date.now(); };
    if (isNew) {
      $('#saveA').onclick = async () => {
        read(); if (!a.numero || !a.intitule) return toast('N° d\'affaire et intitulé requis');
        a.createdAt = Date.now(); await DB.put('affaires', a); location.hash = `#/affaire/${a.id}`;
      };
    } else {
      const save = debounce(async () => { read(); await DB.put('affaires', a); $('#subtitle').textContent = a.numero; });
      $$('input', app).forEach(i => i.oninput = save);
      $('#newVisite').onclick = () => newVisite(a, visites);
      $('#clogo').onclick = async () => {
        const [f] = await pickFiles({ multiple: false }); if (!f) return;
        a.logo = await toPng(f, 800); await DB.put('affaires', a); viewAffaire(a.id);
      };
      if (a.logo) $('#clogoDel').onclick = async () => { a.logo = null; await DB.put('affaires', a); viewAffaire(a.id); };
      $('#delA').onclick = async () => {
        if (!confirm(`Supprimer l'affaire ${a.numero} et toutes ses visites, photos et notes ?`)) return;
        for (const v of visites) await deleteVisite(v.id);
        await DB.del('affaires', a.id); location.hash = '#/';
      };
    }
  }

  async function newVisite(a, visites) {
    const prev = visites[visites.length - 1];
    const numero = visites.length ? Math.max(...visites.map(v => +v.numero || 0)) + 1 : 1;
    const v = {
      id: DB.uid(), affaireId: a.id, numero, date: today(),
      heureDebut: new Date().toTimeString().slice(0, 5), heureFin: '',
      redacteur: await DB.getSetting('redacteur', ''), relecteur: prev?.relecteur || await DB.getSetting('relecteur', ''),
      participants: prev?.participants || '',
      meteo: '', phase: prev?.phase || '', objet: '', conclusion: CLOTURE_TYPE, prochaineVisite: '', diffusion: prev?.diffusion || '',
      points: [], createdAt: Date.now(),
    };
    v.objet = introType(a, v);
    // Reprise des points restés ouverts lors de la visite précédente
    const open = (prev?.points || []).map(normPoint).filter(p => p.statut === 'OBS');
    if (open.length && confirm(`Reprendre les ${open.length} point(s) ouvert(s) de la visite n°${prev.numero} ?`)) {
      v.points = open.map(p => ({ id: DB.uid(), ouvrage: p.ouvrage, observation: `Suite à la visite n°${prev.numero} : ${p.observation}`, avis: p.avis || '', statut: 'OBS' }));
    }
    await DB.put('visites', v);
    a.updatedAt = Date.now(); await DB.put('affaires', a);
    location.hash = `#/visite/${v.id}/infos`;
  }
  async function deleteVisite(id) {
    for (const m of await DB.byIndex('media', 'visiteId', id)) await DB.del('media', m.id);
    await DB.del('visites', id);
  }

  // ------------------------------------------------------------------
  // Vue : visite (onglets)
  // ------------------------------------------------------------------
  const TABS = (id) => [[`#/visite/${id}/infos`, 'Infos'], [`#/visite/${id}/points`, 'Contrôles'], [`#/visite/${id}/photos`, 'Photos'], [`#/visite/${id}/vocal`, 'Vocal'], [`#/visite/${id}/rapport`, 'Rapport']];

  async function viewVisite(id, tab) {
    const v = await DB.get('visites', id);
    if (!v) return (location.hash = '#/');
    const a = await DB.get('affaires', v.affaireId);
    (v.points || []).forEach(normPoint);
    setBar(`${a.numero} · Visite n°${v.numero} · ${frDate(v.date)}`, `#/affaire/${a.id}`, TABS(id), `#/visite/${id}/${tab}`);
    fab(null);
    const save = async () => { v.updatedAt = Date.now(); await DB.put('visites', v); };
    ({ infos: tabInfos, points: tabPoints, photos: tabPhotos, vocal: tabVocal, rapport: tabRapport }[tab] || tabInfos)(v, a, save);
  }

  // --- Onglet Infos
  function tabInfos(v, a, save) {
    app.innerHTML = `
      <div class="card">
        <div class="row"><div><label>N° de visite</label><input id="numero" type="number" inputmode="numeric" value="${esc(v.numero)}"></div>
          <div><label>Date de visite</label><input id="date" type="date" value="${esc(v.date)}"></div></div>
        <div class="row"><div><label>Arrivée</label><input id="heureDebut" type="time" value="${esc(v.heureDebut)}"></div>
          <div><label>Départ</label><input id="heureFin" type="time" value="${esc(v.heureFin)}"></div></div>
        <div class="row"><div><label>Rédacteur</label><input id="redacteur" value="${esc(v.redacteur)}"></div>
          <div><label>Relecteur</label><input id="relecteur" value="${esc(v.relecteur || '')}"></div></div>
        <label>Personnes présentes (une par ligne)</label>${micField('participants', v.participants, 'Nom (Société)')}
        <label>Conditions météo</label><input id="meteo" value="${esc(v.meteo)}">
        <div class="chips">${METEO.map(m => `<button class="chip" data-meteo="${esc(m)}">${esc(m)}</button>`).join('')}</div>
        <label>Phase des travaux</label><input id="phase" value="${esc(v.phase)}" placeholder="ex. Terrassement 2e passe">
        <label>Introduction (début du tableau)</label>${micField('objet', v.objet, 'Lors de notre visite…')}
        <button class="btn ghost small" id="introType" style="margin-top:6px">↻ Texte type</button>
      </div>
      <div class="card">
        <label>Phrase de fin du tableau</label>${micField('conclusion', v.conclusion)}
        <button class="btn ghost small" id="aiConcl" style="margin-top:8px">✨ Rédiger la fin à partir des contrôles</button>
        <label>Prochaine visite prévue</label><input id="prochaineVisite" value="${esc(v.prochaineVisite)}" placeholder="ex. semaine 47 / à l'avancement">
        <label>Diffusion</label><input id="diffusion" value="${esc(v.diffusion)}" placeholder="MOA, MOE, Entreprise…">
      </div>
      <button class="btn danger" id="delV">Supprimer cette visite</button>`;
    const fields = ['numero', 'date', 'heureDebut', 'heureFin', 'redacteur', 'relecteur', 'participants', 'meteo', 'phase', 'objet', 'conclusion', 'prochaineVisite', 'diffusion'];
    const persist = debounce(async () => {
      const oldD = frDate(v.date), newD = frDate($('#date').value);
      if (oldD && newD && oldD !== newD && $('#objet').value.includes(oldD)) $('#objet').value = $('#objet').value.split(oldD).join(newD);
      fields.forEach(k => v[k] = $('#' + k).value); v.numero = +v.numero || v.numero; await save();
      $('#subtitle').textContent = `${a.numero} · Visite n°${v.numero} · ${frDate(v.date)}`;
    });
    fields.forEach(k => $('#' + k).addEventListener('input', persist));
    $$('[data-meteo]').forEach(c => c.onclick = () => {
      const m = $('#meteo'); m.value = m.value ? `${m.value}, ${c.dataset.meteo.toLowerCase()}` : c.dataset.meteo; persist();
    });
    bindMics();
    $('#introType').onclick = () => { $('#objet').value = introType(a, { ...v, date: $('#date').value }); persist(); };
    $('#aiConcl').onclick = async (ev) => {
      if (!v.points.length) return toast('Ajoutez d\'abord des points de contrôle');
      const b = ev.currentTarget; b.disabled = true; b.textContent = '✨ Rédaction…';
      try {
        const pts = v.points.map((p, i) => `${i + 1}. ${p.ouvrage} [${STATUTS[p.statut]?.label}] Obs : ${p.observation} | Avis : ${p.avis}`).join('\n');
        const r = await aiCall(`Opération : ${a.intitule} (${a.commune}). Phase : ${v.phase || 'non précisée'}.\nPoints de contrôle de la visite :\n${pts}\nNotes de conclusion déjà saisies (dictée) : ${$('#conclusion').value || '(aucune)'}\n\nRédige la phrase (ou les 2-3 phrases) de fin du tableau d'observations : synthèse et suites à donner si nécessaire. S'il n'y a rien à signaler, écris « Nous n'avons pas d'autres observations. ». JSON attendu : {"conclusion": "..."}`);
        aiDialog('Conclusion proposée', [{ label: 'Conclusion et suites à donner', value: r.conclusion || '' }], ([c]) => { $('#conclusion').value = c; persist(); });
      } catch (e) { alert(e.message); }
      b.disabled = false; b.textContent = '✨ Rédiger la fin à partir des contrôles';
    };
    $('#delV').onclick = async () => {
      if (!confirm(`Supprimer la visite n°${v.numero} (photos et notes comprises) ?`)) return;
      await deleteVisite(v.id); location.hash = `#/affaire/${a.id}`;
    };
  }

  // --- Onglet Points de contrôle
  async function tabPoints(v, a, save) {
    const photos = await mediaOf(v.id, 'photo');
    const persist = debounce(save, 300);
    const render = () => {
      revokeAll();
      app.innerHTML = `
        <div class="row" style="margin-bottom:10px">
          <button class="btn ghost small" id="fromList">☑︎ Depuis une liste de contrôle</button>
          <button class="btn small" id="addPt">＋ Point libre</button>
        </div>
        ${v.points.length ? '' : '<div class="empty"><div class="glyph">☑︎</div><p>Ajoutez les ouvrages contrôlés : chaque point devient une ligne du tableau <b>Ouvrages / Observations / Avis Ginger</b>.</p></div>'}
        ${v.points.map((p, i) => {
          const ph = photos.filter(x => x.pointId === p.id);
          return `
          <div class="card stripe ${p.statut}" data-id="${p.id}">
            <div class="point-head"><span class="n">${i + 1}</span><input data-f="ouvrage" value="${esc(p.ouvrage)}" placeholder="Ouvrage contrôlé"></div>
            <div class="seg">${Object.entries(STATUTS).map(([k, s]) => `<button data-s="${k}" class="${p.statut === k ? 'on' : ''}"><b>${k}</b><br><small>${esc(s.court)}</small></button>`).join('')}</div>
            <label>Observations</label>${micField('obs_' + p.id, p.observation, 'Constat sur site…')}
            <label>Prescription Ginger (optionnel, en gras sous l'observation)</label>${micField('avis_' + p.id, p.avis, 'ex. Le profilé devra être conforté…')}
            <div class="chips">${AVIS_RAPIDES.map(t => `<button class="chip" data-avis="${esc(t)}">${esc(t)}</button>`).join('')}</div>
            ${ph.length ? `<div class="thumbs mini">${ph.map(x => `<div class="thumb"><img src="${blobUrl(x)}"><span class="tag">${photos.indexOf(x) + 1}</span></div>`).join('')}</div>` : ''}
            <div class="point-tools">
              <button class="btn small gold" data-act="photo">📷 Photo</button>
              <button class="btn small" data-act="ai">✨ IA</button>
              <button class="btn small ghost" data-act="same">＋ Obs. même ouvrage</button>
              <button class="btn small ghost" data-act="up">↑</button>
              <button class="btn small ghost" data-act="down">↓</button>
              <button class="btn small danger" data-act="del">Supprimer</button>
            </div>
          </div>`;
        }).join('')}`;
      bindMics();
      $('#addPt').onclick = async () => { v.points.push({ id: DB.uid(), ouvrage: '', observation: '', avis: '', statut: 'SO' }); await save(); render(); $$('[data-f="ouvrage"]').pop()?.focus(); };
      $('#fromList').onclick = () => checklistDialog(async (items) => {
        items.forEach(o => v.points.push({ id: DB.uid(), ouvrage: o, observation: '', avis: '', statut: 'SO' }));
        await save(); render(); toast(`${items.length} point(s) ajouté(s)`);
      });
      $$('.card[data-id]').forEach(card => {
        const p = v.points.find(x => x.id === card.dataset.id);
        $('[data-f="ouvrage"]', card).oninput = (e) => { p.ouvrage = e.target.value; persist(); };
        $('#obs_' + p.id, card).oninput = (e) => { p.observation = e.target.value; persist(); };
        const avis = $('#avis_' + p.id, card);
        avis.oninput = (e) => { p.avis = e.target.value; persist(); };
        $$('[data-avis]', card).forEach(c => c.onclick = () => { avis.value = avis.value ? `${avis.value.trim()} ${c.dataset.avis}` : c.dataset.avis; p.avis = avis.value; persist(); });
        $$('.seg button', card).forEach(b => b.onclick = async () => {
          p.statut = b.dataset.s; await save();
          $$('.seg button', card).forEach(x => x.classList.toggle('on', x === b));
          card.className = `card stripe ${p.statut}`;
        });
        $$('[data-act]', card).forEach(b => b.onclick = async () => {
          const i = v.points.indexOf(p);
          if (b.dataset.act === 'del') {
            if (!confirm('Supprimer ce point ?')) return;
            v.points.splice(i, 1);
            for (const x of photos.filter(x => x.pointId === p.id)) { x.pointId = null; await DB.put('media', x); }
          } else if (b.dataset.act === 'up' && i > 0) [v.points[i - 1], v.points[i]] = [v.points[i], v.points[i - 1]];
          else if (b.dataset.act === 'down' && i < v.points.length - 1) [v.points[i + 1], v.points[i]] = [v.points[i], v.points[i + 1]];
          else if (b.dataset.act === 'same') {
            v.points.splice(i + 1, 0, { id: DB.uid(), ouvrage: p.ouvrage, observation: '', avis: '', statut: 'SO' });
          }
          else if (b.dataset.act === 'ai') {
            if (!p.observation.trim() && !p.avis.trim()) return toast('Dictez ou saisissez d\'abord une observation');
            b.disabled = true; b.textContent = '…';
            try {
              const r = await aiCall(`Opération : ${a.intitule} (${a.commune}). Phase : ${v.phase || 'non précisée'}.
Ouvrage : ${p.ouvrage || '(non précisé)'}
Statut choisi : ${STATUTS[p.statut]?.label}
Observations brutes (dictée) : ${p.observation || '(vide)'}
Avis brut : ${p.avis || '(vide)'}

Corrige et reformule l'observation en style CR G4 (une ou quelques phrases, comme une puce de compte rendu). Le champ "avis" est une prescription Ginger courte et optionnelle : laisse-le vide s'il n'y a rien à prescrire, sinon formule clairement ce que l'entreprise doit faire. Propose le code d'avis : "SO" (sans observation du point de vue géotechnique), "OBS" (avec observation(s) géotechnique(s), dès qu'il y a une réserve, une anomalie ou une prescription), "HM" (hors mission géotechnique). Écris l'ouvrage en majuscules, court (ex. « PRÉ-TERRASSEMENTS », « ZONE 1 – TALUS »), sans inventer.
JSON attendu : {"ouvrage": "...", "observation": "...", "avis": "...", "statut": "SO|OBS|HM"}`);
              aiDialog(`Point ${i + 1}`, [
                { label: 'Ouvrage', value: r.ouvrage || p.ouvrage }, { label: 'Observations', value: r.observation || '' },
                { label: 'Prescription Ginger', value: r.avis || '' }, { label: 'Avis Ginger', type: 'statut', value: STATUTS[r.statut] ? r.statut : p.statut },
              ], async ([o, ob, av, st]) => { Object.assign(p, { ouvrage: o, observation: ob, avis: av, statut: st }); await save(); render(); toast('Point mis à jour'); });
            } catch (e) { alert(e.message); }
            return render();
          }
          else if (b.dataset.act === 'photo') {
            const added = await addPhotos(v, p.id); photos.push(...added); toast(`${added.length} photo(s) liée(s) au point ${i + 1}`);
          }
          await save(); render();
        });
      });
    };
    render();
  }

  function checklistDialog(onOk) {
    const d = document.createElement('dialog');
    d.innerHTML = `<div class="dlg-body"><h3>Liste de contrôle</h3>
      <select id="cl">${Object.keys(CHECKLISTS).map(k => `<option>${esc(k)}</option>`).join('')}</select>
      <div id="items"></div>
      <div class="row"><button class="btn ghost" id="cx">Annuler</button><button class="btn gold" id="okx">Ajouter</button></div></div>`;
    document.body.appendChild(d);
    const fill = () => {
      $('#items', d).innerHTML = CHECKLISTS[$('#cl', d).value].map(o => `<label class="check-item"><input type="checkbox" checked value="${esc(o)}">${esc(o)}</label>`).join('');
    };
    $('#cl', d).onchange = fill; fill();
    $('#cx', d).onclick = () => { d.close(); d.remove(); };
    $('#okx', d).onclick = () => {
      const items = $$('input:checked', d).map(i => i.value); d.close(); d.remove(); if (items.length) onOk(items);
    };
    d.showModal();
  }

  async function addPhotos(v, pointId = null, capture = true) {
    const files = await pickFiles({ capture, multiple: !capture });
    const existing = await mediaOf(v.id, 'photo');
    let order = existing.length ? Math.max(...existing.map(x => x.order || 0)) + 1 : 1;
    const added = [];
    for (const f of files) {
      try {
        const img = await compressImage(f);
        const m = { id: DB.uid(), visiteId: v.id, kind: 'photo', ...img, legende: '', pointId, order: order++, createdAt: Date.now() };
        await DB.put('media', m); added.push(m);
      } catch { toast('Photo illisible, ignorée'); }
    }
    return added;
  }

  // --- Onglet Photos
  async function tabPhotos(v) {
    const render = async () => {
      revokeAll();
      const photos = await mediaOf(v.id, 'photo');
      app.innerHTML = `
        <div class="row" style="margin-bottom:10px">
          <button class="btn gold small" id="cam">📷 Prendre une photo</button>
          <button class="btn ghost small" id="lib">🖼 Photothèque</button>
        </div>
        <p class="hint">Le titre devient l'encadré rouge de la planche. Deux photos consécutives avec le même titre sont placées côte à côte sur la même page ; une photo seule est affichée en grand.</p>
        ${photos.length ? '' : '<div class="empty"><div class="glyph">📷</div><p>Les photos apparaîtront dans les planches photographiques du compte rendu, numérotées dans cet ordre.</p></div>'}
        ${photos.map((p, i) => `
          <div class="card photo-edit" data-id="${p.id}">
            <div class="thumb"><img src="${blobUrl(p)}"><span class="tag">${i + 1}</span></div>
            <div>
              <input data-f="legende" value="${esc(p.legende)}" placeholder="Titre de planche (ex. Vue d'ensemble)">
              <select data-f="pointId" style="margin-top:6px"><option value="">— Aucun point lié —</option>
                ${v.points.map((pt, j) => `<option value="${pt.id}" ${pt.id === p.pointId ? 'selected' : ''}>${j + 1}. ${esc(pt.ouvrage || 'Point sans titre')}</option>`).join('')}</select>
              <div class="point-tools"><button class="btn small ghost" data-act="up">↑</button><button class="btn small ghost" data-act="down">↓</button><button class="btn small danger" data-act="del">Supprimer</button></div>
            </div>
          </div>`).join('')}`;
      $('#cam').onclick = async () => { const n = await addPhotos(v, null, true); if (n.length) { toast('Photo ajoutée'); render(); } };
      $('#lib').onclick = async () => { const n = await addPhotos(v, null, false); if (n.length) { toast(`${n.length} photo(s) ajoutée(s)`); render(); } };
      $$('.photo-edit').forEach(card => {
        const p = photos.find(x => x.id === card.dataset.id);
        const persist = debounce(() => DB.put('media', p), 300);
        $('[data-f="legende"]', card).oninput = (e) => { p.legende = e.target.value; persist(); };
        $('[data-f="pointId"]', card).onchange = (e) => { p.pointId = e.target.value || null; DB.put('media', p); };
        $$('[data-act]', card).forEach(b => b.onclick = async () => {
          const i = photos.indexOf(p);
          if (b.dataset.act === 'del') { if (!confirm('Supprimer cette photo ?')) return; await DB.del('media', p.id); photos.splice(i, 1); }
          else if (b.dataset.act === 'up' && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
          else if (b.dataset.act === 'down' && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
          for (let k = 0; k < photos.length; k++) if (photos[k].order !== k + 1) { photos[k].order = k + 1; await DB.put('media', photos[k]); }
          render();
        });
      });
    };
    render();
  }

  // --- Onglet Vocal (mémos audio)
  let recorder = null, recTimer = null;
  async function tabVocal(v, a, save) {
    const render = async () => {
      revokeAll();
      const memos = await mediaOf(v.id, 'audio');
      app.innerHTML = `
        <div class="card" style="text-align:center">
          <button class="rec ${recorder ? 'live' : ''}" id="rec">${recorder ? '■' : '●'}</button>
          <div class="timer" id="timer">${recorder ? '…' : '00:00'}</div>
          <p class="hint">Mémos vocaux de terrain, à réécouter au bureau. Pour transformer la voix en texte, utilisez les boutons 🎙 des champs (ou le micro du clavier iOS).</p>
        </div>
        ${memos.map((m, i) => `
          <div class="card" data-id="${m.id}">
            <div class="row"><b style="flex:1">Mémo ${i + 1} · ${new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</b>
              <button class="btn small danger" data-act="del" style="flex:0">Supprimer</button></div>
            <audio controls src="${blobUrl(m)}"></audio>
            <label>Note / transcription</label>${micField('tr_' + m.id, m.transcript || '', 'Résumé du mémo…')}
            <div class="point-tools"><button class="btn small" data-act="topoint">→ Créer un point de contrôle</button><button class="btn small ghost" data-act="toconcl">→ Ajouter à la conclusion</button></div>
          </div>`).join('')}`;
      bindMics();
      $('#rec').onclick = toggleRec;
      $$('.card[data-id]').forEach(card => {
        const m = memos.find(x => x.id === card.dataset.id);
        const ta = $('#tr_' + m.id, card);
        ta.oninput = debounce(() => { m.transcript = ta.value; DB.put('media', m); }, 300);
        $$('[data-act]', card).forEach(b => b.onclick = async () => {
          if (b.dataset.act === 'del') { if (!confirm('Supprimer ce mémo ?')) return; await DB.del('media', m.id); return render(); }
          if (!ta.value.trim()) return toast('Saisissez ou dictez d\'abord le texte du mémo');
          if (b.dataset.act === 'topoint') { v.points.push({ id: DB.uid(), ouvrage: '', observation: ta.value.trim(), avis: '', statut: 'SO' }); toast('Point créé dans Contrôles'); }
          else { v.conclusion = (v.conclusion ? v.conclusion.trim() + '\n' : '') + ta.value.trim(); toast('Ajouté à la conclusion'); }
          await save();
        });
      });
    };
    async function toggleRec() {
      if (recorder) { recorder.stop(); return; }
      if (!window.MediaRecorder) return toast('Enregistrement audio non supporté');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ['audio/mp4', 'audio/webm', ''].find(t => !t || MediaRecorder.isTypeSupported(t));
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = []; const t0 = Date.now();
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = async () => {
          clearInterval(recTimer); stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
          await DB.put('media', { id: DB.uid(), visiteId: v.id, kind: 'audio', buf: await blob.arrayBuffer(), mime: blob.type, transcript: '', duration: Date.now() - t0, createdAt: Date.now() });
          recorder = null; toast('Mémo enregistré'); render();
        };
        recorder.start();
        $('#rec').classList.add('live'); $('#rec').textContent = '■';
        recTimer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const el = $('#timer'); if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
      } catch { recorder = null; toast('Accès au micro refusé'); }
    }
    render();
  }

  // --- Onglet Rapport
  async function tabRapport(v, a) {
    const photos = await mediaOf(v.id, 'photo');
    const perPage = await DB.getSetting('photosParPage', 2);
    const warns = [];
    if (!v.redacteur) warns.push('Rédacteur non renseigné');
    if (!v.participants) warns.push('Personnes présentes non renseignées');
    if (!v.points.length) warns.push('Aucun point de contrôle');
    const vide = v.points.filter(p => !p.observation.trim()).length; if (vide) warns.push(`${vide} point(s) sans observation`);
    const noOuv = v.points.filter(p => !p.ouvrage.trim()).length; if (noOuv) warns.push(`${noOuv} point(s) sans ouvrage`);
    if (!v.relecteur) warns.push('Relecteur non renseigné');
    if (!a.logo) warns.push('Pas de logo client pour cette affaire (fiche affaire)');
    const noLeg = photos.filter(p => !p.legende).length; if (noLeg) warns.push(`${noLeg} photo(s) sans titre de planche`);
    const modele = await DB.getSetting('modele', null);
    if (!modele) warns.push('Aucun modèle Word importé : mise en page standard ANUBIS (⚙︎ Réglages → Modèle Word)');
    const cnt = (s) => v.points.filter(p => p.statut === s).length;
    app.innerHTML = `
      <div class="card">
        <div class="big" style="font-weight:800;font-size:18px">CR de visite G4 n°${esc(v.numero)}</div>
        <div class="hint">Affaire ${esc(a.numero)} · ${esc(a.intitule)} · ${frDate(v.date)}</div>
        <p>${v.points.length} observation(s) : <span style="color:var(--ok)">${cnt('SO')} SO</span> · <span style="color:var(--warn)">${cnt('OBS')} OBS</span> · <span style="color:var(--nv)">${cnt('HM')} HM</span><br>${photos.length} photo(s)${modele ? `<br><span class="hint">Modèle : ${esc(modele.name)}</span>` : ''}</p>
        ${warns.length ? `<b>À vérifier avant envoi :</b><ul class="warn-list">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<ul class="ok-list"><li>Tout est renseigné.</li></ul>'}
        ${modele ? '' : `<label>Photos par page</label>
        <select id="ppp"><option value="2" ${perPage === 2 ? 'selected' : ''}>2 grandes photos</option><option value="4" ${perPage === 4 ? 'selected' : ''}>4 photos</option></select>`}
        <button class="btn gold" id="gen">📄 Générer le compte rendu Word</button>
        <p class="hint">Le fichier .docx s'ouvre dans la feuille de partage iOS : Enregistrer dans Fichiers, Mail, Teams, OneDrive…</p>
      </div>`;
    if ($('#ppp')) $('#ppp').onchange = (e) => DB.setSetting('photosParPage', +e.target.value);
    $('#gen').onclick = async () => {
      const btn = $('#gen'); btn.disabled = true; btn.textContent = 'Génération…';
      try {
        const logo = await DB.getSetting('logo', null);
        const settings = {
          societe: await DB.getSetting('societe', 'GINGER CEBTP'), agence: await DB.getSetting('agence', ''),
          fonction: await DB.getSetting('fonction', 'Ingénieur géotechnicien'), photosParPage: +($('#ppp')?.value || perPage),
          logo: logo ? { data: new Uint8Array(logo.buf), w: logo.w, h: logo.h, type: 'png' } : null,
        };
        const ph = photos.map(p => ({ id: p.id, pointId: p.pointId, legende: p.legende, w: p.w, h: p.h, data: new Uint8Array(p.buf) }));
        let blob;
        if (modele) {
          blob = await Template.buildFromTemplate(window.JSZip, modele.buf, {
            affaire: a, visite: v, photos: ph, codes: STATUTS,
            settings: { clientLogo: a.logo ? { data: new Uint8Array(a.logo.buf), w: a.logo.w, h: a.logo.h } : null },
          });
        } else {
          blob = await window.docx.Packer.toBlob(Report.buildReport(window.docx, { affaire: a, visite: v, photos: ph, settings }));
        }
        const name = Report.fileName(a, v);
        const file = new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') throw e; }
        } else {
          const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = name; l.click();
          setTimeout(() => URL.revokeObjectURL(u), 5000);
        }
        toast('Compte rendu généré');
      } catch (e) { console.error(e); alert('Erreur de génération : ' + e.message); }
      btn.disabled = false; btn.textContent = '📄 Générer le compte rendu Word';
    };
  }

  // ------------------------------------------------------------------
  // Vue : réglages
  // ------------------------------------------------------------------
  async function viewSettings() {
    setBar('Réglages', '#/'); fab(null); revokeAll();
    const s = {};
    const modele = await DB.getSetting('modele', null);
    for (const k of ['societe', 'agence', 'redacteur', 'relecteur', 'fonction']) s[k] = await DB.getSetting(k, { societe: 'GINGER CEBTP', fonction: 'Ingénieur géotechnicien' }[k] || '');
    const logo = await DB.getSetting('logo', null);
    const iaKey = await DB.getSetting('iaKey', ''), iaModel = await DB.getSetting('iaModel', 'claude-sonnet-5-5'), dico = await DB.getSetting('dictionnaire', '');
    let usage = '';
    try { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1048576).toFixed(1)} Mo utilisés`; } catch {}
    app.innerHTML = `
      <h2>Modèle Word</h2>
      <div class="card">
        <p class="hint">Importez un de vos CR habituels (.docx). ANUBIS en garde le cartouche (logos), le pied de page, les styles et les marges, et y écrit vos observations et photos à chaque génération.</p>
        ${modele ? `<p>✓ <b>${esc(modele.name)}</b></p>` : '<p class="hint">Aucun modèle importé : mise en page standard ANUBIS.</p>'}
        <div class="row"><button class="btn small gold" id="tplBtn">${modele ? 'Remplacer le modèle' : 'Importer mon modèle .docx'}</button>${modele ? '<button class="btn small danger" id="tplDel">Retirer</button>' : ''}</div>
      </div>
      <h2>Mise en page standard (sans modèle)</h2>
      <div class="card">
        <label>Société</label><input id="societe" value="${esc(s.societe)}">
        <label>Agence (sous le logo)</label><input id="agence" value="${esc(s.agence)}" placeholder="ex. Agence de Bayonne">
        <label>Logo (image PNG/JPG)</label>
        ${logo ? `<img src="${blobUrl({ buf: logo.buf, mime: 'image/png' })}" style="max-height:60px;display:block;margin:6px 0">` : '<p class="hint">Sans logo, le nom de la société est écrit dans le cartouche.</p>'}
        <div class="row"><button class="btn small ghost" id="logoBtn">Choisir un logo</button>${logo ? '<button class="btn small danger" id="logoDel">Retirer</button>' : ''}</div>
      </div>
      <h2>Rédacteur par défaut</h2>
      <div class="card">
        <label>Nom</label><input id="redacteur" type="text" name="anubis-redacteur" value="${esc(s.redacteur)}" placeholder="Prénom NOM" autocomplete="off" autocorrect="off" data-lpignore="true">
        <label>Relecteur par défaut</label><input id="relecteur" type="text" name="anubis-relecteur" value="${esc(s.relecteur)}" placeholder="Prénom NOM" autocomplete="off" autocorrect="off" data-lpignore="true">
        <label>Fonction</label><input id="fonction" value="${esc(s.fonction)}">
      </div>
      <h2>Assistant IA (Claude)</h2>
      <div class="card">
        <p class="hint">Corrige la dictée (« t'as lu » → talus…), reformule observations et avis en style CR G4, propose le statut et rédige la conclusion. Nécessite votre propre clé API, créée sur platform.claude.com/settings/keys (crédits prépayés, quelques centimes par visite). La clé reste sur cet iPhone ; le texte des points est envoyé à Claude au moment où vous touchez ✨.</p>
        <label>Clé API</label><input id="iaKey" type="text" value="${esc(iaKey)}" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" style="-webkit-text-security:disc">
        <label>Modèle</label><select id="iaModel">
          <option value="claude-sonnet-5-5" ${iaModel === 'claude-sonnet-5-5' ? 'selected' : ''}>Claude Sonnet 5.5 (recommandé)</option>
          <option value="claude-haiku-5-5" ${iaModel === 'claude-haiku-5-5' ? 'selected' : ''}>Claude Haiku 5.5 (plus économique)</option>
          <option value="claude-opus-5-5" ${iaModel === 'claude-opus-5-5' ? 'selected' : ''}>Claude Opus 5.5 (plus fin)</option></select>
        <button class="btn small ghost" id="iaTest" style="margin-top:10px">Tester la connexion</button>
      </div>
      <h2>Dictionnaire de dictée</h2>
      <div class="card">
        <p class="hint">Mots mal compris par la dictée, corrigés automatiquement (hors ligne). Une règle par ligne : <b>entendu => correct</b>. « t'as lu => talus » est déjà intégré.</p>
        <textarea id="dictionnaire" placeholder="prolétaire => profilé&#10;les HB => les HEB">${esc(dico)}</textarea>
      </div>
      <h2>Sauvegarde</h2>
      <div class="card">
        <p class="hint">Les données restent sur cet iPhone (${usage}). Exportez régulièrement une sauvegarde dans Fichiers / OneDrive.</p>
        <button class="btn" id="exp">⬇︎ Exporter une sauvegarde</button>
        <button class="btn ghost" id="imp">⬆︎ Restaurer une sauvegarde</button>
      </div>
      <p class="hint" style="text-align:center">ANUBIS v1.3 · fonctionne hors connexion</p>`;
    for (const k of ['societe', 'agence', 'redacteur', 'relecteur', 'fonction', 'iaKey']) {
      const el = $('#' + k), saveNow = () => DB.setSetting(k, el.value.trim());
      el.addEventListener('input', debounce(saveNow, 300)); el.addEventListener('change', saveNow); el.addEventListener('blur', saveNow);
    }
    $('#iaModel').onchange = (e) => DB.setSetting('iaModel', e.target.value);
    $('#dictionnaire').oninput = debounce(async (e) => { await DB.setSetting('dictionnaire', e.target.value); loadVocab(); }, 300);
    $('#iaTest').onclick = async () => {
      await DB.setSetting('iaKey', $('#iaKey').value.trim());
      try { const r = await aiCall('Corrige : « le t\'as lu est un peu raide ». JSON : {"observation": "..."}', 200); alert('Connexion OK ✓\n\nTest : ' + r.observation); }
      catch (e) { alert('Échec : ' + e.message); }
    };
    $('#logoBtn').onclick = async () => {
      const [f] = await pickFiles({ multiple: false }); if (!f) return;
      const bmp = await createImageBitmap(f); const c = document.createElement('canvas');
      const r = Math.min(1, 600 / bmp.width); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(res => c.toBlob(res, 'image/png'));
      await DB.setSetting('logo', { buf: await b.arrayBuffer(), w: c.width, h: c.height }); viewSettings();
    };
    if (logo) $('#logoDel').onclick = async () => { await DB.setSetting('logo', null); viewSettings(); };
    $('#tplBtn').onclick = async () => {
      const [f] = await pickFiles({ accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple: false }); if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        const info = await Template.inspectTemplate(window.JSZip, buf);
        if (!info.hasHeader) alert('Attention : ce document n\'a pas d\'en-tête, le cartouche sera absent.');
        await DB.setSetting('modele', { buf, name: f.name }); toast('Modèle importé'); viewSettings();
      } catch (e) { alert('Import impossible : ' + e.message); }
    };
    if (modele) $('#tplDel').onclick = async () => { if (confirm('Retirer le modèle Word ?')) { await DB.setSetting('modele', null); viewSettings(); } };
    $('#exp').onclick = exportBackup;
    $('#imp').onclick = importBackup;
  }

  const b64 = {
    enc(buf) { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); },
    dec(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; },
  };
  async function exportBackup() {
    const pack = (x) => x && x.buf ? { ...x, buf: b64.enc(x.buf) } : x;
    const data = {
      app: 'ANUBIS', version: 1, date: new Date().toISOString(),
      affaires: await DB.all('affaires'), visites: await DB.all('visites'),
      media: (await DB.all('media')).map(pack),
      settings: (await DB.all('settings')).map(s => ({ key: s.key, value: pack(s.value) })),
    };
    const name = `ANUBIS_sauvegarde_${today()}.json`;
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch {} }
    else { const u = URL.createObjectURL(file); const l = document.createElement('a'); l.href = u; l.download = name; l.click(); }
  }
  async function importBackup() {
    const [f] = await pickFiles({ accept: '.json,application/json', multiple: false }); if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'ANUBIS') throw new Error('fichier non reconnu');
      if (!confirm(`Restaurer ${d.affaires.length} affaire(s) et ${d.visites.length} visite(s) ? Les éléments existants de même identifiant seront remplacés.`)) return;
      const unpack = (x) => x && typeof x.buf === 'string' ? { ...x, buf: b64.dec(x.buf) } : x;
      for (const x of d.affaires) await DB.put('affaires', x);
      for (const x of d.visites) await DB.put('visites', x);
      for (const x of d.media) await DB.put('media', unpack(x));
      for (const s of d.settings) await DB.put('settings', { key: s.key, value: unpack(s.value) });
      toast('Sauvegarde restaurée'); location.hash = '#/';
    } catch (e) { alert('Restauration impossible : ' + e.message); }
  }

  // ------------------------------------------------------------------
  // Routeur
  // ------------------------------------------------------------------
  async function route() {
    if (activeRec) activeRec.stop();
    const h = location.hash.replace(/^#\/?/, '').split('/');
    window.scrollTo(0, 0);
    if (h[0] === 'affaire' && h[1]) return viewAffaire(h[1]);
    if (h[0] === 'visite' && h[1]) return viewVisite(h[1], h[2] || 'infos');
    if (h[0] === 'reglages') return viewSettings();
    return viewHome();
  }
  // Clavier iOS : on désactive les barres collantes pendant la saisie
  const isField = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'file';
  let typingT;
  document.addEventListener('focusin', (e) => { if (isField(e.target)) { clearTimeout(typingT); document.body.classList.add('typing'); } });
  document.addEventListener('focusout', () => { typingT = setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('typing'); }, 150); });
  $('#settingsBtn').onclick = () => (location.hash = '#/reglages');
  window.addEventListener('hashchange', route);
  loadVocab().then(route);

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
