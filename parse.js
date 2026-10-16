/* ぽっと：書いた文章を「記録（やったこと）」か「期限（〜までに）」に読み分ける。
   AIは使わない（その場で即・オフラインでも読める）。読み違えたら画面で直す前提。
   ページ（iPhone・Macの入力窓）とMacのリマインダーの橋（node）で同じものを使う。 */
(function (root) {
  const DAY = 86400000;
  const WD = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
  const DUE_DEFAULT_HOUR = 20;   // 時刻が無い期限は、その日の20:00締めとみなす（通知は前日20:00と当日18:00）

  const ICONS = [
    [/髪|散髪|美容院|床屋|カット|パーマ|カラー/, '✂️'],
    [/サブスク|入会|契約|解約|登録|会員|プラン|Netflix|ネトフリ|Spotify|アマプラ|Prime|YouTube ?Premium|ChatGPT|Claude|iCloud|定期便/i, '💳'],
    [/片付け|片づけ|掃除|整理|捨て/, '🧹'],
    [/書類|提出|申請|手続|届|役所|区役所|市役所|確定申告|税/, '📄'],
    [/病院|歯医者|歯科|通院|薬|検診|健診|クリニック/, '🏥'],
    [/払|支払|振込|家賃|請求|返金|返済/, '💴'],
    [/返す|返却|借り/, '↩️'],
    [/送る|送付|郵送|発送|連絡|返信|メール|電話|LINE/, '✉️'],
    [/買|購入|注文/, '🛒'],
    [/練習|ダンス|ブレイク|レッスン|授業/, '🕺'],
    [/洗車|車検|車|免許/, '🚗'],
    [/電池|交換|フィルター|歯ブラシ/, '🔁'],
  ];

  function z2h(s) {
    return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[／]/g, '/').replace(/[：]/g, ':').replace(/[．]/g, '.').replace(/　/g, ' ');
  }
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // 方向（未来に寄せるか過去に寄せるか）が決まってから日付を確定させるので、候補を関数で持つ
  function findDate(t, now) {
    const T = day0(now);
    const hits = [];   // {re, at:(dir)=>Date, hard:bool}
    const push = (m, at) => { if (m) hits.push({ s: m.index, e: m.index + m[0].length, at }); };
    let m;
    // 2026/10/20, 2026年10月20日
    if ((m = /(\d{4})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})日?/.exec(t)))
      push(m, () => new Date(+m[1], +m[2] - 1, +m[3]));
    // 10/20, 10月20日, 10.20
    else if ((m = /(\d{1,2})\s*(?:\/|月|\.)\s*(\d{1,2})\s*日?(?![\d:時])/.exec(t))) {
      const mo = +m[1] - 1, d = +m[2];
      push(m, dir => {
        let x = new Date(T.getFullYear(), mo, d);
        if (dir > 0 && x < addD(T, -30)) x = new Date(T.getFullYear() + 1, mo, d);
        if (dir < 0 && x > T) x = new Date(T.getFullYear() - 1, mo, d);
        return x;
      });
    }
    const rel = [
      [/(?:今日|きょう|本日)/, 0], [/(?:明後日|あさって)/, 2], [/(?:明日|あした|あす)/, 1],
      [/(?:一昨日|おととい)/, -2], [/(?:昨日|きのう)/, -1],
    ];
    if (!hits.length) for (const [re, n] of rel) { if ((m = re.exec(t))) { push(m, () => addD(T, n)); break; } }
    if (!hits.length && (m = /(\d+)\s*(日|週間?|か月|ヶ月|ケ月|カ月|ヵ月|月)\s*(後|前)/.exec(t))) {
      const n = +m[1] * (m[3] === '前' ? -1 : 1), u = m[2];
      push(m, () => /週/.test(u) ? addD(T, n * 7) : /月/.test(u) ? new Date(T.getFullYear(), T.getMonth() + n, T.getDate()) : addD(T, n));
    }
    if (!hits.length && (m = /(来週|今週|先週|再来週)?\s*の?\s*([月火水木金土日])曜(?:日)?/.exec(t))) {
      const w = WD[m[2]], pre = m[1] || '';
      push(m, dir => {
        const mon = addD(T, -((T.getDay() + 6) % 7));          // 今週の月曜
        const off = w === 0 ? 6 : w - 1;
        if (pre === '今週') return addD(mon, off);
        if (pre === '来週') return addD(mon, 7 + off);
        if (pre === '再来週') return addD(mon, 14 + off);
        if (pre === '先週') return addD(mon, -7 + off);
        let diff = (w - T.getDay() + 7) % 7;                    // 曜日だけ：未来なら次のその曜日、過去なら直前
        if (dir < 0) return addD(T, diff === 0 ? 0 : diff - 7);
        return addD(T, diff);
      });
    }
    if (!hits.length && (m = /(来月|今月)?\s*(?:の)?\s*(月末|末)/.exec(t)) && (m[1] || m[2] === '月末')) {
      const n = m[1] === '来月' ? 1 : 0;
      push(m, () => new Date(T.getFullYear(), T.getMonth() + n + 1, 0));
    }
    if (!hits.length && (m = /(来週|今週)(?:中|いっぱい|まで)/.exec(t)))
      push(m, () => addD(T, (7 - T.getDay()) % 7 + (m[1] === '来週' ? 7 : 0)));
    if (!hits.length && (m = /年内|年末/.exec(t))) push(m, () => new Date(T.getFullYear(), 11, 31));
    // 20日（単独）：今月の20日
    if (!hits.length && (m = /(?:^|[^\d\/月.])(\d{1,2})\s*日(?![後前間])/.exec(t)) && +m[1] >= 1 && +m[1] <= 31) {
      const d = +m[1], idx = m.index + m[0].indexOf(m[1]);
      push({ index: idx, 0: m[0].slice(m[0].indexOf(m[1])) }, dir => {
        let x = new Date(T.getFullYear(), T.getMonth(), d);
        if (dir > 0 && x < T) x = new Date(T.getFullYear(), T.getMonth() + 1, d);
        if (dir < 0 && x > T) x = new Date(T.getFullYear(), T.getMonth() - 1, d);
        return x;
      });
    }
    return hits[0] || null;
  }

  function findTime(t) {
    let m = /(午前|午後|朝|昼|夕方|夜|晩)?\s*(\d{1,2})\s*(?::\s*(\d{2})|時\s*(半|\d{1,2}\s*分)?)/.exec(t);
    if (!m) { const n = /正午/.exec(t); return n ? { s: n.index, e: n.index + 2, h: 12, mi: 0 } : null; }
    let h = +m[2], mi = m[3] ? +m[3] : m[4] === '半' ? 30 : m[4] ? parseInt(m[4]) : 0;
    if (h > 24 || mi > 59) return null;
    if (/午後|夕方|夜|晩/.test(m[1] || '') && h < 12) h += 12;
    if (m[1] === '昼' && h < 6) h += 12;
    return { s: m.index, e: m.index + m[0].length, h: h % 24, mi };
  }

  function findWho(t) {
    let m = /([^\s、。,()（）「」]{1,12}?)(さん|くん|君|ちゃん|先生|様|さま|社長|店長|オーナー|部長)(?=$|[にからがよりとのへ、。\s])/.exec(t);
    if (m) return m[1] + m[2];
    m = /([^\s、。,]{1,10}?)(?:に|から)(?:言われ|頼まれ|お願いされ|指示され|聞かれ)/.exec(t);
    return m ? m[1] : '';
  }

  const DUE_WORDS = /までに|まで(?![もは])|迄|締め?切り?|〆切?|期限|以内|中に|いっぱい|リミット/;
  const PAST_END = /(?:った|いた|いだ|んだ|した|した|てきた|ました|ちゃった|じゃった|終わった|済み|済んだ|完了|できた|た)\s*[!！。.〜~♪wｗ笑]*\s*$/;
  const FUTURE_END = /(?:する|やる|しとく|しておく|ておく|とく|出す|行く|返す|払う|送る|終わらせる|予定|つもり|こと|べき|しなきゃ|しないと|ないと|なきゃ|ほしい|欲しい|てね|てください|下さい)\s*[!！。.]*\s*$/;

  function iconFor(t) { for (const [re, ic] of ICONS) if (re.test(t)) return ic; return ''; }

  // 「前回から何日」を出すための束ね鍵（髪を切った／髪切った → 髪）
  function groupKey(title) {
    let s = (title || '').replace(/[!！。.〜~♪]+$/, '').trim();
    s = s.replace(/(?:を|に|へ|が|は|で)?\s*(?:切りに行った|切ってもらった|切った|切る|入った|入る|入会した|登録した|契約した|解約した|更新した|始めた|やめた|変えた|替えた|交換した|買った|行った|した|する|やった|済んだ|終わった)$/, '');
    s = s.replace(/[をにへがはで]$/, '').trim();
    return s.toLowerCase();
  }

  function parse(raw, nowArg) {
    const now = nowArg ? new Date(nowArg) : new Date();
    const t = z2h(String(raw || '')).trim();
    const dh = findDate(t, now), tm = findTime(t);
    const hasDue = DUE_WORDS.test(t), past = PAST_END.test(t), fut = FUTURE_END.test(t);
    let dir = hasDue || (!past && fut) ? 1 : past ? -1 : 0;

    let at = null;
    if (dh) {
      const d = dh.at(dir || 1);
      // 方向が決まらないとき：日付が今日より後なら未来扱い
      const d2 = dir ? d : dh.at(1);
      at = new Date(d2);
      if (!dir) dir = day0(at) > day0(now) ? 1 : -1;
      if (dir < 0 && !past && !hasDue) at = dh.at(-1);
    }
    if (tm) {
      if (!at) {   // 時刻だけ：未来なら次に来るその時刻、過去なら直前のその時刻
        at = new Date(now); at.setHours(tm.h, tm.mi, 0, 0);
        if (dir > 0 && at < now) at = addD(at, 1);
        if (dir < 0 && at > now) at = addD(at, -1);
        if (!dir) dir = at > now ? 1 : -1;
      } else at.setHours(tm.h, tm.mi, 0, 0);
    }

    let kind;
    if (hasDue) kind = 'due';
    else if (past) kind = 'log';
    else if (at && at > now) kind = 'due';
    else if (!at && fut) kind = 'due';
    else kind = 'log';

    if (kind === 'log' && !at) at = new Date(now);
    if (kind === 'log' && at > now && !past) kind = 'due';
    if (kind === 'due' && at && !tm) at.setHours(DUE_DEFAULT_HOUR, 0, 0, 0);
    if (kind === 'log' && at && !tm && day0(at).getTime() === day0(now).getTime()) at = new Date(now);   // 今日の記録は今の時刻で並べる
    const who = findWho(t);

    // 題名：日付・時刻・「までに」を抜いた残り
    let title = t;
    const cut = [];
    if (dh) cut.push([dh.s, dh.e]);
    if (tm) cut.push([tm.s, tm.e]);
    cut.sort((a, b) => b[0] - a[0]).forEach(([s, e]) => { title = title.slice(0, s) + ' ' + title.slice(e); });
    title = title.replace(/^\s*(?:の|に|まで(?:に)?|迄に?|から|は|、|,|頃|ごろ)+/, '')
      .replace(/\s*(?:までに|まで|迄に?)\s*(?=\S)/, ' ')
      .replace(/\s*(?:までに|まで|迄に?|中に|中)\s*$/, '')
      .replace(/\s+(?:に|の|は|で)\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    title = title.replace(/^(?:に|の|は|で|、)\s*/, '').trim() || t;
    if (who) {   // 「オーナーに言われた 鍵返す」→ 題は「鍵返す」、誰からは 👤 で別に出す
      const esc = who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const t2 = title.replace(new RegExp('\\s*' + esc + '\\s*(?:に|から|が|より)?\\s*(?:言われた|頼まれた|お願いされた|指示された)(?:こと)?\\s*'), ' ')
        .replace(new RegExp('^' + esc + '\\s*(?:に|から|が|より)\\s*'), '').trim();
      if (t2) title = t2;
    }

    return {
      raw: String(raw || ''),
      kind,                                   // 'log' | 'due'
      title,
      at: at ? at.getTime() : null,           // 記録＝やった時／期限＝締め（無ければ null＝期限未定）
      hasTime: !!tm,
      who,
      icon: iconFor(t),
    };
  }

  const api = { parse, groupKey, iconFor, DUE_DEFAULT_HOUR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PottoParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
