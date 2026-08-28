// make-local.mjs — chèn shim `window.claude.self` vào một canvas đã seed để bật chế độ EDIT khi chạy local
// (không cần Artifact). Save sẽ gọi shim.publish(pageHtml) với CHUỖI HTML NGUYÊN TRANG (đã gồm state block mới).
// Hiện tại shim chỉ log + cất vào localStorage / window.__localSaves; tính năng lưu thật = thay thân hàm publish
// (vd. fetch('/save', {method:'POST', body: page})). Shim tự chèn lại chính nó vào trang nhận được.
// Dùng:  node make-local.mjs spring-menu.html            -> spring-menu-local.html
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output = input.replace(/\.html$/, '-local.html')] = process.argv.slice(2)
if (!input) { console.error('usage: node make-local.mjs <seeded.html> [out.html]'); process.exit(1) }

const SHIM = `<script id="local-edit-shim">
(function () {
  // Editor kiểm tra window.claude.self.publish để quyết định canWrite; có nó là hết Read-only.
  var KEY = 'local-design:' + location.pathname;
  var version = 0;
  try { // xoá cờ read-only cũ nếu có (sessionStorage "appifact-ro/<path>")
    for (var i = sessionStorage.length - 1; i >= 0; i--) {
      var k = sessionStorage.key(i);
      if (k && k.indexOf('appifact-ro/') === 0) sessionStorage.removeItem(k);
    }
  } catch (e) {}
  window.claude = window.claude || {};
  window.claude.self = {
    publish: async function (page) {
      version++;
      var body = typeof page === 'string' ? page : JSON.stringify(page);
      // Editor dựng lại <head> từ template nên trang nhận được KHÔNG còn shim này.
      // Chèn lại để file lưu ra vẫn mở được ở chế độ edit.
      var me = document.getElementById('local-edit-shim');
      if (me && body.indexOf('id="local-edit-shim"') < 0) {
        body = body.replace('<meta charset="utf-8">', '<meta charset="utf-8">\\n' + me.outerHTML + '\\n');
        page = body;
      }
      console.log('[local-shim] publish #' + version + ' — nhận ' + typeof page + ', ' + body.length + ' chars.',
        'Đây là chỗ gắn tính năng lưu thật (POST lên server / ghi file).');
      window.__localSaves = (window.__localSaves || []).concat([{ at: Date.now(), page: page }]);
      try { localStorage.setItem(KEY, body); } catch (e) { console.warn('[local-shim] localStorage full, giữ trong window.__localSaves', e); }
      return { version: version };
    }
  };
})();
</script>
`
const src = readFileSync(input, 'utf8')
if (src.includes('id="local-edit-shim"')) { console.error(input + ' đã có shim rồi'); process.exit(1) }
const at = src.indexOf('<meta charset="utf-8">')
if (at < 0) { console.error('không tìm thấy <meta charset> trong ' + input); process.exit(1) }
const cut = at + '<meta charset="utf-8">'.length
writeFileSync(output, src.slice(0, cut) + '\n' + SHIM + src.slice(cut))
console.log('wrote ' + output + ' (shim chèn sau <meta charset>)')
