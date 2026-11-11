/* ANUBIS — génération du compte rendu de visite G4 au format Word (.docx)
   Mise en page : A4 paysage, cartouche Ginger en en-tête, tableau
   Ouvrages / Observations / Avis Ginger, puis planches photographiques. */
(function (root) {
  const STATUTS = {
    SO:  { label: 'SO – sans observation géotechnique', court: 'Sans obs.', color: '2E7D32' },
    OBS: { label: 'OBS – avec observation(s) géotechnique(s)', court: 'Avec obs.', color: 'E65100' },
    HM:  { label: 'HM – hors mission géotechnique', court: 'Hors mission', color: '757575' },
  };

  function frDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function buildReport(docx, data) {
    const {
      Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
      BorderStyle, ShadingType, ImageRun, Header, Footer, PageNumber, PageOrientation,
      VerticalAlign, TabStopType, HeightRule,
    } = docx;

    const { affaire = {}, visite = {}, photos = [], settings = {} } = data;
    const points = visite.points || [];
    const FONT = 'Arial';
    const ACCENT = settings.couleur || '1F3864';
    const PAGE_W = 16838, PAGE_H = 11906, MARGIN = 794; // 1,4 cm
    const CW = PAGE_W - 2 * MARGIN; // largeur utile (twips)

    const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const noB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const noBorders = { top: noB, bottom: noB, left: noB, right: noB };
    const cellM = { top: 60, bottom: 60, left: 100, right: 100 };

    // Texte multi-lignes -> runs avec sauts de ligne
    const runs = (text, opts = {}) => {
      const lines = String(text ?? '').split('\n');
      return lines.map((l, i) => new TextRun({ text: l, break: i ? 1 : 0, font: FONT, size: 18, ...opts }));
    };
    const P = (text, opts = {}, pOpts = {}) =>
      new Paragraph({ children: runs(text, opts), spacing: { after: 40 }, ...pOpts });

    const cell = (children, width, extra = {}) => new TableCell({
      children: Array.isArray(children) ? children : [children],
      width: { size: width, type: WidthType.DXA },
      borders, margins: cellM, verticalAlign: VerticalAlign.CENTER, ...extra,
    });
    const shade = (fill) => ({ fill, type: ShadingType.CLEAR, color: 'auto' });

    const sectionTitle = (txt) => new Paragraph({
      children: [new TextRun({ text: txt, bold: true, font: FONT, size: 22, color: 'FFFFFF' })],
      shading: shade(ACCENT),
      spacing: { before: 200, after: 100 },
      indent: { left: 60 },
    });

    // ---------- En-tête : cartouche ----------
    const wL = 3600, wR = 4200, wM = CW - wL - wR;
    let logoContent;
    if (settings.logo && settings.logo.data) {
      const maxW = 170, maxH = 60;
      const r = Math.min(maxW / settings.logo.w, maxH / settings.logo.h);
      logoContent = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          type: settings.logo.type || 'png', data: settings.logo.data,
          transformation: { width: Math.round(settings.logo.w * r), height: Math.round(settings.logo.h * r) },
        })],
      });
    } else {
      logoContent = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: settings.societe || 'GINGER CEBTP', bold: true, font: FONT, size: 26, color: ACCENT })],
      });
    }
    const logoCell = [logoContent];
    if (settings.agence) logoCell.push(new Paragraph({ alignment: AlignmentType.CENTER, children: runs(settings.agence, { size: 14, color: '595959' }) }));

    const cartouche = new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [wL, wM, wR],
      rows: [new TableRow({
        children: [
          cell(logoCell, wL),
          cell([
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'COMPTE RENDU DE VISITE', bold: true, font: FONT, size: 28, color: ACCENT })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Mission G4 – Supervision géotechnique d\'exécution (NF P 94-500)', font: FONT, size: 16, italics: true })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: runs(affaire.intitule || '', { bold: true, size: 18 }) }),
          ], wM),
          cell([
            P('', {}),
            new Paragraph({ children: [new TextRun({ text: 'Affaire n° : ', font: FONT, size: 18 }), new TextRun({ text: affaire.numero || '', bold: true, font: FONT, size: 18 })] }),
            new Paragraph({ children: [new TextRun({ text: 'Visite n° : ', font: FONT, size: 18 }), new TextRun({ text: String(visite.numero ?? ''), bold: true, font: FONT, size: 18 })] }),
            new Paragraph({ children: [new TextRun({ text: 'Date de visite : ', font: FONT, size: 18 }), new TextRun({ text: frDate(visite.date), bold: true, font: FONT, size: 18 })] }),
          ], wR),
        ],
      })],
    });

    const header = new Header({ children: [cartouche, new Paragraph({ spacing: { after: 0 }, children: [] })] });

    const footerTxt = `${settings.societe || 'Ginger CEBTP'} – Affaire ${affaire.numero || ''} – CR de visite G4 n°${visite.numero ?? ''} du ${frDate(visite.date)}`;
    const footer = new Footer({
      children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
        children: [
          new TextRun({ text: footerTxt, font: FONT, size: 14, color: '595959' }),
          new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: '595959' }),
        ],
      })],
    });

    // ---------- 1. Informations générales ----------
    const w4 = [2600, CW / 2 - 2600, 2600, CW / 2 - 2600];
    const lab = (t) => cell(P(t, { bold: true }), 2600, { shading: shade('D9E2F3') });
    const val = (t) => cell(P(t || '—'), CW / 2 - 2600);
    const horaires = [visite.heureDebut, visite.heureFin].filter(Boolean).join(' – ');
    const infoRows = [
      ['Opération', affaire.intitule, 'Commune', affaire.commune],
      ['Maître d\'ouvrage / Client', affaire.client, 'Maître d\'œuvre', affaire.moe],
      ['Entreprise(s)', affaire.entreprise, 'Phase des travaux', visite.phase],
      ['Date / horaires', `${frDate(visite.date)}${horaires ? '  (' + horaires + ')' : ''}`, 'Conditions météo', visite.meteo],
      ['Rédacteur', visite.redacteur, 'Personnes présentes', visite.participants],
    ];
    const infoTable = new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: w4,
      rows: infoRows.map(r => new TableRow({ children: [lab(r[0]), val(r[1]), lab(r[2]), val(r[3])] })),
    });

    // ---------- 3. Observations ----------
    const wc = [650, 3300, 0, 5000]; wc[2] = CW - wc[0] - wc[1] - wc[3];
    const head = (t, w) => cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: true, font: FONT, size: 18, color: 'FFFFFF' })] }), w, { shading: shade(ACCENT) });

    // numérotation des photos pour les renvois
    const photoNum = new Map();
    photos.forEach((p, i) => photoNum.set(p.id, i + 1));

    const obsRows = [new TableRow({ tableHeader: true, children: [head('N°', wc[0]), head('Ouvrages', wc[1]), head('Observations', wc[2]), head('Avis Ginger', wc[3])] })];
    if (!points.length) {
      obsRows.push(new TableRow({ children: [cell(P(''), wc[0]), cell(P('—'), wc[1]), cell(P('Aucune observation saisie.'), wc[2]), cell(P(''), wc[3])] }));
    }
    points.forEach((pt, i) => {
      const refs = photos.filter(p => p.pointId === pt.id).map(p => photoNum.get(p.id));
      const obsChildren = [P(pt.observation || '')];
      if (refs.length) obsChildren.push(P(`(cf. photo${refs.length > 1 ? 's' : ''} n°${refs.join(', ')})`, { italics: true, color: '595959', size: 16 }));
      const st = STATUTS[pt.statut] || null;
      const avisChildren = [];
      if (st) avisChildren.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: st.label.toUpperCase(), bold: true, font: FONT, size: 18, color: st.color })] }));
      avisChildren.push(P(pt.avis || ''));
      obsRows.push(new TableRow({
        cantSplit: false,
        children: [
          cell(new Paragraph({ alignment: AlignmentType.CENTER, children: runs(String(i + 1), { bold: true }) }), wc[0]),
          cell(P(pt.ouvrage || '', { bold: true }), wc[1]),
          cell(obsChildren, wc[2]),
          cell(avisChildren, wc[3]),
        ],
      }));
    });
    const obsTable = new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: wc, rows: obsRows });

    // ---------- Corps ----------
    const body = [
      sectionTitle('1. INFORMATIONS GÉNÉRALES'),
      infoTable,
      sectionTitle('2. OBJET DE LA VISITE'),
      P(visite.objet || 'Visite de chantier dans le cadre de la mission G4 de supervision géotechnique d\'exécution.'),
      sectionTitle('3. OBSERVATIONS ET AVIS GINGER'),
      obsTable,
      sectionTitle('4. CONCLUSION ET SUITES À DONNER'),
      P(visite.conclusion || '—'),
    ];
    if (visite.prochaineVisite) body.push(P(`Prochaine visite prévue : ${visite.prochaineVisite}`, { bold: true }));
    body.push(new Paragraph({ spacing: { before: 240 }, children: [
      new TextRun({ text: 'Rédigé par : ', font: FONT, size: 18 }),
      new TextRun({ text: visite.redacteur || '', bold: true, font: FONT, size: 18 }),
      new TextRun({ text: settings.fonction ? ` – ${settings.fonction}` : '', font: FONT, size: 18 }),
    ] }));
    if (visite.diffusion) body.push(P(`Diffusion : ${visite.diffusion}`, { size: 16, color: '595959' }));

    // ---------- Planches photographiques ----------
    const sections = [];
    const pageProps = {
      page: {
        size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 400, footer: 400 },
      },
    };
    sections.push({ properties: pageProps, headers: { default: header }, footers: { default: footer }, children: body });

    if (photos.length) {
      const perPage = settings.photosParPage === 4 ? 4 : 2;
      const colW = Math.floor(CW / 2);
      const PX_CM = 37.8;
      const boxW = 12.6 * PX_CM, boxH = (perPage === 4 ? 5.4 : 11.6) * PX_CM;
      const photoCell = (p, n) => {
        if (!p) return new TableCell({ children: [P('')], width: { size: colW, type: WidthType.DXA }, borders: noBorders });
        const r = Math.min(boxW / p.w, boxH / p.h);
        const pt = points.find(x => x.id === p.pointId);
        const legend = [`Photo n°${n}`, p.legende, pt ? `(${pt.ouvrage})` : ''].filter(Boolean).join(' – ');
        return new TableCell({
          width: { size: colW, type: WidthType.DXA }, borders, margins: cellM, verticalAlign: VerticalAlign.TOP,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: p.data, transformation: { width: Math.round(p.w * r), height: Math.round(p.h * r) } })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: runs(legend, { size: 16, italics: true }) }),
          ],
        });
      };
      const photoBody = [];
      for (let i = 0; i < photos.length; i += perPage) {
        const rows = [];
        for (let j = i; j < Math.min(i + perPage, photos.length); j += 2) {
          rows.push(new TableRow({ cantSplit: true, children: [photoCell(photos[j], j + 1), photoCell(photos[j + 1], j + 2)] }));
        }
        photoBody.push(new Paragraph({ pageBreakBefore: i > 0, children: [], spacing: { after: 0 } }));
        if (i === 0) photoBody.push(sectionTitle('5. PLANCHES PHOTOGRAPHIQUES'));
        photoBody.push(new Table({ width: { size: colW * 2, type: WidthType.DXA }, columnWidths: [colW, colW], rows }));
      }
      sections.push({ properties: pageProps, headers: { default: header }, footers: { default: footer }, children: photoBody });
    }

    return new Document({
      creator: visite.redacteur || 'ANUBIS',
      title: `CR visite G4 n°${visite.numero} – ${affaire.numero}`,
      styles: { default: { document: { run: { font: FONT, size: 18 } } } },
      sections,
    });
  }

  function fileName(affaire, visite) {
    const clean = s => String(s || '').replace(/[^\w\-.]+/g, '_');
    return `CR_G4_${clean(affaire.numero)}_Visite${clean(visite.numero)}_${clean(visite.date)}.docx`;
  }

  const api = { buildReport, fileName, STATUTS, frDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Report = api;
})(typeof window !== 'undefined' ? window : globalThis);
