const letters = ['A', 'B', 'C', 'D'];
const normalize = s => String(s || '').replace(/\u00a0/g, ' ').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();

export function parseText(source) {
  let text = normalize(source);
  text = text.replace(/\s+(Câu\s*\d+\s*[.:)]?)/gi, '\n$1');
  const headers = [...text.matchAll(/(?:^|\n)\s*(?:Câu|Question)\s*(\d+)\s*[.:)]?\s*/gi)];
  if (!headers.length) throw Error('Không tìm thấy dòng “Câu 1, Câu 2…”. Cô kiểm tra lại bố cục tệp nhé.');
  const results = [];
  for (let i = 0; i < headers.length; i++) {
    const begin = headers[i].index + headers[i][0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    let block = text.slice(begin, end).trim();
    let correct = -1;
    const answerMatch = block.match(/(?:Đáp\s*án(?:\s*đúng)?|ĐA|Answer|Correct)\s*[:：\-]\s*([A-D])\b/i);
    if (answerMatch) { correct = letters.indexOf(answerMatch[1].toUpperCase()); block = block.replace(answerMatch[0], ''); }
    const optionRegex = /(?:^|\s)([A-D])\s*[.):]\s*/g;
    const positions = [...block.matchAll(optionRegex)];
    if (positions.length < 4) {
      results.push({ text: block, options: ['', '', '', ''], correct, warning: 'Không nhận đủ bốn phương án.' });
      continue;
    }
    const questionText = block.slice(0, positions[0].index).trim();
    const options = ['', '', '', ''];
    positions.forEach((m, j) => {
      const letterIndex = letters.indexOf(m[1]);
      const start = m.index + m[0].length;
      const stop = j + 1 < positions.length ? positions[j + 1].index : block.length;
      const raw = block.slice(start, stop).trim();
      if (raw.startsWith('*') || raw.endsWith('*') || /\(đúng\)/i.test(raw)) correct = letterIndex;
      options[letterIndex] = raw.replace(/^\*|\*$/g, '').replace(/\(đúng\)/gi, '').trim();
    });
    results.push({ text: questionText, options, correct, warning: '' });
  }
  return results;
}
