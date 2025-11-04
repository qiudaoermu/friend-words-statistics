const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const lemmatizer = require('wink-lemmatizer');

// Input files (10 seasons as provided by user; Season 10 inferred by path pattern)
const inputDocPaths = [
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第一季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第二季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第三季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第四季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第五季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第六季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第七季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第八季 台词 纯英文.doc',
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第九季 台词 纯英文.doc',
  // Season 10 path is inferred. If missing, it will be skipped.
  '/Users/mac/Documents/网剧/Friends/02.剧本台词  中英对照+全英文 高清PDF+Word版【可直接打印】/老友记【普通版剧本】/纯英文剧本/老友记（1-10季纯英文台词合集）/Friends.第十季 台词 纯英文.doc'
];

// Heuristic name list to exclude from word counts (lowercase)
// Focused on Friends primary/recurring characters and common names in scripts
// Base names to exclude (lowercase)
let NAME_LIST = new Set([
  "ross",
  "rachel",
  "monica",
  "chandler",
  "joey",
  "phoebe",
  "janice",
  "carol",
  "susan",
  "ben",
  "emma",
  "gunther",
  "richard",
  "barry",
  "paolo",
  "julie",
  "emily",
  "kathy",
  "mike",
  "david",
  "tag",
  "charlie",
  "nora",
  "frank",
  "alice",
  "ursula",
  "erica",
  "estelle",
  "joshua",
  "mark",
  "amy",
  "paul",
  "katie",
  "gary",
  "pete",
  "tom",
  "bob",
  "steve",
  "eddie",
  "roger",
  "ken",
  "jack",
  "judy",
  "mr",
  "mrs",
  "barney",
  "barneys"
]);

// Surnames to exclude as well (lowercase)
// Main characters' surnames in Friends
const SURNAME_LIST = new Set([
  "geller",   // Ross, Monica
  "greene",   // Rachel
  "bing",     // Chandler
  "tribbiani",// Joey
  "buffay"    // Phoebe
]);

function cleanToken(token) {
  // Remove leading/trailing non-letters except internal apostrophes
  let t = token.trim();
  // Normalize possessives like Ross's -> Ross
  t = t.replace(/'s$/i, '');
  // Keep letters and internal apostrophes only
  t = t.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  return t;
}

function isName(word) {
  if (!word) return false;
  const w = word.toLowerCase();
  return NAME_LIST.has(w) || SURNAME_LIST.has(w);
}

// Merge external name lists (male/female) into NAME_LIST
function mergeExternalNameLists() {
  try {
    const path = require('path');
    const fs = require('fs');
    const malePath = path.join(__dirname, 'name', 'male.txt');
    const femalePath = path.join(__dirname, 'name', 'female.txt');

    const normalize = (s) => {
      if (!s) return '';
      const t = String(s).trim().toLowerCase();
      // keep letters only; strip trailing/leading punctuation and possessives
      return t.replace(/'s$/i, '').replace(/^[^a-z]+|[^a-z]+$/g, '');
    };

    const addFromFile = (p) => {
      if (!fs.existsSync(p)) return;
      const txt = fs.readFileSync(p, 'utf8');
      for (const line of txt.split(/\r?\n/g)) {
        const n = normalize(line);
        if (n) NAME_LIST.add(n);
      }
    };

    addFromFile(malePath);
    addFromFile(femalePath);
  } catch (e) {
    console.warn('[warn] failed to merge external name lists:', e && e.message ? e.message : e);
  }
}

function stripSpeakerLines(text) {
  // Remove lines like "Rachel:" or "RACHEL:" which denote speakers
  return text.replace(/^\s*[A-Z][A-Za-z]+\s*:\s.*$/gm, '');
}

// Contraction expansion mapping
// Minimal irregular exceptions; other contractions handled by rules
const CONTRACTIONS = new Map([
  ["won't", "will not"],
  ["can't", "can not"],
  ["ain't", "is not"],
  ["let's", "let us"]
]);

// Filler words and non-standard words to filter out
const FILLER_WORDS = new Set([
  "y'know", "yknow", "ya", "yeah", "yep", "nah", "uh", "um", "er", "ah", 
  "hmm", "hm", "oh", "eh", "huh", "wow", "whoa", "ooh", "aah", "mmm",
  "shh", "psst", "tsk", "pfft", "blah", "duh", "meh", "bah", "gah",
  "ugh", "argh", "grr", "eww", "ick", "yuck", "oops", "whoops"
  // user-requested y'-style contractions to be excluded from counts
  , "y'all", "y'go", "y'miss", "y'okay", "y'see", "y'serious"
]);

function expandContractions(word) {
  const lower = word.toLowerCase();
  // Normalize smart quotes to straight apostrophe for matching
  const w = lower.replace(/[\u2019\u2018]/g, "'");
  if (CONTRACTIONS.has(w)) return CONTRACTIONS.get(w).split(' ');

  // n't -> not (handle can't separately via exceptions)
  if (w.endsWith("n't")) {
    const stem = w.slice(0, -3);
    if (stem === 'wo') return ['will', 'not']; // won't handled above
    if (stem === 'ca') return ['can', 'not'];  // can't handled above
    return [stem, 'not'];
  }

  // 're, 've, 'll, 'm
  if (/'re$/.test(w)) return [w.replace(/'re$/, ''), 'are'];
  if (/'ve$/.test(w)) return [w.replace(/'ve$/, ''), 'have'];
  if (/'ll$/.test(w)) return [w.replace(/'ll$/, ''), 'will'];
  if (/'m$/.test(w)) return [w.replace(/'m$/, ''), 'am'];

  // 'd: ambiguous. Heuristics:
  // wh- words -> did; pronouns -> would; else -> had
  if (/'d$/.test(w)) {
    const stem = w.replace(/'d$/, '');
    if (/^(who|what|where|when|why|how)$/.test(stem)) return [stem, 'did'];
    if (/^(i|you|he|she|it|we|they|there)$/.test(stem)) return [stem, 'would'];
    return [stem, 'had'];
  }

  // 's: pronouns/demonstratives -> is; nouns -> possessive removed
  if (/'s$/.test(w)) {
    const stem = w.replace(/'s$/, '');
    if (/^(it|he|she|who|what|there|here|that)$/.test(stem)) return [stem, 'is'];
    return [stem];
  }

  return [w];
}

function isFillerWord(word) {
  if (!word) return false;
  const w = word.toLowerCase();
  return FILLER_WORDS.has(w);
}

function lemmatizeWord(word) {
  // Prefer verb lemma (handles is/was/were/has/had -> be/have), then noun, then adjective
  const w = word.toLowerCase();
  const v = lemmatizer.verb(w);
  if (v && v !== w) return v;
  const n = lemmatizer.noun(w);
  if (n && n !== w) return n;
  if (typeof lemmatizer.adjective === 'function') {
    const a = lemmatizer.adjective(w);
    if (a && a !== w) return a;
  }
  return w;
}

function extractWords(text) {
  // Use regex to capture only letter sequences and contractions, splitting on punctuation (e.g., commas)
  const cleaned = stripSpeakerLines(text);
  const normalized = cleaned.replace(/[\u2019\u2018]/g, "'");
  const rawTokens = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || [];
  const words = [];
  
  for (const token of rawTokens) {
    let t = token;
    if (!t) continue;
    
    // Skip names
    if (isName(t)) continue;
    
    // Expand contractions first
    const expandedWords = expandContractions(t);
    
    for (const expandedWord of expandedWords) {
      const cleanWord = expandedWord.toLowerCase().trim();
      if (!cleanWord) continue;
      
      // Exclude names again after removing possessives (e.g., "geller's" -> "geller")
      if (isName(cleanWord)) continue;

      // Skip filler words and non-standard words
      if (isFillerWord(cleanWord)) continue;
      
      // Skip very short words (1 character) that are likely noise
      if (cleanWord.length <= 1) continue;
      // Lemmatize to base form (e.g., is/was/were -> be; has/had -> have)
      const lemma = lemmatizeWord(cleanWord);
      // Final safeguard: if lemma is a name/surname, exclude
      if (isName(lemma)) continue;
      words.push(lemma);
    }
  }
  return words;
}

function makeNgrams(tokens, n = 2) {
  // Build contiguous n-grams from filtered tokens
  const grams = [];
  if (!Array.isArray(tokens) || tokens.length < n) return grams;
  for (let i = 0; i <= tokens.length - n; i++) {
    const g = tokens.slice(i, i + n).join(' ');
    grams.push(g);
  }
  return grams;
}

  async function main() {
    try {
      // Merge external name dictionaries into the base list before processing
      mergeExternalNameLists();

      // Aggregate per-season and overall data
      const seasonData = {}; // { label: { words: entries[], phrases: entries[], stats: {...} } }
      let processed = 0;
      let skipped = 0;
      const seasonLabels = [];
      const seasonRawTexts = {}; // store raw text per season for sentence route generation

    // helper: convert count map to sorted entries (descending by count)
    function toSortedEntries(map) {
      const arr = Array.from(map.entries());
      arr.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
      return arr;
    }

    // helper: sorted word entries ascending by count (tie-break by word)
    function toSortedWordEntries(map) {
      const arr = Array.from(map.entries());
      arr.sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0]));
      return arr;
    }

    // helper: derive season label from path (e.g., 第九季)
    function deriveSeasonLabel(p) {
      const base = path.basename(p);
      const m = base.match(/Friends\.(第[一二三四五六七八九十]+季)/);
      return m ? m[1] : base;
    }

    // helper: find episode boundaries and split season text into episode texts
    function splitSeasonEpisodes(text) {
      const normalized = (text || '').replace(/\r\n/g, '\n');
      // Primary pattern: Friends S01E02 (case-insensitive), "FRIENDS S1E2" also allowed
      const reFriends = /(^|\n)\s*Friends\s+S(\d{1,2})E(\d{1,2})\b.*$/img;
      const boundaries = [];
      let m;
      while ((m = reFriends.exec(normalized)) !== null) {
        const idx = m.index + (m[1] ? m[1].length : 0);
        const epNum = parseInt(m[3], 10);
        boundaries.push({ idx, num: epNum });
      }
      // Fallback patterns if the primary pattern is missing
      if (boundaries.length === 0) {
        const reAlt = /(^|\n)\s*S(\d{1,2})E(\d{1,2})\b.*$/img;
        while ((m = reAlt.exec(normalized)) !== null) {
          const idx = m.index + (m[1] ? m[1].length : 0);
          const epNum = parseInt(m[3], 10);
          boundaries.push({ idx, num: epNum });
        }
      }
      if (boundaries.length === 0) {
        const reTitle = /(^|\n)\s*(The\s+One\s+[^\n]+)/g; 
        while ((m = reTitle.exec(normalized)) !== null) {
          const idx = m.index + (m[1] ? m[1].length : 0);
          boundaries.push({ idx, num: null });
        }
      }
      // Ensure start of text is a boundary when nothing matched at index 0
      if (normalized.length > 0 && (boundaries.length === 0 || boundaries[0].idx !== 0)) {
        boundaries.unshift({ idx: 0, num: 1 });
      }
      boundaries.sort((a, b) => a.idx - b.idx);
      const unique = [];
      let lastIdx = -1;
      for (const b of boundaries) { if (b.idx !== lastIdx) { unique.push(b); lastIdx = b.idx; } }
      const episodes = [];
      for (let i = 0; i < unique.length; i++) {
        const start = unique[i].idx;
        const end = (i + 1 < unique.length) ? unique[i + 1].idx : normalized.length;
        const slice = normalized.slice(start, end).trim();
        if (slice) episodes.push({ num: unique[i].num, text: slice });
      }
      return episodes;
    }

    for (const p of inputDocPaths) {
      const label = deriveSeasonLabel(p);
      seasonLabels.push(label);
      try {
        if (!fs.existsSync(p)) {
          console.warn(`[skip] file not found: ${p}`);
          skipped++;
          // still add empty buckets for this season
          seasonData[label] = { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 }, segments: { '1-8': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '9-16': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '17-last': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } } } };
          continue;
        }
        const result = await mammoth.extractRawText({ path: p });
        const t = (result && result.value) ? result.value : '';
        if (!t) {
          console.warn(`[skip] empty text extracted: ${p}`);
          skipped++;
          seasonData[label] = { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 }, segments: { '1-8': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '9-16': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '17-last': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } } } };
          continue;
        }
        seasonRawTexts[label] = t;
        // Build per-episode words
        const episodeData = splitSeasonEpisodes(t);
        const episodeWords = episodeData.map(ep => ({ num: ep.num, words: extractWords(ep.text) }));
        // Aggregate per-episode buckets for UI tabs
        const episodesAgg = {};
        for (let i = 0; i < episodeWords.length; i++) {
          const ew = episodeWords[i];
          const epNum = ew.num != null ? ew.num : (i + 1);
          const tokens = Array.isArray(ew.words) ? ew.words : [];
          const wc = new Map(); for (const w of tokens) wc.set(w, (wc.get(w) || 0) + 1);
          const eEntries = toSortedWordEntries(wc);
          const grams = makeNgrams(tokens, 2);
          const pc = new Map(); for (const g of grams) pc.set(g, (pc.get(g) || 0) + 1);
          const pEntries = toSortedEntries(pc);
          episodesAgg[epNum] = {
            words: eEntries,
            phrases: pEntries,
            stats: {
              wordsTotal: tokens.length,
              wordsDistinct: eEntries.length,
              phrasesTotal: grams.length,
              phrasesDistinct: pEntries.length
            }
          };
        }
        const words = episodeWords.length ? episodeWords.flatMap(ep => ep.words) : extractWords(t);
        const counts = new Map();
        for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
        const entries = toSortedWordEntries(counts);
        const distinctCount = entries.length;
        const totalCount = words.length;

        const bigrams = makeNgrams(words, 2);
        const phraseCounts = new Map();
        for (const g of bigrams) phraseCounts.set(g, (phraseCounts.get(g) || 0) + 1);
        const phraseEntries = toSortedEntries(phraseCounts);
        const phraseDistinctCount = phraseEntries.length;
        const phraseTotalCount = bigrams.length;

        // Build segments: [1-8], [9-16], [17-last]
        function aggregateFromEpisodes(epWords, startNum, endNumInclusive) {
          const selected = epWords.filter((ep, i) => {
            const n = ep.num != null ? ep.num : (i + 1);
            return n >= startNum && (endNumInclusive == null ? true : n <= endNumInclusive);
          });
          const tokens = selected.length ? selected.flatMap(ep => ep.words) : [];
          const cMap = new Map(); for (const w of tokens) cMap.set(w, (cMap.get(w) || 0) + 1);
          const e = toSortedWordEntries(cMap);
          const grams = makeNgrams(tokens, 2);
          const pc = new Map(); for (const g of grams) pc.set(g, (pc.get(g) || 0) + 1);
          const pe = toSortedEntries(pc);
          return {
            words: e,
            phrases: pe,
            stats: {
              wordsTotal: tokens.length,
              wordsDistinct: e.length,
              phrasesTotal: grams.length,
              phrasesDistinct: pe.length
            }
          };
        }

        const seg_1_8 = aggregateFromEpisodes(episodeWords, 1, 8);
        const seg_9_16 = aggregateFromEpisodes(episodeWords, 9, 16);
        const seg_17_last = aggregateFromEpisodes(episodeWords, 17, null);

        seasonData[label] = {
          words: entries,
          phrases: phraseEntries,
          stats: {
            wordsTotal: totalCount,
            wordsDistinct: distinctCount,
            phrasesTotal: phraseTotalCount,
            phrasesDistinct: phraseDistinctCount
          },
          segments: {
            '1-8': seg_1_8,
            '9-16': seg_9_16,
            '17-last': seg_17_last
          },
          episodes: episodesAgg
        };
        processed++;
        console.log(`[ok] processed: ${p}`);
      } catch (e) {
        console.warn(`[skip] failed to extract: ${p}`, e && e.message ? e.message : e);
        skipped++;
        seasonData[label] = { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 }, segments: { '1-8': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '9-16': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } }, '17-last': { words: [], phrases: [], stats: { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 } } } };
      }
    }

    // Build overall aggregate "All"
    const allWordCounts = new Map();
    const allPhraseCounts = new Map();
    for (const label of seasonLabels) {
      const sd = seasonData[label];
      for (const [w, c] of (sd.words || [])) allWordCounts.set(w, (allWordCounts.get(w) || 0) + c);
      for (const [p, c] of (sd.phrases || [])) allPhraseCounts.set(p, (allPhraseCounts.get(p) || 0) + c);
    }
    const allWordsEntries = toSortedWordEntries(allWordCounts);
    const allPhrasesEntries = toSortedEntries(allPhraseCounts);
    const allStats = {
      wordsTotal: allWordsEntries.reduce((sum, [, c]) => sum + c, 0),
      wordsDistinct: allWordsEntries.length,
      phrasesTotal: allPhrasesEntries.reduce((sum, [, c]) => sum + c, 0),
      phrasesDistinct: allPhrasesEntries.length
    };
    // Build All-level segments by summing per-season segments
    function sumEntries(listA, listB) {
      const m = new Map();
      for (const [t, c] of (listA || [])) m.set(t, (m.get(t) || 0) + c);
      for (const [t, c] of (listB || [])) m.set(t, (m.get(t) || 0) + c);
      return m;
    }
    const allSegKeys = ['1-8', '9-16', '17-last'];
    const allSegments = {};
    for (const key of allSegKeys) {
      let wMap = new Map();
      let pMap = new Map();
      let wTotal = 0, pTotal = 0;
      for (const lbl of seasonLabels) {
        const sd = seasonData[lbl] || {};
        const seg = sd.segments && sd.segments[key];
        if (!seg) continue;
        wMap = sumEntries([...wMap], seg.words);
        pMap = sumEntries([...pMap], seg.phrases);
        wTotal += (seg.stats && seg.stats.wordsTotal) || 0;
        pTotal += (seg.stats && seg.stats.phrasesTotal) || 0;
      }
      const wEntries = toSortedWordEntries(wMap);
      const pEntries = toSortedEntries(pMap);
      allSegments[key] = {
        words: wEntries,
        phrases: pEntries,
        stats: {
          wordsTotal: wTotal,
          wordsDistinct: wEntries.length,
          phrasesTotal: pTotal,
          phrasesDistinct: pEntries.length
        }
      };
    }
    seasonData['All'] = { words: allWordsEntries, phrases: allPhrasesEntries, stats: allStats, segments: allSegments };

    // Generate scripts route: per-season JSON + HTML with sentence anchors
    function splitSentencesByEpisode(text) {
      const episodes = splitSeasonEpisodes(text);
      const sentences = [];
      let sid = 1;
      for (const ep of episodes) {
        const epNum = ep.num != null ? ep.num : (episodes.indexOf(ep) + 1);
        const normalized = ep.text.replace(/\r\n/g, '\n');
        // split by sentence enders and newlines, keep simple
        const parts = normalized.split(/(?<=[\.\!\?])\s+|\n+/g).map(s => s.trim()).filter(Boolean);
        for (const s of parts) {
          const lemmas = extractWords(s);
          sentences.push({ id: sid, ep: epNum, text: s, lemmas });
          sid++;
        }
      }
      return sentences;
    }

    const scriptsDir = path.join(process.cwd(), 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const lbl of seasonLabels) {
      const raw = seasonRawTexts[lbl];
      if (!raw) continue; // skip missing seasons
      const sentences = splitSentencesByEpisode(raw);
      const jsonPath = path.join(scriptsDir, `${lbl}.json`);
      const htmlPath = path.join(scriptsDir, `${lbl}.html`);
      fs.writeFileSync(jsonPath, JSON.stringify({ season: lbl, sentences }, null, 2), 'utf8');
      const scriptHtml = `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><title>Friends ${lbl} Script</title><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:24px;}
      .sent{margin:8px 0; padding:4px 6px; border-radius:4px; scroll-margin-top: 140px;}
      .sent.hl{background:#fff4cc; box-shadow:0 0 0 2px #ffd24d inset;}
      /* Fallback: if JS未执行，使用 :target 也能高亮 */
      .sent:target{background:#fff4cc; box-shadow:0 0 0 2px #ffd24d inset;}
      .ep{color:#555;font-size:13px;margin-right:10px;}
      .txt{font-size:18px; line-height:1.7;}
      .txt mark{background:#fff4cc;}
      a{color:#0065cc;text-decoration:none;} a:hover{text-decoration:underline;}
      </style></head><body><h1>Friends ${lbl} — Script</h1><div>${sentences.map(s => `<div class=\"sent\" id=\"s${s.id}\"><span class=\"ep\">E${s.ep}</span><span class=\"txt\">${s.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span></div>`).join('')}</div><script>
      (function(){
        function escapeHtml(s){ return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function escapeRegex(s){ return s.replace(/[-\/\\^$*+?.()|[\]]/g,'\\$&'); }
        function highlightWordInSentence(text, lemma){
          const safe = escapeHtml(text);
          if (!lemma) return safe;
          const base = String(lemma).toLowerCase();
          const irregular = {
            be:['am','is','are','was','were','be','been','being'],
            have:['have','has','had','having'],
            do:['do','does','did','doing','done'],
            go:['go','goes','went','gone','going'],
            come:['come','comes','came','coming'],
            see:['see','sees','saw','seen','seeing'],
            say:['say','says','said','saying'],
            get:['get','gets','got','getting','gotten'],
            make:['make','makes','made','making'],
            take:['take','takes','took','taking','taken'],
            know:['know','knows','knew','knowing','known'],
            think:['think','thinks','thought','thinking'],
            tell:['tell','tells','told','telling'],
            become:['become','becomes','became','becoming','become'],
            leave:['leave','leaves','left','leaving'],
            feel:['feel','feels','felt','feeling'],
            put:['put','puts','putting'],
            bring:['bring','brings','brought','bringing'],
            begin:['begin','begins','began','beginning','begun'],
            keep:['keep','keeps','kept','keeping'],
            hold:['hold','holds','held','holding'],
            write:['write','writes','wrote','writing','written'],
            stand:['stand','stands','stood','standing'],
            hear:['hear','hears','heard','hearing'],
            let:['let','lets','letting'],
            mean:['mean','means','meant','meaning'],
            set:['set','sets','setting'],
            meet:['meet','meets','met','meeting'],
            run:['run','runs','ran','running'],
            pay:['pay','pays','paid','paying'],
            sit:['sit','sits','sat','sitting'],
            speak:['speak','speaks','spoke','speaking','spoken'],
            lie:['lie','lies','lay','lying','lain'],
            lead:['lead','leads','led','leading'],
            read:['read','reads','reading'],
            grow:['grow','grows','grew','growing','grown'],
            lose:['lose','loses','lost','losing'],
            fall:['fall','falls','fell','falling','fallen'],
            send:['send','sends','sent','sending'],
            build:['build','builds','built','building'],
            understand:['understand','understands','understood','understanding'],
            draw:['draw','draws','drew','drawing','drawn'],
            break:['break','breaks','broke','breaking','broken'],
            spend:['spend','spends','spent','spending'],
            cut:['cut','cuts','cutting'],
            rise:['rise','rises','rose','rising','risen'],
            drive:['drive','drives','drove','driving','driven'],
            buy:['buy','buys','bought','buying'],
            wear:['wear','wears','wore','wearing','worn'],
            choose:['choose','chooses','chose','choosing','chosen'],
            eat:['eat','eats','ate','eating','eaten'],
            sleep:['sleep','sleeps','slept','sleeping'],
            sing:['sing','sings','sang','singing','sung'],
            swim:['swim','swims','swam','swimming','swum'],
            fly:['fly','flies','flew','flying','flown'],
            teach:['teach','teaches','taught','teaching'],
            sell:['sell','sells','sold','selling'],
            catch:['catch','catches','caught','catching'],
            fight:['fight','fights','fought','fighting'],
            throw:['throw','throws','threw','throwing','thrown'],
            show:['show','shows','showed','showing','shown'],
            forget:['forget','forgets','forgot','forgetting','forgotten'],
            forgive:['forgive','forgives','forgave','forgiving','forgiven'],
            shake:['shake','shakes','shook','shaking','shaken'],
            shut:['shut','shuts','shutting'],
            ring:['ring','rings','rang','ringing','rung']
          };
          const forms = irregular[base] || [base, base+'s', base+'es', base+'ed', base+'ing'];
      // 注意：这里需要写成 \\\\b 以便生成到浏览器的脚本文字为 \\b，从而在 RegExp 字符串中表示单词边界
      const pattern = new RegExp('\\\\b(' + forms.map(escapeRegex).join('|') + ')\\\\b','gi');
          return safe.replace(pattern, '<mark>$1<\/mark>');
        }
        var lemmaParam = null; try { var usp = new URLSearchParams(location.search); lemmaParam = usp.get('w'); } catch(e) {}
        function highlightFromHash(){
          var id = location.hash ? location.hash.slice(1) : '';
          if (!id) return;
          var el = document.getElementById(id);
          if (!el) return;
          // clear previous
          var prev = document.querySelector('.sent.hl'); if (prev) { prev.classList.remove('hl'); var pt = prev.querySelector('.txt'); if (pt && pt.dataset.original) { pt.innerHTML = highlightWordInSentence(pt.dataset.original, null); } }
          el.classList.add('hl');
          if (lemmaParam) {
            var txtEl = el.querySelector('.txt');
            if (txtEl) {
              if (!txtEl.dataset.original) { txtEl.dataset.original = txtEl.textContent || ''; }
              var before = highlightWordInSentence(txtEl.dataset.original, null);
              var marked = highlightWordInSentence(txtEl.dataset.original, lemmaParam);
              txtEl.innerHTML = marked;
              // 若目标句未匹配到，则回退为整页应用高亮
              if (marked === before) {
                var all = document.querySelectorAll('.txt');
                for (var i = 0; i < all.length; i++) {
                  var t = all[i];
                  if (!t.dataset.original) { t.dataset.original = t.textContent || ''; }
                  t.innerHTML = highlightWordInSentence(t.dataset.original, lemmaParam);
                }
              }
            }
          }
          try {
            var rect = el.getBoundingClientRect();
            var y = rect.top + (window.pageYOffset || document.documentElement.scrollTop || 0) - 140;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          } catch (e) {
            el.scrollIntoView();
            window.scrollBy(0, -140);
          }
        }
        window.addEventListener('hashchange', highlightFromHash);
        document.addEventListener('DOMContentLoaded', highlightFromHash);
        // 有些浏览器在脚本加载后 DOMContentLoaded 已触发，立即执行一次
        highlightFromHash();
      })();
      </script></body></html>`;
      fs.writeFileSync(htmlPath, scriptHtml, 'utf8');
    }

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Friends Seasons 1–10 — Word & Phrase Frequency</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 24px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    .meta { margin-bottom: 16px; color: #444; }
    .controls { margin: 12px 0 16px; display: flex; gap: 12px; align-items: center; }
    input[type="text"] { padding: 8px; font-size: 14px; width: 280px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 8px 6px; text-align: left; }
    th { position: sticky; top: 0; background: #fafafa; }
    tbody tr:nth-child(odd) { background: #fcfcfc; }
    .count { text-align: right; font-variant-numeric: tabular-nums; }
    .footer { margin-top: 18px; color: #666; font-size: 12px; }
    .note { color: #666; font-size: 12px; }
    .tabs { display: flex; gap: 8px; margin: 8px 0 12px; flex-wrap: wrap; }
    .tab { padding: 8px 12px; border: 1px solid #ddd; border-bottom: none; background: #f7f7f7; cursor: pointer; }
    .tab.active { background: #fff; font-weight: 600; }
    .panel { border: 1px solid #ddd; padding: 8px; }
    .panel.hidden { display: none; }
  </style>
</head>
<body>
  <h1>Word & Phrase Frequency — Friends Seasons 1–10</h1>
  <div class="meta">
    <div>Scope: <strong id="scope-label">All</strong></div>
    Words — Total: <strong id="words-total">${seasonData['All'].stats.wordsTotal.toLocaleString()}</strong> · Distinct: <strong id="words-distinct">${seasonData['All'].stats.wordsDistinct.toLocaleString()}</strong><br/>
    Phrases (bigrams) — Total: <strong id="phrases-total">${seasonData['All'].stats.phrasesTotal.toLocaleString()}</strong> · Distinct: <strong id="phrases-distinct">${seasonData['All'].stats.phrasesDistinct.toLocaleString()}</strong><br/>
    Files processed: <strong>${processed}</strong>${skipped ? ` · Skipped: <strong>${skipped}</strong>` : ''}
  </div>
  <div class="controls">
    <label>
      Search:
      <input id="search" type="text" placeholder="Type to filter..." />
    </label>
    <label>
      Page size:
      <select id="pageSize">
        <option value="50">50</option>
        <option value="100" selected>100</option>
        <option value="200">200</option>
        <option value="500">500</option>
      </select>
    </label>
    <label style="margin-left:12px;">
      <input id="hideCommon" type="checkbox" checked /> 隐藏>10次的词
    </label>
  </div>
  <div class="season-tabs tabs">
    <button class="season-tab tab active" data-season="All">All</button>
    ${seasonLabels.map(lbl => `<button class=\"season-tab tab\" data-season=\"${lbl}\">${lbl}</button>`).join('')}
  </div>
  <div class="segment-tabs tabs" id="segment-tabs" style="display:none;">
    <button class="segment-tab tab active" data-seg="All">All</button>
    <button class="segment-tab tab" data-seg="1-8">1-8</button>
    <button class="segment-tab tab" data-seg="9-16">9-16</button>
    <button class="segment-tab tab" data-seg="17-last">17-last</button>
  </div>
  <div class="episode-tabs tabs" id="episode-tabs" style="display:none;"></div>
  <div class="tabs">
    <button id="tab-words" class="tab active">Words</button>
    <button id="tab-phrases" class="tab">Phrases</button>
  </div>
  <div id="panel-words" class="panel">
  <div class="pager" id="pager-words"></div>
  <table id="table">
    <thead>
      <tr><th>Word</th><th class="count">Count</th></tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>
  <div id="panel-phrases" class="panel hidden">
    <div class="pager" id="pager-phrases"></div>
    <table id="table-phrases">
      <thead>
        <tr><th>Phrase (bigram)</th><th class="count">Count</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
  <div class="footer note">Names excluded by heuristic list (main Friends characters and common names). You can extend this list in analyze.js.</div>
  <script>
    // Embed per-season data for client-side rendering
    window.SEASON_DATA = ${JSON.stringify(seasonData)};
    window.SEASON_LABELS = ${JSON.stringify(['All', ...seasonLabels])};
    window.SENTENCE_CACHE = {};

    const search = document.getElementById('search');
    const pageSizeSel = document.getElementById('pageSize');
    const tabWords = document.getElementById('tab-words');
    const tabPhrases = document.getElementById('tab-phrases');
    const seasonTabs = Array.from(document.querySelectorAll('.season-tab'));
    const segmentTabsEl = document.getElementById('segment-tabs');
    let segmentTabs = Array.from(document.querySelectorAll('.segment-tab'));
    const episodeTabsEl = document.getElementById('episode-tabs');
    let episodeTabs = [];
    const scopeLabelEl = document.getElementById('scope-label');
    const wordsTotalEl = document.getElementById('words-total');
    const wordsDistinctEl = document.getElementById('words-distinct');
    const phrasesTotalEl = document.getElementById('phrases-total');
    const phrasesDistinctEl = document.getElementById('phrases-distinct');
    const panelWords = document.getElementById('panel-words');
    const panelPhrases = document.getElementById('panel-phrases');
    const tbodyWords = document.querySelector('#table tbody');
    const tbodyPhrases = document.querySelector('#table-phrases tbody');
    const pagerWords = document.getElementById('pager-words');
    const pagerPhrases = document.getElementById('pager-phrases');
    const hideCommonEl = document.getElementById('hideCommon');

    let state = {
      active: 'words',
      season: 'All',
      segment: '1-8',
      q: '',
      pageSize: parseInt(pageSizeSel.value, 10),
      pageWords: 1,
      pagePhrases: 1,
      initializedPhrases: false,
      hideCommon: true
    };

    function debounce(fn, ms) {
      let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    async function loadSeasonSentences(season) {
      if (season === 'All') return null;
      if (window.SENTENCE_CACHE[season]) return window.SENTENCE_CACHE[season];
      const resp = await fetch('scripts/' + season + '.json');
      if (!resp.ok) { console.warn('Failed to load sentences for season', season); return null; }
      const data = await resp.json();
      window.SENTENCE_CACHE[season] = data;
      return data;
    }

    function segmentBounds(seg) {
      if (seg === 'All') return { start: 1, end: null };
      if (seg === '1-8') return { start: 1, end: 8 };
      if (seg === '9-16') return { start: 9, end: 16 };
      if (typeof seg === 'string' && seg.startsWith('E')) {
        const n = parseInt(seg.slice(1), 10);
        if (!isNaN(n)) return { start: n, end: n };
      }
      return { start: 17, end: null };
    }

    function renderSegmentTabsForSeason(season) {
      if (season === 'All') { 
        segmentTabsEl.style.display = 'flex'; 
        segmentTabsEl.innerHTML = [
          '<button class="segment-tab tab" data-seg="All">All</button>',
          '<button class="segment-tab tab" data-seg="1-8">1-8</button>',
          '<button class="segment-tab tab" data-seg="9-16">9-16</button>',
          '<button class="segment-tab tab" data-seg="17-last">17-last</button>'
        ].join('');
        segmentTabs = Array.from(segmentTabsEl.querySelectorAll('.segment-tab'));
        segmentTabs.forEach(btn => btn.addEventListener('click', () => setSegment(btn.dataset.seg)));
        episodeTabsEl.style.display = 'none'; episodeTabsEl.innerHTML = '';
        return; 
      }
      segmentTabsEl.style.display = 'flex';
      const base = [
        '<button class="segment-tab tab" data-seg="All">All</button>',
        '<button class="segment-tab tab" data-seg="1-8">1-8</button>',
        '<button class="segment-tab tab" data-seg="9-16">9-16</button>',
        '<button class="segment-tab tab" data-seg="17-last">17-last</button>'
      ];
      segmentTabsEl.innerHTML = base.join('');
      segmentTabs = Array.from(segmentTabsEl.querySelectorAll('.segment-tab'));
      segmentTabs.forEach(btn => btn.addEventListener('click', () => setSegment(btn.dataset.seg)));
      episodeTabsEl.style.display = 'none';
      episodeTabsEl.innerHTML = '';
    }

    function renderEpisodeTabsForRange(season, segRange) {
      const sd = window.SEASON_DATA[season] || {};
      const bounds = segmentBounds(segRange);
      const keys = sd.episodes ? Object.keys(sd.episodes).map(k => parseInt(k, 10)).filter(n => !isNaN(n)) : [];
      const epsInRange = keys.filter(n => n >= bounds.start && (bounds.end == null || n <= bounds.end)).sort((a,b) => a-b);
      if (epsInRange.length === 0) { episodeTabsEl.style.display = 'none'; episodeTabsEl.innerHTML = ''; return; }
      episodeTabsEl.style.display = 'flex';
      episodeTabsEl.innerHTML = epsInRange.map(n => '<button class="episode-tab tab" data-ep="E' + n + '">E' + n + '</button>').join('');
      episodeTabs = Array.from(episodeTabsEl.querySelectorAll('.episode-tab'));
      episodeTabs.forEach(btn => btn.addEventListener('click', () => setSegment(btn.dataset.ep)));
    }

    function renderEpisodePrompt() {
      const tip = '<tr class="word-detail"><td colspan="2" style="color:#666;">请选择该区间中的具体一集以查看数据。</td></tr>';
      tbodyWords.innerHTML = tip;
      tbodyPhrases.innerHTML = '<tr class="word-detail"><td colspan="2" style="color:#666;">请选择该区间中的具体一集以查看数据。</td></tr>';
      pagerWords.innerHTML = '';
      pagerPhrases.innerHTML = '';
    }

    function filterData(data, q) {
      if (!q) return data;
      const qq = q.toLowerCase();
      return data.filter(([text]) => text.toLowerCase().includes(qq));
    }

    // 在句子中高亮指定词（含常见词形），并转义 HTML
    function highlightWordInSentence(text, lemma) {
      const escapeHtml = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // 避免在模板字符串中出现 $ { 序列导致插值：分两步转义
      const escapeRegex = (s) => {
        let r = s.replace(/[-\/\\^$*+?.()|[\]]/g, '\\$&');
        return r.replace(/{/g, '\\{').replace(/}/g, '\\}');
      };
      const safe = escapeHtml(text);
      if (!lemma) return safe;
      const base = String(lemma).toLowerCase();
      const irregularMap = {
        be: ['am','is','are','was','were','be','been','being'],
        have: ['have','has','had','having'],
        do: ['do','does','did','doing','done'],
        go: ['go','goes','went','gone','going'],
        come: ['come','comes','came','coming'],
        see: ['see','sees','saw','seen','seeing'],
        say: ['say','says','said','saying'],
        get: ['get','gets','got','getting','gotten'],
        make: ['make','makes','made','making'],
        take: ['take','takes','took','taking','taken'],
        know: ['know','knows','knew','knowing','known'],
        think: ['think','thinks','thought','thinking'],
        tell: ['tell','tells','told','telling'],
        become: ['become','becomes','became','becoming','become'],
        leave: ['leave','leaves','left','leaving'],
        feel: ['feel','feels','felt','feeling'],
        put: ['put','puts','putting'],
        bring: ['bring','brings','brought','bringing'],
        begin: ['begin','begins','began','beginning','begun'],
        keep: ['keep','keeps','kept','keeping'],
        hold: ['hold','holds','held','holding'],
        write: ['write','writes','wrote','writing','written'],
        stand: ['stand','stands','stood','standing'],
        hear: ['hear','hears','heard','hearing'],
        let: ['let','lets','letting'],
        mean: ['mean','means','meant','meaning'],
        set: ['set','sets','setting'],
        meet: ['meet','meets','met','meeting'],
        run: ['run','runs','ran','running'],
        pay: ['pay','pays','paid','paying'],
        sit: ['sit','sits','sat','sitting'],
        speak: ['speak','speaks','spoke','speaking','spoken'],
        lie: ['lie','lies','lay','lying','lain'],
        lead: ['lead','leads','led','leading'],
        read: ['read','reads','reading'],
        grow: ['grow','grows','grew','growing','grown'],
        lose: ['lose','loses','lost','losing'],
        fall: ['fall','falls','fell','falling','fallen'],
        send: ['send','sends','sent','sending'],
        build: ['build','builds','built','building'],
        understand: ['understand','understands','understood','understanding'],
        draw: ['draw','draws','drew','drawing','drawn'],
        break: ['break','breaks','broke','breaking','broken'],
        spend: ['spend','spends','spent','spending'],
        cut: ['cut','cuts','cutting'],
        rise: ['rise','rises','rose','rising','risen'],
        drive: ['drive','drives','drove','driving','driven'],
        buy: ['buy','buys','bought','buying'],
        wear: ['wear','wears','wore','wearing','worn'],
        choose: ['choose','chooses','chose','choosing','chosen'],
        eat: ['eat','eats','ate','eating','eaten'],
        sleep: ['sleep','sleeps','slept','sleeping'],
        sing: ['sing','sings','sang','singing','sung'],
        swim: ['swim','swims','swam','swimming','swum'],
        fly: ['fly','flies','flew','flying','flown'],
        teach: ['teach','teaches','taught','teaching'],
        sell: ['sell','sells','sold','selling'],
        catch: ['catch','catches','caught','catching'],
        fight: ['fight','fights','fought','fighting'],
        throw: ['throw','throws','threw','throwing','thrown'],
        show: ['show','shows','showed','showing','shown'],
        forget: ['forget','forgets','forgot','forgetting','forgotten'],
        forgive: ['forgive','forgives','forgave','forgiving','forgiven'],
        shake: ['shake','shakes','shook','shaking','shaken'],
        shut: ['shut','shuts','shutting'],
        ring: ['ring','rings','rang','ringing','rung']
      };
      const forms = irregularMap[base] || [base, base + 's', base + 'es', base + 'ed', base + 'ing'];
      // 注意：这里需要写成 \\\\b 以便生成到浏览器的脚本文字为 \\b，从而在 RegExp 字符串中表示单词边界
      const pattern = new RegExp('\\\\b(' + forms.map(escapeRegex).join('|') + ')\\\\b', 'gi');
      return safe.replace(pattern, '<mark style="background:#fff4cc;">$1</mark>');
    }

    function renderPager(el, page, totalPages, onChange) {
      el.innerHTML = '';
      const info = document.createElement('span');
      info.style.marginRight = '12px';
      info.textContent = 'Page ' + page + ' / ' + totalPages;
      const prev = document.createElement('button'); prev.textContent = 'Prev'; prev.disabled = page <= 1;
      const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = page >= totalPages;
      prev.addEventListener('click', () => onChange(page - 1));
      next.addEventListener('click', () => onChange(page + 1));
      el.appendChild(info); el.appendChild(prev); el.appendChild(next);
    }

    function renderTable(tbody, data, page, pageSize) {
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, data.length);
      const rows = data.slice(start, end)
        .map(function(tuple){ var text = tuple[0], count = tuple[1]; return '<tr class="word-row"><td class="word-cell">' + text + '</td><td class="count">' + count + '</td></tr>'; })
        .join('');
      tbody.innerHTML = rows;
    }

    function getSeasonWordsData() {
      if (state.season === 'All') {
        const all = window.SEASON_DATA['All'] || {};
        if (all.segments && all.segments[state.segment]) return all.segments[state.segment].words || [];
        return all.words || [];
      }
      const sd = window.SEASON_DATA[state.season] || {};
      if (typeof state.segment === 'string' && state.segment.startsWith('E') && sd.episodes) {
        const n = parseInt(state.segment.slice(1), 10);
        if (!isNaN(n) && sd.episodes[n]) return sd.episodes[n].words || [];
      }
      if (sd.segments && sd.segments[state.segment]) return sd.segments[state.segment].words || [];
      return sd.words || [];
    }
    function getSeasonPhrasesData() {
      if (state.season === 'All') {
        const all = window.SEASON_DATA['All'] || {};
        if (all.segments && all.segments[state.segment]) return all.segments[state.segment].phrases || [];
        return all.phrases || [];
      }
      const sd = window.SEASON_DATA[state.season] || {};
      if (typeof state.segment === 'string' && state.segment.startsWith('E') && sd.episodes) {
        const n = parseInt(state.segment.slice(1), 10);
        if (!isNaN(n) && sd.episodes[n]) return sd.episodes[n].phrases || [];
      }
      if (sd.segments && sd.segments[state.segment]) return sd.segments[state.segment].phrases || [];
      return sd.phrases || [];
    }

    function updateWords() {
      const dataSrc = getSeasonWordsData();
      let data = filterData(dataSrc, state.q);
      if (state.hideCommon) {
        data = data.filter(function(tuple){ return (tuple[1] || 0) <= 10; });
      }
      const totalPages = Math.max(1, Math.ceil(data.length / state.pageSize));
      state.pageWords = Math.min(state.pageWords, totalPages);
      renderTable(tbodyWords, data, state.pageWords, state.pageSize);
      renderPager(pagerWords, state.pageWords, totalPages, (p) => { state.pageWords = p; updateWords(); });
    }

    function updatePhrases() {
      const dataSrc = getSeasonPhrasesData();
      const data = filterData(dataSrc, state.q);
      const totalPages = Math.max(1, Math.ceil(data.length / state.pageSize));
      state.pagePhrases = Math.min(state.pagePhrases, totalPages);
      renderTable(tbodyPhrases, data, state.pagePhrases, state.pageSize);
      renderPager(pagerPhrases, state.pagePhrases, totalPages, (p) => { state.pagePhrases = p; updatePhrases(); });
    }

    function setActive(tab) {
      state.active = tab;
      if (tab === 'words') {
        tabWords.classList.add('active');
        tabPhrases.classList.remove('active');
        panelWords.classList.remove('hidden');
        panelPhrases.classList.add('hidden');
        updateWords();
      } else {
        tabPhrases.classList.add('active');
        tabWords.classList.remove('active');
        panelPhrases.classList.remove('hidden');
        panelWords.classList.add('hidden');
        if (!state.initializedPhrases) { state.initializedPhrases = true; }
        updatePhrases();
      }
    }

    function updateMetaCounts() {
      let stats;
      if (state.season === 'All') {
        stats = (window.SEASON_DATA['All'] && window.SEASON_DATA['All'].stats) || { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 };
      } else {
        const sd = window.SEASON_DATA[state.season] || {};
        if (typeof state.segment === 'string' && state.segment.startsWith('E') && sd.episodes) {
          const n = parseInt(state.segment.slice(1), 10);
          if (!isNaN(n) && sd.episodes[n]) stats = sd.episodes[n].stats;
          else stats = sd.stats || { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 };
        } else if (sd.segments && sd.segments[state.segment]) stats = sd.segments[state.segment].stats;
        else stats = sd.stats || { wordsTotal: 0, wordsDistinct: 0, phrasesTotal: 0, phrasesDistinct: 0 };
      }
      // Build combined scope label: "Season · Segment"
      let scope = state.season;
      if (state.season === 'All' && state.segment !== 'All') scope = 'All · ' + state.segment;
      else if (state.season !== 'All' && state.segment !== 'All') scope = state.season + ' · ' + state.segment;
      else if (state.season !== 'All' && state.segment === 'All') scope = state.season;
      else scope = 'All';
      scopeLabelEl.textContent = scope;
      wordsTotalEl.textContent = (stats.wordsTotal).toLocaleString();
      wordsDistinctEl.textContent = (stats.wordsDistinct).toLocaleString();
      phrasesTotalEl.textContent = (stats.phrasesTotal).toLocaleString();
      phrasesDistinctEl.textContent = (stats.phrasesDistinct).toLocaleString();
    }

    function setSeason(season) {
      state.season = season;
      seasonTabs.forEach(btn => { if (btn.dataset.season === season) btn.classList.add('active'); else btn.classList.remove('active'); });
      // render segment tabs for selected season (base ranges only)
      renderSegmentTabsForSeason(season);
      state.segment = 'All';
      episodeTabsEl.style.display = 'none';
      episodeTabsEl.innerHTML = '';
      state.pageWords = 1; state.pagePhrases = 1;
      updateMetaCounts();
      if (state.active === 'words') updateWords(); else updatePhrases();
    }

    function setSegment(seg) {
      // range tabs: show episodes list, do not immediately render data
      if (seg === 'All' || seg === '1-8' || seg === '9-16' || seg === '17-last') {
        state.segment = seg;
        segmentTabs.forEach(btn => { if (btn.dataset.seg === seg) btn.classList.add('active'); else btn.classList.remove('active'); });
        state.pageWords = 1; state.pagePhrases = 1;
        updateMetaCounts();
        if (state.season === 'All') {
          // In All view, render data directly for the range
          if (state.active === 'words') updateWords(); else updatePhrases();
          episodeTabsEl.style.display = 'none'; episodeTabsEl.innerHTML = '';
        } else {
          // In concrete season, show episodes list and render aggregated range data
          renderEpisodeTabsForRange(state.season, seg);
          if (state.active === 'words') updateWords(); else updatePhrases();
        }
        return;
      }
      // episode tab (E<number>): render corresponding data
      state.segment = seg;
      // mark active in episode tabs
      episodeTabs.forEach(btn => { if (btn.dataset.ep === seg) btn.classList.add('active'); else btn.classList.remove('active'); });
      state.pageWords = 1; state.pagePhrases = 1;
      updateMetaCounts();
      if (state.active === 'words') updateWords(); else updatePhrases();
    }

    const onSearch = debounce(() => { state.q = search.value.trim(); if (state.active === 'words') { state.pageWords = 1; updateWords(); } else { state.pagePhrases = 1; updatePhrases(); } }, 120);
    search.addEventListener('input', onSearch);
    pageSizeSel.addEventListener('change', () => { state.pageSize = parseInt(pageSizeSel.value, 10); state.pageWords = 1; state.pagePhrases = 1; if (state.active === 'words') updateWords(); else updatePhrases(); });
    hideCommonEl.addEventListener('change', () => { state.hideCommon = !!hideCommonEl.checked; state.pageWords = 1; if (state.active === 'words') updateWords(); });
    tabWords.addEventListener('click', () => setActive('words'));
    tabPhrases.addEventListener('click', () => setActive('phrases'));
    seasonTabs.forEach(btn => btn.addEventListener('click', () => setSeason(btn.dataset.season)));
    segmentTabs.forEach(btn => btn.addEventListener('click', () => setSegment(btn.dataset.seg)));

    // Click-to-expand sentences under word rows
    tbodyWords.addEventListener('click', async (ev) => {
      const tr = ev.target.closest('tr.word-row');
      if (!tr) return;
      const word = tr.querySelector('.word-cell').textContent.trim();
      // toggle: remove existing detail row if present
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('word-detail')) { next.remove(); return; }
      // In All view, aggregate sentence examples across seasons
      if (state.season === 'All') {
        const { start, end } = segmentBounds(state.segment);
        const labels = (window.SEASON_LABELS || []).filter(l => l !== 'All');
        let matches = [];
        for (const lbl of labels) {
          const data = await loadSeasonSentences(lbl);
          if (!data || !data.sentences) continue;
          const ms = data.sentences
            .filter(s => s.ep >= start && (end == null || s.ep <= end) && Array.isArray(s.lemmas) && s.lemmas.includes(word))
            .slice(0, Math.max(0, 25 - matches.length))
            .map(s => ({ season: lbl, s }));
          matches = matches.concat(ms);
          if (matches.length >= 25) break;
        }
        const html = matches.length
          ? ('<ul style="margin:6px 0 0 18px;">' + matches.map(({ season, s }) => {
              const shown = highlightWordInSentence(String(s.text), word);
              const href = 'scripts/' + season + '.html?w=' + encodeURIComponent(word) + '#s' + s.id;
              return '<li><a href="' + href + '" target="_blank">' + shown + '</a> <span style="color:#999;">(' + season + ' · E' + s.ep + ')</span></li>';
            }).join('') + '</ul>')
          : '<div style="color:#666;">该分段没有匹配的句子。</div>';
        const detail = document.createElement('tr'); detail.className = 'word-detail';
        detail.innerHTML = '<td colspan="2">' + html + '</td>';
        tr.after(detail);
        return;
      }
      const data = await loadSeasonSentences(state.season);
      if (!data || !data.sentences) return;
      const { start, end } = segmentBounds(state.segment);
      const matches = data.sentences.filter(s => s.ep >= start && (end == null || s.ep <= end) && Array.isArray(s.lemmas) && s.lemmas.includes(word)).slice(0, 25);
      const html = matches.length ? ('<ul style="margin:6px 0 0 18px;">' + matches.map(s => {
        const shown = highlightWordInSentence(String(s.text), word);
        const href = 'scripts/' + state.season + '.html?w=' + encodeURIComponent(word) + '#s' + s.id;
        return '<li><a href="' + href + '" target="_blank">' + shown + '</a> <span style="color:#999;">(E' + s.ep + ')</span></li>';
      }).join('') + '</ul>') : '<div style="color:#666;">该分段没有匹配的句子。</div>';
      const detail = document.createElement('tr'); detail.className = 'word-detail';
      detail.innerHTML = '<td colspan="2">' + html + '</td>';
      tr.after(detail);
    });

    // Initial render only words to avoid heavy DOM at load
    setActive('words');
    setSeason('All');
  </script>
</body>
</html>`;

    const outPath = path.join(process.cwd(), 'index.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`Generated: ${outPath}`);
  } catch (err) {
    console.error('Failed to analyze document:', err);
    process.exit(1);
  }
}

main();