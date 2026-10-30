/* Local preview metadata; the downloaded production files stay byte-for-byte intact. */
(function () {
  var preview;
  try {
    if (new URLSearchParams(location.search).get('original') === '1') {
      sessionStorage.setItem('qqa-local-preview', 'original');
    }
    preview = sessionStorage.getItem('qqa-local-preview');
  } catch (e) { return; }
  if (preview !== 'lab') return;

  function isHome(pathname) {
    return /^\/qq-agent(?:\/|\/index\.html)?$/.test(pathname);
  }
  if (isHome(location.pathname)) {
    location.replace('/qq-agent/lab/');
    return;
  }

  // A community refresh loads the preserved original document. Keep its home
  // links in this tab's chosen preview; the original router then enters lab.
  function keepLabHome() {
    document.querySelectorAll('a[href]').forEach(function (link) {
      var url;
      try { url = new URL(link.getAttribute('href'), location.href); } catch (e) { return; }
      if (url.origin === location.origin && isHome(url.pathname) && url.searchParams.get('original') !== '1') {
        link.href = '/qq-agent/lab/';
      }
    });
  }
  document.addEventListener('DOMContentLoaded', keepLabHome);
  document.addEventListener('q3:ready', keepLabHome);
  document.addEventListener('q3:page', keepLabHome);
})();
window.__QA_LOCAL_PREVIEW__ = true;
document.addEventListener('DOMContentLoaded', function () {
  document.title = '本地预览 · ' + document.title;
  var label = document.createElement('div');
  label.id = 'local-preview-label';
  label.textContent = '本地预览 · 数据快照';
  label.title = '页面和公开数据保存在本机；登录、发布、点赞与后台管理需要后端。';
  label.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:900;font:11px/1.6 system-ui,sans-serif;padding:4px 9px;border:1px solid #8885;border-radius:4px;background:#fcf7eeeb;color:#383838;pointer-events:none';
  document.body.appendChild(label);
});
