import {installReviewRepair} from './review-repair.mjs?v=30.2.mathtype';
import { parseText } from './parser-core.mjs';
import {readDocxFile} from './docx-reader.mjs?v=30.2.mathtype';
import {renderRichText,plainRichText} from './formula-core.mjs?v=30.2.mathtype';

const $ = id => document.getElementById(id);
const letters = ['A', 'B', 'C', 'D'];
let draft = [];
let saving = false;
let uploadedName = '';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizedAnswer = value => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) return value;
  const letter = String(value ?? '').trim().toUpperCase();
  return letters.indexOf(letter);
};

const readWord=readDocxFile;

async function readPdf(file) {
  const pdfjsLib = await import('./vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({data: bytes}).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let current = '', previousY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5] ?? 0;
      if (previousY !== null && Math.abs(previousY - y) > 3 && current.trim()) { lines.push(current.trim()); current = ''; }
      current += item.str + (item.hasEOL ? '\n' : ' ');
      if (item.hasEOL) { lines.push(current.trim()); current = ''; }
      previousY = y;
    }
    if (current.trim()) lines.push(current.trim());
  }
  return parseText(lines.join('\n'));
}

function renderReview(questions) {
  draft = questions;
  const review = $('questions-review');
  review.hidden = false;
  const incomplete = questions.filter(q=>q.correct<0 || !q.text || q.options.some(x=>!x)).length;
  $('review-count').textContent = `Đã đọc ${questions.length}/15 câu. ${incomplete ? `Có ${incomplete} câu thiếu đáp án hoặc phương án; cô chọn/sửa các ô này rồi bấm LƯU.` : 'Đã có đủ đáp án; cô có thể chỉnh sửa và bấm LƯU để cập nhật lại.'}`;
  $('review-list').innerHTML = questions.map((q, i) => `
    <section class="review-card" data-index="${i}">
      <div class="review-heading"><strong>Câu ${i+1}</strong>${q.warning ? `<span class="review-warning">⚠ ${escapeHtml(q.warning)}</span>` : ''}</div>
      <label class="label">Nội dung câu hỏi</label><div class="review-text formula-editor" contenteditable="true" role="textbox" aria-label="Nội dung câu ${i+1}">${renderRichText(q.text)}</div>
      <div class="review-options">${letters.map((letter,j) => `<label>${letter}. <div class="review-option formula-editor" contenteditable="true" role="textbox" aria-label="Lựa chọn ${letter} câu ${i+1}" data-choice="${j}">${renderRichText(q.options[j])}</div></label>`).join('')}</div>
      <label class="label">Đáp án đúng (bắt buộc kiểm tra)</label>
      <select class="review-correct" ${q.correct<0?'style="border-color:#ffbd66"':''}><option value="-1">— Chọn đáp án —</option>${letters.map((letter,j)=>`<option value="${j}" ${q.correct===j?'selected':''}>${letter}</option>`).join('')}</select>${q.needsReview?'<label class="small"><input type="checkbox" class="review-confirm"> Tôi đã kiểm tra nội dung và công thức được cảnh báo ở câu này.</label>':''}
    </section>`).join('');
  installReviewRepair($('review-list'));
  $('review-save').disabled = $('review-save-bottom').disabled = questions.length !== 15;
}

function editorValue(element){
 const walk=n=>{if(n.nodeType===3)return n.nodeValue;if(n.nodeType!==1)return '';if(n.hasAttribute('data-formula-image'))return '[['+(n.getAttribute('data-image-kind')==='PIC'?'PIC':'IMG')+':'+n.getAttribute('data-formula-image')+']]';if(n.hasAttribute('data-tex-raw'))return n.getAttribute('data-tex-raw');if(n.localName==='math')return '[[MATH:'+n.getAttribute('data-formula')+']]';if(n.localName==='br')return '\n';const t=Array.from(n.childNodes).map(walk).join('');return ['div','p'].includes(n.localName)?t+'\n':t;};
 return Array.from(element.childNodes).map(walk).join('').trim();
}
function collectReview() {
  const cards = [...document.querySelectorAll('.review-card')];
  if (cards.length !== 15) throw Error(`Cần đúng 15 câu; tệp hiện có ${cards.length} câu.`);
  return cards.map((card, i) => {
    const text = editorValue(card.querySelector('.review-text'));
    const options = [...card.querySelectorAll('.review-option')].map(input => editorValue(input));
    if([text,...options].some(s=>s.includes('[ẢNH/CÔNG THỨC CHƯA HỖ TRỢ]')))throw Error(`Câu ${i+1}: hãy thay phần chưa hỗ trợ bằng LaTeX/ảnh hoặc sửa nội dung trước khi lưu.`);
    const correct = Number(card.querySelector('.review-correct').value);
    const confirm=card.querySelector('.review-confirm');if(confirm&&!confirm.checked)throw Error(`Câu ${i+1}: cô cần kiểm tra cảnh báo và đánh dấu xác nhận.`);
    if (!text || options.some(x=>!x) || correct < 0) throw Error(`Câu ${i+1}: cần đủ nội dung, 4 phương án và đáp án đúng.`);
    return {text, options, correct};
  });
}

function notify(message, error=false) {
  $('import-status').textContent = message;
  $('import-status').className = error?'small import-error':'small import-success';
}

async function saveReview() {
  if (saving) return;
  try {
    const questions = collectReview();
    saving = true;
    $('review-save').disabled = $('review-save-bottom').disabled = true;
    notify('⏳ Đang cập nhật 15 câu vào ngân hàng đề dùng chung…');
    const result = await window.saveQuestionsToRoom(questions, uploadedName);
    notify(`✅ ĐÃ CẬP NHẬT THÀNH CÔNG ${result.count || 15} CÂU CHO CẢ HAI CHẾ ĐỘ! Câu đầu: ${plainRichText(result.preview || questions[0].text)}. Cô có thể chia sẻ link cá nhân hoặc tạo phòng mới.`);
    if (typeof window.refreshTeacherRoom === 'function') await window.refreshTeacherRoom();
    const next = $('admin-action-hint');
    if (next) {
      next.textContent = '✅ ĐÃ LƯU ĐỀ! BƯỚC 2: BẤM “VÀO CHƠI CÁ NHÂN” HOẶC “TẠO PHÒNG THI TRỰC TIẾP” Ở DƯỚI.';
      next.style.color = '#8affb8';
      next.scrollIntoView({behavior:'smooth',block:'start'});
    }
  } catch (e) {
    notify('⚠ CHƯA LƯU ĐƯỢC: ' + e.message, true);
    const matched = /Câu (\d+)/.exec(e.message);
    if (matched) document.querySelectorAll('.review-card')[Number(matched[1])-1]?.scrollIntoView({behavior:'smooth',block:'center'});
  } finally { saving=false; $('review-save').disabled = $('review-save-bottom').disabled = draft.length!==15; }
}

$('question-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadedName = file.name.replace(/\.[^.]+$/, '').trim();
  notify(`⏳ Đang đọc ${file.name}…`);
  $('questions-review').hidden = true;
  try {
    if (file.size > 12 * 1024 * 1024) throw Error('Tệp lớn hơn 12 MB. Cô rút gọn tệp trước khi nhập nhé.');
    const ext = file.name.toLowerCase().split('.').pop();
    let questions;
    if (ext === 'docx') questions = await readWord(file);
    else if (ext === 'pdf') questions = await readPdf(file);
    else if (ext === 'txt') questions = parseText(await file.text());
    else if (ext === 'json') {
      const input = JSON.parse(await file.text());
      if (!Array.isArray(input)) throw Error('JSON cần là danh sách câu hỏi.');
      questions = input.map(q=>({text:q.text??q.question??'', options:q.options??[], correct:normalizedAnswer(q.correct??q.answer),warning:''}));
    } else throw Error('Cô vui lòng chọn .docx, .pdf, .txt hoặc .json.');
    renderReview(questions);
    if (questions.length!==15) notify(`⚠ File chỉ đọc được ${questions.length}/15 câu. Cô kiểm tra lại cách ghi “Câu 1…” trong Word/PDF.`,true);
    else if (questions.every(q=>q.text && q.options.every(Boolean) && q.correct>=0 && !q.needsReview) && !questions.some(q=>[q.text,...q.options].some(t=>/\[\[(?:IMG|PIC):/.test(t))||q.text.includes('[[MATH:')||q.options.some(x=>x.includes('[[MATH:'))||[q.text,...q.options].some(t=>/\$|\\[([]/.test(t)))) {
      notify('✅ Đã đọc đủ 15 câu có đáp án. Đang tự động cập nhật bộ đề chung…');
      await saveReview();
    } else notify('Đã đọc 15 câu. Cô xem công thức trong bảng kiểm tra, chọn đáp án ở những câu chưa chắc chắn rồi bấm LƯU 15 CÂU CHO CẢ HAI CHẾ ĐỘ.');
  } catch (e) { notify('⚠ ' + e.message,true); }
});

$('review-save').addEventListener('click',saveReview);
$('review-save-bottom').addEventListener('click',saveReview);
notify('✅ Bộ đọc câu hỏi đã sẵn sàng. Cô chọn file Word hoặc PDF để nhập 15 câu.');
