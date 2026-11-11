/* ANUBIS — génération du CR à partir du modèle Word de l'utilisateur.
   Le modèle (.docx importé dans les Réglages) fournit : en-tête (cartouche + logos),
   pied de page (légende SO/OBS/HM, pagination), styles, puces, marges.
   ANUBIS réécrit : textes du cartouche, logo client, tableau Ouvrages / Observations /
   Avis Ginger, planches photographiques. */
(function (root) {
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const frDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const EMU_CM = 360000;

  const RPR = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
  const RPR_B = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
  const RPR_HEAD = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';

  // runs multi-lignes
  const runs = (text, rpr = RPR) => String(text ?? '').split('\n')
    .map((l, i) => `${i ? `<w:r>${rpr}<w:br/></w:r>` : ''}<w:r>${rpr}<w:t xml:space="preserve">${xe(l)}</w:t></w:r>`).join('');
  const para = (inner, ppr = '<w:jc w:val="both"/>') => `<w:p><w:pPr>${ppr}${RPR}</w:pPr>${inner}</w:p>`;
  const emptyP = (sz = 10) => `<w:p><w:pPr><w:rPr><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr></w:p>`;

  function tc(width, content, { fill, vMerge, borders, vAlign } = {}) {
    let pr = `<w:tcW w:w="${width}" w:type="dxa"/>`;
    if (vMerge) pr += vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
    if (borders) pr += `<w:tcBorders>${borders}</w:tcBorders>`;
    if (fill) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
    if (vAlign) pr += `<w:vAlign w:val="${vAlign}"/>`;
    return `<w:tc><w:tcPr>${pr}</w:tcPr>${content || '<w:p/>'}</w:tc>`;
  }
  const B = (side, on) => on ? `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>` : `<w:${side} w:val="nil"/>`;

  // ---------- Image en ligne ----------
  let docPrId = 5000;
  function inlineImg(rid, cx, cy, name) {
    const id = docPrId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xe(name)}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xe(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  const fit = (w, h, maxWcm, maxHcm) => { const r = Math.min(maxWcm * EMU_CM / w, maxHcm * EMU_CM / h); return [Math.round(w * r), Math.round(h * r)]; };

  // ---------- Regroupement des points par ouvrage (consécutifs) ----------
  function groupPoints(points) {
    const groups = [];
    for (const p of points) {
      const key = (p.ouvrage || '').trim().toUpperCase();
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(p); else groups.push({ key, ouvrage: (p.ouvrage || '').trim(), items: [p] });
    }
    return groups;
  }

  // ---------- Regroupement des photos en planches ----------
  function photoPages(photos, points) {
    const titled = photos.map(p => {
      const pt = points.find(x => x.id === p.pointId);
      return { ...p, titre: (p.legende || '').trim() || (pt ? pt.ouvrage : '') || 'Vue du chantier' };
    });
    const pages = [];
    for (const p of titled) {
      const last = pages[pages.length - 1];
      if (last && last.titre === p.titre && last.items.length < 2) last.items.push(p);
      else pages.push({ titre: p.titre, items: [p] });
    }
    return pages;
  }

  async function buildFromTemplate(JSZip, tplBuf, data) {
    const { affaire = {}, visite = {}, photos = [], settings = {}, codes } = data;
    const zip = await JSZip.loadAsync(tplBuf);
    const docPath = 'word/document.xml';
    let doc = await zip.file(docPath).async('string');
    const relsPath = 'word/_rels/document.xml.rels';
    let rels = await zip.file(relsPath).async('string');

    // --- puces : on récupère la numérotation et le style du modèle
    const numM = doc.match(/<w:pStyle w:val="([^"]+)"\/>\s*<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="(\d+)"\/>/);
    const bulletPPr = numM
      ? `<w:pStyle w:val="${numM[1]}"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numM[2]}"/></w:numPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="both"/>`
      : '<w:spacing w:before="60" w:after="60"/><w:ind w:left="720" w:hanging="360"/><w:jc w:val="both"/>';
    const bulletPrefix = numM ? '' : '•\t';

    // --- largeur utile & colonnes du tableau du modèle
    const grid = [...doc.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].slice(0, 3).map(m => +m[1]);
    const [wO, wB, wA] = grid.length === 3 ? grid : [2553, 11359, 1540];
    const tblW = wO + wB + wA;
    const sect = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g);
    const sectPr = sect ? sect[sect.length - 1] : '';
    const pg = sectPr.match(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/), mar = sectPr.match(/<w:pgMar w:top="(\d+)" w:right="(\d+)" w:bottom="(\d+)" w:left="(\d+)"/);
    const usableWcm = pg && mar ? (+pg[1] - +mar[2] - +mar[4]) / 567 : 26;
    const usableHcm = pg && mar ? (+pg[2] - +mar[1] - +mar[3]) / 567 : 16.5;

    // --- nettoyage des images du corps du modèle (on garde celles de l'en-tête)
    const bodyRids = [...doc.matchAll(/r:embed="(\w+)"/g)].map(m => m[1]);
    for (const rid of new Set(bodyRids)) {
      const m = rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*/>`));
      if (!m) continue;
      const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
      rels = rels.replace(m[0], '');
      if (target) zip.remove('word/' + target);
    }

    // ========== Tableau Ouvrages / Observations / Avis Ginger ==========
    const hdr = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="557"/></w:trPr>` +
      tc(wO, para(runs('Ouvrages', RPR_HEAD), '<w:jc w:val="center"/>'), { fill: '0070C0', vAlign: 'center' }) +
      tc(wB, para(runs('Observations', RPR_HEAD), '<w:jc w:val="center"/>'), { fill: '0070C0', vAlign: 'center' }) +
      tc(wA, para(runs('Avis Ginger', RPR_HEAD), '<w:jc w:val="center"/>'), { fill: '0070C0', vAlign: 'center' }) + '</w:tr>';

    const points = visite.points || [];
    const groups = groupPoints(points);
    const rows = [];
    const intro = (visite.objet || '').trim();
    const closing = (visite.conclusion || '').trim();
    if (!groups.length) groups.push({ ouvrage: 'GÉNÉRALITÉS', items: [] });

    groups.forEach((g, gi) => {
      const lines = [];
      if (gi === 0 && intro) lines.push({ kind: 'intro' });
      g.items.forEach(p => lines.push({ kind: 'pt', p }));
      if (gi === groups.length - 1 && closing) lines.push({ kind: 'close' });
      if (!lines.length) lines.push({ kind: 'close' });
      lines.forEach((ln, li) => {
        const first = li === 0, last = li === lines.length - 1;
        const bb = B('top', first) + B('bottom', last);
        let obs = '', avis = '';
        if (ln.kind === 'intro') {
          obs = emptyP() + intro.split('\n').map(t => para(runs(t))).join('') + emptyP();
          avis = '<w:p/>';
        } else if (ln.kind === 'close') {
          obs = emptyP() + closing.split('\n').map(t => para(runs(t))).join('') + emptyP();
          avis = '<w:p/>';
        } else {
          const p = ln.p;
          const txt = (p.observation || '').trim();
          const contPPr = '<w:spacing w:before="0" w:after="60"/><w:ind w:left="720"/><w:jc w:val="both"/>';
          const lines2 = txt.split('\n').filter(l => l.trim());
          let bp = para(runs(bulletPrefix + (lines2.shift() || '')), bulletPPr);
          lines2.forEach(l => { bp += para(runs(l), contPPr); });
          if ((p.avis || '').trim()) p.avis.trim().split('\n').forEach(l => { bp += para(runs(l, RPR_B), contPPr); });
          obs = (first ? emptyP() : '') + bp + (last ? emptyP() : '');
          const code = codes[p.statut] ? p.statut : '';
          avis = (first ? emptyP() : '') + para(runs(code), '<w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/>');
        }
        const ouvCell = first
          ? tc(wO, para(runs((g.ouvrage || '').toUpperCase(), RPR_B), '<w:jc w:val="left"/>'), { vMerge: lines.length > 1 ? 'restart' : null, vAlign: 'center' })
          : tc(wO, '<w:p/>', { vMerge: 'continue' });
        rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${ouvCell}${tc(wB, obs, { borders: bb })}${tc(wA, avis, { borders: bb })}</w:tr>`);
      });
    });

    const table = `<w:tbl><w:tblPr><w:tblW w:w="${tblW}" w:type="dxa"/><w:jc w:val="center"/>` +
      `<w:tblBorders>${B('top', 1)}${B('left', 1)}${B('bottom', 1)}${B('right', 1)}${B('insideH', 1)}${B('insideV', 1)}</w:tblBorders>` +
      `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid><w:gridCol w:w="${wO}"/><w:gridCol w:w="${wB}"/><w:gridCol w:w="${wA}"/></w:tblGrid>${hdr}${rows.join('')}</w:tbl>`;

    // ========== Planches photographiques ==========
    let photoXml = '';
    let rid = 9000, imgN = 1;
    const addMedia = (bytes, ext = 'jpeg') => {
      const id = `rIdAnubis${rid++}`, name = `anubis_${imgN++}.${ext}`;
      zip.file('word/media/' + name, bytes);
      rels = rels.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/></Relationships>`);
      return id;
    };
    const titleBox = (t) => `<w:tbl><w:tblPr><w:tblW w:w="6810" w:type="dxa"/><w:jc w:val="center"/>` +
      `<w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="FF0000"/><w:left w:val="single" w:sz="6" w:space="0" w:color="FF0000"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="FF0000"/><w:right w:val="single" w:sz="6" w:space="0" w:color="FF0000"/></w:tblBorders>` +
      `<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="6810"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="495"/></w:trPr>` +
      `<w:tc><w:tcPr><w:tcW w:w="6810" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
    const maxH = Math.max(8, Math.min(12.6, usableHcm - 4));
    for (const page of photoPages(photos, points)) {
      photoXml += `<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:after="0"/></w:pPr></w:p>` + titleBox(page.titre) + emptyP(12);
      if (page.items.length === 1) {
        const p = page.items[0]; const [cx, cy] = fit(p.w, p.h, usableWcm - 2, maxH);
        photoXml += para(inlineImg(addMedia(p.data), cx, cy, `Photo ${p.n}`), '<w:jc w:val="center"/>');
      } else {
        const colW = Math.floor((usableWcm * 567) / 2);
        const cells = page.items.map(p => {
          const [cx, cy] = fit(p.w, p.h, usableWcm / 2 - 0.8, maxH);
          return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(inlineImg(addMedia(p.data), cx, cy, `Photo ${p.n}`), '<w:jc w:val="center"/>')}</w:tc>`;
        }).join('');
        photoXml += `<w:tbl><w:tblPr><w:tblW w:w="${colW * 2}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
          `<w:tblGrid><w:gridCol w:w="${colW}"/><w:gridCol w:w="${colW}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`;
      }
      photoXml += '<w:p/>';
    }

    const body = table + '<w:p/>' + photoXml + sectPr;
    doc = doc.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`);
    zip.file(docPath, doc);

    // ========== En-tête : textes du cartouche + logo client ==========
    const hRids = [...rels.matchAll(/<Relationship [^>]*Type="[^"]*\/header"[^>]*\/>/g)].map(m => (m[0].match(/Target="([^"]+)"/) || [])[1]).filter(Boolean);
    const titre = `Mission G4 - Compte rendu de visite de chantier n°${visite.numero} du ${frDate(visite.date)}`;
    const redac = `Rédacteur : ${visite.redacteur || ''}${visite.relecteur ? ` / Relecteur : ${visite.relecteur}` : ''}`;
    for (const target of hRids) {
      const hp = 'word/' + target;
      let h = await zip.file(hp).async('string');
      let seenTitle = false, didIntitule = false;
      h = h.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
        const text = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
        if (!text.trim()) return p;
        let nt = null;
        if (/compte rendu/i.test(text)) { nt = titre; seenTitle = true; }
        else if (/^\s*dossier/i.test(text)) nt = `Dossier : ${affaire.numero || ''}`;
        else if (/r[ée]dacteur/i.test(text)) nt = redac;
        else if (seenTitle && !didIntitule) { nt = affaire.intitule || ''; didIntitule = true; }
        if (nt === null) return p;
        let firstRpr = '';
        const firstRun = p.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/) || p.match(/<w:r [^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/);
        if (firstRun) { const m = firstRun[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/); if (m) firstRpr = m[0]; }
        // supprime les runs de texte, garde les runs contenant des dessins (logos)
        let q = p.replace(/<w:r(?: [^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (r) => (/<w:t[ >]/.test(r) && !/<w:drawing|<w:pict|mc:AlternateContent/.test(r)) ? '' : r);
        return q.replace(/<\/w:p>$/, `<w:r>${firstRpr}<w:t xml:space="preserve">${xe(nt)}</w:t></w:r></w:p>`);
      });
      // logo client = image la plus à gauche du cartouche
      if (settings.clientLogo !== undefined) {
        const hrelsPath = hp.replace('word/', 'word/_rels/') + '.rels';
        const hrf = zip.file(hrelsPath);
        if (hrf) {
          const hrels = await hrf.async('string');
          const draws = [...h.matchAll(/<wp:(anchor|inline)[\s\S]*?<\/wp:\1>/g)].map(m => {
            const d = m[0]; const off = +(d.match(/<wp:positionH[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/) || [0, 0])[1];
            const al = (d.match(/<wp:positionH[\s\S]*?<wp:align>(\w+)<\/wp:align>/) || [])[1];
            return { d, rid: (d.match(/r:embed="(\w+)"/) || [])[1], x: al === 'left' ? -1 : al === 'right' ? 1e12 : off };
          }).filter(o => o.rid).sort((a, b) => a.x - b.x);
          if (draws.length >= 2) {
            const left = draws[0];
            const target2 = (hrels.match(new RegExp(`Id="${left.rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${left.rid}"`)) || []).slice(1).find(Boolean);
            if (target2) {
              const logo = settings.clientLogo;
              const ext0 = left.d.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
              const bw = ext0 ? +ext0[1] : 750000, bh = ext0 ? +ext0[2] : 460000;
              let nd;
              if (logo) {
                const r = Math.min(bw / logo.w, bh / logo.h); const cx = Math.round(logo.w * r), cy = Math.round(logo.h * r);
                zip.file('word/' + target2.replace(/^\.?\//, ''), logo.data);
                nd = left.d.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`).replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
              } else {
                zip.file('word/' + target2.replace(/^\.?\//, ''), TRANSPARENT_PNG());
                nd = left.d;
              }
              h = h.replace(left.d, nd);
            }
          }
        }
      }
      zip.file(hp, h);
    }

    // ========== Pied de page : total de pages automatique ==========
    const estLines = 4 + points.reduce((n, p) => n + 1 + Math.ceil(((p.observation || '').length + (p.avis || '').length) / 140), 0) + groups.length * 2;
    const estPages = Math.max(1, Math.ceil(estLines / 32)) + photoPages(photos, points).length;
    const fRids = [...rels.matchAll(/<Relationship [^>]*Type="[^"]*\/footer"[^>]*\/>/g)].map(m => (m[0].match(/Target="([^"]+)"/) || [])[1]).filter(Boolean);
    for (const target of fRids) {
      const fp = 'word/' + target; let f = await zip.file(fp).async('string');
      if (/NUMPAGES|SECTIONPAGES/.test(f)) {
        f = f.replace(/(NUMPAGES|SECTIONPAGES)([\s\S]*?fldCharType="separate"\/><\/w:r>[\s\S]*?<w:t[^>]*>)\d+(<\/w:t>)/g, `$1$2${estPages}$3`);
      } else {
        f = f.replace(/(<w:fldChar w:fldCharType="end"\/><\/w:r>\s*<w:r(?: [^>]*)?>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:t(?: [^>]*)?>\s*\/\s*<\/w:t><\/w:r>\s*)<w:r(?: [^>]*)?>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:t(?: [^>]*)?>\d+<\/w:t><\/w:r>/,
          (m, pre, rpr = '') => `${pre}<w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr}<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr}<w:t>${estPages}</w:t></w:r><w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`);
      }
      zip.file(fp, f);
    }

    zip.file(relsPath, rels);
    // le nom de fichier d'origine du logo client peut être .jpeg : Word lit le contenu, pas l'extension
    return zip.generateAsync({ type: typeof window !== 'undefined' ? 'blob' : 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  function TRANSPARENT_PNG() {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    return typeof atob === 'function' ? Uint8Array.from(atob(b64), c => c.charCodeAt(0)) : Buffer.from(b64, 'base64');
  }

  // Vérifie qu'un fichier importé ressemble bien à un modèle de CR
  async function inspectTemplate(JSZip, buf) {
    const zip = await JSZip.loadAsync(buf);
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('Ce fichier n\'est pas un document Word (.docx).');
    const hasHeader = Object.keys(zip.files).some(f => /^word\/header\d*\.xml$/.test(f));
    return { hasHeader };
  }

  const api = { buildFromTemplate, inspectTemplate, groupPoints, photoPages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Template = api;
})(typeof window !== 'undefined' ? window : globalThis);
